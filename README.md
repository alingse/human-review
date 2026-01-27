# hrevu - Human Review CLI Tool

[中文文档](README.zh-CN.md) | English

A CLI tool for manual code review with a web-based interface. Designed to integrate seamlessly into your AI coding workflow (like Claude, Gemini, OpenCode, etc.), providing a browser-based review experience where you can add comments without scrolling through terminal input boxes.

## Quick Start

### Install CLI Tool

```bash
cargo install human-review
```

This installs the `hrevu` command-line tool.

### Install Claude Code Skill

```bash
npx skills add alingse/human-review
```

This installs the Claude Code skill to your AI coding assistant.

## Use Cases

- **Review plan documents**
  - Review `.md` plan files with detailed feedback

- **Review important code changes**
  - Before merging critical features or PRs with local human review + comments

- **AI workflow integration**
  - In Claude Code: `/human-review diff`, `/human-review README.md`

## Output Example

```
════════════════════════════════════════════════════════════
📋 Review Summary
════════════════════════════════════════════════════════════

Input: File: README.md
Created: 2026-01-27 06:27:29
Comments: 2


📄 README.md

💬 Line 12: This section needs more details
    ▸ ```bash
    ─ 06:28

💬 第 30 行: 这个部分需要更多说明
    ▸ ## Use Cases
    ─ 06:29

────────────────────────────────────────────────────────────
Summary: 2 total comments
```

## Why hrevu?

When using AI coding assistants, code review often happens in cramped terminal input boxes with limited scrolling context. `/human-review` solves this by providing a web interface for human review with line-level comments.

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

## License

MIT
