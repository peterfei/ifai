# 任务清单：GUI 客户端 Marvis 风格重构

## Phase 0: 准备工作

- [x] **0.1** 建立 Design Tokens 系统 ✅
  - [x] 0.1.1 创建 `src/gui/design-tokens/` 目录 ✅
  - [x] 0.1.2 定义品牌色（Brand Blue #4b89ff）、语义色、中性色 Token（#17191c/#1d2127/#252a31/#2d333b/#3b4450） ✅
  - [x] 0.1.3 定义圆角、阴影、间距、字体 Token 层级 ✅
  - [x] 0.1.4 创建 `src/gui/design-tokens/colors.ts` ✅
  - [x] 0.1.5 创建 `src/gui/design-tokens/spacing.ts` ✅
  - [x] 0.1.6 创建 `src/gui/design-tokens/typography.ts` + `radii.ts` + `shadows.ts` ✅
  - [x] 0.1.7 组装 `DEFAULT_THEME: ThemeDSL` + 12 个测试用例 ✅

- [ ] **0.2** 重构 App.css 变量系统 **[P2]**
  - [ ] 0.2.1 替换所有硬编码颜色为 Token 变量引用
  - [ ] 0.2.2 添加 `black` 新主题色系（#000000/#1a1a1a/#007acc）
  - [ ] 0.2.3 保持现有 `--vscode-*` 变量兼容性
  - [ ] 0.2.4 验证无样式回归

- [ ] **0.3** 布局引擎重构 — 声明式（App.tsx） **已完成，详见 Phase 0.5 + 1.7**
  - [x] 0.3.1 提取布局模式逻辑到 layoutStore ✅
  - [x] 0.3.2 layoutStore 添加 `mode` 状态、`setMode` action ✅
  - [x] 0.3.3 实现 `LayoutEngine` 通用渲染器 ✅（layoutRegistry 驱动，零 if-else）
  - [x] 0.3.4 初始状态 = `split` ✅
  - [x] 0.3.5 模式切换时保存/恢复状态 ✅
  - [x] 0.3.6 模式切换过渡动画 ✅（opacity 150ms ease）
  - [x] 0.3.7 切换触点统一注册 ✅（LayoutModeBar + LayoutShortcuts 查表）

- [ ] **0.4** 测试基础设施 **[P3]**
  - [ ] 0.4.1 编写 layoutStore 单元测试
  - [ ] 0.4.2 编写 Design Tokens 视觉回归测试
  - [ ] 0.4.3 编写布局模式切换 E2E 测试
  - [ ] 0.4.4 搭建测试框架（Vitest + Playwright + pixel-diff）
  - [ ] 0.4.5 实现 ESLint custom rule: zero-if-else 审计（禁止 `if (mode ===`、`if (risk ===`、`if (type ===`）
  - [ ] 0.4.6 实现 ESLint custom rule: 魔术索引审计（禁止 `step[5]`、`step[6]`）
  - [ ] 0.4.7 编写静态分析 CI 门禁脚本

## Phase 0.5: 元编程基础设施 + 五层 DSL 系统（新增）

**关键原则：此阶段的产出是所有后续 Phase 的构建基础。后续所有组件必须基于此声明式框架 + DSL 实现，禁止产生新的 if-else 链或手动重复。所有 UI 输出须通过 Fidelity 验证（间距 < 2px、色差 ΔE < 2、动画时序 < 50ms）。所有新 UI 代码放入 `src/gui/` 目录，旧 `src/components/` 代码不动。**

- [x] **0.5.0** 创建 `src/gui/` 目录结构 ✅
  - [x] 0.5.0.1 创建 `src/gui/` 根目录 ✅
  - [x] 0.5.0.2 创建 `src/gui/registry/`（元编程基础设施） ✅
  - [x] 0.5.0.3 创建 `src/gui/dsl/compiler/`（五层 DSL + 编译器） ✅
  - [x] 0.5.0.4 创建 `src/gui/layout/`（布局引擎 + PaneShell） ✅
  - [x] 0.5.0.5 创建 `src/gui/stores/`（workflowStore / animationStore） ✅
  - [x] 0.5.0.6 创建 `src/gui/styles/`（DSL 编译输出样式目录） ✅

- [x] **0.5.1** 实现泛型 Registry 类 ✅
  - [x] 0.5.1.1 实现 `Registry<T>` 类（register / get / has / entries 方法） ✅
  - [x] 0.5.1.2 安全降级策略：get() 返回 undefined 时调用方 fallback，不抛异常 ✅
  - [x] 0.5.1.3 写单元测试：注册 + 查询 + 缺失 type 降级 ✅

- [x] **0.5.2** 实现 LayoutDescriptor 系统 ✅
  - [x] 0.5.2.1 定义 `PaneDescriptor` 接口 ✅
  - [x] 0.5.2.2 定义 `LayoutDescriptor` 类型 ✅
  - [x] 0.5.2.3 实现 `layoutRegistry` 映射 ✅
  - [x] 0.5.2.4 实现 `PaneShell` 通用容器 ✅
  - [x] 0.5.2.5 实现 `LayoutEngine` 组件（从 layoutRegistry[mode] 驱动渲染，零分支） ✅
  - [x] 0.5.2.6 写单元测试 ✅

