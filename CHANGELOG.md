# 更新日志

## [0.5.2] - 2026-05-31
### GUI 线程管理系统 & Agent 协作增强

全新 GUI 对话线程管理系统，实现多线程并发流式的完全隔离和跨线程事件路由。

#### 1. 线程管理系统 (Phase 1-5)
- **threadAwareMiddleware**：Zustand 中间件，Rule 1/2/U 实现 `_messagesByThread` 自动路由
- **双队列 MessageQueue**：线程感知并发处理，同线程串行 + 跨线程并发
- **5维度活动检测**：stream activity / per-thread stream count / agent tasks / pending tool calls / active workflows
- **未读红点**：后台线程收到消息时自动标记 `hasUnreadActivity`，切回时清除
- **StreamingPulseBanner**：per-thread `streamSummary` 替代局部 `useRef`，跨线程持久显示

#### 2. 跨线程事件路由
- **workflow:started/progress/response/completed** 全部支持跨线程路由
- **chat:message:sent** 工作流消息块添加 cross-thread 检测
- **SendMessageOrchestrator** 传递 `threadId` 防止 async gap 串流

#### 3. Agent 协作
- **并行 Agent 调用**：`call_agent_parallel` 工具支持同时启动多个 Agent
- **协作工具注册**：`task_agent`、`call_agent`、`call_agent_parallel` 声明式注册

#### 4. GUI 增强
- **对话模式 titlebar** 右上角仅保留设置按钮
- **WorkLogPanel** 活跃 Agent 高亮
- **文件授权系统**：PermissionStore 规则链 + ApprovalCard 数据驱动按钮
- **内置浏览器预览**：iframe 双模式 + 自动触发

## [0.5.1] - 2026-05-19
### TUI 事件驱动自动保存 & 交互式会话恢复

基于 Codex 设计理念实现完整的 TUI 会话持久化系统，支持崩溃恢复和配置化自动保存。

#### 1. 事件驱动持久化架构
- **SessionEvent 枚举**：定义 6 种会话事件（UserMessage、AIResponseChunk、StreamFinished、ToolCall、ToolResult、ThreadSwitch）
- **EventMetadata**：时间戳 + 序列号 + 线程 ID 元数据
- **异步写入通道**：tokio::sync::mpsc（容量 256）+ 后台 worker 任务
- **JsonlWriter**：JSONL 增量日志写入，文件锁定保证并发安全

#### 2. 增量日志与快照
- **JSONL 实时写入**：每个事件异步追加到 `sessions/live/{session-id}.jsonl`
- **自动快照创建**：每 N 个事件或 M 分钟触发（可配置，默认 50/10min）
- **SessionSnapshot**：从事件序列重构完整会话状态
- **4 级快照保留策略**：最近 10 个 + 1 小时全保留 + 24 小时每小时 + 7 天过期
- **归档机制**：会话结束时增量日志移至 `sessions/archive/`，30 天后清理

#### 3. 交互式会话恢复（ResumePicker）
- **`/resume` 无参数**：弹出交互式选择器，键盘上下键 + 回车恢复
- **三类会话来源**：手动保存、自动快照 `[auto]`、实时日志 `[live]`
- **合并恢复**：自动合并最新快照 + 增量日志，重构完整会话历史
- **UI 渲染**：参照 CommandPopup 模式，声明式按键映射 + 弹出框

#### 4. 配置管理
- **`~/.ifai/config.toml`** 新增 `[tui.event_persistence]` 段：
  ```toml
  [tui.event_persistence]
  enabled = true
  snapshot_interval_minutes = 10
  snapshot_event_count = 50
  max_snapshots = 10
  ```
- **`/config show`**：查看事件持久化配置
- **`/config init`**：生成配置文件模板

#### 5. 会话管理命令
- **`/cleanup-sessions`**：手动清理过期快照和归档，显示释放空间

#### 6. UI 改进
- **状态栏**：`evt:N` 显示已持久化事件计数（文本风格，匹配 TUI 设计语言）
- **启动提示**：`auto-save · 50 events / 10 min`（灰色，不干扰主要信息）

#### 7. 新增模块（6 个文件）
| 模块 | 功能 |
|------|------|
| `session_event.rs` | 会话事件定义和序列化 |
| `event_persistence.rs` | 异步持久化通道和 worker |
| `jsonl_writer.rs` | JSONL 增量日志写入器 |
| `snapshot_manager.rs` | 快照保留策略和归档管理 |
| `resume_picker.rs` | 交互式会话选择器 |
| `config.rs`（扩展） | TOML 事件持久化配置解析 |

