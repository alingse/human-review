# hrev CLI 工具实现计划

## 需求概述

创建一个 CLI 工具 `hrev`，用于人工代码审查。

### 三种用法
1. `hrev <commit-hash>` - 显示某个 commit 的 diff
2. `hrev <file.md>` - 显示文档内容（如 plan.md）
3. `hrev diff` - 显示当前 git diff

### 功能流程
1. 启动后打开浏览器页面
2. 显示对应内容（diff/文档），支持行号
3. 用户在 HTML 页面上添加评论（支持行级评论）
4. 评论完成后提交，作为工具输出

### 额外需求
- 提供 Claude Code skill/command，引导 AI 在修改后让人 review
- 在 git commit 前、PR 前进行人工 review

## 技术选型

- 语言: **Rust**（性能、单一二进制、无依赖）
- Web框架: axum（异步、基于 tokio）
- 模板: askama（编译时模板检查）
- CLI: clap（derive API）
- Git: git2（Rust git 绑定）

## 项目结构

```
hrev/
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── main.rs           # CLI 入口
│   ├── cli.rs            # 命令行参数解析
│   ├── server.rs         # Axum 服务器
│   ├── git_ops.rs        # Git 操作封装
│   ├── models.rs         # 数据模型
│   └── templates/
│       └── review.html   # 前端页面（askama）
├── skills/
│   └── review-changes.md # Claude Code skill 定义
└── README.md
```

## 详细设计

### 1. CLI 参数设计

```rust
// cli.rs
#[derive(Parser, Debug)]
#[command(name = "hrev")]
#[command(about = "Human review CLI tool", long_about = None)]
struct Args {
    /// Input: commit hash, file path, or "diff"
    #[arg(value_name = "INPUT")]
    input: String,

    /// Port for web server (default: random available port)
    #[arg(short, long, default_value = "0")]
    port: u16,

    /// Don't open browser automatically
    #[arg(long, default_value = "false")]
    no_browser: bool,
}
```

**输入判断逻辑：**
- 如果 `input` 是 `"diff"` → 显示当前 git diff
- 如果 `input` 是存在的文件路径 → 显示文件内容
- 如果 `input` 是 40 字符 hex string → 解析为 commit hash
- 如果 `input` 是短 hash（7+ 字符） → 尝试解析为 commit

### 2. 数据模型

```rust
// models.rs
use serde::{Deserialize, Serialize};

/// 评论数据存储格式
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReviewData {
    /// 输入类型
    input_type: InputType,
    /// 原始输入
    input: String,
    /// 评论列表
    comments: Vec<Comment>,
    /// 创建时间
    created_at: DateTime<Utc>,
    /// 状态
    status: ReviewStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum InputType {
    CommitDiff { commit: String },
    FileContent { path: String },
    WorkingTreeDiff,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Comment {
    /// 唯一 ID
    id: String,
    /// 文件路径（diff 模式下）
    file: Option<String>,
    /// 行号
    line: Option<u32>,
    /// 评论内容
    text: String,
    /// 创建时间
    created_at: DateTime<Utc>,
    /// 已解决标记
    resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum ReviewStatus {
    InProgress,
    Completed,
}
```

**评论存储：**
- 文件位置: `.hrev/<input-hash>/comments.json`
- 输入 hash 的计算: `sha256(input)` 作为目录名

### 3. API 设计

```rust
// server.rs
// RESTful API 路由

// GET /api/data - 获取初始数据（diff/文件内容）
// POST /api/comments - 添加评论
// PUT /api/comments/:id - 更新评论
// DELETE /api/comments/:id - 删除评论
// POST /api/complete - 完成审查，输出结果并关闭服务器

// WebSocket (可选，用于实时同步)
// WS /ws - 实时推送评论更新
```

**API 响应格式：**

```json
// GET /api/data 响应
{
  "type": "commit_diff" | "file_content" | "working_tree_diff",
  "title": "Commit abc1234 or path/to/file.md",
  "content": "<html>渲染后的内容</html>",
  "comments": [
    {"id": "1", "file": "src/main.rs", "line": 42, "text": "...", "resolved": false}
  ]
}

// POST /api/comments 请求
{
  "file": "src/main.rs",
  "line": 42,
  "text": "这里可以改进..."
}
```

### 4. 前端设计

