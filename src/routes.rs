use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;

use crate::models::*;
use crate::server::AppState;

#[derive(Default, Deserialize)]
pub struct DataQuery {
    review: Option<String>,
}

pub async fn get_data_handler(
    State(state): State<AppState>,
    Query(query): Query<DataQuery>,
) -> Result<Json<DataResponse>, AppError> {
    let historical = query.review.is_some();
    let session = if let Some(id) = query.review {
        state.store.load(&id)?
    } else {
        state
            .active
            .as_ref()
            .ok_or(AppError::NoActiveReview)?
            .read()
            .await
            .clone()
    };
    Ok(Json(DataResponse {
        review_id: session.id,
        snapshot_note: session.snapshot_note,
        read_only: historical || session.data.status == ReviewStatus::Completed,
        status: session.data.status,
        input_type: session.data.input_type,
        files: session.files,
        comments: session.data.comments,
    }))
}

pub async fn list_reviews_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<ReviewSummary>>, AppError> {
    Ok(Json(state.store.list()?))
}

pub async fn get_review_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ReviewSession>, AppError> {
    Ok(Json(state.store.load(&id)?))
}

#[derive(Deserialize)]
pub struct ExportQuery {
    format: Option<String>,
}

pub async fn export_review_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<ExportQuery>,
) -> Result<Response, AppError> {
    let session = state.store.load(&id)?;
    let (body, extension, mime) = match query.format.as_deref().unwrap_or("json") {
        "json" => (
            serde_json::to_string_pretty(&session).map_err(anyhow::Error::from)?,
            "json",
            "application/json; charset=utf-8",
        ),
        "text" => (
            crate::output::export_text(&session),
            "txt",
            "text/plain; charset=utf-8",
        ),
        _ => return Err(AppError::InvalidFormat),
    };
    Ok((
        [
            (header::CONTENT_TYPE, mime.to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!(
                    "attachment; filename=\"review-{}.{}\"",
                    session.id, extension
                ),
            ),
        ],
        body,
    )
        .into_response())
}

fn editable(session: &ReviewSession) -> Result<(), AppError> {
    if session.data.status == ReviewStatus::Completed {
        return Err(AppError::Completed);
    }
    Ok(())
}

// Persist before replacing in-memory state or acknowledging a mutation.
fn save(
    state: &AppState,
    current: &mut ReviewSession,
    mut next: ReviewSession,
) -> Result<(), AppError> {
    next.updated_at = chrono::Utc::now();
    state.store.save(&next)?;
    *current = next;
    Ok(())
}

pub async fn add_comment_handler(
    State(state): State<AppState>,
    Json(req): Json<AddCommentRequest>,
) -> Result<Json<Comment>, AppError> {
    let mut session = state
        .active
        .as_ref()
        .ok_or(AppError::NoActiveReview)?
        .write()
        .await;
    editable(&session)?;
    let mut next = session.clone();
    let mut comment = Comment::new(req.file, req.line, req.column, req.text);
    comment.side = req.side;
    comment.anchor = req.anchor;
    next.data.comments.push(comment.clone());
    save(&state, &mut session, next)?;
    Ok(Json(comment))
}

pub async fn update_comment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateCommentRequest>,
) -> Result<Json<Comment>, AppError> {
    let mut session = state
        .active
        .as_ref()
        .ok_or(AppError::NoActiveReview)?
        .write()
        .await;
    editable(&session)?;
    let mut next = session.clone();
    let comment = next
        .data
        .comments
        .iter_mut()
        .find(|comment| comment.id == id)
        .ok_or(AppError::CommentNotFound(id))?;
    if let Some(text) = req.text {
        comment.text = text;
    }
    let result = comment.clone();
    save(&state, &mut session, next)?;
    Ok(Json(result))
}

pub async fn delete_comment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let mut session = state
        .active
        .as_ref()
        .ok_or(AppError::NoActiveReview)?
        .write()
        .await;
    editable(&session)?;
    let mut next = session.clone();
    let index = next
        .data
        .comments
        .iter()
        .position(|comment| comment.id == id)
        .ok_or(AppError::CommentNotFound(id))?;
    next.data.comments.remove(index);
    save(&state, &mut session, next)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn complete_handler(
    State(state): State<AppState>,
) -> Result<Json<CompletionResponse>, AppError> {
    let mut session = state
        .active
        .as_ref()
        .ok_or(AppError::NoActiveReview)?
        .write()
        .await;
    if session.data.status != ReviewStatus::Completed {
        let mut next = session.clone();
        next.data.status = ReviewStatus::Completed;
        save(&state, &mut session, next)?;
        state.completion.notify_one();
    }
    Ok(Json(CompletionResponse {
        message: "Review completed and saved".into(),
        comment_count: session.data.comments.len(),
    }))
}