#### 8. 测试覆盖
- **单元测试**：session_event 11 个 + snapshot_manager 11 个 + config 20 个
- **集成测试**：
  - 事件驱动保存完整流程（EventPersistence → JSONL → 快照重构）
  - 崩溃恢复（模拟 JSONL 残留 → 事件重放 → 会话恢复）
  - 快照清理集成（15 个快照 → 保留策略过滤 → 5 个过期删除）
  - 配置解析 + App 集成（TOML 解析 → 配置传递 → 字段应用）
- **总计**：47+ 新增测试用例

#### 9. 修改文件清单
| 文件 | 变更类型 |
|------|---------|
| `session_event.rs` | 新增 |
| `event_persistence.rs` | 新增 |
| `jsonl_writer.rs` | 新增 |
| `snapshot_manager.rs` | 新增 |
| `resume_picker.rs` | 新增 |
| `main.rs` | 修改（持久化初始化、ResumePicker、集成测试） |
| `tui.rs` | 修改（Mode::ResumePicker、状态栏、配置字段） |
| `commands.rs` | 修改（/resume 交互式、/cleanup-sessions、/config 增强） |
| `config.rs` | 修改（TOML 事件持久化配置） |
| `event/handlers.rs` | 修改（ResumePicker 键盘处理） |

---

## [0.4.1] - 2026-04-14
### 🚀 多智能体协作系统 & 消息稳定性修复

#### 1. 多智能体协作系统（P0-P4 核心完成） 🏆
基于 OpenSpec P4 提案实现完整的多智能体工作流编排、通信和可视化能力。

- **工作流引擎**：
  - DAG 工作流定义与解析（YAML 支持）
  - 拓扑排序调度器（Kahn 算法），并行任务自动识别
  - 节点执行器（Tool/Agent 节点），暂停/恢复/取消控制
- **智能体通信协议**：
  - 消息总线（ChatEventBus），点对点通信、广播和主题订阅
  - 会话管理和请求-响应模式
- **DAG 可视化**：
  - React Flow 集成 + Dagre 自动布局，自定义节点组件
  - 默认 SVG 模式，字母标识（S/R/W/A）替代 emoji
  - 节点点击交互，视图模式切换
- **前端用户交互**：
  - 工作流命令识别（/explore, /review, /refactor）
  - WorkflowInlineMonitor 内嵌监控器（专业级实时进度可视化）
  - 工作流执行期间不显示空白气泡，完成后一次性显示总结
  - 重复探索命令检测和总结模式
- **标签页隔离**：
  - Session ID 传递，前端基于 activeThreadId 过滤
  - 监控器在正确的标签页显示
- **消息队列机制**：
  - 双队列设计（普通消息队列 + 工作流队列），优先级调度
  - QueueIndicator 实时显示队列状态、排队数量、消息预览
  - AbortController 停止机制
- **代码统计**：新增 ~10,080 行核心代码，96 个测试用例，95% 测试覆盖率

#### 2. 消息持久化修复（5 项）
- **Tab 消息隔离**：修复 switchThread 在不同线程间切换时消息串扰，添加 isSameThread 检查
- **IndexedDB 版本冲突**：修复 `VersionError`，移除硬编码 DB_VERSION，支持自动升级
- **threadPersistence 初始化**：修复未初始化导致 loadThreadMessages 静默返回空数组
- **Store 实例一致性**：修复 CoreStoreProxy 与 useChatStore 产生不同 Zustand 实例的问题
- **Zustand persist merge**：自定义 merge 函数，防止空 localStorage 数据覆盖内存消息

#### 3. 工作流可靠性修复（4 项）
- **工作流消息阻塞**：修复工作流处理期间其它消息无法被处理的问题
- **聊天内容乱序**：修复工作流执行过程中的消息顺序错乱
- **工具执行结果不显示**：修复工具执行完成后的结果摘要渲染
- **`/explore` 历史消息丢失**：修复 explore 命令执行后历史消息被清空

#### 4. 其他修复（3 项）
- **流式空事件**：移除流式处理时的空事件
- **WorkflowInlineMonitor**：修复 require 错误和 getChatEventBus 导出问题
- **工具 explore 流式输出**：修复 explore 工具在总结时流式输出异常

#### 5. 性能优化
- **虚拟列表优化**：对聊天虚拟列表（VirtualMessageList）进行渲染性能优化