**页面布局：**
```
┌─────────────────────────────────────────────────────────┐
│  hrev - Commit: abc1234                    [完成] [导出] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │   文件列表          │  │   内容区域               │  │
│  │  ┌───────────────┐  │  │  ┌─────────────────────┐ │  │
│  │  │ src/main.rs   │  │  │  │ 1  fn main() {      │ │  │
│  │  │ src/lib.rs    │  │  │  │ 2      println!();  │ │  │
│  │  │ README.md     │  │  │  │ 3  }                │ │  │
│  │  └───────────────┘  │  │  └─────────────────────┘ │  │
│  │                     │  │                           │  │
│  │  [所有文件]         │  │  💬 [2] 这里可以改进...    │  │
│  │                     │  │                           │  │
│  └─────────────────────┘  └──────────────────────────┘  │
│                                                           │
│  [+ 添加行内评论]  [全局评论]                              │
└─────────────────────────────────────────────────────────┘
```

**交互方式：**
1. 点击任意行 → 弹出评论输入框
2. 评论显示在对应行下方
3. 评论支持：编辑、删除、标记已解决
4. 右侧显示所有文件列表（diff 模式）
5. 点击文件名切换显示

**核心 JavaScript 功能：**
```javascript
// app.js
class ReviewApp {
  // 加载初始数据
  async loadData();

  // 渲染 diff/文件内容
  renderContent(content, type);

  // 添加评论
  async addComment(file, line, text);

  // 渲染评论
  renderComment(comment);

  // 点击行事件
  onLineClick(file, line);

  // 完成审查
  async complete();
}
```

### 5. Rust 代码实现（详细）

#### 5.1 Cargo.toml

```toml
[package]
name = "hrev"
version = "0.1.0"
edition = "2021"
description = "Human review CLI tool"
license = "MIT"

[dependencies]
# CLI
clap = { version = "4.5", features = ["derive"] }

# Async runtime
tokio = { version = "1.40", features = ["full"] }

# Web framework
axum = { version = "0.7", features = ["ws"] }
tower = "0.5"
tower-http = { version = "0.5", features = ["fs", "cors"] }

# Templating
askama = { version = "0.12", features = ["with-axum"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Git operations
git2 = "0.19"

# Date/time
chrono = { version = "0.4", features = ["serde"] }

# Hashing
sha2 = "0.10"

# UUID
uuid = { version = "1.10", features = ["v4", "serde"] }

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Logging
tracing = "0.1"
tracing-subscriber = "0.3"

# Browser open
open = "5.3"

# Terminal colors
colored = "2.1"
```

#### 5.2 src/main.rs

```rust
use anyhow::Result;
use clap::Parser;
use tracing::{info, warn};

mod cli;
mod server;
mod git_ops;
mod models;
mod storage;
mod routes;
mod output;

use cli::Args;
use git_ops::parse_input;
use storage::ReviewStorage;

#[tokio::main]
async fn main() -> Result<()> {
    // 初始化日志
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    // 解析输入
    let input = parse_input(&args.input)?;
    info!("Parsed input: {:?}", input);

    // 创建存储
    let storage = ReviewStorage::new(&input)?;
    let data = storage.load_or_create()?;

    // 启动服务器
    let port = server::run(args.port, data.clone()).await?;

    // 打开浏览器
    if !args.no_browser {
        if let Err(e) = open::that(format!("http://localhost:{}", port)) {
            warn!("Failed to open browser: {}", e);
            eprintln!("Please open http://localhost:{} in your browser", port);
        }
    }

    // 等待服务器完成
    server::wait_for_completion().await?;

    // 输出评论摘要
    let final_data = storage.load()?;
    output::print_summary(&final_data);

    Ok(())
}
```

#### 5.3 src/cli.rs

```rust
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "hrev")]
#[command(author = "hrev")]
#[command(version = "0.1.0")]
#[command(about = "Human review CLI tool", long_about = None)]
pub struct Args {
    /// Input: commit hash, file path, or "diff"
    #[arg(value_name = "INPUT")]
    pub input: String,

    /// Port for web server (default: random available port)
    #[arg(short, long, default_value = "0")]
    pub port: u16,

    /// Don't open browser automatically
    #[arg(long, default_value = "false")]
    pub no_browser: bool,
}
```

#### 5.4 src/models.rs

```rust
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
    /// 已解决标记
    pub resolved: bool,
    /// 父评论 ID（用于回复）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

impl Comment {
    pub fn new(file: Option<String>, line: Option<u32>, text: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            file,
            line,
            text,
            created_at: Utc::now(),
            resolved: false,
            parent_id: None,
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
#[derive(Debug, Serialize)]
pub struct LineData {
    pub number: u32,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
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
```

#### 5.5 src/git_ops.rs