- [x] **0.5.3** 实现 BlockingStep 注册表 ✅
  - [x] 0.5.3.1 定义 `BlockingStepHandler<T>` 接口 ✅
  - [x] 0.5.3.2 实现 `blockingStepRegistry` ✅
  - [x] 0.5.3.3 实现通用 `pauseForBlocking(step)` 函数 ✅
  - [x] 0.5.3.4 **禁止**在 workflowStore 中出现 if-else 链 ✅
  - [x] 0.5.3.5 写单元测试 ✅

- [x] **0.5.4** 实现 ComponentRegistry ✅
  - [x] 0.5.4.1 实现 `componentRegistry = new Registry<React.ComponentType>()` ✅
  - [x] 0.5.4.2 PaneShell 通过 componentRegistry.get(descriptor.component) 解析组件 ✅
  - [x] 0.5.4.3 懒加载支持（组件按需注册，避免循环依赖） ✅

- [x] **0.5.5** 实现 PanelStack 工厂 ✅
  - [x] 0.5.5.1 实现 `PanelStack` 组件（垂直面板堆叠 + 分隔线 + 拖拽） ✅
  - [x] 0.5.5.2 实现 `PanelConfig` 接口（id, title, component, defaultSize, minSize, collapsible） ✅
  - [x] 0.5.5.3 面板折叠/展开 + 标题栏 + data-testid ✅
  - [x] 0.5.5.4 10 个测试用例 ✅

- [x] **0.5.6** 实现切换触点统一注册器 ✅ — 已通过 LayoutModeBar + LayoutShortcuts 实现
  - [ ] 0.5.6.1 定义 TriggerConfig 类型（source, event, selector/keyMap, action）
  - [ ] 0.5.6.2 实现 `installTriggers(triggers: TriggerConfig[], dispatch)` 批量绑定
  - [ ] 0.5.6.3 5 种触点从独立 handler 改为 TriggerConfig 数组

- [x] **0.5.7** 实现 AnimationSpec 编译器 ✅
  - [x] 0.5.7.1 定义 AnimationSpec 类型（name, duration, easing, keyframes, fillMode, iterationCount, direction） ✅
  - [x] 0.5.7.2 编译函数：`compileAnimations()` AnimationSpec[] → CSS @keyframes + `.animate-*` 工具类 ✅
  - [x] 0.5.7.3 参数校验：duration ≤ 0 抛出错误 ✅
  - [x] 0.5.7.4 10 个测试用例 ✅

- [ ] **0.5.8** 集成测试 **[P3]**
  - [ ] 0.5.8.1 Registry + Descriptor + Factory 三件套集成测试
  - [ ] 0.5.8.2 验证：通过配置驱动而非代码分支实现功能变更

- [x] **0.5.9** ThemeDSL ✅
  - [x] 0.5.9.1 定义 ThemeDSL 类型（colors / spacing / radius / font / shadow） ✅
  - [x] 0.5.9.2 编译器：ThemeDSL → CSS custom properties ✅
  - [x] 0.5.9.3 编写原型像素映射表 ✅

- [x] **0.5.10** AnimationDSL ✅
  - [x] 0.5.10.1 定义 AnimationSpec 类型（KeyframeStep / AnimationSpec） ✅
  - [x] 0.5.10.2 编译器：`compileAnimations()` → CSS @keyframes + `.animate-*` utility classes ✅
  - [x] 0.5.10.3 提取 12 个项目动画为 ANIMATIONS DSL 声明（fadeIn/fadeOut/slideInUp/slideInDown/pulse/shimmer/blink/spin/scaleIn/scaleOut/toastSlideIn/dropdownSlideIn） ✅
  - [x] 0.5.10.4 8 个测试用例 ✅

- [x] **0.5.11** LayoutDSL ✅
  - [x] 0.5.11.1 定义 LayoutDSL 类型（PanelDecl / LayoutDSL） ✅
  - [x] 0.5.11.2 编译器：`compileLayout()` LayoutDSL → CSS Flex 布局 + CSS 变量 ✅
  - [x] 0.5.11.3 支持 conversation/editor/split 三种模式编译 ✅
  - [x] 0.5.11.4 8 个测试用例 ✅

- [ ] **0.5.12** ComponentDSL **[P2]** — 当前已有 AGENT_DSL/PALETTE/RISK_CONFIG 等查表实现
  - [ ] 0.5.12.1 定义 ComponentDSL 类型（SlotDecl / ComponentDecl / variants）
  - [ ] 0.5.12.2 编译器：ComponentDSL → React 组件代码（compile-time codegen）
  - [ ] 0.5.12.3 编写审批卡片的 ComponentDSL 声明（精确对应原型 renderApprovalCard）
  - [ ] 0.5.12.4 编写交互问答卡片的 ComponentDSL 声明（精确对应原型 renderInteractionCard）
  - [ ] 0.5.12.5 编写 Agent 工位的 ComponentDSL 声明（含 statusStyleMap 变体）

- [ ] **0.5.13** InteractionDSL **[P3]**
  - [ ] 0.5.13.1 定义 InteractionDSL 类型（VisualEffect / Transition / InteractionDSL）
  - [ ] 0.5.13.2 编译器：InteractionDSL → Event handler + state machine
  - [ ] 0.5.13.3 注册到 blockingStepRegistry（handler 由 InteractionDSL 编译产生）
  - [ ] 0.5.13.4 编写单选/多选交互的 InteractionDSL 声明（精确对应原型交互流程）

