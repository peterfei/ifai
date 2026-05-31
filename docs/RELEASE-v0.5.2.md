# 🎉 IfAI v0.5.2 — 全新 GUI 对话模式 + 线程管理系统 + Agent 协作框架

> **发布时间**: 2026-05-31
> **里程碑**: 全新图形界面对话模式 — 三栏布局 + 声明式 DSL 驱动 + 多线程并发隔离

---

![截屏2026-05-29 01.14.05](http://image-peterfei-blog.test.upcdn.net/截屏2026-05-29 01.14.05.png)

## ✨ 核心亮点

### 💬 全新 GUI 对话模式（v0.5.2 最大亮点）

v0.5.2 新增了全新的图形界面**对话模式**，这是一次全面的 GUI 交互体验升级：

- **三栏布局**：左侧对话列表（260px）+ 中间 AI 聊天区域 + 右侧详情面板（300px）
- **多线程并发对话**：支持同时打开多个对话线程，各线程流式响应互不干扰
- **线程快捷切换**：Ctrl+T 新建 / Ctrl+W 关闭 / Ctrl+Tab 切换 / F2 重命名
- **右键上下文菜单**：重命名、置顶、归档、删除对话
- **未读红点提示**：后台线程收到新消息自动标记未读，切回时清除
- **拖拽调整布局**：左右两栏宽度可自由拖拽调整（150-600px），支持一键折叠
- **持久化恢复**：所有线程消息自动保存到 IndexedDB，重启后完整恢复

### 🏛️ 声明式 DSL 驱动架构

整个对话模式基于元编程驱动的声明式 UI 系统构建：

- **双注册表架构** — `layoutRegistry` + `componentRegistry`，零 if-else 分支渲染
- **24 个声明式 DSL 表** — 所有 UI 行为（状态标签、颜色、动画、分类）通过查表驱动
- **交互式卡片管线** — `CARD_ENRICHMENT_DSL` 声明式注入审批卡、交互卡
- **消息卡片注册表** — 10 种消息类型运行时注册（文本/审批/交互/进度/文件变更/工具调用等）
- **色板 Token 系统** — `PALETTE_DSL` 9 级文本色阶 + Brand/Surface 色板

### 🧵 线程管理系统

全新的 GUI 对话线程管理系统，实现多线程并发流式的完全隔离：

- **双队列 MessageQueue** — 线程感知并发处理，同线程串行 + 跨线程并发
- **5 维度活动检测** — stream activity / per-thread stream count / agent tasks / pending tool calls / active workflows
- **跨线程事件路由** — workflow:started/progress/response/completed 全面支持跨线程路由
- **StreamingPulseBanner** — per-thread streamSummary，跨线程持久显示"思考中..."和 Token 摘要

### 🤖 Agent 协作框架

Agent 可自动协作完成复杂的多步骤任务：

- **`call_agent_parallel`** — 并行调用多个 Agent 同时执行独立任务
- **`share_knowledge`** — Agent 之间共享中间结果和发现
- **`aggregate_results`** — 支持 merge/vote/first 三种策略聚合多 Agent 结果
- **自动协作** — Agent 可自动调用其他专用 Agent（最大深度 5 层）

### 🎨 对话模式功能区

**右侧详情面板（三 Tab 并排）：**

| Tab | 功能 | 说明 |
|-----|------|------|
| 工作日志 | `WorkLogPanel` | 实时显示 Agent 操作日志，活跃 Agent 高亮 |
| 产出物 | `ArtifactsPanel` | 展示 AI 生成的文件变更列表 |
| 预览 | `PreviewPanel` | 内置浏览器预览 HTML 产出物（iframe 双模式）|

**其他增强：**
- **对话模式 titlebar** — 右上角精简为仅保留设置按钮
- **文件授权系统** — PermissionStore 规则链 + ApprovalCard 数据驱动按钮
- **Token 用量可视化** — 右侧详情面板底部进度条（渐变绿→黄→橙→红）
- **智能体动画** — 7 Agent × 6 动画 × 4 级自适应降级

### 🔄 Workflow 工作流引擎

- **YAML 工作流定义**：`workflows/explore.yml` — 三阶段工作流（扫描→读取→报告）
- **多阶段编排**：支持 nodes + edges 定义工作流 DAG

---

## 📋 详细变更

### 🚀 新功能

**GUI 对话模式：**
- 三栏布局：对话列表（左）+ AI 聊天（中）+ 详情面板（右）
- 双注册表架构：`layoutRegistry` + `componentRegistry` 零分支 UI 组合
- 24 个声明式 DSL 表驱动所有 UI 行为
- 交互式卡片管线：`CARD_ENRICHMENT_DSL` 注入审批卡/交互卡
- 10 种消息卡片类型：文本/审批/交互/进度/文件变更/工具调用/Composer/错误修复/Agent 工作区/探索结果
- Color Token 系统：`PALETTE_DSL` 9 级文本色阶 + Brand/Surface 色板
- 消息操作管道：纯可组合函数 `[op1, op2, op3]` 组合

**线程管理系统：**
- `threadAwareMiddleware` — Zustand 中间件，Rule 1/2/U 自动路由
- `MessageQueue` — 双队列线程感知并发处理
- `PerThreadSessionStore` — per-thread isLoading/streamSummary/input/scroll 状态
- `ThreadManager` — 线程生命周期统一入口
- 5 维度活动检测：防止误设 idle 状态
- 跨线程事件路由：workflow:started/progress/response/completed 全部跨线程
- CrossThreadPersistenceService — 写后缓冲 + 独立 EventBus 监听

**Agent 协作：**
- Agent 协作框架：`call_agent_parallel` + `share_knowledge` + `aggregate_results`
- Workflow 工作流引擎：YAML 定义 + 多阶段编排
- Agent 提示词系统 v2.0（全部 8 个 Agent 并行化升级）
- 声明式 `global_agent_registry!` 宏 — 12 个 Agent

**GUI 组件：**
- Skills Hub 技能广场（8 分类体系 + 宣言式查表 + 全屏 Modal）
- 智能体动画系统（7 Agent × 6 动画 × 4 降级）
- StreamingPulseBanner（per-thread streamSummary）
- 文件授权系统（PermissionStore + ApprovalCard）
- 内置浏览器预览（iframe 双模式）
- 对话右键菜单
- WorkLogPanel 活跃 Agent 高亮

### 🧪 测试

- 总测试数：2591（2450 通过，139 跳过，2 预存失败）
- 单测文件：264/265 通过
- 对话模式集成测试：14/14 通过
- E2E 测试覆盖：跨线程路由（HE-x 系列）、LLM 流式对话、Skills Hub 集成、Chat Input 系统
- 真实 LLM E2E 测试：6/6 通过，验证消息发送/线程状态同步/工作日志/多轮对话/模式切换

### 🔧 优化

- Agent 提示词全面升级：并行读取、工具级并行、批量操作
- StreamingPulseBanner 零 useState/useRef，纯派生自状态
- 对话模式 AIChat compact 模式精简 UI 冗余
- 面板宽度和折叠状态通过 Zustand persist 持久化

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

---

## 🙏 致谢

感谢所有贡献者和测试者的支持！

---

*完整提交历史: `git log v0.5.1..v0.5.2`*