```rust
use anyhow::{Context, Result};
use git2::{Repository, Diff, Delta};
use std::path::{Path, PathBuf};
use std::fs;

use crate::models::{InputType, FileData, LineData, ReviewData, Comment, ReviewStatus};
use crate::storage::ReviewStorage;

/// 解析输入
pub fn parse_input(input: &str) -> Result<InputType> {
    // 检查是否是 "diff" 关键字
    if input == "diff" {
        return Ok(InputType::WorkingTreeDiff);
    }

    // 检查是否是文件路径
    if Path::new(input).exists() {
        return Ok(InputType::FileContent {
            path: input.to_string(),
        });
    }

    // 尝试解析为 commit hash
    if let Ok(repo) = Repository::discover(".") {
        if let Ok(_) = repo.revparse_single(input) {
            return Ok(InputType::CommitDiff {
                commit: input.to_string(),
            });
        }
    }

    Err(anyhow::anyhow!("无法解析输入: {}. 请提供: commit hash, 文件路径, 或 'diff'", input))
}

/// 获取工作区 diff
pub fn get_working_tree_diff() -> Result<Vec<FileData>> {
    let repo = Repository::discover(".")?;
    let head = repo.head()?;
    let head_tree = head.peel_to_tree()?;

    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.include_unmodified(false);
    diff_opts.recurse_untracked_dirs(true);

    let diff = repo.diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut diff_opts))?;

    diff_to_file_data(&diff, &repo)
}

/// 获取 commit diff
pub fn get_commit_diff(commit_hash: &str) -> Result<Vec<FileData>> {
    let repo = Repository::discover(".")?;
    let obj = repo.revparse_single(commit_hash)?;
    let commit = obj.peel_to_commit()?;

    let parent = commit.parent(0)?;
    let parent_tree = parent.tree()?;
    let commit_tree = commit.tree()?;

    let diff = repo.diff_tree_to_tree(
        Some(&parent_tree),
        Some(&commit_tree),
        None,
    )?;

    diff_to_file_data(&diff, &repo)
}

/// 获取文件内容
pub fn get_file_content(path: &str) -> Result<Vec<FileData>> {
    let content = fs::read_to_string(path)?;
    let lines: Vec<LineData> = content
        .lines()
        .enumerate()
        .map(|(i, line)| LineData {
            number: (i + 1) as u32,
            content: line.to_string(),
            type_: None,
        })
        .collect();

    Ok(vec![FileData {
        path: path.to_string(),
        status: "view".to_string(),
        lines,
    }])
}

/// 将 git2 Diff 转换为 FileData
fn diff_to_file_data(diff: &Diff, repo: &Repository) -> Result<Vec<FileData>> {
    let mut files = Vec::new();

    diff.foreach(
        &mut |delta, _progress| {
            let path = delta.new_file().path().and_then(|p| p.to_str()).unwrap_or("unknown");
            let status = match delta.status() {
                Delta::Added => "added",
                Delta::Deleted => "deleted",
                Delta::Modified => "modified",
                Delta::Renamed => "renamed",
                Delta::Copied => "copied",
                _ => "modified",
            };

            files.push(FileData {
                path: path.to_string(),
                status: status.to_string(),
                lines: Vec::new(),
            });
            true
        },
        None,
        Some(|delta, hunk| {
            // 处理每个 hunk
            true
        }),
        Some(|delta, hunk, line| {
            // 处理每一行
            let path = delta.new_file().path().and_then(|p| p.to_str()).unwrap_or("unknown");
            if let Some(file) = files.iter_mut().find(|f| f.path == path) {
                let line_num = line.new_lineno().unwrap_or(0);
                let content = std::str::from_utf8(line.content()).unwrap_or("").trim_end().to_string();
                let line_type = match line.origin() {
                    '+' | '>' => Some("added".to_string()),
                    '-' | '<' => Some("removed".to_string()),
                    _ => None,
                };

                file.lines.push(LineData {
                    number: line_num,
                    content,
                    type_: line_type,
                });
            }
            true
        }),
    )?;

    Ok(files)
}
```

#### 5.6 src/storage.rs

