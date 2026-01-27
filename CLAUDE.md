# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**hrevu** is a CLI tool for manual code review with a web-based interface. Users can review commits, diffs, or files in their browser with line-level commenting. The tool is self-contained with all assets (HTML/CSS/JS) embedded in the binary.

## Build Commands

```bash
# Development build with arguments
cargo run -- diff                    # Review current changes
cargo run -- README.md               # Review a file
cargo run -- abc1234                 # Review a commit
cargo run -- diff --port 8080        # Custom port
cargo run -- diff --no-browser       # Don't auto-open browser

# Release build (self-contained binary)
cargo build --release

# Install via cargo
cargo install --path .

# Run release binary
./target/release/hrevu <input>
```

## Architecture

### Core Flow

1. **CLI → Git Ops → Models → Server → Browser**
   - `cli.rs` parses arguments (commit/file/diff)
   - `git_ops.rs` retrieves content via git2 library
   - Data stored in `ReviewData` model in memory
   - `server.rs` starts Axum web server with embedded assets
   - Browser opens review interface

2. **Review Session Lifecycle**
   - Session data stored in memory (`Arc<RwLock<ReviewData>>`)
   - Comments added/edited/deleted via REST API
   - Completion signaled via `tokio::sync::Notify`
   - `wait_for_completion()` returns final data to CLI
   - Terminal output printed with source context

3. **Asset Embedding**
   - `static_assets.rs` uses `rust-embed` to compile assets into binary
   - Assets served at runtime from memory (no disk access)
   - MIME type detected via file extension matching

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `cli.rs` | Command-line argument parsing with clap |
| `git_ops.rs` | Git operations via git2 library, parses input type |
| `models.rs` | Core data structures (ReviewData, Comment, FileData) |
| `server.rs` | Axum web server, session state management |
| `routes.rs` | REST API handlers for comments |
| `output.rs` | Terminal output formatting with context |
| `static_assets.rs` | Asset embedding and serving |

### Input Detection Logic

The `parse_input()` function in `git_ops.rs` determines input type:
1. If input is exactly "diff" → `WorkingTreeDiff`
2. If path exists → `FileContent`
3. Otherwise → `CommitDiff` (validated as git commit)

### Comment System

- **Line comments**: Attached to specific line numbers
- **Global comments**: No file/line association
- **CRUD operations**: Full create, read, update, delete via API
- **No persistence**: All data stored in memory, lost after completion

### Internationalization (i18n)

Frontend automatically detects language:
- Chinese (`zh-*` locale) → 中文界面
- All other locales → English interface

Translation dictionaries in both `static/app.js` and `templates/review.html`.

## Important Conventions

### No File Persistence
The application intentionally does NOT persist data:
- No `.hrevu` directory
- No session files saved
- Everything runs in memory
- Review results only printed to terminal on completion

### Asset Updates
After modifying files in `static/` or `templates/`:
1. Run `cargo build --release`
2. Assets are embedded at compile time
3. Binary contains all changes

### Error Handling
- Uses `anyhow::Result<T>` throughout
- API errors return proper HTTP status codes
- Frontend shows toast messages (no alerts)

### State Coordination
- `COMPLETION_SIGNAL`: `tokio::sync::Notify` for async signaling
- `FINAL_DATA`: `tokio::sync::OnceCell<ReviewData>` stores final state
- Server waits for completion, CLI retrieves results

## Claude Code Integration

Skill located at `.claude/skills/human-review.md` automates:
1. Starting appropriate hrevu command based on changes
2. Waiting for browser-based review completion
3. Parsing terminal output for comments
4. Auto-applying suggested changes
