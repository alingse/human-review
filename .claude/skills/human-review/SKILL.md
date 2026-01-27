---
name: human-review
description: 启动人工审查流程，自动读取评论并修改代码
argument-hint: [target]
disable-model-invocation: true
---

## Human Review Skill

自动启动人工审查，等待用户完成评论，然后自动根据反馈修改代码。

## 工作流程

### 1. 检测变更并启动 hrevu

首先判断当前状态：
- 有未提交的 git 变更 → `hrevu diff`
- 用户指定了文件 → `hrevu <file>`
- 用户指定了 commit → `hrevu <commit>`

### 2. 等待审查完成

- 运行 hrevu 命令
- 工具会自动打开浏览器
- **等待**用户在浏览器中完成评论
- 用户点击"完成"后，hrevu 会输出结果并退出

### 3. 解析审查结果

从输出中读取 `.hrevu/sessions/<id>/review.md`，解析每条评论。

### 4. 自动修改代码

根据评论内容，使用 Edit 工具逐条修改代码。

**跳过策略：**
- 纯赞美类评论（如 "Great!"）
- 模糊建议（无具体修改方案）

**修改策略：**
- 明确的代码修改 → 直接使用 Edit
- 重命名变量 → 使用 Edit + replace_all
- 添加错误处理 → 添加相应代码

- **必须等待** hrevu 完成后再继续
- 使用 Edit 工具修改代码，保留原有缩进和格式
- 每次修改后，报告修改内容和位置