```rust
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use sha2::{Sha256, Digest};
use chrono::Utc;

use crate::models::{ReviewData, ReviewStatus, InputType, Comment};
use crate::git_ops;

/// 审查存储管理
pub struct ReviewStorage {
    data_dir: PathBuf,
    input: InputType,
}

impl ReviewStorage {
    /// 创建新的存储
    pub fn new(input: &InputType) -> Result<Self> {
        let base_dir = PathBuf::from(".hrev");
        fs::create_dir_all(&base_dir)?;

        // 计算输入的 hash 作为目录名
        let input_str = match input {
            InputType::CommitDiff { commit } => format!("commit_{}", commit),
            InputType::FileContent { path } => format!("file_{}", path),
            InputType::WorkingTreeDiff => "diff".to_string(),
        };

        let mut hasher = Sha256::new();
        hasher.update(input_str.as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        let data_dir = base_dir.join(&hash[..16]);

        fs::create_dir_all(&data_dir)?;

        Ok(Self {
            data_dir,
            input: input.clone(),
        })
    }

    /// 获取数据文件路径
    fn data_file(&self) -> PathBuf {
        self.data_dir.join("data.json")
    }

    /// 加载或创建数据
    pub fn load_or_create(&self) -> Result<ReviewData> {
        let data_file = self.data_file();

        if data_file.exists() {
            self.load()
        } else {
            self.create()
        }
    }

    /// 加载数据
    pub fn load(&self) -> Result<ReviewData> {
        let data_file = self.data_file();
        let content = fs::read_to_string(&data_file)
            .context("Failed to read review data")?;
        let data: ReviewData = serde_json::from_str(&content)
            .context("Failed to parse review data")?;
        Ok(data)
    }

    /// 保存数据
    pub fn save(&self, data: &ReviewData) -> Result<()> {
        let data_file = self.data_file();
        let content = serde_json::to_string_pretty(data)
            .context("Failed to serialize review data")?;
        fs::write(&data_file, content)
            .context("Failed to write review data")?;
        Ok(())
    }

    /// 创建新数据
    fn create(&self) -> Result<ReviewData> {
        let input_str = match &self.input {
            InputType::CommitDiff { commit } => format!("Commit: {}", commit),
            InputType::FileContent { path } => format!("File: {}", path),
            InputType::WorkingTreeDiff => "Working Tree Diff".to_string(),
        };

        Ok(ReviewData {
            input_type: self.input.clone(),
            input: input_str,
            comments: Vec::new(),
            created_at: Utc::now(),
            status: ReviewStatus::InProgress,
        })
    }
}
```

#### 5.7 src/server.rs

```rust
use anyhow::Result;
use axum::{
    extract::{
        State,
        Path,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post, put, delete},
    Router,
    Json,
};
use askama::Template;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::info;

use crate::models::{ReviewData, AddCommentRequest, Comment, DataResponse, FileData};
use crate::storage::ReviewStorage;
use crate::routes::*;
use crate::git_ops;

/// 服务器状态
#[derive(Clone)]
pub struct AppState {
    pub data: Arc<RwLock<ReviewData>>,
    pub storage: ReviewStorage,
}

/// 全局完成信号
static COMPLETION_SIGNAL: tokio::sync::Notify = tokio::sync::Notify::const_notify();

/// 运行服务器
pub async fn run(port: u16, data: ReviewData) -> Result<u16> {
    let storage = ReviewStorage::new(&data.input_type)?;
    storage.save(&data)?;

    let state = AppState {
        data: Arc::new(RwLock::new(data)),
        storage,
    };

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/api/data", get(get_data_handler))
        .route("/api/comments", post(add_comment_handler))
        .route("/api/comments/:id", put(update_comment_handler))
        .route("/api/comments/:id", delete(delete_comment_handler))
        .route("/api/complete", post(complete_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // 绑定端口
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    let actual_port = listener.local_addr()?.port();
    info!("Server running on port {}", actual_port);

    // 启动服务器
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    Ok(actual_port)
}

/// 等待完成信号
pub async fn wait_for_completion() -> Result<()> {
    COMPLETION_SIGNAL.notified().await;
    Ok(())
}

/// 主页模板
#[derive(Template)]
#[template(path = "review.html")]
struct IndexTemplate {}

/// 主页 handler
async fn index_handler() -> impl IntoResponse {
    IndexTemplate {}
}
```

#### 5.8 src/routes.rs

