# IfAI v0.1.0 - First Release 🎉

> **A Cross-Platform AI Code Editor Built with Tauri 2.0**

Release Date: December 17, 2025

---

## 📖 About IfAI

**IfAI (若爱)** is a modern cross-platform code editor that perfectly integrates powerful AI assistance with traditional code editing. The name "若爱" (IfAI) means "if there is love, code will be warm" - we believe AI should be the most caring programming companion for developers.

### Core Philosophy

- 🎯 **Focus on Developer Experience** - Smooth editing experience with zero latency
- 🤖 **Intelligent Programming Assistance** - Deep AI integration that understands your code intent
- 🚀 **Lightweight & Efficient** - Built with Rust + Tauri, fast startup, low memory footprint
- 🌍 **Cross-Platform** - Consistent experience on Windows, macOS, and Linux
- 🔒 **Local-First** - Controllable data privacy with local LLM support

---

## ✨ v0.1.0 Key Features

### 🎨 Modern Editor

- ✅ **Monaco Editor Core** - Same editor engine as VSCode, professional-grade editing experience
- ✅ **Syntax Highlighting** - Support for mainstream programming languages
- ✅ **Code Intelligence** - Auto-completion, code navigation, smart refactoring
- ✅ **Multi-Tab** - Efficiently manage multiple files with quick switching
- ✅ **File Tree** - Intuitive project structure browsing with Git status integration
- ✅ **Theme System** - Dark theme (default), eye-friendly

### 🤖 AI Assistant

- ✅ **Multi-Model Support** - OpenAI, Anthropic Claude, Zhipu AI, and other mainstream LLMs
- ✅ **Context Understanding** - RAG retrieval enhancement for precise project code comprehension
- ✅ **Code Generation** - Generate code from natural language descriptions
- ✅ **Smart Refactoring** - AI-assisted code optimization and refactoring
- ✅ **Bug Diagnosis** - Intelligent error analysis with fix suggestions
- ✅ **Streaming Response** - Real-time AI replies for enhanced interaction
- ✅ **Tool Calling** - Agent toolchain supports file read/write, directory listing, etc.

### 🛠 Development Tools Integration

- ✅ **Integrated Terminal** - Built-in terminal emulator for seamless command execution
- ✅ **Git Integration** - File status tracking, visual version control
- ✅ **LSP Support** - Language Server Protocol for intelligent code analysis
- ✅ **Global Search** - Fast file name and content search
- ✅ **Multi-Language Support** - English/Chinese interface switching

---

## 📸 Screenshots

### Main Interface - Code Editing & File Management
![Main Interface](https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025001.png)

*Monaco Editor + File Tree + Multi-Tab, Smooth Development Experience*

---

### AI Assistant - Code Generation & Conversation
![AI Assistant](https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025002.png)

*Multi-model support, streaming responses, Markdown rendering, code highlighting*

---

### Integrated Terminal - Seamless Command Execution
![Integrated Terminal](https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025003.png)

*Built-in terminal emulator, multi-session management, ANSI escape sequences*

---

## 🏗 Tech Stack

### Frontend
- **React 19** - Latest UI framework
- **TypeScript 5.8** - Type safety
- **Zustand** - Lightweight state management
- **TailwindCSS 3.4** - Utility-first CSS framework
- **Monaco Editor** - Code editor core
- **Vite 7** - Fast build tool

### Backend
- **Tauri 2.0** - Cross-platform application framework
- **Rust** - System programming language
- **tokio** - Async runtime
- **reqwest** - HTTP client (AI API calls)
- **git2** - Git library integration
- **portable-pty** - Cross-platform terminal emulation

### Performance Metrics
- ⚡ **Startup Time**: < 2 seconds
- 💾 **Memory Usage**: ~100 MB (baseline)
- 📦 **Package Size**: 5-10 MB (90% smaller than Electron)
- 🎯 **Editor Response**: < 16ms (60 FPS smooth experience)

---

## 📦 Installation

### System Requirements

- **Windows**: Windows 10/11 (x64, ARM64)
- **macOS**: macOS 10.15+ (Intel, Apple Silicon)
- **Linux**: Ubuntu 20.04+, Fedora 35+, Debian 11+ (x64, ARM64)

### Build from Source

#### Prerequisites

