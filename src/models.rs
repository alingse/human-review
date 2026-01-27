use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Review data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewData {
    /// Input type
    pub input_type: InputType,
    /// Original input
    pub input: String,
    /// Comments list
    pub comments: Vec<Comment>,
    /// Creation time
    pub created_at: DateTime<Utc>,
    /// Status
    pub status: ReviewStatus,
}

/// Input type
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

impl InputType {
    pub fn display_title(&self) -> String {
        match self {
            InputType::CommitDiff { commit } => format!("Commit: {}", commit),
            InputType::FileContent { path } => format!("File: {}", path),
            InputType::WorkingTreeDiff => "Current Changes".to_string(),
        }
    }
}

/// Comment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    /// Unique ID
    pub id: String,
    /// File path (for diff mode)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// Line number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    /// Comment content
    pub text: String,
    /// Creation time
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

/// Review status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReviewStatus {
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "completed")]
    Completed,
}

/// API response - initial data
#[derive(Debug, Serialize)]
pub struct DataResponse {
    pub input_type: InputType,
    pub files: Vec<FileData>,
    pub comments: Vec<Comment>,
}

/// File data (for frontend rendering)
#[derive(Debug, Serialize)]
pub struct FileData {
    pub path: String,
    pub status: String,
    pub lines: Vec<LineData>,
}

/// Line data
#[derive(Debug, Clone, Serialize)]
pub struct LineData {
    pub number: u32,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    pub type_: Option<String>,
}

/// API request - add comment
#[derive(Debug, Deserialize)]
pub struct AddCommentRequest {
    #[serde(rename = "file")]
    pub file: Option<String>,
    pub line: Option<u32>,
    pub text: String,
}

/// Update comment request
#[derive(Debug, Deserialize)]
pub struct UpdateCommentRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// Completion response
#[derive(Debug, Serialize)]
pub struct CompletionResponse {
    pub message: String,
    pub comment_count: usize,
}