```rust
use axum::{
    extract::{
        State,
        Path,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use tracing::info;

use crate::models::*;
use crate::server::{AppState, COMPLETION_SIGNAL};
use crate::git_ops;

/// 获取初始数据
pub async fn get_data_handler(State(state): State<AppState>) -> Result<Json<DataResponse>, AppError> {
    let data = state.data.read().await;

    // 根据 input_type 获取文件内容
    let files = match &data.input_type {
        InputType::CommitDiff { commit } => {
            git_ops::get_commit_diff(commit)?
        }
        InputType::FileContent { path } => {
            git_ops::get_file_content(path)?
        }
        InputType::WorkingTreeDiff => {
            git_ops::get_working_tree_diff()?
        }
    };

    let response = DataResponse {
        type_: match data.input_type {
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

    state.storage.save(&data)?;
    info!("Added comment: {}", comment.id);

    Ok(Json(comment))
}

/// 更新评论
pub async fn update_comment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut comment): Json<Comment>,
) -> Result<Json<Comment>, AppError> {
    let mut data = state.data.write().await;

    if let Some(existing) = data.comments.iter_mut().find(|c| c.id == id) {
        comment.id = id; // 确保 ID 不变
        *existing = comment.clone();
        state.storage.save(&data)?;
        Ok(Json(comment))
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
        state.storage.save(&data)?;
        info!("Deleted comment: {}", id);
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::CommentNotFound(id))
    }
}

/// 完成审查
pub async fn complete_handler(State(state): State<AppState>) -> Result<Json<CompletionResponse>, AppError> {
    let mut data = state.data.write().await;
    data.status = ReviewStatus::Completed;
    state.storage.save(&data)?;

    // 发送完成信号
    COMPLETION_SIGNAL.notify_one();

    Ok(Json(CompletionResponse {
        message: "Review completed".to_string(),
        comment_count: data.comments.len(),
    }))
}

/// 完成响应
#[derive(serde::Serialize)]
struct CompletionResponse {
    message: String,
    comment_count: usize,
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
            AppError::CommentNotFound(id) => (StatusCode::NOT_FOUND, format!("Comment not found: {}", id)),
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
```

#### 5.9 src/output.rs

```rust
use colored::Colorize;
use crate::models::{ReviewData, Comment};

/// 打印评论摘要（Markdown 格式）
pub fn print_summary(data: &ReviewData) {
    println!();
    println!("{}", "═".repeat(60));
    println!("{}", "📋 Review Summary".bold().cyan());
    println!("{}", "═".repeat(60));
    println!();

    println!("{}: {}", "Input".bold(), data.input);
    println!("{}: {}", "Created".bold(), data.created_at.format("%Y-%m-%d %H:%M:%S"));
    println!("{}: {}", "Comments".bold(), data.comments.len());
    println!();

    if data.comments.is_empty() {
        println!("{}", "No comments added.".dimmed());
        return;
    }

    // 按文件分组
    let mut by_file: std::collections::HashMap<Option<String>, Vec<&Comment>> = std::collections::HashMap::new();
    for comment in &data.comments {
        by_file.entry(comment.file.clone()).or_default().push(comment);
    }

    // 打印评论（Markdown 格式）
    for (file, comments) in by_file.iter() {
        if let Some(f) = file {
            println!("\n## 📄 {}", f.bold());
        } else {
            println!("\n## 💬 Global Comments");
        }

        for comment in comments {
            println!();
            if comment.resolved {
                print!("✅ ");
            } else {
                print!("💬 ");
            }

            if let Some(line) = comment.line {
                print!("Line {}: ", line.to_string().yellow());
            }

            println!("{}", comment.text);
            println!("    {} {}", "─".dimmed(), comment.created_at.format("%H:%M").to_string().dimmed());

            // 统计
            let unresolved = data.comments.iter().filter(|c| !c.resolved).count();
            let resolved = data.comments.iter().filter(|c| c.resolved).count();

            println!();
            println!("{}", "─".repeat(60).dimmed());
            println!("{} {} unresolved, {} resolved",
                "Summary:".bold(),
                unresolved.to_string().yellow(),
                resolved.to_string().green()
            );
        }
    }
}
```

### 6. Claude Code Skill 设计

**文件位置:** `.claude/skills/human-review.md`

```markdown
---
description: 启动人工审查流程，自动读取评论并修改代码
---

## Human Review Skill

自动启动人工审查，等待用户完成评论，然后自动根据反馈修改代码。

## 工作流程

### 1. 检测变更并启动 hrev

首先判断当前状态：
- 有未提交的 git 变更 → `hrev diff`
- 用户指定了文件 → `hrev <file>`
- 用户指定了 commit → `hrev <commit>`

### 2. 等待审查完成

- 运行 hrev 命令
- 工具会自动打开浏览器
- **等待**用户在浏览器中完成评论
- 用户点击"完成"后，hrev 会输出结果并退出

### 3. 解析审查结果

hrev 输出包含：
- 终端摘要（评论数量、涉及文件）
- Markdown 文件（详细评论 + 上下文）
- JSON 文件（结构化数据）

从输出中提取：
```bash
# 输出示例
Review Results: diff | 5 comment(s)

📄 src/main.rs
  [L42] Consider using debug logging instead
  [L55] This function should return a Result

📄 src/parser.rs
  [L12] Variable name unclear
  [L30] Missing error handling
  [L45] Great implementation!

💾 Full results saved to:
   .hrev/sessions/abc123/review.json
   .hrev/sessions/abc123/review.md
