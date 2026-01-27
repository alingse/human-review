use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use tracing::info;

use crate::models::*;
use crate::server::{AppState, COMPLETION_SIGNAL, FINAL_DATA};
use crate::git_ops;

/// Get initial data
pub async fn get_data_handler(
    State(state): State<AppState>,
) -> Result<Json<DataResponse>, AppError> {
    let data = state.data.read().await;

    let files = match &data.input_type {
        InputType::CommitDiff { commit } => git_ops::get_commit_diff(commit)?,
        InputType::FileContent { path } => git_ops::get_file_content(path)?,
        InputType::WorkingTreeDiff => git_ops::get_working_tree_diff()?,
    };

    let response = DataResponse {
        input_type: data.input_type.clone(),
        files,
        comments: data.comments.clone(),
    };

    Ok(Json(response))
}

/// Add comment
pub async fn add_comment_handler(
    State(state): State<AppState>,
    Json(req): Json<AddCommentRequest>,
) -> Result<Json<Comment>, AppError> {
    let mut data = state.data.write().await;

    let comment = Comment::new(req.file, req.line, req.text);
    data.comments.push(comment.clone());

    info!("Added comment: {}", comment.id);

    Ok(Json(comment))
}

/// Update comment
pub async fn update_comment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateCommentRequest>,
) -> Result<Json<Comment>, AppError> {
    let mut data = state.data.write().await;

    data.comments
        .iter_mut()
        .find(|c| c.id == id)
        .map(|comment| {
            if let Some(text) = req.text {
                comment.text = text;
            }
            Json(comment.clone())
        })
        .ok_or_else(|| AppError::CommentNotFound(id))
}

/// Delete comment
pub async fn delete_comment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let mut data = state.data.write().await;

    if let Some(pos) = data.comments.iter().position(|c| c.id == id) {
        data.comments.remove(pos);
        info!("Deleted comment: {}", id);
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::CommentNotFound(id))
    }
}

/// Complete review
pub async fn complete_handler(
    State(state): State<AppState>,
) -> Result<Json<CompletionResponse>, AppError> {
    let mut data = state.data.write().await;
    data.status = ReviewStatus::Completed;

    let _ = FINAL_DATA.set((*data).clone());
    COMPLETION_SIGNAL.notify_one();

    Ok(Json(CompletionResponse {
        message: "Review completed".to_string(),
        comment_count: data.comments.len(),
    }))
}

/// Application errors
#[derive(Debug)]
pub enum AppError {
    CommentNotFound(String),
    Internal(anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::CommentNotFound(id) => {
                (StatusCode::NOT_FOUND, format!("Comment not found: {}", id))
            }
            AppError::Internal(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        };
        (status, message).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e)
    }
}
