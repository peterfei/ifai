# 若爱 (IfAI) v0.1.0 - 首次发布 🎉

> **一款基于 Tauri 2.0 构建的跨平台 AI 代码编辑器**

发布日期: 2025-12-17

---

## 📖 关于若爱 (IfAI)

**若爱 (IfAI)** 是一款现代化的跨平台代码编辑器，将强大的 AI 辅助能力与传统代码编辑完美融合。"若爱"寓意"如果有爱，代码将充满温度"，我们相信 AI 应该成为开发者最贴心的编程伙伴。

### 核心理念

- 🎯 **专注开发体验** - 流畅的编辑体验，零延迟响应
- 🤖 **智能辅助编程** - AI 深度集成，理解你的代码意图
- 🚀 **轻量高效** - 基于 Rust + Tauri，启动迅速，内存占用低
- 🌍 **跨平台支持** - Windows、macOS、Linux 一致体验
- 🔒 **本地优先** - 数据隐私可控，支持本地大模型

---

## ✨ v0.1.0 主要特性

### 🎨 现代化编辑器

- ✅ **Monaco Editor 内核** - VSCode 同款编辑器引擎，提供专业级编辑体验
- ✅ **语法高亮** - 支持主流编程语言的语法高亮和代码着色
- ✅ **代码智能** - 自动补全、代码导航、智能重构
- ✅ **多标签页** - 高效管理多个文件，快速切换
- ✅ **文件树** - 直观的项目结构浏览，Git 状态集成
- ✅ **主题系统** - 深色主题（默认），护眼舒适

### 🤖 AI 智能助手

- ✅ **多模型支持** - 支持 OpenAI、Anthropic Claude、智谱 AI 等主流大模型
- ✅ **上下文理解** - RAG 检索增强生成，精准理解项目代码
- ✅ **代码生成** - 通过自然语言描述即可生成代码
- ✅ **智能重构** - AI 辅助代码优化和重构
- ✅ **Bug 诊断** - 智能分析错误，提供修复建议
- ✅ **流式响应** - 实时展示 AI 回复，提升交互体验
- ✅ **工具调用** - Agent 工具链支持文件读写、目录列表等操作

### 🛠 开发工具集成

- ✅ **集成终端** - 内置终端模拟器，无缝执行命令
- ✅ **Git 集成** - 文件状态追踪，可视化版本管理
- ✅ **LSP 支持** - 语言服务器协议，智能代码分析
- ✅ **全局搜索** - 快速的文件名和内容搜索
- ✅ **多语言支持** - 中英文界面切换

---

## 📸 应用截图

### 主界面 - 代码编辑与文件管理
![主界面](https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025001.png)

*Monaco 编辑器 + 文件树 + 多标签页，流畅的开发体验*

---

### AI 智能助手 - 代码生成与对话
![AI助手](https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025002.png)

*支持多模型对话，流式响应，Markdown 渲染，代码高亮*

---

### 集成终端 - 无缝命令执行
![集成终端](https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025003.png)

*内置终端模拟器，支持多会话管理，ANSI 转义序列*

---

## 🏗 技术栈

### 前端技术
- **React 19** - 最新 UI 框架
- **TypeScript 5.8** - 类型安全
- **Zustand** - 轻量状态管理
- **TailwindCSS 3.4** - 实用优先 CSS 框架
- **Monaco Editor** - 代码编辑器核心
- **Vite 7** - 快速构建工具

### 后端技术
- **Tauri 2.0** - 跨平台应用框架
- **Rust** - 系统级编程语言
- **tokio** - 异步运行时
- **reqwest** - HTTP 客户端（AI API 调用）
- **git2** - Git 库集成
- **portable-pty** - 跨平台终端模拟

### 性能指标
- ⚡ **启动时间**: < 2 秒
- 💾 **内存占用**: ~100 MB（基础运行）
- 📦 **安装包大小**: 5-10 MB（相比 Electron 节省 90%）
- 🎯 **编辑器响应**: < 16ms（60 FPS 流畅体验）

---

## 📦 安装说明

### 系统要求

- **Windows**: Windows 10/11 (x64, ARM64)
- **macOS**: macOS 10.15+ (Intel, Apple Silicon)
- **Linux**: Ubuntu 20.04+, Fedora 35+, Debian 11+ (x64, ARM64)

### 从源码构建

#### 前置要求