```

### 4. 自动处理评论（关键）

**读取 `.hrev/sessions/<id>/review.md`**，解析每条评论：

对于每条评论：
```markdown
#### Line 42: Consider using debug logging instead
```context
  40 |     fn process(&self) {
  41 |         let data = self.load();
  42 | >>> Consider using debug logging instead
  43 |         println!("{:?}", data);
  44 |     }
```
```

**自动处理策略：**
1. 理解评论内容
2. 定位到对应文件和行号
3. 根据评论意图修改代码
4. 修改后报告变更

### 5. 汇报处理结果

完成所有修改后，汇报：
```
✅ 已处理 5 条评论：

1. src/main.rs:42 - Consider using debug logging instead
   → 改用 log::debug!() 替代 println!()

2. src/main.rs:55 - This function should return a Result
   → 添加了 Result<(), Error> 返回类型

3. src/parser.rs:12 - Variable name unclear
   → 重命名为 input_buffer

4. src/parser.rs:30 - Missing error handling
   → 添加了 ? 错误传播

5. src/parser.rs:45 - Great implementation!
   → （无需修改）

是否需要再次 review？
```

## 重要规则

- **必须等待** hrev 完成后再继续
- **必须读取** review.md 文件获取完整上下文
- **必须处理** 每条评论（即使是"同意"类评论也要确认）
- **修改前** 确认理解评论意图
- **修改后** 汇报每条评论的处理方式
```

**文件位置:** `.claude/skills/human-review.json`

```json
{
  "name": "human-review",
  "description": "Launch human review and auto-apply feedback",
  "parameters": {
    "target": {
      "type": "string",
      "description": "Commit hash, file path, or 'diff'",
      "default": "diff"
    }
  }
}
```

### Skill 调用示例

用户说：
- "Review my changes" → skill 检测变更，调用 `hrev diff`
- "Review this plan" → skill 调用 `hrev plan.md`
- "Review commit abc123" → skill 调用 `hrev abc123`

### 7. 完整项目结构

```
hrev/
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── main.rs           # CLI 入口，main 函数
│   ├── cli.rs            # Args 结构体，输入解析
│   ├── server.rs         # Axum 服务器，路由定义
│   ├── git_ops.rs        # Git 操作封装
│   ├── models.rs         # 数据结构定义
│   ├── storage.rs        # 评论存储管理
│   └── routes.rs         # API handler
├── templates/
│   └── review.html       # Askama 模板
├── static/
│   └── app.js            # 前端逻辑（可内联到 html）
├── skills/
│   └── review-changes.md # Claude Code skill
└── README.md
```

### 8. 关键文件预览

**src/main.rs:**
```rust
#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let parsed = parse_input(&args.input)?;

    let (data, port) = setup_review_session(parsed).await?;

    if !args.no_browser {
        open_browser(port);
    }

    run_server(data, port).await?;

    // 输出评论摘要
    print_summary(&data);

    Ok(())
}
```

### 9. 四个关键技术问题的解决方案

#### 问题 1: 用户评论怎么收集？

**前端收集流程：**

```javascript
// static/app.js - 评论收集逻辑
class ReviewApp {
    constructor() {
        this.comments = [];
        this.currentFile = null;
    }

    // 点击行时触发
    onLineClick(lineElement) {
        const file = this.currentFile;
        const line = parseInt(lineElement.dataset.line);
        this.openCommentModal(file, line);
    }

    // 打开评论输入弹窗
    openCommentModal(file, line) {
        const modal = document.getElementById('comment-modal');
        const textarea = document.getElementById('comment-text');

        modal.dataset.file = file;
        modal.dataset.line = line;
        textarea.value = '';
        modal.classList.remove('hidden');
    }

    // 提交评论
    async submitComment() {
        const modal = document.getElementById('comment-modal');
        const comment = {
            file: modal.dataset.file,
            line: parseInt(modal.dataset.line),
            text: document.getElementById('comment-text').value,
            timestamp: new Date().toISOString()
        };

        // 发送到后端
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(comment)
        });

        const saved = await response.json();
        this.comments.push(saved);
        this.renderComments();
        modal.classList.add('hidden');
    }
}
```

**后端存储流程：**

```rust
// src/storage.rs - 评论持久化
use serde_json;
use std::fs;
use std::path::PathBuf;

pub struct CommentStorage {
    session_dir: PathBuf,
}

impl CommentStorage {
    pub fn new(session_id: &str) -> Result<Self> {
        let dir = dirs::home_dir()
            .unwrap()
            .join(".hrev")
            .join("sessions")
            .join(session_id);
        fs::create_dir_all(&dir)?;
        Ok(Self { session_dir: dir })
    }

    // 添加评论
    pub fn add_comment(&self, comment: &Comment) -> Result<()> {
        let mut comments = self.load_comments()?;
        comments.push(comment.clone());
        self.save_comments(&comments)?;
        Ok(())
    }

    // 保存到 JSON
    fn save_comments(&self, comments: &[Comment]) -> Result<()> {
        let path = self.session_dir.join("comments.json");
        let json = serde_json::to_string_pretty(comments)?;
        fs::write(path, json)?;
        Ok(())
    }
}
```

