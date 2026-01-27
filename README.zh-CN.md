# hrevu - Human Review CLI 工具

中文文档 | [English](README.md)

一个基于 Web 界面的手动代码审查 CLI 工具。专为 AI 编码工作流（如 Claude、Gemini、OpenCode 等）无缝集成而设计，提供浏览器端的审查体验，您可以在其中添加评论，而无需在狭窄的终端输入框中滚动浏览。

## 快速开始

### 安装 CLI 工具

```bash
cargo install human-review
```

这会安装 `hrevu` 命令行工具。

### 安装 Claude Code 技能

```bash
npx skills add alingse/human-review
```

这会将技能安装到您的 AI 编码助手。

## 使用场景

- **审查计划文档**
  - 在 `.md` 计划文件上添加详细评论

- **审查重要代码变更**
  - 在合并关键功能或 PR 前进行本地人工审查和评论

- **AI 工作流集成**
  - 在 Claude Code 中使用：`/human-review diff`、`/human-review README.md`

## 输出示例

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

## 为什么选择 hrevu？

使用 AI 编码助手时，代码审查通常在狭窄的终端输入框中进行，上下文滚动受限。`/human-review` 通过提供 Web 界面进行人工审查和行级评论来解决这个问题。

- **浏览器端审查**：在功能齐全的 Web 界面中查看变更
- **行级评论**：在特定行上添加精确反馈
- **无上下文切换**：与现有 AI 工作流无缝配合
- **清晰输出**：审查结果输出到终端供 AI 处理

## 功能特性

- **多种输入模式**
  - 审查提交差异：`hrevu <commit-hash>`
  - 审查当前变更：`hrevu diff`（包括已暂存和未暂存的变更）
  - 审查任意文件：`hrevu <file.md>`

- **基于 Web 的审查界面**
  - 深色主题 UI，专为代码审查优化
  - 逐文件导航
  - 行级评论
  - 编辑和删除评论
  - 实时评论更新

- **国际化 (i18n)**
  - 自动语言检测
  - 支持中文和英文
  - 所有 UI 元素均已翻译

## 语言支持

hrevu 会自动检测您的浏览器语言并相应显示界面：

**中文**:
- 文件 | 评论 | 完成审查
- 编辑 | 删除
- + 全局评论

**English**:
- Files | Comments | Complete Review
- Edit | Delete
- + Global Comment

检测基于 `navigator.language` - 任何以 `zh` 开头的语言环境将显示中文，其他显示英文。

## 许可证

MIT