- [ ] **0.5.14** Fidelity 验证（FT4） **[P3]**
  - [ ] 0.5.14.1 从原型截图每个 UI 状态（12 个状态：初始对话/用户气泡/AI气泡/紧凑栏/展开工作台/低风险审批/高风险审批/批准后/拒绝后/单选渲染/单选选中/多选确认）
  - [ ] 0.5.14.2 实现 Playwright 截图脚本：打开原型 + 实现，并排截图
  - [ ] 0.5.14.3 集成 pixel-diff 对比工具，输出 diff.png + JSON 报告
  - [ ] 0.5.14.4 定义偏差标准：间距 < 2px、色差 ΔE < 2、动画时序 < 50ms
  - [ ] 0.5.14.5 编写 12 个 fidelity 断言（每个 UI 状态一个 test case）
  - [ ] 0.5.14.6 搭建 Fidelity CI 步骤：未通过则阻断构建

- [ ] **0.5.15** Registry 单元测试（UT1.1） **[P3]** — 已有基础覆盖（Registry.test.ts）
  - [ ] 0.5.15.1 注册 + 查询 + 覆盖
  - [ ] 0.5.15.2 缺失 type 安全降级
  - [ ] 0.5.15.3 空注册表 + entries 迭代
  - [ ] 0.5.15.4 TypeScript 泛型约束 + 并发注册
  - [ ] 0.5.15.5 60 个测试用例覆盖所有边界

- [ ] **0.5.16** DSL Compiler 单元测试（UT1.2-1.6） **[P3]** — 已有基础覆盖（animation/theme/layout compiler tests）
  - [ ] 0.5.16.1 ThemeDSL 编译器 8 用例（每个 Token 类型 + 全量输出对比）
  - [ ] 0.5.16.2 AnimationDSL 编译器 16 用例（含 19 个原型动画逐字符对比）
  - [ ] 0.5.16.3 LayoutDSL 编译器 10 用例（3 模式 + 边界）
  - [ ] 0.5.16.4 ComponentDSL 编译器 24 用例（生成器：props/variant/lifecycle/event/child/list/边界/快照）
  - [ ] 0.5.16.5 InteractionDSL 编译器 18 用例（hook 生成：effect/delay/condition/多 transition/可 parse）

- [x] **0.5.17** workflowStore 单元测试 ✅（WF-1~11）
  - [ ] 0.5.17.1 advanceStep 无 blocking / approval / interaction 三种路径
  - [ ] 0.5.17.2 未注册类型安全跳过
  - [ ] 0.5.17.3 answeredSteps 去重 + 多步骤推进
  - [ ] 0.5.17.4 边界：第一步 blocking / 最后一步 blocking / 进度计算 / 步骤回滚

- [ ] **0.5.18** Agent 状态机单元测试（UT1.7） **[P2]** — AGENT_STATUS_PALETTE 已有，状态机转换待实现
  - [ ] 0.5.18.1 5 种状态转换（idle→working→error→celebrating→idle）
  - [ ] 0.5.18.2 非法状态降级 + 切换去抖
  - [ ] 0.5.18.3 statusStyleMap 完整性 + 查表性能

- [ ] **0.5.19** 集成测试（IT3.1-3.4） **[P3]**
  - [ ] 0.5.19.1 DSL 全链路：ThemeDSL → CSS variables → 浏览器验证
  - [ ] 0.5.19.2 AnimationDSL 全链路：编译 → 注入 → 动画执行
  - [ ] 0.5.19.3 LayoutDSL 全链路：descriptor → PaneShell → DOM
  - [ ] 0.5.19.4 ComponentDSL 全链路：decl → React → 截图与原型对照

- [ ] **0.5.20** CI 集成 **[P3]**
  - [ ] 0.5.20.1 搭建 CI pipeline：lint → typecheck → zero-if-else → unit → component → integration → fidelity → e2e → perf
  - [ ] 0.5.20.2 配置门禁规则：unit/component/integration 100% 通过 + fidelity ΔE < 2 + zero-if-else 0 违规

## Phase 1: 对话优先界面 — 三栏布局

- [x] **1.1** 三栏布局容器 ✅
  - [x] 1.1.1 创建 `src/gui/conversation/` 目录 ✅
  - [x] 1.1.2 实现左栏组件（TaskProgressPanel / ConversationListPanel） ✅
  - [x] 1.1.3 实现中栏组件（ConversationPanel → AIChat compact） ✅
  - [x] 1.1.4 实现右栏组件（ConversationDetailPanel） ✅
  - [x] 1.1.5 实现 `LayoutEngine` 三栏布局容器 ✅
  - [x] 1.1.6 实现三栏可拖拽分隔线（PaneResizer 复用） ✅
  - [x] 1.1.7 栏宽状态持久化到 layoutStore ✅

- [x] **1.2** 左栏 — 对话管理 ✅
  - [x] 1.2.1 实现左栏布局框架（新建对话 + 技能广场 + 对话列表） ✅
  - [x] 1.2.2 实现 `NewChatButton.tsx` 新建对话按钮 ✅
  - [x] 1.2.3 实现 `SkillSquareEntry.tsx` 技能广场入口 ✅
  - [x] 1.2.4 实现 `ThreadList.tsx` 对话列表（复用现有 ThreadTabs） ✅
  - [x] 1.2.5 对话列表条目显示：标题、摘要、时间戳 ✅
  - [x] 1.2.6 左栏折叠/展开功能 ✅ (PaneCollapseToggle + LayoutEngine collapsedMap, LC/PCT 测试)