#### 代码统计
- 新增 ~48,000 行代码（166 个文件变更）
- E2E 测试通过率：44/44 chat 测试通过（100%）

---

## [0.4.0] - 2026-04-07
### 🚀 提示词生态系统与多智能体架构 - 史上最大架构升级

#### 1. 提示词管理系统 (Prompt Manager) ✅ 100% 完成
- **分层透明策略**：基于业界最佳实践，实现三层提示词管理架构
  - 🟢 公开层（80%）：用户自定义提示词、官方智能体模板、工具描述
  - 🟡 半透明层（15%）：系统主提示词、安全和权限规则、对话管理提示词
  - 🔴 隐藏层（5%）：ifainew-core 内部提示词、专有算法、反滥用规则
- **版本控制与 Git 集成**：版本历史追踪、对比、回滚、修改状态检测（基于 git2-rs）
- **Monaco Editor 集成**：Handlebars + Markdown 语法高亮、智能变量补全、13+ Helper 函数补全、实时验证（防抖 500ms）
- **导入导出功能**：ZIP 包创建和解析、多选提示词打包、覆盖逻辑检查、包信息验证
- **安全增强**：提示词注入检测（18 种危险模式）、花括号平衡检查、YAML Front Matter 验证
- **代码统计**：新增 ~3384 行（后端 5 文件 + 前端 7 文件），E2E 测试通过率 93.6% (44/47)

#### 2. 工具系统 (Tool Registry) ✅ P0-P3 完成
- **核心工具集（10+ 工具）**：
  - 文件操作：read_file, write_file, edit_file
  - 搜索：glob_search, grep_search（自动过滤 node_modules/target/dist）
  - Shell 命令：bash, PowerShell（跨平台支持）
  - 项目管理：TodoWrite（三态面板自动折叠）
- **工具权限分级**：ReadOnly / WorkspaceWrite / DangerFullAccess
- **AI 服务集成**：自动注入 working_dir、自动解析相对路径、多工作区兼容
- **代码统计**：新增 4 个执行器，~1300 行代码，E2E 测试 13/13 通过

#### 3. 多智能体系统 (Agent System) ✅ P4 核心完成
- **里程碑：移除 commercial 限制**：社区版用户现在可以使用完整的智能体系统！
- **核心智能体（5 种）**：
  - Explore Agent：只读代码探索，多层次搜索策略
  - Review Agent：代码审查，安全/性能/最佳实践检查
  - TaskBreakdown Agent：任务分解，TodoWrite 集成（E2E: 5/5）
  - ProposalGenerator Agent：OpenSpec 提案生成（E2E: 6/6）
  - Refactor Agent：重构建议和自动执行（E2E: 6/6）
- **智能体协作机制**：消息协议、协作管理器、用户确认 UI、DAG 可视化（E2E: 10/10）
- **代码统计**：新增 9 个模块文件，~1200 行代码

#### 4. CLI 交互式工具 ✅ 完成
- **交互式对话模式**：rustyline 支持、命令历史、会话持久化、优雅退出（Ctrl+C）
- **多 Provider 支持**：DeepSeek（默认）、OpenAI、Anthropic
- **System Prompt 集成**：AI 正确识别为 "IfAI"，messages[0] 格式修复
- **清洁输出体验**：移除调试日志、流式文本显示、工具调用可视化
- **代码统计**：~600 行代码，5 个 CLI 文档，二进制大小 ~8MB

#### 5. 流式响应架构重构 ✅ 完成
- **OpenAI 格式支持**：工具调用、参数累积机制、分片数据处理
- **事件顺序优化**：ToolDone → MessageDone，确保工具执行正确
- **生命周期管理**：isActivelyStreaming、isLoading 状态验证与恢复

#### 6. UI 体验优化 ✅ P6 完成
- **TodoWrite 面板三态自动折叠**：
  - full (384px)：TodoWrite 调用时自动展开，显示完整任务列表
  - collapsed (~40px)：所有任务完成后 800ms 自动折叠，显示完成摘要
  - hidden (0px)：用户手动关闭
  - CSS transition 平滑过渡（300ms ease-in-out）

#### 7. 测试覆盖
- **E2E 测试**：
  - Section 2（提示词管理）：44/47 通过（93.6%）
  - P3（工具系统 UI）：13/13 通过（100%）
  - P4（智能体协作）：10/10 通过（100%）
  - P6（TodoWrite 面板）：102 回归测试通过
- **单元测试**：Rust 后端 10/10 通过，工具执行器 ~500 行测试代码