- Node.js >= 18.0
- Rust >= 1.70 (install via [rustup](https://rustup.rs/))
- System dependencies:
  - **Windows**: Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `sudo apt install build-essential libgtk-3-dev libwebkit2gtk-4.0-dev`

#### Build Steps

```bash
# 1. Clone repository
git clone https://github.com/peterfei/ifai.git
cd ifai

# 2. Install dependencies
npm install

# 3. Start development mode (optional)
npm run tauri dev

# 4. Build release version
npm run build
npm run tauri build
```

Build artifacts are located in `src-tauri/target/release/bundle/`

### Binary Packages

> 🚧 Pre-compiled binary packages coming soon
>
> Please build from source for now, or watch for future Release updates

---

## 🚀 Quick Start

### First Launch

1. After starting the app, click the settings button on the right to configure AI providers
2. Add your API Key (supports OpenAI, Claude, Zhipu AI, etc.)
3. Select a model and enable it
4. Click "Open Folder" in the top left, select your project directory
5. Start coding with AI assistant!

### Using AI Features

#### Chat Mode
1. Click the AI assistant icon on the right to open the chat panel
2. Enter your question or requirement
3. AI will analyze the code and provide suggestions

#### Inline Edit
1. Select code in the editor
2. Trigger AI edit via shortcut or right-click menu
3. Describe the desired modification in natural language
4. AI will directly modify the selected code

#### Agent Tools
- AI can automatically read project files
- AI can create and modify files
- AI can list directory contents
- Tool calls require user approval for security

---

## 🐛 Known Issues

### Feature Limitations

- File tree doesn't support drag-and-drop
- File create/delete not implemented (use AI or terminal)
- Git features only support status display, not commit operations
- LSP client functionality still being refined
- Some languages have incomplete syntax highlighting

### Performance

- Opening very large files (>10MB) may be slow
- RAG indexing large projects (>1000 files) takes time

### Planned Fixes

These issues will be gradually addressed in future versions. Feel free to report issues in [Issues](https://github.com/peterfei/ifai/issues).

---

## 🗺 Roadmap

### v0.2.0 - Enhanced Experience (Planned)

- 🔄 Plugin system
- 🔄 Custom keyboard shortcuts
- 🔄 Code snippet manager
- 🔄 Markdown preview
- 🔄 Multi-cursor editing
- 🔄 File diff comparison

### v0.3.0 - Intelligence Upgrade (Future)

- 📋 AI code review
- 📋 Smart test generation
- 📋 Performance analysis tools
- 📋 Team collaboration features
- 📋 Cloud settings sync

### v1.0.0 - Production-Ready (Vision)

- 📋 Enterprise features
- 📋 Private deployment solution
- 📋 Extension marketplace
- 📋 Real-time collaboration
- 📋 Complete debugger integration

For the complete roadmap, see [README.md](https://github.com/peterfei/ifai#-roadmap)

---

## 🤝 Contributing

We welcome all forms of contribution!

### How to Contribute

- 🐛 **Report Bugs** - Submit detailed issue reports in [Issues](https://github.com/peterfei/ifai/issues)
- 💡 **Feature Suggestions** - Share your ideas and needs
- 📝 **Improve Documentation** - Enhance docs and examples
- 💻 **Contribute Code** - Fork the repo and submit Pull Requests
- 🌍 **Translation** - Help translate to other languages

For detailed contribution guidelines, see [CONTRIBUTING.md](https://github.com/peterfei/ifai/blob/main/CONTRIBUTING.md)

---

## 📄 License

### MIT License

The open-source framework portion of this project is licensed under **MIT License**.

Open-source parts include:
- ✅ User interface and interaction logic
- ✅ File system management
- ✅ Monaco Editor integration
- ✅ Terminal emulator
- ✅ Git integration interface
- ✅ LSP client implementation

### Core AI Capabilities (Commercial License)

Core AI capabilities are provided by proprietary commercial modules and are not included in the open-source scope:
- AI model integration and protocol adapters
- RAG retrieval engine
- Agent toolchain
- Vector semantic search
- Intelligent context building

For full AI capabilities, please contact the author for commercial licensing.

See [LICENSE](https://github.com/peterfei/ifai/blob/main/LICENSE) file for details.

---

## 🙏 Acknowledgments

### Open Source Projects

Thanks to these excellent open-source projects:

- [Tauri](https://tauri.app/) - Cross-platform framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [React](https://reactjs.org/) - UI framework
- [Rust](https://www.rust-lang.org/) - System programming language
- And all dependent open-source libraries

### Contributors

Thanks to all developers who have contributed to this project! ❤️

---

## 💬 Community & Support

- **Project Homepage**: [https://github.com/peterfei/ifai](https://github.com/peterfei/ifai)
- **Bug Reports**: [GitHub Issues](https://github.com/peterfei/ifai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/peterfei/ifai/discussions)
- **Contact Author**: [peterfei](https://github.com/peterfei)

---

## 📊 Version Info

- **Version**: v0.1.0
- **Release Date**: December 17, 2025
- **Git Tag**: `v0.1.0`
- **Frontend Build**: 1,431 kB (gzip: 458 kB)
- **Test Status**: ✅ 4/4 tests passing

### Complete Changelog

For detailed version history, see [CHANGELOG.md](https://github.com/peterfei/ifai/blob/main/CHANGELOG.md)

---

<div align="center">

### 🌟 If this project helps you, please give us a Star! ⭐️

**Let's make coding more enjoyable with AI!**

Made with ❤️ by [peterfei](https://github.com/peterfei)

</div>

---

## 📌 Related Links

- [README (中文)](https://github.com/peterfei/ifai/blob/main/README.md)
- [README (English)](https://github.com/peterfei/ifai/blob/main/README_EN.md)
- [Contributing Guide](https://github.com/peterfei/ifai/blob/main/CONTRIBUTING.md)
- [Changelog](https://github.com/peterfei/ifai/blob/main/CHANGELOG.md)
- [License](https://github.com/peterfei/ifai/blob/main/LICENSE)

---

**First release - looking forward to your feedback and suggestions!** 🚀
