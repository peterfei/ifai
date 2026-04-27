# CLI REPL 模式手动测试指南

## 概述

由于 REPL（Read-Eval-Print Loop）是交互式模式，自动化测试较为困难。本文档提供了完整的手动测试步骤。

## 测试环境准备

```bash
# 设置测试 API key
export OPENAI_API_KEY="your-api-key"

# 或从配置文件读取
ifai --config init
```

## 2.5.1 REPL 启动和退出

**目标**: 验证 REPL 能正确启动并退出

**步骤**:
```bash
# 启动 REPL
ifai

# 应该看到欢迎信息和提示符，如：
# IfAI CLI v0.4.4
# Welcome to IfAI! Type /help for available commands.
# Press Ctrl+D to exit.
# Use ↑/↓ arrows for command history.
# ⟩

# 输入退出命令
/exit

# 或使用 Ctrl+D
# 应该看到: Goodbye!
```

**预期结果**: REPL 正常启动，显示欢迎信息，`/exit` 命令正常退出

---

## 2.5.2 多轮对话

**目标**: 验证 REPL 支持多轮对话

**步骤**:
```bash
ifai

# 第一轮
⟩ hello
# [AI 响应]

# 第二轮（应记住上下文）
⟩ what did I just ask?
# [AI 应该回答你问了 hello]

/exit
```

**预期结果**: REPL 能记住上下文，正确回答关于之前对话的问题

---

## 2.5.3 命令帮助

**目标**: 验证 `/help` 命令显示帮助信息

**步骤**:
```bash
ifai

⟩ /help
# 应该显示可用命令列表：
# Available commands:
# /help - 显示帮助信息
# /clear - 清空对话历史
# /compact - 压缩对话历史（自动摘要）
# /cost - 显示 token 使用和成本统计
# /provider [name] - 切换或显示当前 AI 提供商
# /model [name] - 切换或显示当前模型
# /permissions - 显示当前权限级别
# /save <name> - 保存当前会话
# /resume [name] - 恢复已保存的会话
# /export <file> - 导出对话历史为 Markdown
# /undo - 撤销上一轮对话
# /config [init|show] - 显示或初始化配置
# /status - 显示当前状态
```

**预期结果**: 显示完整的命令列表和描述

---

## 2.5.4 清除历史

**目标**: 验证 `/clear` 命令清空对话历史

**步骤**:
```bash
ifai

⟩ tell me a joke
# [AI 讲笑话]

⟩ /clear
# 应该显示: Conversation history cleared.

⟩ what did I just ask?
# [AI 应该不记得之前的对话]

/exit
```

**预期结果**: `/clear` 后，AI 不再记得之前的对话内容

---

## 2.5.5 状态命令

**目标**: 验证 `/status` 命令显示当前状态

**步骤**:
```bash
ifai

⟩ /status
# 应该显示：
# Current Session Status:
# Provider: openai (or your configured provider)
# Model: gpt-4o-mini (or your configured model)
# Messages: 0
# Tokens: 0
# ...

/exit
```

**预期结果**: 显示完整的会话状态信息

---

## 2.5.6 模型切换

**目标**: 验证 `/model` 命令可以切换模型

**步骤**:
```bash
ifai

# 查看当前模型
⟩ /model
# 应该显示: Current model: gpt-4o-mini

# 切换模型
⟩ /model gpt-4o
# 应该显示: Model switched to: gpt-4o

# 验证切换
⟩ /model
# 应该显示: Current model: gpt-4o

/exit
```

**预期结果**: 可以成功切换模型并验证

---

## 2.5.7 提供商切换

**目标**: 验证 `/provider` 命令可以切换提供商

**步骤**:
```bash
ifai

# 查看当前提供商
⟩ /provider
# 应该显示: Current provider: openai

# 列出可用提供商
⟩ /provider list
# 应该显示可用提供商列表

# 切换提供商
⟩ /provider deepseek
# 应该显示: Provider switched to: deepseek

# 验证切换
⟩ /provider
# 应该显示: Current provider: deepseek

/exit
```

**预期结果**: 可以成功切换提供商并验证

---

## 2.5.8 撤销命令

**目标**: 验证 `/undo` 命令撤销上一轮对话

**步骤**:
```bash
ifai

⟩ tell me a joke
# [AI 讲笑话 A]

⟩ /undo
# 应该显示: Last message removed.

⟩ tell me a joke
# [AI 讲笑话 B - 应该与 A 不同]

/exit
```

**预期结果**: `/undo` 后再问同样问题，AI 应该给出不同的回答

---

## 2.5.9 导出命令

**目标**: 验证 `/export` 命令导出对话历史

**步骤**:
```bash
ifai

⟩ hello
# [AI 响应]

⟩ /export /tmp/test_repl_export.md
# 应该显示: Conversation exported to: /tmp/test_repl_export.md

# 验证文件
cat /tmp/test_repl_export.md
# 应该包含对话历史内容

/exit
```

**预期结果**: 文件成功创建，包含完整的对话历史

---

## 2.5.10 会话保存和恢复

**目标**: 验证 `/save` 和 `/resume` 命令

**步骤**:
```bash
ifai

⟩ my favorite color is blue
# [AI 响应]

⟩ /save test-session
# 应该显示: Session saved as: test-session

⟩ /exit

# 重新启动并恢复
ifai

⟩ /resume test-session
# 应该显示: Session resumed: test-session

⟩ what is my favorite color?
# [AI 应该回答 blue]

/exit
```

**预期结果**: 会话成功保存和恢复，AI 记住之前的信息

---

## 2.5.11 历史导航

**目标**: 验证命令历史导航功能

**步骤**:
```bash
ifai

⟩ tell me a joke
# [AI 讲笑话]

⟩ what is 2+2?
# [AI 回答 4]

⟩ # 按 ↑ 键
# 应该显示上一个命令: what is 2+2?

⟩ # 再按 ↑ 键
# 应该显示: tell me a joke

⟩ # 按 ↓ 键
# 应该显示: what is 2+2?

/exit
```

**预期结果**: 可以使用 ↑/↓ 键浏览命令历史

---

## 2.5.12 Ctrl+C 中断

**目标**: 验证 REPL 能正确处理 Ctrl+C 中断

**步骤**:
```bash
ifai

⟩ tell me a very long story
# [AI 开始生成...]

⟩ # 按 Ctrl+C
# 应该中断生成并返回提示符

⟩ /exit
```

**预期结果**: Ctrl+C 能中断正在生成的响应，返回 REPL 提示符

---

## 自动化测试限制

由于以下原因，REPL 模式难以完全自动化测试：

1. **TTY 依赖**: REPL 需要真实的终端（TTY）才能正常工作
2. **交互循环**: REPL 是一个持续的交互循环，难以模拟
3. **异步输出**: 流式响应需要实时处理
4. **信号处理**: Ctrl+C 等信号处理需要真实环境

## 建议

对于 REPL 功能，建议：
1. **手动测试**: 使用本文档进行完整的手动测试
2. **端到端测试**: 在真实环境中测试完整用户流程
3. **集成测试**: 测试单个命令功能（如 `/help`, `/clear` 的 handler 函数已有单元测试）
