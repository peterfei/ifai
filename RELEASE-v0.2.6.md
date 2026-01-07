# 若爱 (IfAI) v0.2.6 - 智能体进化：任务拆解与环境感知 🧬

**发布时间**: 2026-01-07

IfAI v0.2.6 是我们在 **AI Agent 自主性**与**环境感知能力**上的里程碑式更新。在这个版本中，我们不仅赋予了 Agent 使用 Shell 命令的强大能力，更构建了一套具备自我纠错和路径感知的健壮执行框架。同时，全新的**任务拆解服务**让 AI 能够像资深架构师一样，将复杂需求转化为结构化、可追踪的任务树。

我们正在从“代码编辑器”向“自主编程环境”迈进。

---

## 🌟 核心亮点 (Highlights)

### 🐚 Agent Shell 能力解锁 (Bash Tool)
Agent 不再被局限于沙箱内的文件读写，现在它拥有了真正的系统级交互能力。
- **系统级操作**：Agent 可执行 `npm install`、`cargo build`、`git status` 等物理命令。
- **环境自愈**：具备“路径感知”能力，自动识别并跳出源码目录陷阱，根据错误反馈自动修正工作目录。

![Agent Shell & Path Perception](./imgs/ifai202601007.png)

### 📊 Token 可视化与成本管理 (Token Intelligence)
- **实时计量**：对话界面实时显示 Token 消耗。
- **透明消耗**：详细分解 Context 与 Generation 占比，帮助开发者精准掌控 API 成本。

![Token Usage Visualization](./imgs/ifai202601001.png)

### 🌳 结构化任务拆解 (Task Tree)
- **架构师思维**：将复杂需求拆解为层级分明的子任务树，并在 UI 中实时渲染。
- **持久化同步**：任务状态实时同步至 `.ifai/tasks/`，支持跨会话断点续传。

![Task Tree & Mission Control](./imgs/ifai202601005.png)

### 📑 OpenSpec 深度融合 (Spec-Driven)
- **规范驱动**：原生集成 [OpenSpec](https://openspec.dev) 标准，确保 AI 生成代码的架构一致性。

![OpenSpec Workflow Integration](./imgs/ifai202601007.png)

### 📝 专业级 Markdown 支持
- **实时预览**：引入全新的预览引擎，支持“编辑/预览/分屏”三栖布局。

![Markdown Preview Mode](./imgs/ifai202601002.png)

### ⚡ 极致性能与本地模型
- **Snippet 虚拟滚动**：支持万级数据秒级加载，保持 120 FPS 顺滑度。
- **本地自愈**：实现 Local LLM 自动续写功能，解决长文本截断痛点。

![Snippet & Local LLM](./imgs/ifai202601009.png)

---

## 📊 迭代数据统计 (v0.2.5 ~ v0.2.6)

在短短 4 天的迭代中，项目经历了爆发式的成长，通过高频次的重构与功能注入，IfAI 的工程化程度达到了新的高度。

| 指标 | 统计数据 | 说明 |
| :--- | :--- | :--- |
| **文件变更数** | **172** 个文件 | 覆盖了从内核 Rust 到前端 UI 的全链路 |
| **代码新增行数** | **+26,540** 行 | 包含 50+ E2E 测试脚本及多个核心服务 |
| **代码删除/重构行数** | **-2,847** 行 | 进行了大规模的类型优化与组件重构 |
| **提交次数 (Commits)** | **88** 次 | 平均每天 22 次高质量提交 |

---

## 📝 详细变更日志 (Detailed Changes)

### 🚀 新增功能 (Features)
- **[Agent]** 新增 `bash` 执行工具，支持路径自动校准与智能 stderr 反馈。
- **[Settings]** 全面支持 OpenAI 兼容格式的自定义 API 接入。
- **[UI]** 引入 `VirtualMessageList`，大规模对话渲染性能提升 80%。
- **[UI]** Snippet Manager 实现全量虚拟滚动。

### ⚡ 优化 (Improvements)
- **[Performance]** 优化流式响应渲染管线，高负载场景 CPU 降低 30%。
- **[Test]** 建立全链路 E2E 测试体系，新增 50+ 核心回归用例。

### 🐛 修复 (Fixes)
- **[RAG]** 实现了强制索引重置机制，消除项目切换时的数据污染。
- **[Agent]** 修复绝对路径解析 Bug 导致的 Agent 死循环。

---

## 🤝 升级指南

如果您是从 v0.2.5 升级，建议安装后运行 `/index` 命令重置 RAG 索引以获得最佳体验。
