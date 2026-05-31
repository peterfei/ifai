# 🎉 IfAI v0.5.2 — GUI 声明式架构 + 线程管理系统 + Agent 协作框架

> **发布时间**: 2026-05-31
> **里程碑**: 图形界面全面重构 — 声明式 DSL 驱动架构 + 多线程并发隔离 + Agent 并行协作

---

## ✨ 核心亮点

### 🏛️ GUI 声明式 DSL 架构（全新重构）

v0.5.2 对图形界面进行了全面架构升级，引入元编程驱动的声明式 UI 系统：

- **24 个声明式 DSL 表** — 所有 UI 行为通过声明式查表驱动，零 if-else 分支渲染
- **双注册表架构** — `layoutRegistry` + `componentRegistry` 实现零分支 UI 组合
- **Operation as Data** — 消息操作作为纯可组合函数，支持管道组合 `[op1, op2, op3]`
- **交互式卡片管线** — `CARD_ENRICHMENT_DSL` 声明式注入审批卡、交互卡
- **色板 Token 系统** — `PALETTE_DSL` 定义 9 级文本色阶 + Brand/Surface 色板

### 🧵 线程管理系统 — 多线程并发隔离

全新的 GUI 对话线程管理系统，实现多线程并发流式的完全隔离：

- **双队列 MessageQueue** — 线程感知并发处理，同线程串行 + 跨线程并发
- **5 维度活动检测** — stream activity / per-thread stream count / agent tasks / pending tool calls / active workflows
- **跨线程事件路由** — workflow:started/progress/response/completed 全面支持跨线程路由
- **未读红点** — 后台线程收到消息时自动标记，切回时清除
- **StreamingPulseBanner** — per-thread streamSummary，跨线程持久显示

### 🤖 Agent 协作框架

Agent 可自动协作完成复杂的多步骤任务：

- **`call_agent_parallel`** — 并行调用多个 Agent 同时执行独立任务
- **`share_knowledge`** — Agent 之间共享中间结果和发现
- **`aggregate_results`** — 支持 merge/vote/first 三种策略聚合多 Agent 结果
- **自动协作** — Agent 可自动调用其他专用 Agent（最大深度 5 层）

### 🔄 Workflow 工作流引擎

新增基于 YAML 的工作流编排系统：

- **`workflows/explore.yml`** — Explore Agent 三阶段工作流（扫描→读取→报告）
- **`AgentWorkflowSpec`** — 从 `workflow_type` 自动加载对应 YAML 配置
- **多阶段编排** — 支持 nodes + edges 定义工作流 DAG

### 🎨 GUI 增强功能

- **Skills Hub 技能广场**：8 分类体系 + 宣言式查表组件 + 全屏 Modal 弹窗
- **智能体动画系统**：7 个智能体 CSS 动画 + 4 级自适应降级策略
- **文件授权系统**：PermissionStore 规则链 + ApprovalCard 数据驱动按钮
- **内置浏览器预览**：iframe 双模式 + 自动触发
- **对话右键菜单**：上下文操作（编辑/固定/归档/删除）
- **WorkLogPanel**：活跃 Agent 高亮

### 🧪 智能体动画系统

7 个专用 Agent 的声明式 CSS 动画系统：

- **6 种动画类型**：working（脉冲/呼吸）、celebrate（完成）、error（错误抖动）、idle 4 种（coffee/reading/stretching/meditating）
- **4 级自适应降级**：Full（FPS≥30）→ Degraded → Minimal（reducedMotion）→ Off
- **声明式查表**：`STATUS_TO_ANIM` 状态到动画映射，零分支

### 🏛️ 声明式 Agent 注册系统

- **`global_agent_registry!` 宏** — 声明式注册所有 Agent
- 支持 12 个 Agent：Explore/Review/Refactor/Test/Doc/Debug/TaskBreakdown/ProposalGenerator/WebSearch/GitCommit/ReAct/GeneralPurpose
- 最大协作深度 5 层

---

## 📋 详细变更

### 🚀 新功能

**GUI 声明式架构：**
- 双注册表架构：`layoutRegistry` + `componentRegistry` 零分支 UI 组合
- 24 个声明式 DSL 表驱动所有 UI 行为
- 交互式卡片管线：`CARD_ENRICHMENT_DSL` 注入审批卡/交互卡
- Color Token 系统：`PALETTE_DSL` 9 级文本色阶 + Brand/Surface 色板
- 消息操作管道：纯可组合函数 `[op1, op2, op3]` 组合

**线程管理系统：**
- `threadAwareMiddleware` — Zustand 中间件，Rule 1/2/U 自动路由
- `MessageQueue` — 双队列线程感知并发处理
- `PerThreadSessionStore` — per-thread isLoading/streamSummary/input/scroll 状态
- `ThreadManager` — 线程生命周期统一入口
- 5 维度活动检测：防止误设 idle 状态
- CrossThreadPersistenceService — 写后缓冲 + 独立 EventBus 监听

**Agent 协作：**
- Agent 协作框架：`call_agent_parallel` + `share_knowledge` + `aggregate_results`
- Workflow 工作流引擎：YAML 定义 + 多阶段编排

**GUI 组件：**
- Skills Hub 技能广场（8 分类体系 + 宣言式查表）
- 智能体动画系统（7 Agent × 6 动画 × 4 降级）
- StreamingPulseBanner（per-thread streamSummary）
- 文件授权系统（PermissionStore + ApprovalCard）
- 内置浏览器预览（iframe 双模式）
- 对话右键菜单

### 🧪 测试

- 总测试数：2591（2450 通过，139 跳过，2 预存失败）
- 单测文件：264/265 通过
- E2E 测试覆盖：跨线程路由（HE-x 系列）、Skills Hub 集成、Chat Input 系统
- 高保真 LLM 测试：真实 LLM 流式 + 线程切换 + 工作流验证

### 🔧 优化

- Agent 提示词全面升级：并行读取、工具级并行、批量操作
- Doc Agent 支持 `agent_write_file` 直接写入
- Explore Agent 并行探索策略（扫描→批量读取→报告）
- Review Agent 自动调用复杂度分析
- StreamingPulseBanner 零 useState/useRef，纯派生自状态

### 🐛 修复

- 修复工作流消息跨线程路由丢失（workflow:started/progress/response/completed）
- 修复 MessageQueue async gap 导致消息串线程
- 修复流式切换后后台线程内容不显示
- 修复 ArtifactsPanel 工具名称/结果类型/字段名不匹配
- 修复历史对话加载时异常显示 stream 态
- 修复 Chat Input @ 触发逻辑：空 filter 优先展示 Agent 选择器
- 修复 Skills Hub 卸载/恢复安装状态管理

---

## 📦 下载

- **GitHub**: https://github.com/peterfei/ifai
- **Cargo**: `cargo install ifai`

---

## 🙏 致谢

感谢所有贡献者和测试者的支持！

---

*完整提交历史: `git log v0.5.1..v0.5.2`*
