# IfAI Release Notes - v0.2.0 🚀

## 📅 发布日期: 2025年12月21日

> **"如果有爱，代码将充满温度"**。v0.2.0 不仅仅是一个版本的迭代，它是 IfAI 从“编辑器”进化为“智能伙伴”的关键跃迁。

<div align="center">
  <img src="imgs/ifainew_1280.gif" alt="IfAI v0.2.0 动态演示" width="750"/>
  <p><i>演示：AI Agent 正在自主执行代码重构任务，所有操作清晰可见且安全可控</i></p>
</div>

---

## 🌟 核心突破：AI Agent 与 Supervisor 监督架构

在 v0.2.0 中，我们引入了工业级的 **Supervisor（监督者）架构**，让 AI 不仅能“说”，更能精准、安全地“做”。

- **安全审批闭环**：所有的写操作、重命名或 Git 更改都必须经过您的审批。
- **灵动任务监控器 (Agent Monitor)**：支持自由拖拽与磁力吸附，实时展示 Agent 的思考路径与执行日志。

<div align="center">
  <img src="imgs/ifai2025002.png" alt="AI Agent 交互界面" width="700"/>
  <p><i>图 1：AI 助手深度集成，支持流式对话与 Agent 工具实时调用</i></p>
</div>

---

## 🚀 性能黑科技：GPU 渲染与 Zero-Lag 技术

我们通过 Rust 底层的极致优化，解决了复杂任务下的编辑器流畅度问题：

- **120 FPS 高刷新支持**：针对高刷新率显示器深度优化渲染调度，确保滚动与动画达到视觉上限。
- **Zero-Lag 生成**：引入 150ms 动态节流算法，彻底消除 AI 在大规模写入文件时的界面卡顿。
- **GPU 硬件加速渲染**：UI 渲染与 AI 计算彻底解耦，无论后台任务多重，编辑器始终响应如初。

<div align="center">
  <img src="imgs/ifai2025001.png" alt="GPU 加速效果展示" width="700"/>
  <p><i>图 2：Monaco 编辑器内核 + GPU 加速，带来丝滑的编码体验</i></p>
</div>

---

## 🔍 RAG 性能革命：并行化与非阻塞索引

为了让 AI 真正“读懂”您的项目，我们彻底重构了 RAG（检索增强生成）系统：

- **非阻塞索引构建**：项目扫描与对话生成完全解耦，无需等待索引完成即可开始聊天。
- **并行任务分发**：RAG 搜索结果现在可以与 AI 生成过程同步并行，大幅缩短首字响应时间 (TTFT)。
- **@codebase 深度集成**：优化了在多模态消息中对代码库查询指令的精准识别。

---

## 💻 一站式工作台：集成终端与工具链

- **专业级终端**：内置基于 xterm.js 的 PTY 原生终端，支持多会话管理与完整 ANSI 支持。
- **全方位中文化**：从 Agent 日志到系统菜单，实现了全量的国际化适配。

<div align="center">
  <img src="imgs/ifai2025003.png" alt="集成终端与工具链" width="700"/>
  <p><i>图 3：无缝集成的专业终端，支持在编辑器内直接执行系统命令</i></p>
</div>

---

## 📝 结构化 Prompt 管理系统

- **模板化引擎**：支持动态注入项目上下文，确保 AI 接收到的指令永远是最精准的。
- **热加载配置**：实时修改 `.ifai/prompts` 下的 Markdown 模板，无需重启，即时生效。

---

## 🛠 修复与改进

- **核心逻辑隔离**：完成了核心 AI 逻辑向 `ifainew-core` 的深度隔离，系统架构更清晰。
- **多模态增强**：优化了复杂消息中对 `@codebase` 等指令的精准识别。
- **历史记录唤回**：支持通过键盘方向键快速找回历史对话。

---

### 📥 立即体验

访问 [GitHub Releases](https://github.com/peterfei/ifai/releases) 下载最新版。



##  社区与支持

- **GitHub Issues**: [问题反馈](https://github.com/peterfei/ifai/issues)
- **GitHub Discussions**: [讨论交流](https://github.com/peterfei/ifai/discussions)
- **项目主页**: [https://github.com/peterfei/ifai](ifai)

**peterfei**
*2025年12月21日*
