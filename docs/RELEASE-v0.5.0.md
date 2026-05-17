# IfAI v0.5.0 发布说明

**发布日期**: 2025-05-17

**主题**: 多智能体系统成型 + 意图路由 + TUI 渲染优化

---

## 📋 概述

v0.5.0 是一个**重要版本**，标志着 IfAI 多智能体系统从基础框架走向**生产就绪**。新增 5 个专用 Agent（Review 增强、Test、Doc、Debug、Refactor）、2 个全新 Agent（Git Commit、ReAct）、**声明式意图路由系统**、**TUI Markdown 渲染引擎**，以及 Bracketed Paste 等多项终端体验优化。

### 关键数据
- **24 个提交** 自 v0.4.8 以来
- **52 个文件变更**，+4,462 行代码
- **Agent 数量**: 7 个专用 Agent（Explore / Review / Test / Doc / Debug / Refactor / Git Commit / Plan / ReAct）
- **意图路由**: 声明式路由表替代过程式 if-else 链
- **测试覆盖**: 1032 个测试全部通过

---

## 🌟 主要特性

### 一、多智能体系统成型 ⭐ 核心亮点

**Phase 1: Review Agent 增强**
- 新增 `git_diff`、`complexity_analyzer`、`code_review` 底层工具
- 免审批白名单注册（category: safe）
- 去除嵌套 workflow，直接返回 diff 上下文给 LLM

**Phase 2: Test Agent**
- `test_agent` — 自动化测试生成和执行
- 注册为低风险工具，无需用户审批

**Phase 3: Doc Agent**
- `doc_agent` — 自动化文档生成和维护
- 注册为低风险工具

**Phase 4: Debug Agent**
- `debug_agent` — 智能调试，自动分析错误和定位问题
- 注册为低风险工具

**Phase 6A: Refactor Agent**
- `refactor_agent` — 代码重构，补全已有 AgentType
- 仅缺的 Executor 实现，ROI 最高

**Phase 6B: Git Commit Agent**
- `git_commit_agent` — 智能提交：分析变更 → 生成 message → 安全提交
- 新增底层工具：`git_status`（`git status --porcelain`）、`git_commit`（`git add + git commit`）
- 5 层安全设计：Pre-flight 检查、Ghost Snapshot 回滚、Secret 扫描、Commit Attribution、禁止列表
- StderrMute 守卫：临时静音 stderr 调试日志，保持 TUI 界面清爽

**Phase 6C: Plan Agent**
- `plan_agent` — 任务分解与规划，复用 TaskBreakdown AgentType
- 工具名统一为 `plan_agent`

**Phase 6D: ReAct Agent**
- `react_agent` — 深度推理：显式 Thought → Action → Observation 循环
- 与现有 `execute_with_tools` 循环的区别：显式推理链、反思机制、完成度评估终止条件
- 最大 5 轮推理（可配置）

### 二、声明式意图路由系统 🔀

**元编程级路由表**
- 声明式路由表替代过程式 if-else 链
- 每个路由条目包含：keywords（匹配词）、exclusions（排除词）、agent_tool（目标 Agent）
- O(1) 查表性能，新增 Agent 只需添加一条路由规则

**支持的路由规则**
| 用户意图关键词 | 路由目标 | 排除词 |
|---|---|---|
| 重构代码 / refactor / 优化结构 | refactor_agent | refactor_agent |
| 提交代码 / commit / git commit | git_commit_agent | git_push |
| 任务分解 / 制定计划 / 拆解任务 | plan_agent | plan_agent |
| 深度分析 / 逐步推理 / 全面分析 | react_agent | react_agent |
| 审查代码 / review / code review | review_agent | review_agent |

### 三、TUI Markdown 渲染引擎 🎨

**双路径渲染管线**
- **ANSI 路径**: `ansi_to_spans()` — 解析 ANSI SGR 转义序列 → ratatui `Span<Style>`（颜色、粗体、斜体、下划线、256色）
- **Markdown 路径**: `clean_markdown()` + `strip_inline_markdown()` — 行级 Markdown 清理（标题、表格、分隔线、粗体、斜体、代码）
- Agent 工具 "╾" 输出路径：`strip_markdown()` 全量多行 Markdown 清理

**MarkdownStreamState 状态重置**
- 每轮对话开始时自动重置状态
- `output_buffer.clear()` 确保无残留

**自适应换行**
- `Paragraph::new().wrap(Wrap { trim: false })` 终端窄屏自适应

### 四、终端体验优化 ⌨️

**Bracketed Paste Mode**
- 终端粘贴大段文本不再逐字符触发事件
- `EnableBracketedPaste` / `DisableBracketedPaste` 生命周期管理
- `PasteHandler` + `insert_paste()` 原子粘贴

**自动滚动修复**
- 输入高度变化时重新检测是否需要滚动到底部
- 解决多行输入时内容被遮挡的问题

### 五、SIGINT 信号处理 🛑

- 全局 SIGINT 处理器，确保 TUI 模式 Ctrl+C 安全退出
- TDD 开发，含完整测试覆盖

### 六、安全工具白名单 🛡️