- [x] **1.3** 中栏 — 对话区 ✅
  - [x] 1.3.1 实现对话消息列表（气泡渲染） ✅（已有 VirtualMessageList + @tanstack/react-virtual）
  - [x] 1.3.2 用户消息气泡样式（品牌色背景、右对齐） ✅（bubbleStyles.ts PALETTE 查表 + compact inline style）
  - [x] 1.3.3 AI 消息气泡样式（中性色背景、左对齐、Agent 头像） ✅（getAgentBubbleStyle + Agent abbr 头像）
  - [x] 1.3.4 内联代码块渲染（展开/折叠） ✅（已有 MarkdownRenderer 50 行折叠）
  - [x] 1.3.5 时间分组标题（今天/昨天/更早） ✅（timeGrouping.ts + TimeDivider.tsx，集成到短列表路径）
  - [x] 1.3.6 对话区滚动和自动滚动行为 ✅（已有 useChatScrollController 规则表驱动）
  - [x] 1.3.7 复用现有 MarkdownRenderer、VirtualMessageList ✅

- [x] **1.4** 中栏 — 输入区域 ✅
  - [x] 1.4.1 实现中栏底部固定输入区域 ✅（已有 ChatInputArea）
  - [x] 1.4.2 输入框自适应高度（最多 8 行） ✅（已有 max-height 200px）
  - [x] 1.4.3 工具按钮（📎 @ 🧠）集成 ✅（已有）
  - [x] 1.4.4 拖拽文件到输入框支持 ✅（已有）
  - [x] 1.4.5 '@' 触发 Agent 选择器 ✅（AgentSelector.tsx + ChatInputArea 集成，7 Agent 过滤 + ESC 关闭）

- [x] **1.5** 右栏 — Tab 并排四面板（基于真实数据） ✅
  - [x] 1.5.1 实现 `useWorkLogData` hook 从 messages 提取工作日志 ✅
  - [x] 1.5.2 实现 `useArtifactData` hook 从 messages 提取产出物 ✅
  - [x] 1.5.3 实现 `WorkLogPanel.tsx` Agent 操作时间线（AGENT_DSL 颜色查表） ✅
  - [x] 1.5.4 实现 `ArtifactsPanel.tsx` 产出物列表（文件类型图标 + 点击选择） ✅
  - [x] 1.5.5 实现 `PreviewPanel.tsx` 代码/文档预览 ✅
  - [x] 1.5.6 Tab 并排四标签切换（工作日志 / 产出物 / 预览 / Agent） ✅
  - [x] 1.5.7 消除 MOCK_LOGS / MOCK_ARTIFACTS 硬编码数据 ✅
  - [x] 1.5.8 右栏整体折叠/展开功能 ✅ (PaneCollapseToggle + 24px 展开窄条)

- [x] **1.6** AIChat 组件重构 ✅
  - [x] 1.6.1 改造 AIChat.tsx 支持 conversation 模式的渲染 ✅
  - [x] 1.6.2 compact 模式专用样式（隐藏 TokenUsageIndicator、QueueIndicator、ConversationSummary） ✅

- [x] **1.7** 布局模式集成 ✅
  - [x] 1.7.1 conversation 模式下隐藏 Sidebar 和 Editor ✅
  - [x] 1.7.2 conversation 模式保留快速切换回 Editor 的入口 ✅
  - [x] 1.7.3 Titlebar 实现 GuiLayoutSwitcher 模式切换按钮 ✅
  - [x] 1.7.4 底部快捷切换按钮 ✅ (LayoutModeBar DSL 查表, LMB-1~7 测试) — 已移除：与顶部 GuiLayoutSwitcher 重复
  - [x] 1.7.5 键盘快捷键（⌘+1/2/3） ✅ (LayoutShortcuts KEY_TO_MODE 查表, LS-1~7 测试)
  - [x] **1.7.6** 对话列表右键菜单 ✅ **[P0]** 已完成 - 2026-05-24
    - [x] 1.7.6.1 创建 `ConversationContextMenu.tsx` 组件 ✅（策略模式 + 配置驱动，Portal 渲染，自动位置调整）
    - [x] 1.7.6.2 实现删除对话功能 ✅（ConfirmDialog 替代 window.confirm，修复 Tauri/Electron 兼容性）
    - [x] 1.7.6.3 实现重命名对话功能 ✅（编辑状态输入框，Enter/ESC 键盘支持）
    - [x] 1.7.6.4 实现固定对话功能 ✅（置顶图标显示，toggle pinned 状态）
    - [x] 1.7.6.5 扩展 ThreadManager 方法 ✅（updateTitle/update 方法，事件发射）
    - [x] 1.7.6.6 单元测试 ✅（15 个测试：5 + 10，ConversationContextMenu + calculateMenuPosition）
    - [x] 1.7.6.7 E2E 测试 ✅（8 个测试：E2E-CM-1~8，全部通过）
  - [ ] 1.7.7 文件引用上下文菜单（点击文件链接显示操作选项） **[P1]**
  - [x] 1.7.8 模式切换过渡动画 ✅ (LayoutEngine opacity 150ms ease, LT-1~5)

