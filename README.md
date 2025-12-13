# IfAI Editor (MVP)

基于 Tauri 2.0 + React + Monaco Editor 的 AI 代码编辑器。

## 开发环境

确保已安装：
- Node.js (v18+)
- Rust (latest stable)
- Tauri CLI (`cargo install tauri-cli`)

## 快速开始

1. 安装依赖：
   ```bash
   npm install
   ```

2. 启动开发服务器：
   ```bash
   npm run tauri dev
   ```

## 功能特性

- **Monaco Editor**: 完整的代码编辑体验。
- **文件管理**: 打开文件夹、文件树浏览、多标签页。
- **文件操作**: 读取、保存文件。
- **UI**: 现代化暗色主题 (TailwindCSS)。

## 目录结构

- `src/`: 前端代码 (React)
- `src-tauri/`: 后端代码 (Rust)
- `src/stores/`: 状态管理 (Zustand)
- `src/utils/`: 工具函数 (File System wrapper)