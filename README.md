# 若爱 (IfAI) - 智能代码编辑器

<div align="center">

**一款基于 Tauri 2.0 构建的跨平台 AI 代码编辑器**

[English](./README_EN.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Latest-orange)](https://www.rust-lang.org/)

</div>

---

## 📖 项目简介

**若爱 (IfAI)** 是一款现代化的跨平台代码编辑器,将强大的 AI 辅助能力与传统代码编辑器完美融合。"若爱"寓意"如果有爱,代码将充满温度",我们相信 AI 应该成为开发者最贴心的编程伙伴。

### 核心理念

- 🎯 **专注开发体验** - 流畅的编辑体验,零延迟响应
- 🤖 **智能辅助编程** - AI 深度集成,理解你的代码意图
- 🚀 **轻量高效** - 基于 Rust + Tauri,启动迅速,内存占用低
- 🌍 **跨平台支持** - Windows、macOS、Linux 一致体验
- 🔒 **本地优先** - 数据隐私可控,支持本地大模型

---

## ✨ 功能特性

### 🎨 现代化编辑器

- **Monaco Editor 内核** - VSCode 同款编辑器引擎
- **语法高亮** - 支持主流编程语言
- **代码智能** - 自动补全、代码导航、重构
- **多标签页** - 高效管理多个文件
- **文件树** - 直观的项目结构浏览
- **主题定制** - 深色/浅色主题,护眼舒适

### 🤖 AI 智能助手

- **多模型支持** - 支持 OpenAI、Anthropic Claude、智谱 AI 等主流大模型
- **上下文理解** - RAG 检索增强,精准理解项目代码
- **代码生成** - 自然语言描述即可生成代码
- **智能重构** - AI 辅助代码优化和重构
- **Bug 诊断** - 智能分析错误,提供修复建议
- **技术问答** - 即时解答编程疑问

### 🛠 开发工具集成

- **集成终端** - 内置终端,无缝执行命令
- **Git 集成** - 文件状态追踪,可视化版本管理
- **LSP 支持** - 语言服务器协议,智能代码分析
- **快速搜索** - 全局文件和内容搜索
- **多语言支持** - 中英文界面切换

---

## 🏗 技术架构

### 技术栈

```
┌─────────────────────────────────────────────────────┐
│                   若爱 (IfAI)                        │
├─────────────────────────────────────────────────────┤
│  前端层 (Frontend)                                   │
│  ├─ React 19         - UI 框架                      │
│  ├─ TypeScript 5.8   - 类型安全                     │
│  ├─ Zustand          - 状态管理                     │
│  ├─ TailwindCSS      - 样式系统                     │
│  ├─ Monaco Editor    - 代码编辑器                   │
│  └─ Vite             - 构建工具                     │
├─────────────────────────────────────────────────────┤
│  后端层 (Backend - Rust/Tauri)                      │
│  ├─ Tauri 2.0        - 跨平台框架                   │
│  ├─ tokio            - 异步运行时                   │
│  ├─ serde            - 序列化/反序列化              │
│  ├─ reqwest          - HTTP 客户端                  │
│  ├─ git2             - Git 集成                     │
│  ├─ portable-pty     - 终端模拟                     │
│  └─ walkdir          - 文件遍历                     │
├─────────────────────────────────────────────────────┤
│  核心能力层 (Core - 私有扩展)                        │
│  ├─ AI 模型集成      - 多模型协议适配               │
│  ├─ Agent 工具链     - 智能代码操作                 │
│  ├─ RAG 检索         - 向量化语义搜索               │
│  └─ 上下文构建       - 智能代码理解                 │
└─────────────────────────────────────────────────────┘
```

### 核心设计

- **Tauri 架构** - Web 前端 + Rust 后端,兼具性能与开发效率
- **事件驱动** - 前后端通过事件系统异步通信
- **依赖注入** - 核心包通过注册机制访问主应用状态
- **插件化设计** - 核心 AI 能力作为独立包,易于扩展
- **本地优先** - 文件操作、Git 管理均在本地完成

### 项目结构

```
ifainew/
├── src/                      # React 前端代码
│   ├── components/          # UI 组件
│   │   ├── Editor/         # Monaco 编辑器
│   │   ├── FileTree/       # 文件树
│   │   ├── AIChat/         # AI 对话界面
│   │   └── Terminal/       # 终端模拟器
│   ├── stores/             # Zustand 状态管理
│   │   ├── fileStore.ts    # 文件状态
│   │   ├── chatStore.ts    # AI 对话状态
│   │   └── settingsStore.ts # 设置状态
│   └── utils/              # 工具函数
│
├── src-tauri/               # Rust 后端代码
│   ├── src/
│   │   ├── lib.rs          # 主入口
│   │   ├── file_walker.rs  # 文件遍历
│   │   ├── terminal.rs     # 终端管理
│   │   ├── git.rs          # Git 集成
│   │   ├── lsp.rs          # LSP 客户端
│   │   └── search.rs       # 文件搜索
│   └── Cargo.toml
│
├── tests/                   # 测试用例
│   ├── spec_agent_flow.cjs
│   ├── spec_escape_fix.cjs
│   └── spec_tool_history.cjs
│
└── package.json
```

---

## 🚀 快速开始

### 环境要求

确保已安装以下工具:

- **Node.js** >= 18.0
- **Rust** >= 1.70 (通过 [rustup](https://rustup.rs/) 安装)
- **系统依赖**:
  - **Windows**: Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `build-essential`, `libgtk-3-dev`, `libwebkit2gtk-4.0-dev`

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/peterfei/ifai.git
   cd ifai
   ```

2. **安装依赖**

   ```bash
   npm install
   ```

3. **启动开发服务器**

   ```bash
   npm run tauri dev
   ```

   应用将自动编译并启动,通常在几秒内完成。

### 构建发布版本

```bash
# 构建前端
npm run build

# 构建 Tauri 应用
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

---

## 📸 截图展示

### 主界面 - 代码编辑与文件管理
![IfAI 主界面](./imgs/ifai2025001.png)

*Monaco 编辑器 + 文件树 + 多标签页，流畅的开发体验*

---

### AI 智能助手 - 代码生成与对话
![AI 助手界面](./imgs/ifai2025002.png)

*支持多模型对话，流式响应，Markdown 渲染，代码高亮*

---

### 集成终端 - 无缝命令执行
![集成终端](./imgs/ifai2025003.png)

*内置终端模拟器，支持多会话管理，ANSI 转义序列*

---

## 🛠 开发指南

### 本地开发

```bash
# 启动开发模式
npm run tauri dev

# 运行前端开发服务器
npm run dev

# 运行测试
node tests/spec_agent_flow.cjs
```

### 代码规范

- **前端**: 使用 TypeScript 严格模式,遵循 React Hooks 最佳实践
- **后端**: 遵循 Rust 官方代码规范,运行 `cargo fmt` 和 `cargo clippy`
- **提交**: 遵循 Conventional Commits 规范

### 技术栈说明

**为什么选择 Tauri?**
- 性能优异: 启动速度快,内存占用低 (相比 Electron 节省 90% 内存)
- 安全可靠: Rust 的内存安全保证,避免常见漏洞
- 跨平台: 一次编写,多平台运行
- 包体积小: 发布包仅 5-10MB (Electron 通常 100MB+)

**为什么选择 React 19?**
- 最新特性: React Server Components、并发渲染
- 生态丰富: 丰富的组件库和工具链
- 开发体验: 热更新、DevTools、TypeScript 支持

---

## 🗺 产品路线

### v0.1.0 (当前版本) - MVP 基础

- ✅ Monaco 编辑器集成
- ✅ 文件系统管理
- ✅ 多标签页编辑
- ✅ AI 对话集成 (核心能力)
- ✅ 基础 Git 集成
- ✅ 集成终端
- ✅ LSP 支持
- ✅ **多光标编辑** - 支持多位置同时编辑，提升编码效率

### v0.2.0 (规划中) - 增强体验

- 🔄 插件系统
- 🔄 自定义快捷键
- 🔄 代码片段管理
- 🔄 Markdown 预览
- 🔄 文件历史对比

### v0.3.0 (未来) - 智能化升级

- 📋 AI 代码审查
- 📋 智能测试生成
- 📋 性能分析工具
- 📋 团队协作功能
- 📋 云端同步设置

### v1.0.0 (愿景) - 生产级工具

- 📋 企业版功能
- 📋 私有化部署方案
- 📋 扩展市场
- 📋 多人实时协作
- 📋 完整的调试器集成

---

## 🌟 未来愿景

### 技术愿景

**若爱 (IfAI)** 致力于成为开发者最智能的编程伙伴:

1. **AI 原生编辑器** - 不是简单的 AI 功能叠加,而是从底层架构设计就融入 AI 思维
2. **本地优先** - 支持完全离线使用,保护代码隐私
3. **开放生态** - 开源核心框架,允许社区共建插件和扩展
4. **跨平台体验** - 统一的操作体验,无缝切换工作环境

### 产品愿景

我们希望**若爱**能够:

- 🎯 **降低编程门槛** - 让新手也能通过 AI 辅助快速上手
- 💡 **提升开发效率** - 减少重复劳动,专注创造性工作
- 🤝 **促进知识传承** - AI 助手成为代码知识的载体
- 🌍 **服务全球开发者** - 支持多语言,适配不同文化和习惯

### 社区愿景

- **开源共建** - 开放核心框架,欢迎贡献代码和想法
- **知识共享** - 构建开发者社区,分享最佳实践
- **持续创新** - 紧跟 AI 技术发展,探索新的可能性

---

## 🤝 参与贡献

我们欢迎所有形式的贡献!

### 如何贡献

1. **Fork 本仓库**
2. **创建特性分支** (`git checkout -b feature/AmazingFeature`)
3. **提交更改** (`git commit -m 'Add some AmazingFeature'`)
4. **推送到分支** (`git push origin feature/AmazingFeature`)
5. **提交 Pull Request**

详细贡献指南请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 参与方式

- 🐛 **报告 Bug** - 提交详细的问题报告
- 💡 **功能建议** - 分享你的想法和需求
- 📝 **改进文档** - 完善文档和示例
- 💻 **贡献代码** - 修复 bug 或添加新功能
- 🌍 **翻译** - 帮助翻译成其他语言

---

## 📄 开源协议

本项目采用 **MIT License** 开源协议。

核心 AI 能力由私有商业授权模块提供,不包含在开源范围内。开源部分提供完整的编辑器框架和扩展接口。

详见 [LICENSE](./LICENSE) 文件。

---

## 💬 社区与支持

- **GitHub Issues**: [问题反馈](https://github.com/peterfei/ifai/issues)
- **GitHub Discussions**: [讨论交流](https://github.com/peterfei/ifai/discussions)
- **项目主页**: [https://github.com/peterfei/ifai](https://github.com/peterfei/ifai)

---

## 🙏 致谢

感谢以下开源项目:

- [Tauri](https://tauri.app/) - 跨平台框架
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 代码编辑器
- [React](https://reactjs.org/) - UI 框架
- [Rust](https://www.rust-lang.org/) - 系统编程语言

以及所有为本项目贡献过的开发者! ❤️

---

<div align="center">

**如果这个项目对你有帮助,请给我们一个 ⭐️**

Made with ❤️ by [peterfei](https://github.com/peterfei)

</div>