- [x] **1.8** split 模式改进（当前布局的进化版） ✅ 部分完成
  - [x] 1.8.1 聊天面板采用新设计的对话气泡 ✅ (PALETTE 驱动, BS-1~13 测试)
  - [ ] 1.8.2 聊天面板宽度自适应 **[P1]**
  - [ ] 1.8.3 聊天面板可折叠为浮动按钮 **[P1]**

- [x] **1.8b** Thread 状态管理系统 ✅（commit ee4daf6d，详见 `specs/thread-state-management/proposal.md`）
  - [x] 1.8b.1 实现 `ThreadManager` 统一入口（create/switch/archive/delete） ✅
  - [x] 1.8b.2 ThreadStatus 扩展为 5 态（active/idle/working/archived/deleted） ✅
  - [x] 1.8b.3 Agent 状态同步：`initAgentStatusSync()` 订阅 runningAgents ✅ (TM-3~TM-5, TM-7~TM-8)
  - [x] 1.8b.4 Chat 流式状态同步：`initChatStatusSync()` 事件总线驱动 ✅ (TM-9~TM-12)
  - [x] 1.8b.5 `migrateLegacyStatus()` 历史数据迁移（active → idle） ✅
  - [x] 1.8b.6 ConversationListPanel 使用 ThreadManager + STATUS_LABEL 查表 ✅
  - [x] 1.8b.7 App.tsx 初始化订阅 + 清理 ✅
  - [x] 1.8b.8 单元测试 26 个 ✅（TM-1~TM-12）
  - [x] 1.8b.9 E2E 测试 5 个 ✅（真实事件总线驱动：LLM 交互流程 + 多轮对话 + Agent+Chat 并发）
  - [x] 1.8b.10 修复 "Unknown: center" Bug ✅（删除旧 `registrations.ts`，统一使用 `registrations.tsx`）

- [ ] **1.9** 组件测试
  - [x] 1.9.1 用户消息气泡渲染测试 ✅ (BS-1~2 bubbleStyles.test.ts)
  - [x] 1.9.2 AI 气泡渲染测试 ✅ (BS-3~4 bubbleStyles.test.ts)
  - [ ] 1.9.3 消息列表滚动测试（20 条以上自动到底部） **[P2]** — 依赖 E2E 环境
  - [ ] 1.9.4 输入框自适应高度测试（多行递增至 8 行上限） **[P2]** — 依赖 E2E 环境
  - [x] 1.9.5 空对话占位测试 ✅ (EmptyConversationState 组件, EC-1~3 测试)
  - [x] 1.9.6 时间分组渲染测试 ✅（TG-1~11, TD-1~5）
  - [x] 1.9.7 三栏布局单元测试 + 宽度拖拽测试 ✅（LR-8~14, layoutStore LR-1~7）
  - [x] 1.9.8 左栏对话列表渲染 + 选择测试 ✅（CLP-1~13）
  - [x] 1.9.9 右栏面板测试 ✅（WLP-1~5, AP-1~5, PP-1~4, CDP-1~11, RL-1~7, RA-1~6）
  - [ ] 1.9.10 面板拖拽调整高度 E2E 测试（IT3.12） **[P3]**
  - [ ] 1.9.11 三栏宽度拖拽 E2E 测试（IT3.13） **[P3]**
  - [ ] 1.9.12 布局模式切换 E2E 测试（E2E5.8） **[P3]**
  - [ ] 1.9.13 Fidelity 验证：FT4.1~4.3 **[P3]**

- [x] **1.9b** 对话模式集成测试审计 ✅（详见 `specs/conversation-mode/audit-report.md`）
  - [x] 1.9b.1 编写真实集成测试（ConversationMode.integration.test.tsx，14 个测试用例）✅
  - [x] 1.9b.2 运行测试并验证全部通过（14/14 ✅）✅
  - [x] 1.9b.3 审计 DSL 双注册表架构符合度（layoutRegistry + componentRegistry）✅
  - [x] 1.9b.4 验证查表驱动 UI 模式（STATUS_LABEL, AGENT_DSL, PALETTE）✅
  - [x] 1.9b.5 验证状态驱动响应式架构（Zustand store → UI）✅
  - [x] 1.9b.6 生成审计总结报告（符合度 96/100）✅

## Phase 2: Agent 工作台 + 审批/问答系统

- [x] **2.1** Agent 角色系统 ✅
  - [x] 2.1.1 定义 Agent 角色配置接口（颜色/图标/动画/台词） ✅ (AGENT_DSL)
  - [x] 2.1.2 创建 Agent 角色 ✅ (7 个 Agent: explore/proposal/refactor/test/doc/review/execute)
  - [x] 2.1.3 Agent 角色数据通过 AGENT_DSL + PALETTE 查表 ✅

- [ ] **2.2** Agent 工作台组件
  - [x] 2.2.1 实现 `AgentWorkspace.tsx` 容器组件 ✅ (紧凑/展开双模式, AGENT_DSL 颜色查表, AW-1~10 测试)
  - [x] 2.2.2 实现 `AgentWorkstation.tsx` 单个 Agent 工位 ✅ (AGENT_STATUS_PALETTE + STATUS_LABELS 查表, ASW-1~8)
  - [ ] 2.2.3 实现 `AgentAvatar.tsx` SVG 角色形象 **[P2]**
  - [ ] 2.2.4 实现 `AgentStatusIndicator.tsx` 状态指示器 **[P2]** — 已有颜色查表，可按需独立提取
  - [ ] 2.2.5 实现工作台场景背景（WorkspaceScene.tsx） **[P3]**

