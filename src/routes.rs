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

/// 获取初始数据
pub async fn get_data_handler(
    State(state): State<AppState>,
) -> Result<Json<DataResponse>, AppError> {
    let data = state.data.read().await;

    // 根据 input_type 获取文件内容
    let files = match &data.input_type {
        InputType::CommitDiff { commit } => git_ops::get_commit_diff(commit)?,
        InputType::FileContent { path } => git_ops::get_file_content(path)?,
        InputType::WorkingTreeDiff => git_ops::get_working_tree_diff()?,
    };

    let response = DataResponse {
        type_: match &data.input_type {
            InputType::CommitDiff { .. } => "commit_diff".to_string(),
            InputType::FileContent { .. } => "file_content".to_string(),
            InputType::WorkingTreeDiff => "working_tree_diff".to_string(),
        },
        title: data.input.clone(),
        files,
        comments: data.comments.clone(),
    };

    Ok(Json(response))
}

/// 添加评论
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

/// 更新评论
pub async fn update_comment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateCommentRequest>,
) -> Result<Json<Comment>, AppError> {
    let mut data = state.data.write().await;

    if let Some(idx) = data.comments.iter().position(|c| c.id == id) {
        if let Some(text) = req.text {
            data.comments[idx].text = text;
        }
        let updated = data.comments[idx].clone();
        Ok(Json(updated))
    } else {
        Err(AppError::CommentNotFound(id))
    }
}

/// 删除评论
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

/// 完成审查
pub async fn complete_handler(
    State(state): State<AppState>,
) -> Result<Json<CompletionResponse>, AppError> {
    let mut data = state.data.write().await;
    data.status = ReviewStatus::Completed;

    // 保存最终数据
    let _ = FINAL_DATA.set((*data).clone());

    // 发送完成信号
    COMPLETION_SIGNAL.notify_one();

    Ok(Json(CompletionResponse {
        message: "Review completed".to_string(),
        comment_count: data.comments.len(),
    }))
}


/// 应用错误
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
