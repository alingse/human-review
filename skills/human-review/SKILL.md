---
name: human-review
description: 启动人工审查流程，自动读取评论并修改代码
argument-hint: [target]
disable-model-invocation: false
---

## Human Review Skill / 人工审查技能

自动启动 Web 人工审查界面，等待用户完成评论，然后自动应用建议的修改。

**依赖工具**：此技能依赖 `hrevu` CLI 工具，请先安装：
```bash
cargo install human-review
```

## 工作流程

### 1. 检测变更并启动 hrevu

首先判断当前状态：
- 用户指定了文件 → `hrevu <file>`
- 用户指定了 commit → `hrevu <commit>`
- 无参数 → 检查 git 变更，如有变更则使用 `hrevu diff`

### 2. 等待审查完成

- 运行 hrevu 命令
- 浏览器自动打开审查界面
- **等待**用户在浏览器中完成评论
- 用户点击"完成审查"后，hrevu 输出摘要并退出

### 3. 解析审查结果

从终端输出解析审查结果。每条评论包含：
- 文件名
- 行号
- 评论内容
- 源代码上下文（用 `▸` 标记）

### 4. 自动修改代码

根据评论内容使用 Edit 工具应用修改。

**跳过策略：**
- 纯赞美（如 "Great!", "LGTM"）
- 无具体修改方案的模糊建议

**修改策略：**
- 明确的代码修改 → 直接使用 Edit
- 变量/函数重命名 → 使用 Edit + replace_all
- 添加内容（错误处理、导入等）→ 添加相应代码

**重要：**
- **必须等待** hrevu 完成后再继续
- 使用 Edit 工具修改代码，保留原有缩进和格式
- 每次修改后报告位置和内容
- 如果不确定某个修改，请向用户确认