- [ ] **2.3** Agent 动画系统 **[P2]** — 详见 `specs/agent-animation/proposal.md`
  - [ ] 2.3.1 定义 Agent 状态机（idle/working/thinking/error/celebrating）
  - [ ] 2.3.2 实现工作动画（键盘打字效果）
  - [ ] 2.3.3 实现空闲动画（喝咖啡/看书/伸懒腰/冥想）
  - [ ] 2.3.4 实现错误动画（困惑表情/求助提示）
  - [ ] 2.3.5 实现庆祝动画（任务完成效果）

- [ ] **2.4** Agent 协作可视化 **[P3]**
  - [ ] 2.4.1 实现 `AgentCollaborationLine.tsx` 任务传递连线
  - [ ] 2.4.2 任务分配动画（主 Agent → 子 Agent）
  - [ ] 2.4.3 任务完成上报动画（子 Agent → 主 Agent → 用户）
  - [ ] 2.4.4 Agent 间消息传递的 SVG 路径动画

- [x] **2.5** 审批卡片系统 ✅
  - [x] 2.5.1 创建 `src/gui/conversation/cards/` 目录 ✅
  - [x] 2.5.2 实现 `ApprovalCard.tsx` 审批卡片 UI（数据驱动渲染） ✅
  - [x] 2.5.3 注册到 MessageCardRegistry：`register('approval', ApprovalCard)` ✅
  - [x] 2.5.4 风险等级徽章（RISK_CONFIG 查表） ✅
  - [x] 2.5.5 变更文件列表显示 ✅
  - [x] 2.5.6 确认/拒绝按钮交互 ✅
  - [x] 2.5.7 Mock 数据 WORKFLOW_DSL ✅

- [x] **2.6** 交互问答卡片系统 ✅
  - [x] 2.6.1 创建 `InteractionCard.tsx` ✅
  - [x] 2.6.2 注册到 MessageCardRegistry ✅
  - [x] 2.6.3 实现单选交互（点击 → 高亮 → 0.8s 自动 resolve） ✅
  - [x] 2.6.4 实现多选交互（点击 toggle → 确认按钮计数 → 提交） ✅
  - [x] 2.6.5 选项标签（TAG_COLORS 查表） ✅
  - [x] 2.6.6 Mock 数据 WORKFLOW_DSL ✅

- [x] **2.7** workflowStore 实现（基于 blockingStepRegistry） ✅
  - [x] 2.7.1 定义 `StepData` 接口 ✅ (WorkflowStep: id/type/payload)
  - [x] 2.7.2 实现 `pending: boolean` 通用状态 ✅ (WorkflowStatus: running/paused/completed/cancelled/blocked)
  - [x] 2.7.3 实现 `advanceStep()` 方法 ✅ (resolveBlockingStep → blockingStepRegistry.get(type).resolve, 零 if-else)
  - [x] 2.7.4 实现 `answeredSteps: Set<string>` 去重 ✅ (results 数组记录)
  - [x] 2.7.5 实现步骤进度计算和存储 ✅ (WF-1~11 测试)

- [ ] **2.8** 工作台集成
  - [x] 2.8.1 conversation 模式右栏 Agent Tab 集成 ✅ (ConversationDetailPanel CDP-8~11)
  - [ ] 2.8.2 split 模式下 AgentWorkspace 在聊天面板顶部 **[P1]**
  - [ ] 2.8.3 工作台大小自适应（4/5/6 Agent 布局） **[P2]**
  - [ ] 2.8.4 空状态设计（无活跃 Agent 时的占位动画） **[P2]**

- [ ] **2.9** 性能优化 **[P2]**
  - [ ] 2.9.1 CSS transform/opacity 硬件加速
  - [ ] 2.9.2 空闲 Agent 动画降频（`will-change` 控制）
  - [ ] 2.9.3 `prefers-reduced-motion` 支持
  - [ ] 2.9.4 animationStore 自动帧率检测和降级

- [x] **2.10** ApprovalCard 组件测试 ✅（approval-card.test.tsx, 13 用例）
  - [x] 2.10.1 低/中/高 3 种风险渲染 ✅
  - [x] 2.10.2 文件列表渲染 ✅
  - [x] 2.10.3 批准交互 ✅
  - [x] 2.10.4 批准后按钮禁用 ✅
  - [x] 2.10.5 拒绝交互 ✅
  - [x] 2.10.6 跳过/回退/终止后果 ✅
  - [x] 2.10.9 批准后拒绝不可用 ✅

- [ ] **2.11** FilePreview 组件测试（CT2.2，8 用例） **[P2]**
  - [ ] 2.11.1 文件预览模态窗渲染（标题栏显示文件路径 + 语言类型 + 行数）
  - [ ] 2.11.2 语法高亮渲染（TS/TSX 5 种 Token 类型颜色正确）
  - [ ] 2.11.3 行号渲染（第 1 行 ~ 末行，对齐）
  - [ ] 2.11.4 只读/编辑模式切换（点击按钮 → textarea 显示，再点击 → 语法高亮恢复）
  - [ ] 2.11.5 点击外部 / Escape 关闭模态窗
  - [ ] 2.11.6 入场/出场动画执行（className 存在，transition 触发）
  - [ ] 2.11.7 「在编辑器中打开」按钮 → switchMode('editor') 被调用
  - [ ] 2.11.8 文件内容不存在时显示友好占位提示