#[derive(Debug)]
pub enum AppError {
    CommentNotFound(String),
    NoActiveReview,
    Completed,
    InvalidFormat,
    Internal(anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            Self::CommentNotFound(id) => {
                (StatusCode::NOT_FOUND, format!("Comment not found: {id}"))
            }
            Self::NoActiveReview => (StatusCode::CONFLICT, "No active review".into()),
            Self::Completed => (
                StatusCode::CONFLICT,
                "Review is completed. Start a new review to add feedback.".into(),
            ),
            Self::InvalidFormat => (
                StatusCode::BAD_REQUEST,
                "Use format=json or format=text".into(),
            ),
            Self::Internal(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        };
        (status, message).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(error: anyhow::Error) -> Self {
        Self::Internal(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::tests::Fixture;
    use std::sync::Arc;
    use tokio::sync::{Notify, RwLock};

    fn state(fixture: &Fixture) -> AppState {
        AppState {
            active: Some(Arc::new(RwLock::new(fixture.session.clone()))),
            store: fixture.store.clone(),
            completion: Arc::new(Notify::new()),
        }
    }
    fn request(text: &str) -> AddCommentRequest {
        serde_json::from_value(serde_json::json!({
            "file":"missing.md", "line":1,"side":"old","text":text,
            "anchor":{"start_line":1,"end_line":2,"x":0.82,"y":0.34,"quote":"Frozen content"}
        }))
        .unwrap()
    }

    #[tokio::test]
    async fn every_acknowledged_mutation_survives_reopening() {
        let fixture = Fixture::new();
        fixture.store.save(&fixture.session).unwrap();
        let state = state(&fixture);
        let Json(comment) = add_comment_handler(State(state.clone()), Json(request("First")))
            .await
            .unwrap();
        assert_eq!(
            fixture
                .store
                .load(&fixture.session.id)
                .unwrap()
                .data
                .comments[0]
                .text,
            "First"
        );
        let _ = update_comment_handler(
            State(state.clone()),
            Path(comment.id.clone()),
            Json(UpdateCommentRequest {
                text: Some("Updated".into()),
            }),
        )
        .await
        .unwrap();
        let updated = fixture.store.load(&fixture.session.id).unwrap();
        assert_eq!(updated.data.comments[0].text, "Updated");
        assert_eq!(updated.data.comments[0].side, Some(DiffSide::Old));
        assert_eq!(updated.data.comments[0].anchor.as_ref().unwrap().x, 0.82);
        let Json(data) = get_data_handler(State(state.clone()), Query(DataQuery::default()))
            .await
            .unwrap();
        assert_eq!(data.files[0].markdown.as_deref(), Some("# Frozen content"));
        delete_comment_handler(State(state.clone()), Path(comment.id))
            .await
            .unwrap();
        assert!(fixture
            .store
            .load(&fixture.session.id)
            .unwrap()
            .data
            .comments
            .is_empty());
        let _ = complete_handler(State(state.clone())).await.unwrap();
        assert_eq!(
            fixture.store.load(&fixture.session.id).unwrap().data.status,
            ReviewStatus::Completed
        );
        assert!(matches!(
            add_comment_handler(State(state.clone()), Json(request("Too late"))).await,
            Err(AppError::Completed)
        ));
        let Json(data) = get_data_handler(
            State(state),
            Query(DataQuery {
                review: Some(fixture.session.id.clone()),
            }),
        )
        .await
        .unwrap();
        assert!(data.read_only);
    }

    #[tokio::test]
    async fn failed_save_keeps_memory_and_last_saved_revision_unchanged() {
        let fixture = Fixture::new();
        fixture.store.save(&fixture.session).unwrap();
        let mut state = state(&fixture);
        // A regular file cannot be used as a storage directory.
        let blocker = fixture.store.root.join("blocked");
        std::fs::write(&blocker, "not a directory").unwrap();
        state.store.root = blocker;
        assert!(add_comment_handler(
            State(state.clone()),
            Json(request("Must not be acknowledged"))
        )
        .await
        .is_err());
        assert!(complete_handler(State(state.clone())).await.is_err());
        let active = state.active.as_ref().unwrap().read().await;
        assert!(active.data.comments.is_empty());
        assert_eq!(active.data.status, ReviewStatus::InProgress);
        assert_eq!(
            fixture.store.load(&fixture.session.id).unwrap().data.status,
            ReviewStatus::InProgress
        );
        assert!(tokio::time::timeout(
            std::time::Duration::from_millis(10),
            state.completion.notified()
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn exports_include_comments_locations_and_the_frozen_content() {
        let fixture = Fixture::new();
        let mut session = fixture.session.clone();
        let mut comment = Comment::new(
            Some("missing.md".into()),
            Some(1),
            Some(3),
            "Please clarify".into(),
        );
        comment.anchor = Some(MarkdownAnchor {
            start_line: 1,
            end_line: 2,
            x: 0.4,
            y: 0.6,
            quote: "Frozen content".into(),
        });
        session.data.comments.push(comment);
        fixture.store.save(&session).unwrap();
        let state = state(&fixture);
        let json = export_review_handler(
            State(state.clone()),
            Path(session.id.clone()),
            Query(ExportQuery {
                format: Some("json".into()),
            }),
        )
        .await
        .unwrap();
        assert!(json.headers()[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .contains("attachment"));
        let bytes = axum::body::to_bytes(json.into_body(), usize::MAX)
            .await
            .unwrap();
        let reopened: ReviewSession = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            reopened.files[0].markdown.as_deref(),
            Some("# Frozen content")
        );
        assert_eq!(reopened.data.comments[0].anchor.as_ref().unwrap().y, 0.6);
        let text = export_review_handler(
            State(state),
            Path(session.id),
            Query(ExportQuery {
                format: Some("text".into()),
            }),
        )
        .await
        .unwrap();
        let text = String::from_utf8(
            axum::body::to_bytes(text.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        assert!(text.contains("Please clarify"));
        assert!(text.contains("Frozen content"));
        assert!(text.contains("L1–2"));
    }
}
