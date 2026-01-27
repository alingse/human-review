use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// 审查数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewData {
    /// 输入类型
    pub input_type: InputType,
    /// 原始输入
    pub input: String,
    /// 评论列表
    pub comments: Vec<Comment>,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 状态
    pub status: ReviewStatus,
}

/// 输入类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InputType {
    #[serde(rename = "commit_diff")]
    CommitDiff { commit: String },
    #[serde(rename = "file_content")]
    FileContent { path: String },
    #[serde(rename = "working_tree_diff")]
    WorkingTreeDiff,
}

/// 评论
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    /// 唯一 ID
    pub id: String,
    /// 文件路径（diff 模式下）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// 行号
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    /// 评论内容
    pub text: String,
    /// 创建时间
    pub created_at: DateTime<Utc>,
}

impl Comment {
    pub fn new(file: Option<String>, line: Option<u32>, text: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            file,
            line,
            text,
            created_at: Utc::now(),
        }
    }
}

/// 审查状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReviewStatus {
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "completed")]
    Completed,
}

/// API 响应 - 初始数据
#[derive(Debug, Serialize)]
pub struct DataResponse {
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub files: Vec<FileData>,
    pub comments: Vec<Comment>,
}

/// 文件数据（用于前端渲染）
#[derive(Debug, Serialize)]
pub struct FileData {
    pub path: String,
    pub status: String,
    pub lines: Vec<LineData>,
}

/// 行数据
#[derive(Debug, Clone, Serialize)]
pub struct LineData {
    pub number: u32,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    pub type_: Option<String>, // "added", "removed", or null
}

/// API 请求 - 添加评论
#[derive(Debug, Deserialize)]
pub struct AddCommentRequest {
    #[serde(rename = "file")]
    pub file: Option<String>,
    pub line: Option<u32>,
    pub text: String,
}

/// 更新评论请求
#[derive(Debug, Deserialize)]
pub struct UpdateCommentRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// 完成响应
#[derive(Debug, Serialize)]
pub struct CompletionResponse {
    pub message: String,
    pub comment_count: usize,
}