#### 问题 2: JS 渲染 diff 用哪一套？

**方案：自己实现简单 diff 渲染，不依赖外部库**

```javascript
// static/app.js - 简单 diff 渲染
class DiffRenderer {
    // 渲染单个 diff hunk
    renderHunk(hunk) {
        return hunk.lines.map(line => {
            const className = line.type === 'added' ? 'added' :
                            line.type === 'removed' ? 'removed' : 'context';
            const prefix = line.type === 'added' ? '+' :
                          line.type === 'removed' ? '-' : ' ';
            return `<div class="diff-line ${className}"
                        data-file="${hunk.file}"
                        data-line="${line.number}"
                        onclick="app.onLineClick(this)">
                        <span class="line-prefix">${prefix}</span>
                        <span class="line-content">${this.escapeHtml(line.content)}</span>
                    </div>`;
        }).join('');
    }

    // 渲染文件 diff
    renderFileDiff(fileDiff) {
        return `
            <div class="file-diff" data-file="${fileDiff.path}">
                <div class="file-header">
                    <span class="file-status ${fileDiff.status}">${fileDiff.status}</span>
                    <span class="file-path">${fileDiff.path}</span>
                </div>
                ${fileDiff.hunks.map(h => this.renderHunk(h)).join('')}
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

**CSS 样式：**

```css
/* static/app.css - Diff 样式 */
.diff-line {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 13px;
    line-height: 20px;
    padding: 0 10px;
    cursor: pointer;
    transition: background 0.15s;
}

.diff-line:hover {
    background: rgba(255, 255, 255, 0.05);
}

.diff-line .line-prefix {
    color: #8b949e;
    margin-right: 10px;
    user-select: none;
}

.diff-line.added {
    background: rgba(46, 160, 67, 0.15);
}

.diff-line.added .line-prefix {
    color: #3fb950;
}

.diff-line.removed {
    background: rgba(248, 81, 73, 0.15);
}

.diff-line.removed .line-prefix {
    color: #f85149;
}
```

#### 问题 3: 怎么打包到一个 binary 里面？

**方案：使用 `rust-embed` 嵌入静态资源**

```toml
# Cargo.toml 添加依赖
[dependencies]
rust-embed = "8.0"
mime_guess = "2.0"
```

```rust
// src/static_assets.rs - 嵌入静态资源
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "static/"]
struct Assets;

#[derive(RustEmbed)]
#[folder = "templates/"]
struct Templates;

pub fn get_asset(path: &str) -> Option<(Vec<u8>, &'static str)> {
    let asset = Assets::get(path.trim_start_matches('/'))?;
    let mime = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    // leak 转换为 &'static str，生命周期与程序相同
    let mime_static: &'static str = Box::leak(mime.into_boxed_str());
    Some((asset.data.to_vec(), mime_static))
}

pub fn get_template(name: &str) -> Option<String> {
    let asset = Templates::get(name)?;
    Some(String::from_utf8(asset.data.to_vec()).ok()?)
}
```

**Axum 路由使用嵌入资源：**

```rust
// src/routes.rs
use axum::{response::Response, body::Body, http::{StatusCode, header}};
use crate::static_assets::get_asset;

pub async fn serve_static(path: String) -> Response {
    match get_asset(&path) {
        Some((data, mime)) => {
            let mut response = Response::new(Body::from(data));
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static(mime)
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

pub async fn serve_index() -> Response {
    match get_template("review.html") {
        Some(html) => {
            let mut response = Response::new(Body::from(html));
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static("text/html; charset=utf-8")
            );
            response
        }
        None => {
            let mut response = Response::new(Body::from("Template not found"));
            *response.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
            response
        }
    }
}
```

**项目结构调整：**

```
hrev/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── static_assets.rs    # 嵌入资源
│   └── ...
├── static/                 # 开发时存在，编译后嵌入二进制
│   ├── app.js
│   └── app.css
└── templates/
    └── review.html
```

**编译后：**
- `cargo build --release` 生成单一二进制 `target/release/hrev`
- 无需携带 static/ 目录
- 可直接复制到任何地方运行

#### 问题 4: 如何将用户的评论与文件、行号、上下文整理为合适的输出？

**输出格式设计（两者兼顾：人类可读 + AI 可解析）：**

