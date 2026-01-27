# hrevu - Human Review CLI Tool

A CLI tool for manual code review with a web-based interface. Designed to integrate seamlessly into your AI coding workflow (like Claude Code, Cursor, etc.), providing a browser-based review experience where you can add comments without scrolling through terminal input boxes.

## Quick Start / 快速开始

### Install CLI Tool / 安装 CLI 工具

```bash
cargo install human-review
```

This installs the `hrevu` command-line tool.
这会安装 `hrevu` 命令行工具。

### Install Claude Code Skill / 安装 Claude Code 技能

```bash
npx skills add alingse/human-review
```

This installs the Claude Code skill to your AI coding assistant.
这会将技能安装到您的 AI 编码助手。

## Use Cases / 使用场景

- **Review plan documents / 审查计划文档**
  - Review `.md` plan files with detailed feedback
  - 在计划文档上添加详细评论

- **Review important code changes / 审查重要代码变更**
  - Before merging critical features or PRs with local human review + comments
  - 合并重要功能或 PR 前进行本地人工审查和评论

- **AI workflow integration / AI 工作流集成**
  - In Claude Code: `/human-review diff`, `/human-review README.md`
  - 在 Claude Code 中使用：`/human-review diff`、`/human-review README.md`

## Output Example / 输出示例

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

## Why hrevu? / 为什么选择 hrevu?

When using AI coding assistants, code review often happens in cramped terminal input boxes with limited scrolling context. `/human-review` solves this by providing a web interface for human review with line-level comments.
使用 AI 编码助手时，代码审查通常在狭窄的终端输入框中进行，上下文滚动受限。`/human-review` 通过提供 Web 界面进行人工审查和行级评论来解决这个问题。

- **Browser-based review**: View changes in a full-featured web interface / 在功能齐全的 Web 界面中查看变更
- **Line-level commenting**: Add precise feedback on specific lines / 在特定行上添加精确反馈
- **No context switching**: Works alongside your existing AI workflow / 与现有 AI 工作流无缝配合
- **Clean output**: Review results are printed to terminal for your AI to process / 审查结果输出到终端供 AI 处理

## Features / 功能特性

- **Multiple Input Modes / 多种输入模式**
  - Review commit diffs: `hrevu <commit-hash>`
  - Review current changes: `hrevu diff` (includes both staged and unstaged / 包括已暂存和未暂存的变更)
  - Review any file: `hrevu <file.md>`

- **Web-Based Review Interface / 基于 Web 的审查界面**
  - Dark theme UI optimized for code review / 深色主题 UI，专为代码审查优化
  - File-by-file navigation / 逐文件导航
  - Line-level commenting / 行级评论
  - Edit and delete comments / 编辑和删除评论
  - Real-time comment updates / 实时评论更新

- **Internationalization (i18n) / 国际化**
  - Automatic language detection / 自动语言检测
  - Supports Chinese (中文) and English / 支持中文和英文
  - All UI elements translated / 所有 UI 元素均已翻译

## Language Support / 语言支持

hrevu automatically detects your browser language and displays the UI accordingly:
hrevu 会自动检测您的浏览器语言并相应显示界面：

**Chinese (中文)**:
- 文件 | 评论 | 完成审查
- 编辑 | 删除
- + 全局评论

**English**:
- Files | Comments | Complete Review
- Edit | Delete
- + Global Comment

The detection is based on `navigator.language` - any locale starting with `zh` will show Chinese, all others show English.
检测基于 `navigator.language` - 任何以 `zh` 开头的语言环境将显示中文，其他显示英文。

## License

MIT
