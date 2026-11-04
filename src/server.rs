use anyhow::Result;
use axum::{
    body::Body,
    extract::{OriginalUri, Path, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::info;

use crate::history::ReviewStore;
use crate::models::ReviewSession;
use crate::routes::*;
use crate::static_assets;

/// Milliseconds to wait after completion signal before returning final data
const COMPLETION_WAIT_MS: u64 = 100;

/// Server state
#[derive(Clone)]
pub struct AppState {
    pub active: Option<Arc<RwLock<ReviewSession>>>,
    pub store: ReviewStore,
    pub completion: Arc<tokio::sync::Notify>,
}

/// Run one active review, or a history browser when no active review is supplied.
pub async fn run(
    port: u16,
    session: Option<ReviewSession>,
    store: ReviewStore,
) -> Result<(u16, AppState)> {
    let state = AppState {
        active: session.map(|session| Arc::new(RwLock::new(session))),
        store,
        completion: Arc::new(tokio::sync::Notify::new()),
    };

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/api/data", get(get_data_handler))
        .route("/api/reviews", get(list_reviews_handler))
        .route("/api/reviews/:id", get(get_review_handler))
        .route("/api/reviews/:id/export", get(export_review_handler))
        .route("/api/comments", post(add_comment_handler))
        .route("/api/comments/:id", put(update_comment_handler))
        .route("/api/comments/:id", delete(delete_comment_handler))
        .route("/api/complete", post(complete_handler))
        .route("/static/*path", get(serve_static_handler))
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await?;
    let actual_port = listener.local_addr()?.port();
    info!("Server running on port {}", actual_port);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Server error: {}", e);
        }
    });

    Ok((actual_port, state))
}

/// Wait for completion signal and return final data
pub async fn wait_for_completion(state: &AppState) -> Result<ReviewSession> {
    state.completion.notified().await;
    tokio::time::sleep(Duration::from_millis(COMPLETION_WAIT_MS)).await;
    Ok(state
        .active
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("No active review"))?
        .read()
        .await
        .clone())
}

/// Index page handler
async fn index_handler(State(state): State<AppState>, OriginalUri(uri): OriginalUri) -> Response {
    if state.active.is_none() && uri.query().is_none() {
        return Redirect::temporary("/?history=1").into_response();
    }
    match static_assets::get_template("review.html") {
        Some(html) => Html(html).into_response(),
        None => {
            let mut response = Response::new(Body::from("Template not found"));
            *response.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
            response
        }
    }
}

/// Static asset handler
async fn serve_static_handler(
    State(_state): State<AppState>,
    Path(path): Path<String>,
) -> impl IntoResponse {
    let asset_path = format!("/static/{}", path);
    match static_assets::get_asset(&asset_path) {
        Some((data, mime)) => {
            let mut response = Response::new(Body::from(data));
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, header::HeaderValue::from_static(mime));
            response
        }
        None => {
            let mut response = Response::new(Body::empty());
            *response.status_mut() = StatusCode::NOT_FOUND;
            response
        }
    }
}