#### 8. 代码统计总览
| 模块 | 新增代码 | 新增文件 | 测试通过率 |
|------|---------|---------|-----------|
| 提示词管理 | ~3384 行 | 15 | 93.6% |
| 工具系统 | ~1300 行 | 8 | 100% |
| 智能体系统 | ~1200 行 | 9 | 100% |
| CLI 工具 | ~600 行 | 1 + 5 文档 | - |
| UI 优化 | ~150 行 | 3 | 100% |
| **总计** | **~6634 行** | **41** | **~97%** |

---

## [0.3.12] - 2026-03-25
### 🚀 流式渲染架构重构、ChatEventBus 引入与稳定性物理加固

#### 1. 流式响应架构重构 (Streaming Architecture Refactor)
- **ChatEventBus 基础设施**：引入全局事件总线 `ChatEventBus`，实现消息发送、流式更新与持久化任务的事务级解耦。
- **有序段管理器 (ContentSegmentManager)**：重构流式消息渲染逻辑，通过物理级段管理彻底解决内容与工具调用乱序、重复及打字机失效问题。
- **SendMessageOrchestrator**：实现消息发送全生命周期的协同编排，将复杂的发送逻辑从 Store 中剥离。

#### 2. 状态管理与持久化升级 (State & Persistence Evolution)
- **ChatStore 深度解构**：彻底重构 `useChatStore`，物理移除臃肿逻辑，引入 Session 事务级持久化，确保多 Tab 切换时的消息绝对隔离与顺序保真。
- **物理级消息脱敏**：实现消息段落 (Segments) 的物理级持久化，根治长对话场景下的内容丢失难题。
- **ToolCallManager**：引入专用的工具调用管理器，实现工具调用全生命周期的 TDD 验证与状态同步。

#### 3. 智能代理与工具链优化 (Agent & Toolchain Refinement)
- **DebuggerAgent v0.5.0**：正式引入 `DebuggerAgent` 实现意图驱动的自主调试闭环，打通 PIVO 3.0 物理授权链路。
- **流式工具聚合修复**：修复了 `agent_write_file` 缺失 `batchId` 导致的工具聚合失效，并优化了工具参数的累积解析算法。
- **OpenAI 格式兼容性**：增强了对 OpenAI API 格式的兼容性，确保流式工具调用在不同模型提供商下的稳定性。

#### 4. UI 交互与引导体验 (UI & Onboarding)
- **引导系统完善 (Onboarding)**：优化了新手引导步骤的动态面板联动、布局定位逻辑及渲染稳定性。
- **项目树实时渲染**：解除流式传输对项目树渲染的硬阻断，确保 `agent_scan_project` 等结果能即时呈现。
- **Tab 自动命名**：恢复了 Tab 页签基于对话内容的自动命名功能。

#### 5. 后端与内核稳定性 (Backend & Core Stability)
- **UTF-8 边界溢出修复**：根治了后端在处理流式切片时由于 UTF-8 字符边界截断导致的 Panic 崩溃。
- **自愈机制 (Sentinel)**：增强了哨兵自愈机制的启动保护，彻底解决工具调用失败后的对话截断与续播卡死问题。

#### 6. 测试与工程化 (Testing & QA)
- **E2E 回归体系加固**：通过白盒驱动方式绕过 UI 交互延迟，显著提升了 Playwright 测试在 Zhipu AI 及 Bash 工具链下的稳定性。
- **物理级 TDD 验证**：为 `ToolCallManager`、`StreamingResponseController` 等核心组件补齐了全生命周期单元测试与信号仿真测试。

## [0.3.11] - 2026-03-14
### 🚀 架构稳定性加固、TypeScript 类型对齐与构建流程优化

#### 1. TypeScript 类型系统深度对齐 (Type-Safe Alignment)
- **底层架构 interop 优化**：针对 `ifainew-core` 核心库与本地 Store 定义的类型冲突，实施了非侵入式的类型扩展与强制转换，彻底解决了 `Message` 和 `ToolCall` 在复杂流式场景下的类型不匹配问题。
- **PIVO 3.0 状态合法化**：显式支持 `'executed'` 状态与 `isStreaming` 属性，确保 PIVO 自动化任务拆解逻辑在构建环境中获得完整类型支撑。
- **Store 接口全量补齐**：在 `InlineEditState` 中精准补全了 `pivoStage`、`pivoTasks`、`modifiedFiles` 等关键属性，消除了行内编辑 (Cmd+K) 逻辑在编译期的属性缺失报错。