- Node.js >= 18.0
- Rust >= 1.70（通过 [rustup](https://rustup.rs/) 安装）
- 系统依赖:
  - **Windows**: Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `sudo apt install build-essential libgtk-3-dev libwebkit2gtk-4.0-dev`

#### 构建步骤

```bash
# 1. 克隆仓库
git clone https://github.com/peterfei/ifai.git
cd ifai

# 2. 安装依赖
npm install

# 3. 启动开发模式（可选）
npm run tauri dev

# 4. 构建发布版本
npm run build
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`

### 二进制安装包

> 🚧 预编译的二进制安装包即将提供
>
> 目前请从源码构建，或关注后续 Release 更新

---

## 🚀 快速开始

### 首次启动

1. 启动应用后，点击右侧设置按钮配置 AI 提供商
2. 添加你的 API Key（支持 OpenAI、Claude、智谱 AI 等）
3. 选择模型并启用
4. 点击左上角"打开文件夹"，选择你的项目目录
5. 开始编码，使用 AI 助手辅助开发！

### AI 功能使用

#### 对话模式
1. 点击右侧 AI 助手图标打开聊天面板
2. 输入你的问题或需求
3. AI 会分析代码并提供建议

#### 内联编辑
1. 在编辑器中选中代码
2. 使用快捷键或右键菜单触发 AI 编辑
3. 输入自然语言描述期望的修改
4. AI 会直接修改选中的代码

#### Agent 工具
- AI 可以自动读取项目文件
- AI 可以创建和修改文件
- AI 可以列出目录内容
- 工具调用需要用户审批，保证安全

---

## 🐛 已知问题

### 功能限制

- 文件树不支持拖拽操作
- 未实现文件创建/删除功能（需通过 AI 或终端）
- Git 功能仅支持状态显示，不支持提交操作
- LSP 客户端功能仍在完善中
- 部分语言的语法高亮不完整

### 性能相关

- 打开超大文件（>10MB）可能响应较慢
- RAG 索引大型项目（>1000 文件）需要较长时间

### 计划修复

以上问题将在后续版本中逐步解决。欢迎在 [Issues](https://github.com/peterfei/ifai/issues) 中反馈遇到的问题。

---

## 🗺 未来计划

### v0.2.0 - 增强体验（规划中）

- 🔄 插件系统
- 🔄 自定义快捷键
- 🔄 代码片段管理
- 🔄 Markdown 预览
- 🔄 多光标编辑
- 🔄 文件历史对比

### v0.3.0 - 智能化升级（未来）

- 📋 AI 代码审查
- 📋 智能测试生成
- 📋 性能分析工具
- 📋 团队协作功能
- 📋 云端同步设置

### v1.0.0 - 生产级工具（愿景）

- 📋 企业版功能
- 📋 私有化部署方案
- 📋 扩展市场
- 📋 多人实时协作
- 📋 完整的调试器集成

完整路线图请查看 [README.md](https://github.com/peterfei/ifai#-产品路线)

---

## 🤝 参与贡献

我们欢迎所有形式的贡献！

### 如何贡献

- 🐛 **报告 Bug** - 在 [Issues](https://github.com/peterfei/ifai/issues) 中提交详细的问题报告
- 💡 **功能建议** - 分享你的想法和需求
- 📝 **改进文档** - 完善文档和示例
- 💻 **贡献代码** - Fork 仓库，提交 Pull Request
- 🌍 **翻译** - 帮助翻译成其他语言

详细贡献指南请参阅 [CONTRIBUTING.md](https://github.com/peterfei/ifai/blob/main/CONTRIBUTING.md)

---

## 📄 开源协议

### MIT License

本项目的开源框架部分采用 **MIT License** 开源协议。

开源部分包括:
- ✅ 用户界面和交互逻辑
- ✅ 文件系统管理
- ✅ Monaco 编辑器集成
- ✅ 终端模拟器
- ✅ Git 集成界面
- ✅ LSP 客户端实现

### 核心 AI 能力（商业协议）

核心 AI 能力由私有商业模块提供，不包含在开源范围内:
- AI 模型集成和协议适配
- RAG 检索引擎
- Agent 工具链
- 向量化语义搜索
- 智能上下文构建

如需使用完整的 AI 功能，请联系作者获取商业授权。

详见 [LICENSE](https://github.com/peterfei/ifai/blob/main/LICENSE) 文件。

---

## 🙏 致谢

### 开源项目

感谢以下优秀的开源项目:

- [Tauri](https://tauri.app/) - 跨平台框架
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 代码编辑器
- [React](https://reactjs.org/) - UI 框架
- [Rust](https://www.rust-lang.org/) - 系统编程语言
- 以及所有依赖的开源库

### 贡献者

感谢所有为本项目做出贡献的开发者! ❤️

---

## 💬 社区与支持

- **项目主页**: [https://github.com/peterfei/ifai](https://github.com/peterfei/ifai)
- **问题反馈**: [GitHub Issues](https://github.com/peterfei/ifai/issues)
- **讨论交流**: [GitHub Discussions](https://github.com/peterfei/ifai/discussions)
- **联系作者**: [peterfei](https://github.com/peterfei)

---

## 📊 版本信息

- **版本号**: v0.1.0
- **发布日期**: 2025-12-17
- **Git 标签**: `v0.1.0`
- **前端构建**: 1,431 kB (gzip: 458 kB)
- **测试状态**: ✅ 4/4 测试通过

### 完整更新日志

详细的版本历史请查看 [CHANGELOG.md](https://github.com/peterfei/ifai/blob/main/CHANGELOG.md)

---

<div align="center">

### 🌟 如果这个项目对你有帮助，请给我们一个 Star！⭐️

**Let's make coding more enjoyable with AI! 让我们用 AI 让编程更有趣！**

Made with ❤️ by [peterfei](https://github.com/peterfei)

</div>

---

## 📌 相关链接

- [完整 README (中文)](https://github.com/peterfei/ifai/blob/main/README.md)
- [README (English)](https://github.com/peterfei/ifai/blob/main/README_EN.md)
- [贡献指南](https://github.com/peterfei/ifai/blob/main/CONTRIBUTING.md)
- [更新日志](https://github.com/peterfei/ifai/blob/main/CHANGELOG.md)
- [开源协议](https://github.com/peterfei/ifai/blob/main/LICENSE)

---

**首次发布，期待你的反馈和建议！** 🚀
