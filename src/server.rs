use anyhow::Result;
use axum::{
    body::Body,
    extract::{State, Path},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post, put, delete},
    Router,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::info;

use crate::models::ReviewData;
use crate::routes::*;
use crate::static_assets;

/// Milliseconds to wait after completion signal before returning final data
const COMPLETION_WAIT_MS: u64 = 100;

/// Server state
#[derive(Clone)]
pub struct AppState {
    pub data: Arc<RwLock<ReviewData>>,
}

/// Global completion signal and data storage
pub static COMPLETION_SIGNAL: tokio::sync::Notify = tokio::sync::Notify::const_new();
pub static FINAL_DATA: tokio::sync::OnceCell<ReviewData> = tokio::sync::OnceCell::const_new();

/// Run server
pub async fn run(port: u16, data: ReviewData) -> Result<u16> {
    let state = AppState {
        data: Arc::new(RwLock::new(data)),
    };

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/api/data", get(get_data_handler))
        .route("/api/comments", post(add_comment_handler))
        .route("/api/comments/:id", put(update_comment_handler))
        .route("/api/comments/:id", delete(delete_comment_handler))
        .route("/api/complete", post(complete_handler))
        .route("/static/*path", get(serve_static_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    let actual_port = listener.local_addr()?.port();
    info!("Server running on port {}", actual_port);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Server error: {}", e);
        }
    });

    Ok(actual_port)
}

/// Wait for completion signal and return final data
pub async fn wait_for_completion() -> Result<ReviewData> {
    COMPLETION_SIGNAL.notified().await;
    tokio::time::sleep(Duration::from_millis(COMPLETION_WAIT_MS)).await;

    FINAL_DATA
        .get()
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("Final data not available"))
}

/// Index page handler
async fn index_handler() -> impl IntoResponse {
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
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static(mime),
            );
            response
        }
        None => {
            let mut response = Response::new(Body::empty());
            *response.status_mut() = StatusCode::NOT_FOUND;
            response
        }
    }
}