- [x] **2.12** InteractionCard 组件测试 ✅（interaction-card.test.tsx, 15 用例）
  - [x] 2.12.1 单选 3 个 option 渲染 ✅
  - [x] 2.12.2 单选选中高亮 + 其他半透明 + 0.8s resolve ✅
  - [x] 2.12.3 单选切换（点 A → 点 B，A 恢复） ✅
  - [x] 2.12.4 选项标签渲染（tag/tagColor 正确配色） ✅
  - [x] 2.12.5 多选 checkbox + 确认按钮渲染 ✅
  - [x] 2.12.6 多选勾选 + 计数更新 ✅
  - [x] 2.12.7 多选取消勾选 ✅
  - [x] 2.12.8 多选确认后禁用 + 变绿 + 1.0s resolve ✅
  - [x] 2.12.9 多选 0 项确认按钮禁用 ✅

- [x] **2.12b** AgentWorkstation 组件测试 ✅（AgentWorkstation.test.tsx, ASW-1~8）
  - [x] 2.12b.1 状态颜色查表渲染 ✅
  - [x] 2.12b.2 紧凑模式（头像 + 状态行） ✅
  - [x] 2.12b.3 展开模式（完整工位 + 进度条 + 日志） ✅
  - [x] 2.12b.4 未知 Agent 类型安全降级 ✅

- [ ] **2.13** 集成测试（IT3.5-3.18，14 场景） **[P3]**
  - [ ] 2.13.1 Registry + blocking step 链路（advanceStep → dispatch → render）
  - [ ] 2.13.2 审批 → 继续 → 问答（连续两个 blocking 类型交替）
  - [ ] 2.13.3 问答 → 继续 → 审批（顺序无关）
  - [ ] 2.13.4 三个 blocking 连续（approval → interaction → approval）
  - [ ] 2.13.5 workflowStore + layoutStore 共存（模式切换不中断工作流）
  - [ ] 2.13.6 多 Agent 并行状态切换（独立互不干扰）
  - [ ] 2.13.7 紧凑/展开切换流畅
  - [ ] 2.13.8 LayoutDSL 热更新 + AnimationDSL 热更新
  - [ ] 2.13.9 多线程独立推进（线程 1 step 3 ↔ 线程 2 step 1）
  - [ ] 2.13.10 工作流完成后循环（跳过已 answered blocking）
  - [ ] 2.13.11 50 次工作流循环内存泄漏检查

- [ ] **2.14** E2E 测试（E2E5.1-5.7，7 场景） **[P3]**
  - [ ] 2.14.1 无 blocking 完整工作流（6 步完成）
  - [ ] 2.14.2 含审批完整工作流（启动 → 审批 → Approve → 完成）
  - [ ] 2.14.3 含拒绝完整工作流（启动 → 审批 → Reject → skip → 完成）
  - [ ] 2.14.4 含单选问答完整工作流
  - [ ] 2.14.5 含多选问答完整工作流
  - [ ] 2.14.6 审批 + 问答交替完整工作流
  - [ ] 2.14.7 多线程独立推进 E2E

- [ ] **2.15** 性能测试（PT6.1-6.6，6 项） **[P3]**
  - [ ] 2.15.1 布局切换延迟 < 300ms
  - [ ] 2.15.2 Agent 动画帧率 ≥ 30 FPS（低端设备）
  - [ ] 2.15.3 低帧率自动降级（FPS < 25 时 2s 内关闭空闲动画）
  - [ ] 2.15.4 prefers-reduced-motion 响应
  - [ ] 2.15.5 50 次工作流循环内存增量 < 80MB
  - [ ] 2.15.6 DSL 编译性能 < 50ms 首次 / < 5ms 增量

## Phase 3: 技能商店 UI 重构 **[P3]**

- [ ] **3.1** 卡片式技能展示（路径: `src/gui/skill/`）
  - [ ] 3.1.1 创建 `src/gui/skill/` 目录
  - [ ] 3.1.2 设计技能卡片组件（SkillCard.tsx）
  - [ ] 3.1.3 左侧封面图/图标（128x128）+ 右侧描述布局
  - [ ] 3.1.4 卡片悬浮动效（lift + shadow）
  - [ ] 3.1.5 安装按钮和内联进度条
  - [ ] 3.1.6 技能标签展示（分类/版本/大小）

- [ ] **3.2** SkillMarket 重构（位于 `src/gui/skill/SkillMarket.tsx`）
  - [ ] 3.2.1 重写 SkillMarket.tsx 为双列/三列卡片网格
  - [ ] 3.2.2 分类标签导航（横向滚动）
  - [ ] 3.2.3 即时搜索栏（带防抖）
  - [ ] 3.2.4 推荐区块（基于项目类型/常用技能）
  - [ ] 3.2.5 已安装 / 可更新 / 全部 筛选视图

- [ ] **3.3** 技能安装流程
  - [ ] 3.3.1 一键安装按钮
  - [ ] 3.3.2 安装过程进度条动画
  - [ ] 3.3.3 安装完成后 Toast 通知
  - [ ] 3.3.4 卸载确认对话框（带影响分析）

