# /human-review for AI

中文文档 | [English](README.md)

一个基于 Web 界面的手动代码审查 CLI 工具。专为 AI 编码工作流（如 Claude、Gemini 等）设计，提供浏览器端的审查体验，告别狭窄的终端输入框。

## 快速开始

```bash
# 安装 CLI 工具
cargo install human-review

# 安装 Claude Code 技能
npx skills add alingse/human-review
```

## 使用方法

在 AI 编码助手中使用 `/human-review`：

```
/human-review diff              # 审查当前变更
/human-review README.md         # 审查指定文件
/human-review abc1234           # 审查某个提交
/human-review last commit       # 审查最后一次提交
/human-review current plan      # 审查计划文档
```

或使用自然语言 - AI 会理解您的意图：
- `/human-review "审查我刚做的更改"`
- `/human-review "检查一下认证模块"`
- `/human-review "我想审查最近 3 次提交"`

## 功能特性

- **浏览器端审查** - 功能齐全的 Web 界面，深色主题
- **行级评论** - 在特定行添加精确反馈
- **多种输入模式** - 支持审查提交、差异或任意文件
- **AI 工作流集成** - 清晰的终端输出供 AI 处理
- **双语支持** - 根据浏览器语言自动切换中英文

## 许可证

MIT