新增以下 Agent 到安全工具列表（免审批）：
- `refactor_agent`
- `git_commit_agent`
- `plan_agent`
- `code_review_agent`
- `web_search_agent`

---

## 📦 详细变更

### 新增文件

**Agent 系统**
- `.ifai/prompts/agents/react.md` — ReAct Agent 提示词
- `workflows/code_review.yaml` — Code Review 工作流定义

**工具**
- `src-tauri/src/harness/tool/new_tools/git_status.rs` — Git 状态工具
- `src-tauri/src/harness/tool/new_tools/git_commit.rs` — Git 提交工具

### 修改文件

**核心注册链**（每个新 Agent 均涉及）
- `agentexecutors.rs` — Agent 执行器（Refactor / GitCommit / Plan / ReAct）
- `executor.rs` — 执行器导出
- `router.rs` — 工具路由注册
- `registry.rs` — ToolSpec 注册 + 权限级别
- `session.rs` — AGENT_INTENT_RULES 意图路由 + needs_progress + Markdown 渲染
- `types.rs` — AgentType 枚举扩展

**Workflow 引擎**
- `parser.rs` — 工作流解析器增强
- `prompt_loader.rs` — 提示词加载器增强
- `runner.rs` — 工作流运行器增强

**TUI 渲染**
- `tui.rs` — ansi_to_spans / clean_markdown / strip_inline_markdown / Bracketed Paste / 自适应换行
- `handlers.rs` — PasteHandler / 自动滚动修复
- `input_composer.rs` — insert_paste() 方法
- `event/mod.rs` — PasteHandler 导出
- `markdown_stream.rs` — reset_state() 状态清理

**系统**
- `main.rs` — 版本号 v0.5.0
- `render.rs` — 版本号 v0.5.0
- `Cargo.toml` — 版本号 0.5.0
- `http_api.rs` — API 增强
- `agent_cmd.rs` — Agent 命令增强
- `tool_approval_config.json` — 安全类别更新

**提示词**
- `.ifai/prompts/system/cli.md` — 工具映射表更新
- `.ifai/prompts/zh-CN/system/cli.md` — 工具映射表更新

---

## 🐛 Bug 修复

1. **UTF-8 字符串切片越界 panic** — 修复 9 处 `&str[..N]` 不安全切片（28d0a109）
2. **git_diff 返回空结果** — 使用 commit range 语法修复（a2b732b3）
3. **Code Review 嵌套 workflow** — 去除嵌套，直接返回 diff 上下文（1b31d7c9）
4. **LLM 调用 git_diff 而非 code_review** — 修复工具路由（d1a6b35d）
5. **git_diff/complexity_analyzer/code_review 未免审批** — 加入白名单（a6c3f5f6）
6. **7 个既有测试失败** — 修复缓存持久化 + HOME 并发竞态（62b4acaa）
7. **MarkdownStreamState 状态残留** — 每轮对话重置状态
8. **TUI 窄屏内容截断** — 添加自适应换行
9. **粘贴大段文本逐字符触发** — Bracketed Paste Mode 修复

---

## 🧪 测试

### 测试覆盖
- **总计**: 1032/1032 测试通过（100%）
- **新增**: Git 工具注册完整性测试、SIGINT 处理器测试、Agent 工具测试

---

## 📊 Agent 能力矩阵

| Agent | 工具名 | 意图路由 | 底层工具 | 权限 |
|---|---|---|---|---|
| Explore | explore_agent | ✅ | agent_read_file, agent_list_dir, glob_search | safe |
| Review | review_agent | ✅ | git_diff, complexity_analyzer, code_review | safe |
| Test | test_agent | - | - | safe |
| Doc | doc_agent | - | - | safe |
| Debug | debug_agent | - | - | safe |
| Refactor | refactor_agent | ✅ | - | WorkspaceWrite |
| Git Commit | git_commit_agent | ✅ | git_status, git_commit | WorkspaceWrite |
| Plan | plan_agent | ✅ | - | safe |
| ReAct | react_agent | ✅ | - | safe |

---

## 🔄 升级说明

### 从 v0.4.8 升级
1. 拉取最新代码: `git pull`
2. 安装依赖: `npm install`
3. 构建 Tauri 应用: `npm run tauri:community`
4. 新增 Agent 自动可用，无需额外配置

---

## ⚠️ 破坏性变更

**无** — 这是一个完全向后兼容的版本。

---

## 📅 下一步计划

**v0.5.1 规划**
- Security Audit Agent（安全审计：OWASP/CWE 漏洞扫描 + 密钥泄露检测）
- 增强的 ReAct Agent 反思机制
- 更多意图路由规则
- Agent 协作编排

---

## 📞 支持

- **文档**: [docs/](docs/)
- **问题反馈**: [GitHub Issues](https://github.com/peterfei/ifai/issues)
- **讨论交流**: [GitHub Discussions](https://github.com/peterfei/ifai/discussions)

---

**下载 v0.5.0**: [GitHub Releases](https://github.com/peterfei/ifai/releases/tag/v0.5.0)

---

<div align="center">
  <p><strong>Made with ❤️ by peterfei</strong></p>
  <p>多智能体协作的 AI 原生编程环境 | 9 个专用 Agent + 意图路由 | IfAI v0.5.0</p>
</div>
