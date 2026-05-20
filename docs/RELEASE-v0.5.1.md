# IfAI v0.5.1 发布说明

**发布日期**: 2026-05-20

**主题**: Agent 协作编排 + 会话持久化引擎 + 终端体验优化

---

## 📋 概述

v0.5.1 是 v0.5.0 的增强版本，新增 **Agent 协作编排系统**（元编程基础设施 + 并行调用）、**完整的事件持久化与会话恢复引擎**（JSONL + Auto Snapshot WAL/Checkpoint 模型），以及多项终端体验优化和 Bug 修复。

### 关键数据
- **50+ 个提交** 自 v0.5.0 以来
- **Agent 协作**: 元编程基础设施 + 互调用 + 并行执行 + 权限控制
- **会话持久化**: JSONL append-only + Auto Snapshot + ResumePicker
- **架构决策**: WAL + Checkpoint 双路径容错模型

---

## 🌟 主要特性

### 一、Agent 协作编排系统 ⭐ 核心亮点

**Phase 1: 元编程基础设施**
- 消息协议定义宏，类型安全的 Agent 间通信
- `workflow!` DSL 宏，零样板代码定义协作流程

**Phase 2: workflow! 宏协作模式扩展**
- 支持 DAG 工作流定义
- 节点级并行执行

**Phase 2.5: Agent 并行调用**
- `call_agent_parallel` 工具，支持多个 Agent 并行执行
- 独立线程 + channel 避免 tokio runtime 嵌套冲突

**Phase 3: Agent 互调用机制**
- Agent 间桥接调用
- 协作工具注册到 ToolRegistry

**Phase 4: JSONPath 条件执行**
- 工作流节点支持 JSONPath 条件分支
- 声明式条件逻辑

**Phase 5: 权限检查 + 端到端测试**
- 协作工具细粒度权限控制
- 社区版/商业版条件编译支持
- 强制并行调用规则提示词优化

**TUI 集成**
- 协作工具简约 TUI 风格
- 工具调用回显过滤与输出展示
- 文件缓存优化并行 Agent 共享读取

### 二、事件持久化与会话恢复引擎 💾

**Phase 1-2: 基础设施**
- JSONL 增量日志写入器（append-only）
- `JsonlWriter`: BufWriter + OpenOptions::append
- `SessionEvent` 类型系统：UserMessage / AIResponseChunk / ToolCall / ToolResult / ThreadSwitch / StreamFinished

**Phase 3: 自动快照**
- Auto Snapshot 创建（周期性全量快照）
- 快照与增量日志的双路径存储

**Phase 4: 会话管理**
- `/resume` 交互式恢复选择器（ResumePicker）
- 支持 auto snapshot / live JSONL / saved session 三种来源
- 会话清理与可配置持久化
- 退出时归档增量日志 + 清理过期快照

**Phase 5-8: 健壮性增强**
- session_id 去重（选择消息数最多的快照）
- 历史消息重放到 JSONL（消除 base_messages 概念）
- JSONL 成为唯一真相源
- 事件持久化状态指示器（TUI 底部 `evt:N`）
- 事件持久化集成测试

**架构决策: WAL + Checkpoint 模型**
```
JSONL (append-only)  = WAL   → 增量追加，崩溃恢复
Auto Snapshot        = Checkpoint → 周期全量快照，快速恢复
```
- 互为兜底：JSONL 损坏 → 从 snapshot 恢复；Snapshot 过期 → 从 JSONL 完整回放
- 触发条件：每 50 个事件 / 每 10 分钟 / resume 后立即（供 ResumePicker）

### 三、终端体验优化 ⌨️

**终端 resize 自适应**
- 处理窗口大小变化事件
- 消除滚动和 resize 时的终端伪影
- 状态不变性检查和线程切换重构

**两次 Ctrl+C 强制退出**
- 首次 Ctrl+C 友好提示
- 二次强制退出并异步保存会话

### 四、Bug 修复 🛡️

1. **OpenAI 兼容 API 流式 tool_calls** — 补齐流式 tool_calls 支持，修复 401 错误
2. **TOML provider 配置短名称** — 支持短名称匹配，api_key 缺失时输出警告
3. **tokio runtime 嵌套冲突** — 多次修复 call_agent_parallel 的 runtime 冲突
4. **Agent 真实执行** — 优化并行报告展示及 tool_call 回显过滤
5. **文件路径显示** — 优化文件路径显示并支持复制
6. **事件计数显示** — 替换软盘图标为 `evt:` 前缀

---

## 📦 详细变更

### 新增文件

**Agent 协作**
- 协作工具实现（Phase 3）
- workflow! DSL 宏（Phase 2）
- 消息协议定义宏（Phase 1）
- Agent 互调用桥接（Phase 0.1.1）

**事件持久化**
- `jsonl_writer.rs` — JSONL 格式增量写入器
- `session_event.rs` — 会话事件类型定义
- `event_persistence.rs` — 事件持久化核心逻辑
- `session_snapshot.rs` — 会话快照管理

### 修改文件

**核心**
- `tui.rs` — 事件收集/快照创建/ResumePicker/resize 适配/Ctrl+C
- `main.rs` — 事件持久化集成/resume 命令处理/版本号 v0.5.1
- `commands.rs` — 会话管理增强（list + resume from JSONL）
- `render.rs` — 版本号 v0.5.1
- `Cargo.toml` — 版本号 0.5.1

---

## 🧪 测试

- Phase 10 系列测试：7 个测试覆盖快照去重、消息合并、历史重放
- jsonl_writer: 11 个测试全通过
- event_persistence: 9 个测试全通过
- session_event: 7 个测试全通过

---

## 🔄 升级说明

### 从 v0.5.0 升级
1. 拉取最新代码: `git pull`
2. 安装依赖: `npm install`
3. 构建: `npm run tauri:community` 或 `cargo build --bin ifai`
4. 旧会话自动兼容：`~/.ifai/sessions/` 目录结构不变

---

## ⚠️ 破坏性变更

**无** — 这是一个完全向后兼容的版本。

---

## 📞 支持

- **文档**: [docs/](docs/)
- **问题反馈**: [GitHub Issues](https://github.com/peterfei/ifai/issues)
- **讨论交流**: [GitHub Discussions](https://github.com/peterfei/ifai/discussions)

---

**下载 v0.5.1**: [GitHub Releases](https://github.com/peterfei/ifai/releases/tag/v0.5.1)

---

<div align="center">
  <p><strong>Made with ❤️ by peterfei</strong></p>
  <p>Agent 协作编排 + 会话持久化引擎 | WAL + Checkpoint 容错模型 | IfAI v0.5.1</p>
</div>