#### 2. 编辑器交互与快捷键引擎修复 (Monaco Engine Fixes)
- **指令路由修复**：修正了 `MonacoEditor.tsx` 中 `editor.trigger` 的调用参数，解决了 Cmd+K/Ctrl+K 在特定环境下无法唤起 AI 助手的问题。
- **语法健壮性修复**：修复了 `useChatStore.ts` 在流式渲染优化过程中的语法括号闭合漏洞。

#### 3. 存储与持久化层优化 (Persistence Refinement)
- **冗余逻辑清理**：移除了 `IndexedDB` 中 `deleteThreadMessages` 的陈旧重复实现，统一采用基于索引和游标的高效方案，提升了大数据量下的存储性能。

#### 4. 构建与工程化改进
- **构建全量通过**：经物理验证，`npm run build` (tsc && vite build) 已全线跑通。
- **版本号同步更新**：同步更新了 `package.json`、`Cargo.toml` 及系统版本描述文件至 `v0.3.11`。


## [0.3.7] - 2026-03-03
### 🛡️ 路径感知审批、沉浸式编辑器集成与安全沙箱增强

#### 1. 路径感知风险引擎 (Path-Aware Risk Engine)
- **智能风险分级**：重构了 `RiskPolicy`，引入基于文件路径（Glob 模式）的动态风险评估。
  - 🔴 **高危**：自动识别 `.env`, `package.json`, `.git/` 等核心配置并强制红色预警。
  - 🟡 **中危**：源代码文件修改采用标准审批流。
  - 🟢 **安全**：文档（`.md`）、测试及 `LICENSE` 修改在特定模式下可静默放行。
- **路径摘要提取**：优化了审批卡片中的路径展示，支持长路径的语义化缩略逻辑。

#### 2. 沉浸式编辑器集成 (Immersive Editor Integration)
- **原位预览联动**：点击侧边栏卡片可立即在主编辑器中开启 `Monaco Diff` 视图，实现真正的“所见即所审”。
- **自动聚焦变更点**：开启 Diff 预览后，编辑器将自动滚动并聚焦到第一个代码变更行。
- **原位审批工具条**：在编辑器顶部引入了 `ApprovalToolbar`，支持在代码阅读过程中直接执行接受或拒绝操作。

#### 3. 执行层安全沙箱 (Backend Sandbox)
- **硬核路径拦截**：在 Rust 执行层实现了物理级的安全拦截，严禁 AI 代理篡改 `.git`, `.env` 及 `.ifai` 等核心系统资产。
- **路径规范化校验**：引入了严谨的路径规范化处理，防止通过相对路径绕过安全检查。

#### 4. 稳定性与细节优化
- **Monaco 内存管理修复**：彻底解决了组件卸载时由于 `TextModel` 过早销毁导致的运行时错误。
- **路径乱码修复**：修复了任务完成横幅（TaskCompletionBanner）中由于 AI 错误输出转义字符导致的 UI 乱码。
- **文件刷新逻辑增强**：优化了 `refreshOpenedFiles` 逻辑，确保相对路径文件在合并后能正确重载。

## [0.3.6] - 2026-02-15
### 🎨 UI 工业级重构、PIVO 2.0 指令引擎与全链路结构化

#### 1. UI & 交互重构 (Industrial UI Refactor)
- **模型胶囊面板 (Model Capsule)**：引入全新的模型选择与状态监控胶囊，支持多提供商状态实时透传与极速切换。
- **多线程标签页增强 (Thread Tabs Evolution)**：重构了会话管理界面，实现了更平滑的线程切换与上下文隔离，支持 Thread 级的资源销毁与清理。
- **工业级输入区 (Pro Input Area)**：深度重构了聊天输入组件，支持更复杂的 `#` 符号引用、`@` 文件引用，并优化了多行输入与快捷键路由。
- **侧边栏架构优化**：优化了 AI 侧边栏的布局密度，增强了在小屏幕下的可用性与交互反馈。

#### 2. PIVO 2.0 高级指令集 (Next-Gen Approval Engine)
- **基于风险的决策引擎 (Risk-Based Policy)**：引入 `RiskPolicy` 体系，根据工具破坏性、编辑器模式及上下文自动评估执行风险。
- **异步预览机制 (Async Preview)**：实现了在工具执行前的异步数据预览（如 Diff 预览、文件列表预查），大幅提升用户决策效率。
- **执行器架构重组 (Executor Architecture)**：将文件系统、Shell、搜索及符号引擎彻底抽象为独立的执行器，实现了执行逻辑与 UI 的完全解耦。
- **并发批处理支持**：PIVO 2.0 现在能够稳定处理多工具并行调用，并提供统一的批处理审批界面。

