# IfAI v0.2.4 Release Notes

## 概览 (Overview)

IfAI v0.2.4 是一个专注于提升 Windows 平台体验和整体稳定性的版本。我们彻底解决了困扰 Windows 用户的内容闪烁问题，并优化了流式渲染的流畅度。

## 🚀 重点修复 (Critical Fixes)

### Windows 闪屏修复
- **问题**: 在 Windows 平台上，当 AI 生成代码时，编辑器内容区域会出现频繁的闪烁和跳动，严重影响阅读体验。
- **修复**: 通过重构流式渲染逻辑，移除了不必要的节流（Throttle）机制，并优化了 DOM 更新策略，彻底消除了闪烁现象。
- **效果**: 现在，无论是在 macOS 还是 Windows 上，代码生成的打字机效果都一样丝滑流畅。

### 版本号统一
- 规范了全项目的版本号管理，确保 `package.json`、`Cargo.toml` 和 `tauri.conf.json` 中的版本号严格一致，避免构建和发布过程中的混淆。

## ✨ 优化与改进 (Improvements)

- **UI 稳定性**: 增强了 Markdown 渲染组件的稳定性，防止在解析复杂代码块时出现布局抖动。
- **构建流程**: 完善了 Windows 平台的自动化构建流程，确保发布的 MSI 安装包版本号正确且功能完整。

## 📦 如何获取 (How to Get)

- **Windows**: 下载 `.msi` 安装包或 `.exe` 安装程序。
- **macOS**: 下载 `.dmg` 镜像文件。
- **Linux**: 下载 `.AppImage` 或 `.deb` 包。

请访问 [GitHub Releases](https://github.com/peterfei/ifai/releases) 获取最新版本。
