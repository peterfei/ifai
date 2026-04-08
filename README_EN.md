# IfAI — A Mature AI Native Harness 🚀

### 🌟 v0.4.0 Highlights: Prompt Ecosystem, Multi-Agent Architecture & Conversation Management
- **Prompt Management System**: Layered transparency strategy (80%/15%/5%), version control, Monaco Editor integration
- **Multi-Agent System**: Community edition unlocked! Explore/Review/TaskBreakdown/ProposalGenerator/Refactor Agents
- **Tool System**: 10+ core tools (file operations, search, Shell commands, TodoWrite), three-level permission grading
- **Conversation Management**: Session notes auto-extraction (60+ keywords), Token statistics & threshold detection (100k), auto-summary & smart compression (88.6% Token reduction)
- **CLI Interactive Tool**: `ifai` command-line tool, multi-Provider support, command history
- **Mature Harness Milestone**: Completion of conversation management marks IfAI as a fully functional AI Native Harness

### 🌟 v0.3.12 Highlights: Event-Driven Architecture & Streaming Order
- **ChatEventBus Architecture**: Global event bus decoupling for messaging, streaming, and persistence
- **ContentSegmentManager (Industry First)**: Resolving streaming response ordering issues
- **Industrial Persistence**: Full IndexedDB migration with automatic session self-healing

### 🌟 v0.3.9 Highlights: Physical Fidelity & Cognitive Upgrade
- **Symbol-First Probing Engine**: Millisecond-level physical structure analysis for large files
- **Physical Fidelity Reinforcement**: Full IndexedDB storage migration (bye-bye 5MB LocalStorage limit)
- **NVIDIA NIM Deep Integration**: Rust-based URL auto-calibration for industrial inference protocols

### 🌟 v0.3.6 Highlights: UI Refactor, PIVO 2.0 & Structured Workflow
- **Industrial UI Refactor**: Model Capsule panel and enhanced multi-threading management
- **PIVO 2.0 Engine**: Risk-aware instruction engine with asynchronous previews
- **Structured Workflow**: Tool results consumed as PivoProjectTree graphical nodes

<div align="center">

**A Mature AI Native Harness — Empowering Autonomous Agents**

Built with Tauri 2.0 + React 19

[简体中文](./README.md) | English