#### 3. 全链路结构化 (Structured Workflow)
- **PivoProjectTree 集成**：工具执行结果（如目录扫描、搜索）现在直接消费为结构化数据，并由 `PivoProjectTree` 组件进行图形化渲染，而非简单的文本输出。
- **引用物理化 (Symbol-Level Injection)**：重构了 `@` 和 `#` 引用的注入逻辑，实现了符号级的精准代码片段注入，显著降低了 LLM 的理解幻觉。
- **全链路流式容错**：升级了 JSON 解析引擎，支持对不完整、分片或夹杂推理内容（GLM5 XML）的结构化提取。

#### 4. 模型适配与修复
- **NVIDIA GLM-5 全力支持**：通过后端专项路由适配了 GLM5 的思维链输出与 NVIDIA NIM 特有的请求协议。
- **SSE [DONE] 信号修复**：优雅处理 SSE 结束标记，消除日志中的 JSON 解析异常。

## [0.3.5] - 2026-02-11
### 🚀 工业级稳定性增强与 Vibe 模式深度优化

#### 核心亮点
- **并发控制系统 (Concurrency Control)**：引入全局并发管理器（Semaphore），限制最大 5 个并发工具执行，彻底解决大规模 RAG 时的 429 限流错误。
- **Vibe 模式 2.0**：实现只读类安全工具的**完全隐式自动批准**，配合工具名归一化引擎（支持 List Directory 等变体），提供零打扰的智能辅助体验。
- **流式解析引擎升级**：针对 DeepSeek 等模型的分片输出优化正则提取算法，支持贪婪匹配和多行容错，确保 JSON 截断时内容不丢失。
- **Bash 工具修复**：更正后端路由至 `execute_bash_command`，并新增自动清洗逻辑，自动剔除 AI 误生成的“运行”、“执行”等命令前缀。

#### 修复与稳定性
- **防御性清理**：为所有事件监听器销毁逻辑添加安全检查，消除网络错误时的二次崩溃。
- **TDD 基线回归**：通过 854 个 Vitest 测试用例回归，修复了符号触发、消息排序等 7 处潜在回归点。
- **UI 透传优化**：修正 `StreamingToolArgsViewer` 的渲染层级，恢复流式打字机在提取参数时的可见性。

## [0.3.4] - 2026-02-08
### 🚀 震撼发布：双模引擎、插件化技能系统与工业级交互重构

#### 核心亮点
- **双模驱动引擎 (Dual-Engine)**：在标题栏中央引入震撼的 VIBE/SPEC 切换轨道。
  - **VIBE 模式**：纯净、感性、零干扰的创意空间，物理隔离工具流，防止意图劫持。
  - **SPEC 模式**：理性、严谨的工程堡垒，支持只读工具的静默授权与自动执行。
- **插件化技能系统 (Skills System)**：正式集成插件化 AI 技能注入架构，支持日语专家等特定领域能力扩展，具备“静默执行”铁律。
- **工业级聊天交互升级**：
  - **MessageItem 骨架屏**：引入高性能 Skeleton 占位动效，彻底消除 AI 思考阶段的布局抖动 (CLS)。
  - **Action-First 排序**：优化工具卡片与摘要的显示权重，提升复杂任务下的视觉逻辑。
  - **性能巅峰**：冷启动耗时优化至 **112ms**，实现零主线程阻塞启动。

#### 修复与稳定性
- **物理同步方案**：采用 Window 挂载点根除跨模块状态丢失 Bug。
- **死循环抑制**：引入 5s 物理去重锁，彻底解决流式竞态下的重复读取难题。
- **高保真测试体系**：交付 `HIGH_FIDELITY_E2E_GUIDE.md`，确立基于 IPC 报文拦截的 E2E 验证模型。
- **CI 加固**：锁定 Tauri 依赖版本，解决 GitHub Actions 打包冲突。

## [0.3.3] - 2026-01-27
### 🚀 重大变更
- **工具分类系统** - 智能三层分类机制（精确匹配 → 规则引擎 → LLM fallback），自动路由 AI 请求到最合适的工具
- **Agent 服务模块化** - 重构 Agent 系统架构，提取工具注册表、事件监听器、去重器等核心服务模块
- **自定义提供商增强** - 修复 NVIDIA 等自定义提供商 404 错误，添加示例模型列表，优化用户配置体验