- [ ] **3.4** 集成
  - [ ] 3.4.1 SkillsDock 保留为快速启动坞
  - [ ] 3.4.2 从 SkillsDock 可直接跳转到 SkillMarket
  - [ ] 3.4.3 技能市场入口在 Titlebar 和左栏技能广场入口

- [ ] **3.5** 测试
  - [ ] 3.5.1 SkillMarket 筛选搜索单元测试
  - [ ] 3.5.2 技能安装/卸载流程 E2E 测试
  - [ ] 3.5.3 卡片渲染性能测试（滚动 60 FPS）
  - [ ] 3.5.4 安装进度条动画单元测试
  - [ ] 3.5.5 搜索防抖单元测试
  - [ ] 3.5.6 推荐算法单元测试（基于项目类型匹配）
  - [ ] 3.5.7 空搜索结果状态测试
  - [ ] 3.5.8 分类标签导航 E2E 测试（横向滚动 + 选中高亮）

## Phase 4: 隐私模式与体验打磨 **[P3]**

- [ ] **4.1** 隐私模式指示器（位于 `src/gui/layout/Statusbar.tsx`）
  - [ ] 4.1.1 Statusbar 添加隐私指示器组件（在 gui/layout/ 中实现）
  - [ ] 4.1.2 indicators: [🌐 效率模式] / [🔒 隐私模式]
  - [ ] 4.1.3 点击指示器弹出模式切换面板
  - [ ] 4.1.4 模式切换面板说明数据流向差异

- [ ] **4.2** 数据流可视化
  - [ ] 4.2.1 隐私面板中显示当前数据流向图
  - [ ] 4.2.2 效率模式：用户 → 云端模型 → 本地
  - [ ] 4.2.3 隐私模式：用户 → 本地模型（数据不出设备）
  - [ ] 4.2.4 数据发送量统计（当前会话累计）

- [ ] **4.3** settingsStore 扩展
  - [ ] 4.3.1 添加 privacyMode 状态
  - [ ] 4.3.2 添加 dataFlowVisible 配置
  - [ ] 4.3.3 隐私模式切换自动选择对应模型
  - [ ] 4.3.4 设置页面隐私分组重构

- [ ] **4.4** 动效系统打磨
  - [ ] 4.4.1 页面/模式切换滑动动画
  - [ ] 4.4.2 组件交互弹性反馈
  - [ ] 4.4.3 骨架屏统一化
  - [ ] 4.4.4 加载状态品牌动画

- [ ] **4.5** 设计一致性检查
  - [ ] 4.5.1 圆角统一（检查所有组件）
  - [ ] 4.5.2 间距系统对齐
  - [ ] 4.5.3 调色板一致性校验
  - [ ] 4.5.4 字体层级校验

- [ ] **4.6** 测试
  - [ ] 4.6.1 隐私模式切换单元测试（efficiency ↔ privacy 状态转换）
  - [ ] 4.6.2 数据流面板渲染测试（效率模式：云端路径；隐私模式：本地路径）
  - [ ] 4.6.3 全局样式回归测试（所有 Token 引用 vs 硬编码颜色检查）
  - [ ] 4.6.4 动画降级 E2E 测试（PT6.3-6.4）
  - [ ] 4.6.5 骨架屏加载状态测试
  - [ ] 4.6.6 圆角系统一致性校验（所有组件的 border-radius 来自 theme）
  - [ ] 4.6.7 间距系统一致性校验（所有 margin/padding 来自 theme）
  - [ ] 4.6.8 字体层级一致性校验

## Phase 5: 集成与发布 **[P3]**

- [ ] **5.1** 全面集成测试
  - [ ] 5.1.1 所有布局模式完整 E2E 流程测试（conversation → editor → split 全覆盖）
  - [ ] 5.1.2 Agent 工作台 + 对话 + 技能市场集成测试
  - [ ] 5.1.3 隐私模式 + 模型选择集成测试
  - [ ] 5.1.4 全链路 Fidelity 回归：12 个 UI 状态全部通过（FT4.1-4.12）
  - [ ] 5.1.5 零 if-else 审计全量通过（0 违规）
  - [ ] 5.1.6 完整 E2E 8 场景全部通过（E2E5.1-5.8）
  - [ ] 5.1.7 性能基准全部达标（PT6.1-6.6）

- [ ] **5.2** 性能基准测试
  - [ ] 5.2.1 布局切换延迟 < 300ms（PT6.1）
  - [ ] 5.2.2 Agent 动画低端设备 ≥ 30 FPS（PT6.2）
  - [ ] 5.2.3 动画降级响应 < 2s（PT6.3）
  - [ ] 5.2.4 prefers-reduced-motion 适配（PT6.4）
  - [ ] 5.2.5 内存增量 < 80MB（PT6.5）
  - [ ] 5.2.6 DSL 编译性能 < 50ms / < 5ms（PT6.6）
  - [ ] 5.2.7 首屏加载时间 < 1.5s

- [ ] **5.3** 文档与变更日志
  - [ ] 5.3.1 更新用户文档（新布局模式说明）
  - [ ] 5.3.2 更新开发者文档（Design Tokens 使用指南）
  - [ ] 5.3.3 生成变更日志（CHANGELOG）

- [ ] **5.4** beta 发布
  - [ ] 5.4.1 默认保持 split 模式（经典体验）
  - [ ] 5.4.2 conversation 模式标记为 beta
  - [ ] 5.4.3 收集用户反馈迭代