[![Downloads](https://img.shields.io/github/downloads/peterfei/ifai/total.svg)](https://github.com/peterfei/ifai/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)](https://tauri.app/)
[![AI Native](https://img.shields.io/badge/AI-Native-green)](https://ai-native.dev)
[![Harness Ready](https://img.shields.io/badge/Harness-Mature-brightgreen)](https://github.com/peterfei/ifai#harness-capabilities)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Latest-orange)](https://www.rust-lang.org/)

</div>

---

![](imgs/ifai2601003_1280.gif)

---

## 📖 Introduction

**IfAI (若爱)** is a mature AI Native Harness that empowers autonomous agents with complete runtime environment. With v0.4.0, IfAI achieves full core capability coverage including tool execution, multi-agent collaboration, prompt management, conversation management, and persistence. The name "若爱" (IfAI) means "if there is love, code will be warm" — we believe AI should be the most caring programming companion for developers.

### 🎖️ Mature Harness Capabilities

As a mature AI Native Harness, IfAI provides:

- **Complete Tool Execution System**: 10+ core tools with standardized interfaces, three-level permission grading, and automatic path resolution
- **Multi-Agent Collaboration**: 5 core agents (Explore, Review, TaskBreakdown, ProposalGenerator, Refactor) with collaboration mechanisms and DAG visualization
- **Prompt Management System**: Layered transparency strategy, version control with Git integration, Monaco Editor integration
- **Conversation Management**: Auto-summarization, smart compression (88.6% Token reduction), session notes auto-extraction
- **Production-Ready Persistence**: IndexedDB storage with transaction-level consistency and automatic repair

### 📈 Project Status

- **✅ v0.4.0** - Apr 08, 2026 (Prompt Ecosystem, Multi-Agent Architecture & Conversation Management — Mature Harness)
- **✅ v0.3.12** - Event-Driven Architecture & Streaming Order
- **✅ v0.3.9** - Physical Fidelity & Cognitive Upgrade
- **✅ v0.3.6** - UI Refactor, PIVO 2.0 & Structured Workflow
- **🎉 v0.3.0 Multimodal Vision Upgrade** - Jan 14, 2026 (Vision LLM, Hybrid Scheduling, Code Navigation, Onboarding Tour)
- **🎉 v0.2.9 Agent Intelligence** - Jan 12, 2026 (Smart Terminal Loop, Inline Editing Experience, AI Code Review)
- **🎉 v0.2.8 Industrial Evolution** - Jan 10, 2026 (Composer 2.0, RAG Symbol-Aware, Command Palette)
- **🎉 v0.2.7 Experience Leap** - Jan 09, 2026 (AI Rollback, Smart Diff, Industrial Layout Switcher, Automated E2E Framework)
- **🎉 v0.2.5 Hybrid Intelligence** - Jan 03, 2026 (Local LLM Support, Intelligence Router, Offline Completion)
- **🎉 v0.2.4 Optimization Update** - Dec 30, 2025 (Windows Rendering, Flicker Fixes, Stability)
- **🎉 v0.2.0 Major Update** - Dec 20, 2025 (Interactivity & Performance Milestone)
- **🎉 v0.1.2 Stable** - Dec 19, 2025
- **⚡ Rendering** - 120 FPS High Frame Rate + GPU Acceleration
- **🌊 Interaction** - Claude-style progressive streaming
- **💾 Memory Usage** - ~80MB (20% lower than v0.1.0)

<img src="imgs/ifai.gif" alt="IfAI Demo" width="600" height="auto"/>

---

## ✨ v0.2.0 Interaction & Performance Revolution

### 🌊 Claude-style Streaming System
- **Typewriter Effect** - AI tool operations present a smooth line-by-line generation effect.
- **Progressive Parsing** - The Rust backend features heuristic parsing, extracting code content before the response ends.
- **Streaming Cursor Feedback** - Added a dynamic pulsing cursor to tool previews for real-time visual confirmation.

### 🚀 GPU Hardware Acceleration Pipeline
- **120 FPS Support** - Optimized rendering for high-refresh-rate monitors, ensuring ultra-smooth scrolls and animations.
- **Zero-Lag Generation** - 150ms rendering throttling and dynamic scaling eliminate editor lag during AI generation.
- **Performance Monitor** - Toggle a real-time FPS panel with `Mod+Alt+p`.

### ⌨️ Advanced UX & Keyboard Navigation
- **Persistent Command History** - Call back your previous prompts with the **Up Arrow**, even after restarting the app. Experience terminal-like input efficiency.
- **Seamless Global Control** - Re-engineered keyboard logic for Slash Commands and Project Search, supporting smooth up/down navigation and instant selection.
- **Intelligent Indexing** - Precisely distinguishes between manual edits and history refills, ensuring continuous interaction remains intuitive.

### 🛡️ Smart Agent Monitor
- **Drag & Snap** - The monitor widget can be dragged anywhere and intelligently snaps to corners.
- **Adaptive Layout** - The panel automatically adjusts its expansion direction based on its snap position.
- **Full Internationalization** - Task status and real-time logs fully support EN/CN switching.

### 📐 Intelligent Rendering Logic
- **Summary at Bottom** - Re-engineered the engine so tool boxes stay on top, while the AI **Summary** naturally lands at the bottom.
- **Pure UI Upgrade** - Minimalist logo design to maximize space for code communication.


### 🎨 Modern Editor

- **Monaco Editor Core** - Same editor engine as VSCode
- **Syntax Highlighting** - Support for mainstream programming languages
- **Code Intelligence** - Auto-completion, code navigation, refactoring
- **Multi-Tab** - Efficiently manage multiple files
- **File Tree** - Intuitive project structure browsing
- **Theme Customization** - Dark/Light themes, eye-friendly

### 🤖 AI Assistant

- **Multi-Model Support** - OpenAI, Anthropic Claude, Zhipu AI, and other mainstream LLMs
- **Context Understanding** - RAG retrieval enhancement for precise project code comprehension
- **Code Generation** - Generate code from natural language descriptions
- **Smart Refactoring** - AI-assisted code optimization and refactoring
- **Bug Diagnosis** - Intelligent error analysis with fix suggestions
- **Technical Q&A** - Instant answers to programming questions

### 🛠 Development Tools Integration

- **Integrated Terminal** - Built-in terminal for seamless command execution
- **Git Integration** - File status tracking, visual version control
- **LSP Support** - Language Server Protocol for intelligent code analysis
- **Quick Search** - Global file and content search
- **Multi-Language Support** - English/Chinese interface switching

---

## 🏗 Technical Architecture

### Tech Stack

```
┌─────────────────────────────────────────────────────┐
│                      IfAI                            │
├─────────────────────────────────────────────────────┤
│  Frontend Layer                                      │
│  ├─ React 19         - UI Framework                 │
│  ├─ TypeScript 5.8   - Type Safety                  │
│  ├─ Zustand          - State Management             │
│  ├─ TailwindCSS      - Styling System               │
│  ├─ Monaco Editor    - Code Editor                  │
│  └─ Vite             - Build Tool                   │
├─────────────────────────────────────────────────────┤
│  Backend Layer (Rust/Tauri)                         │
│  ├─ Tauri 2.0        - Cross-Platform Framework     │
│  ├─ tokio            - Async Runtime                │
│  ├─ serde            - Serialization                │
│  ├─ reqwest          - HTTP Client                  │
│  ├─ git2             - Git Integration              │
│  ├─ portable-pty     - Terminal Emulation           │
│  └─ walkdir          - File Traversal               │
├─────────────────────────────────────────────────────┤
│  Core Capability Layer (Private Extension)          │
│  ├─ AI Model Integration - Multi-model adapters    │
│  ├─ Agent Toolchain     - Smart code operations    │
│  ├─ RAG Retrieval       - Vector semantic search   │
│  └─ Context Building    - Intelligent understanding │
└─────────────────────────────────────────────────────┘
```

### Core Design

- **Tauri Architecture** - Web frontend + Rust backend, combining performance with development efficiency
- **Event-Driven** - Async communication between frontend and backend through event system
- **Dependency Injection** - Core package accesses main app state through registry mechanism
- **Plugin Design** - Core AI capabilities as independent packages, easy to extend
- **Local-First** - File operations and Git management all performed locally

### Project Structure

```
ifainew/
├── src/                      # React frontend code
│   ├── components/          # UI components
│   │   ├── Editor/         # Monaco editor
│   │   ├── FileTree/       # File tree
│   │   ├── AIChat/         # AI chat interface
│   │   └── Terminal/       # Terminal emulator
│   ├── stores/             # Zustand state management
│   │   ├── fileStore.ts    # File state
│   │   ├── chatStore.ts    # AI chat state
│   │   └── settingsStore.ts # Settings state
│   └── utils/              # Utility functions
│
├── src-tauri/               # Rust backend code
│   ├── src/
│   │   ├── lib.rs          # Main entry
│   │   ├── file_walker.rs  # File traversal
│   │   ├── terminal.rs     # Terminal management
│   │   ├── git.rs          # Git integration
│   │   ├── lsp.rs          # LSP client
│   │   └── search.rs       # File search
│   └── Cargo.toml
│
├── tests/                   # Test cases
│   ├── spec_agent_flow.cjs
│   ├── spec_escape_fix.cjs
│   └── spec_tool_history.cjs
│
└── package.json
```

---

## 🚀 Quick Start

### Prerequisites

Ensure the following tools are installed:

- **Node.js** >= 18.0
- **Rust** >= 1.70 (install via [rustup](https://rustup.rs/))
- **System Dependencies**:
  - **Windows**: Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `build-essential`, `libgtk-3-dev`, `libwebkit2gtk-4.0-dev`

### Installation Steps

1. **Clone Repository**

   ```bash
   git clone https://github.com/peterfei/ifai.git
   cd ifai
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Start Development Server**

   ```bash
   npm run tauri dev
   ```

   The app will automatically compile and start, usually within seconds.

### Build Release Version

```bash
# Build frontend
npm run build

# Build Tauri app
npm run tauri build
```

Build artifacts are located in `src-tauri/target/release/bundle/`.

---

## 📸 Screenshots

### Main Interface - Code Editing & File Management
![IfAI Main Interface](./imgs/ifai2025001.png)

*Monaco Editor + File Tree + Multi-Tab, Smooth Development Experience*

---

### AI Assistant - Code Generation & Conversation
![AI Assistant Interface](./imgs/ifai2025002.png)

*Multi-model support, streaming responses, Markdown rendering, code highlighting*

---

### Integrated Terminal - Seamless Command Execution
![Integrated Terminal](./imgs/ifai2025003.png)

*Built-in terminal emulator, multi-session management, ANSI escape sequences*

---

## 🛠 Development Guide

### Local Development

```bash
# Start development mode
npm run tauri dev

# Run frontend dev server only
npm run dev

# Run tests
node tests/spec_agent_flow.cjs
```

### Code Standards

- **Frontend**: Use TypeScript strict mode, follow React Hooks best practices
- **Backend**: Follow Rust official code standards, run `cargo fmt` and `cargo clippy`
- **Commits**: Follow Conventional Commits specification

### Tech Stack Rationale

**Why Tauri?**
- Excellent performance: Fast startup, low memory (90% less than Electron)
- Secure & reliable: Rust memory safety prevents common vulnerabilities
- Cross-platform: Write once, run everywhere
- Small bundle size: 5-10MB release packages (vs Electron's 100MB+)

**Why React 19?**
- Latest features: React Server Components, concurrent rendering
- Rich ecosystem: Abundant component libraries and tooling
- Developer experience: Hot reload, DevTools, TypeScript support

---

## 🗺 Roadmap

### v0.2.0 (Current) - Interaction Milestone

- ✅ **Claude-style Streaming** - Progressive JSON parsing and typewriter rendering
- ✅ **Smart Agent Monitor** - Draggable, corner-snapping, and adaptive layout
- ✅ **Personalized Settings** - Fira Code, ligatures, smooth caret, and VS Code-style options
- ✅ **Rendering Optimization** - Ensures summary text always lands at the message bottom
- ✅ **Minimalist UI** - Clean chat header and optimized visual space

### v0.3.0 (Planned) - Intelligence Upgrade

- 📋 AI code review
- 📋 Smart test generation
- 📋 Performance analysis tools
- 📋 Team collaboration features
- 📋 Cloud settings sync

### v1.0.0 (Vision) - Production-Ready

- 📋 Enterprise features
- 📋 Private deployment solution
- 📋 Extension marketplace
- 📋 Real-time collaboration
- 📋 Complete debugger integration

---

## 🌟 Future Vision

### Technical Vision

**IfAI** is committed to becoming the smartest programming companion for developers:

1. **AI-Native Editor** - Not simple AI feature stacking, but AI thinking integrated from the ground up
2. **Local-First** - Fully offline capable, protecting code privacy
3. **Open Ecosystem** - Open-source core framework, community-driven plugins and extensions
4. **Cross-Platform Experience** - Unified operation experience, seamless environment switching

### Product Vision

We hope **IfAI** can:

- 🎯 **Lower Programming Barriers** - Enable beginners to quickly get started with AI assistance
- 💡 **Boost Development Efficiency** - Reduce repetitive work, focus on creative tasks
- 🤝 **Facilitate Knowledge Transfer** - AI assistant as code knowledge carrier
- 🌍 **Serve Global Developers** - Multi-language support, adapt to different cultures

### Community Vision

- **Open-Source Collaboration** - Open core framework, welcome code and ideas
- **Knowledge Sharing** - Build developer community, share best practices
- **Continuous Innovation** - Keep up with AI tech evolution, explore new possibilities

---

## 🤝 Contributing

We welcome all forms of contribution!

### How to Contribute

1. **Fork this repository**
2. **Create feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to branch** (`git push origin feature/AmazingFeature`)
5. **Submit Pull Request**

For detailed contribution guide, see [CONTRIBUTING.md](./CONTRIBUTING.md).

### Ways to Participate

- 🐛 **Report Bugs** - Submit detailed issue reports
- 💡 **Feature Suggestions** - Share your ideas and needs
- 📝 **Improve Documentation** - Enhance docs and examples
- 💻 **Contribute Code** - Fix bugs or add features
- 🌍 **Translation** - Help translate to other languages

---

## 📄 License

This project is licensed under **MIT License**.

Core AI capabilities are provided by proprietary commercial modules and are not included in the open-source scope. The open-source portion provides a complete editor framework and extension interfaces.

See [LICENSE](./LICENSE) file for details.

---

## 💬 Community & Support

- **GitHub Issues**: [Bug Reports](https://github.com/peterfei/ifai/issues)
- **GitHub Discussions**: [Discussions](https://github.com/peterfei/ifai/discussions)
- **Project Homepage**: [https://github.com/peterfei/ifai](https://github.com/peterfei/ifai)

---

## 🙏 Acknowledgments

Thanks to the following open-source projects:

- [Tauri](https://tauri.app/) - Cross-platform framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [React](https://reactjs.org/) - UI framework
- [Rust](https://www.rust-lang.org/) - System programming language

And all developers who have contributed to this project! ❤️

---

<div align="center">

**If this project helps you, please give us a ⭐️**

Made with ❤️ by [peterfei](https://github.com/peterfei)

</div>
