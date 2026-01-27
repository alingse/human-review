# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**hrevu** (v0.1.2) — CLI tool for manual code review with web interface. Review commits, diffs, or files with line-level commenting. Self-contained binary with embedded assets.

## Build Commands

```bash
cargo run -- diff                    # Review current changes
cargo run -- README.md               # Review a file
cargo run -- abc1234                 # Review a commit
cargo run -- diff --port 8080        # Custom port
cargo run -- diff --json             # JSON output

cargo build --release                # Release build
cargo install --path .               # Install
```

### CLI Arguments

| Argument | Description |
|----------|-------------|
| `<input>` | "diff", file path, or commit hash |
| `--port <PORT>` | Custom port (default: 0 = random) |
| `--json` | JSON output format |

## Architecture

```
CLI → Git Ops → Models → Axum Server → Browser
```

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `main.rs` | Entry point, orchestration |
| `cli.rs` | CLI parsing with clap |
| `git_ops.rs` | Git operations via git2 |
| `models.rs` | Core data structures |
| `server.rs` | Axum server, state management |
| `routes.rs` | REST API handlers |
| `output.rs` | Terminal output formatting |
| `static_assets.rs` | Asset embedding (rust-embed) |

### Input Detection

`parse_input()` in `git_ops.rs`:
- `"diff"` → `WorkingTreeDiff`
- File path → `FileContent`
- Commit hash → `CommitDiff`

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/data` | Get review data |
| POST | `/api/comments` | Add comment |
| PUT | `/api/comments/:id` | Update comment |
| DELETE | `/api/comments/:id` | Delete comment |
| POST | `/api/complete` | Complete review |

### State Coordination

- `Arc<RwLock<ReviewData>>` — Thread-safe shared state
- `tokio::sync::Notify` — Completion signal
- `tokio::sync::OnceCell` — Final data storage

### Assets

- Embedded via rust-embed at compile time
- Askama templates + static files
- Modify `static/` or `templates/` → rebuild binary

## Important Conventions

### No Persistence
- All data in memory only
- No `.hrevu` directory or config files
- Results printed to terminal on completion

### Error Handling
- `anyhow::Result<T>` throughout
- Proper HTTP status codes
- Toast notifications (no alerts)

### i18n
- Auto-detects language: `zh-*` → 中文, others → English
- Translations in `static/app.js` and `templates/review.html`

### Theme
- Dark/light toggle
- CSS custom properties
- localStorage persistence

## Claude Code Integration

The `human-review` skill (installed globally) automates:
1. Start hrevu based on changes
2. Wait for review completion
3. Parse output for comments
4. Apply suggested changes
