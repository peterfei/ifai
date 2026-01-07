# 若爱 (IfAI) v0.2.6 - 智能体进化：任务拆解与环境感知 🧬

**发布时间**: 2026-01-07

IfAI v0.2.6 是我们在 **AI Agent 自主性**与**环境感知能力**上的里程碑式更新。在这个版本中，我们不仅赋予了 Agent 使用 Shell 命令的强大能力，更构建了一套具备自我纠错和路径感知的健壮执行框架。同时，全新的**任务拆解服务**让 AI 能够像资深架构师一样，将复杂需求转化为结构化、可追踪的任务树。

我们正在从“代码编辑器”向“自主编程环境”迈进。

---

## 🌟 核心亮点 (Highlights)

### 🐚 Agent Shell 能力解锁 (Bash Tool)
Agent 不再被局限于沙箱内的文件读写，现在它拥有了真正的系统级交互能力。
- **环境配置**：Agent 可以执行 `npm install`、`cargo build` 等命令，自动配置开发环境。
- **Git 交互**：支持 `git status`、`git diff` 等操作，让 AI 理解版本控制状态。
- **智能路径校准**：彻底解决了开发环境与运行环境路径不一致的痛点。
- **自我纠错机制**：当命令失败时主动分析并提供路径提示。

![Bash Tool Demo 1](./imgs/ifai202601001.png)
![Bash Tool Demo 2](./imgs/ifai202601002.png)

### 🌳 结构化任务拆解 (Task Breakdown)
面对模糊的复杂需求，IfAI 现在能像高级工程师一样进行系统化拆解。
- **可视化任务树**：将需求拆解为层级分明的子任务（Task Tree），并在 UI 中实时渲染。
- **持久化同步**：任务状态实时同步到文件系统（`.ifai/tasks/`）。

![Task Tree Visualization](./imgs/ifai202601004.png)
![Mission Control Center](./imgs/ifai202601005.png)

### 📑 OpenSpec 深度融合 (Deep OpenSpec Integration)
- **协议驱动开发**：v0.2.6 实现了与 [OpenSpec](https://openspec.dev) 标准的深度集成。
- **一致性保证**：AI 能够更精准地遵循项目设计规范，确保生成代码的架构一致性。

![OpenSpec Workflow](./imgs/ifai202601007.png)

### 🔌 灵活的自定义 API (Flexible Custom API)
- **OpenAI 兼容**：支持接入 DeepSeek、Moonshot (Kimi)、Yi 等第三方大模型服务。
- **参数微调**：支持自定义 Context Window 大小和 Max Tokens。

![Custom API Settings](./imgs/ifai202601009.png)

### ⚡ 极致性能：Snippet Manager 虚拟滚动
- **海量数据承载**：代码片段管理器支持万级数据加载，保持 120 FPS 顺滑滚动。
- **流畅体验**：告别长列表卡顿，实现毫秒级预览。

![Snippet Virtual Scroll](./imgs/ifai202601010.png)

### 🤖 本地模型体验升级
- **自动续写**：长代码生成不再中断，实现无缝续写。
- **Token 计数**：精细控制本地推理成本。

![Local LLM Stats](./imgs/ifai202601011.png)

---

## 📝 详细变更日志 (Detailed Changes)

### 🚀 新增功能 (Features)
- **[Agent]** 新增 `bash` 和 `agent_run_shell_command` 工具，支持带超时控制的命令执行。
- **[Agent]** 实现了基于 `stderr` 分析的智能错误反馈机制。
- **[Settings]** 新增自定义 API 配置面板，支持灵活设置。
- **[Tasks]** 引入 `TaskBreakdownService` 和 `TaskExecutionService`。
- **[OpenSpec]** 深度集成 OpenSpec 标准协议。

### ⚡ 优化 (Improvements)
- **[Performance]** 优化流式响应渲染管线，CPU 占用降低 30%。
- **[UI]** Snippet Manager 全面接入虚拟列表技术。
- **[Core]** `src-tauri` 路径自动校准逻辑。

### 🐛 修复 (Fixes)
- **[RAG]** 修复了项目切换时的索引数据残留 Bug。
- **[Agent]** 修复了绝对路径遍历错误及重复执行循环。

---

## 🤝 升级指南

如果您是从 v0.2.5 升级：
1. 直接安装新版本覆盖即可。
2. 建议首次运行执行 `/index` 重建索引。

> **致谢**: 感谢所有为 v0.2.6 提供反馈和测试支持的用户。