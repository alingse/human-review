# hrevu - Human Review CLI Tool

A CLI tool for manual code review with a web-based interface. Designed to integrate seamlessly into your AI coding workflow (like Claude Code, Cursor, etc.), providing a browser-based review experience where you can add comments without scrolling through terminal input boxes.

## Why hrevu?

When using AI coding assistants, code review often happens in cramped terminal input boxes with limited context. hrevu solves this by:

- **Browser-based review**: View changes in a full-featured web interface
- **Line-level commenting**: Add precise feedback on specific lines
- **No context switching**: Works alongside your existing AI workflow
- **Clean output**: Review results are printed to terminal for your AI to process

## Features

- **Multiple Input Modes**
  - Review commit diffs: `hrevu <commit-hash>`
  - Review current changes: `hrevu diff` (includes both staged and unstaged)
  - Review any file: `hrevu <file.md>`

- **Web-Based Review Interface**
  - Dark theme UI optimized for code review
  - File-by-file navigation
  - Line-level commenting
  - Edit and delete comments
  - Real-time comment updates

- **Internationalization (i18n)**
  - Automatic language detection
  - Supports Chinese (中文) and English
  - All UI elements translated

- **Clean Terminal Output**
  - Shows comments with source context
  - Easy to read summary format

## Installation

### From Source

```bash
# Requires Rust/Cargo to be installed
# Clone and build
git clone https://github.com/alingse/human-review.git
cd human-review
cargo build --release

# The binary will be at target/release/hrevu
```

### Install via Cargo

```bash
cargo install human-review
```

## Usage

### Review Current Changes

```bash
hrevu diff
```

This opens a web interface showing your current uncommitted changes.

### Review a Commit

```bash
hrevu abc1234
```

Review the changes in a specific commit.

### Review a File

```bash
hrevu README.md
hrevu src/main.rs
```

View and comment on any file.

### Options

```bash
hrevu diff --help

Options:
  -p, --port <PORT>    Port for web server (default: random available)
      --no-browser     Don't open browser automatically
  -h, --help           Print help

  Examples:
    hrevu diff                  Review current changes
    hrevu abc123                 Review commit abc123
    hrevu src/main.rs            Review a file
    hrevu diff --port 8080       Use custom port
    hrevu diff --no-browser      Don't auto-open browser
```

## Workflow

1. **Start hrevu** with your desired input (commit/diff/file)
2. **Browser opens** automatically showing the review interface
3. **Add comments** by clicking on any line or using the "+ Global Comment" button
4. **Edit or delete** comments as needed
5. **Click "Complete Review"** (完成审查) when done
6. **View summary** in terminal with all comments and source context

## Output Format

### Terminal Output

```
════════════════════════════════════════════════════════════
📋 Review Summary
════════════════════════════════════════════════════════════

Input: File: README.md
Created: 2026-01-27 06:27:29
Comments: 2


📄 README.md

💬 Line 12: 请你使用中文
    ▸ - Review commit diffs: `hrevu <commit-hash>`
    ─ 06:28

💬 Line 192: 这个最好提供 build
    ▸ cargo install human-review
    ─ 06:28

────────────────────────────────────────────────────────────
Summary: 2 total comments

✓ Review complete!
```

Comments are displayed with:
- Line number and comment text
- Original source content (marked with `▸`)
- Timestamp

## Language Support

hrevu automatically detects your browser language and displays the UI accordingly:

**Chinese (中文)**:
- 文件 | 评论 | 完成审查
- 编辑 | 删除
- + 全局评论

**English**:
- Files | Comments | Complete Review
- Edit | Delete
- + Global Comment

The detection is based on `navigator.language` - any locale starting with `zh` will show Chinese, all others show English.

## Claude Code Integration

hrevu includes a Claude Code skill that automates the review workflow.

### Quick Install

```bash
# Install the skill directly from GitHub
npx skills add alingse/human-review
```

### Manual Install

```bash
# Or manually copy the skill to your project
git clone https://github.com/alingse/human-review.git
cp -r human-review/skills/human-review /path/to/your/project/.claude/skills/
```

### Using the Skill

Once installed, you can invoke the skill in Claude Code:

```
/human-review diff           # Review current changes
/human-review README.md      # Review a specific file
/human-review abc1234        # Review a commit
```

The skill will:
1. Launch hrevu with the appropriate input
2. Wait for you to complete the review in the browser
3. Parse your comments from the terminal output
4. Automatically apply the suggested changes

## Development

### Project Structure

```
human-review/
├── src/
│   ├── main.rs         # CLI entry point
│   ├── cli.rs          # Argument parsing
│   ├── server.rs       # Web server
│   ├── git_ops.rs      # Git operations
│   ├── models.rs       # Data structures
│   ├── routes.rs       # API handlers
│   ├── output.rs       # Output formatting
│   └── static_assets.rs # Asset embedding
├── templates/
│   └── review.html     # Web UI template
├── static/
│   ├── app.css         # Styles
│   └── app.js          # Frontend logic with i18n
├── .claude/
│   └── skills/
│       └── human-review/  # Claude Code skill (local)
└── skills/
    └── human-review/      # Claude Code skills (for distribution)
        └── SKILL.md
```

### Running in Development

```bash
cargo run -- diff
```

### Building

```bash
cargo build --release
```

The resulting binary is self-contained with all HTML, CSS, and JavaScript assets embedded using `rust-embed`.

## How It Works

1. **Asset Embedding**: Static files (HTML/CSS/JS) are embedded in the binary at compile time
2. **Web Server**: A lightweight Axum server serves the review interface
3. **State Management**: Comments are stored in memory during the review session
4. **Completion**: When you click "Complete Review", comments are printed to terminal with context
5. **No Persistence**: No files are written to disk - everything runs in memory

## License

MIT