```rust
// src/output.rs - 评论输出格式
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewOutput {
    pub session_id: String,
    pub review_type: String,
    pub target: String,
    pub created_at: String,
    pub completed_at: String,
    pub summary: ReviewSummary,
    pub comments: Vec<GroupedComment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewSummary {
    pub total_comments: usize,
    pub total_files: usize,
    pub files_with_comments: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupedComment {
    pub file: String,
    pub comments: Vec<FileComment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileComment {
    pub line: usize,
    pub text: String,
    pub context_before: Vec<String>,  // 上文 2 行
    pub context_after: Vec<String>,   // 下文 2 行
    pub created_at: String,
}

// 输出为 Markdown 格式（AI 友好 + 人类可读）
pub fn output_markdown(output: &ReviewOutput) -> String {
    let mut md = String::new();

    // 顶部摘要（人类快速查看）
    md.push_str("╔════════════════════════════════════════════════════════════╗\n");
    md.push_str(&format!("║  Review Results: {} | {} comment(s) ║\n",
        output.target, output.summary.total_comments));
    md.push_str("╚════════════════════════════════════════════════════════════╝\n\n");

    // AI 结构化区域（用特殊标记）
    md.push_str("<!-- HREV_AI_START -->\n");
    md.push_str(&format!("## Review: {} ({})\n\n", output.target, output.review_type));
    md.push_str(&format!("**Files:** {}\n", output.summary.files_with_comments.join(", ")));
    md.push_str(&format!("**Comments:** {} total\n\n", output.summary.total_comments));

    for group in &output.comments {
        md.push_str(&format!("### File: {}\n\n", group.file));

        for comment in &group.comments {
            md.push_str(&format!("#### Line {}: {}\n\n",
                comment.line, comment.text));

            // 上下文代码块
            md.push_str("```context\n");
            for (i, line) in comment.context_before.iter().enumerate() {
                let line_num = comment.line as isize - comment.context_before.len() as isize + 1 + i as isize;
                md.push_str(&format!("{:>4} | {}\n", line_num, line));
            }
            md.push_str(&format!("{:>4} | >>> {}\n", comment.line, comment.text));
            for (i, line) in comment.context_after.iter().enumerate() {
                md.push_str(&format!("{:>4} | {}\n", comment.line + 1 + i, line));
            }
            md.push_str("```\n\n");
        }
    }
    md.push_str("<!-- HREV_AI_END -->\n\n");

    md
}

// 输出为 JSON 格式（供程序解析）
pub fn output_json(output: &ReviewOutput) -> String {
    serde_json::to_string_pretty(output).unwrap()
}

// 终端输出（人类可读）
pub fn print_terminal(output: &ReviewOutput) {
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║                    Code Review Complete                    ║");
    println!("╚════════════════════════════════════════════════════════════╝");
    println!();
    println!("  Target: {} ({})", output.target, output.review_type);
    println!("  Comments: {} across {} file(s)",
        output.summary.total_colors,
        output.summary.total_files);
    println!();

    for group in &output.comments {
        println!("  📄 {}", group.file);
        for comment in &group.comments {
            println!("    [L{}] {}", comment.line,
                comment.text.chars().take(50).collect::<String>());
        }
        println!();
    }

    println!("  💾 Full results saved to:");
    println!("     .hrev/sessions/{}/review.json", output.session_id);
    println!("     .hrev/sessions/{}/review.md", output.session_id);
}
```

**带上下文的评论收集：**

```rust
// src/git_ops.rs - 获取上下文
impl GitOps {
    /// 获取指定行的上下文
    pub fn get_line_context(
        &self,
        file_path: &str,
        line: usize,
        before: usize,
        after: usize,
    ) -> Result<(Vec<String>, Vec<String>)> {
        let content = self.get_file_content(file_path, None)?;
        let lines: Vec<&str> = content.lines().collect();

        let start = if line > before { line - before - 1 } else { 0 };
        let end = (line + after).min(lines.len());

        let context_before = lines[start..line].to_vec();
        let context_after = lines[line..end].to_vec();

        Ok((
            context_before.into_iter().map(|s| s.to_string()).collect(),
            context_after.into_iter().map(|s| s.to_string()).collect(),
        ))
    }
}
```

### 10. 验证计划

完成后的测试流程：
1. `cargo build --release` - 编译二进制
2. `./target/release/hrev diff` - 测试 diff 模式
3. `./target/release/hrev plan.md` - 测试文件模式
4. `./target/release/hrev abc1234` - 测试 commit 模式
5. 在浏览器中添加评论，验证保存和导出
6. 检查 `.hrev/sessions/` 目录查看输出文件
7. 测试 Claude Code skill 集成

---
