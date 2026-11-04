use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
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

/// Durable review record, including the exact content the reviewer saw.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSession {
    pub id: String,
    pub cwd: std::path::PathBuf,
    pub updated_at: DateTime<Utc>,
    #[serde(flatten)]
    pub data: ReviewData,
    pub files: Vec<FileData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReviewSummary {
    pub id: String,
    pub input: String,
    pub cwd: std::path::PathBuf,
    pub status: ReviewStatus,
    pub comment_count: usize,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<ReviewSession> for ReviewSummary {
    fn from(session: ReviewSession) -> Self {
        Self {
            id: session.id,
            input: session.data.input,
            cwd: session.cwd,
            status: session.data.status,
            comment_count: session.data.comments.len(),
            created_at: session.data.created_at,
            updated_at: session.updated_at,
        }
    }
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
    /// Column number (for precise inline positioning)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,
    /// Diff side; absent in comments from older clients.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<DiffSide>,
    /// Source range and relative point in a rendered Markdown block.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<MarkdownAnchor>,
    /// Comment content
    pub text: String,
    /// Creation time
    pub created_at: DateTime<Utc>,
}

impl Comment {
    pub fn new(file: Option<String>, line: Option<u32>, column: Option<u32>, text: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            file,
            line,
            column,
            side: None,
            anchor: None,
            text,
            created_at: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DiffSide {
    Old,
    New,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkdownAnchor {
    pub start_line: u32,
    pub end_line: u32,
    pub x: f64,
    pub y: f64,
    pub quote: String,
}

/// Review status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReviewStatus {
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "completed")]
    Completed,
}

/// API response - initial data
#[derive(Debug, Serialize)]
pub struct DataResponse {
    pub review_id: String,
    pub status: ReviewStatus,
    pub read_only: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_note: Option<String>,
    pub input_type: InputType,
    pub files: Vec<FileData>,
    pub comments: Vec<Comment>,
}

/// File data (for frontend rendering)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileData {
    pub path: String,
    pub status: String,
    pub lines: Vec<LineData>,
    /// Complete snapshots, since diff hunks alone cannot render Markdown.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub markdown: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_markdown: Option<String>,
}

/// Line data
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub column: Option<u32>,
    pub side: Option<DiffSide>,
    pub anchor: Option<MarkdownAnchor>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comment_serializes_precise_column() {
        let comment = Comment::new(
            Some("src/app.js".to_string()),
            Some(52),
            Some(12),
            "Check this expression".to_string(),
        );
        let value = serde_json::to_value(comment).unwrap();

        assert_eq!(value["line"], 52);
        assert_eq!(value["column"], 12);
    }

    #[test]
    fn add_comment_request_accepts_legacy_payload_without_column() {
        let request: AddCommentRequest = serde_json::from_value(serde_json::json!({
            "file": "src/app.js",
            "line": 52,
            "text": "Legacy comment"
        }))
        .unwrap();

        assert_eq!(request.column, None);
    }
}
