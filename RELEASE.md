# IfAI v0.5.3 发布说明

<div align="center">
  <h2>📝 StreamingCodeCard 流式预览 + 文件编码切换</h2>
  <p>AI 文件写入实时预览，10 种编码自由切换</p>
  <p>2026-06-10</p>
</div>

---

## 🌟 核心新特性

### 1. StreamingCodeCard 流式文件写入预览
v0.5.3 引入了 StreamingCodeCard 组件，AI 写入文件时实时显示代码内容：
- **实时代码渲染** — AI 逐块写入时即时展示最新内容
- **动态审批按钮** — 流式进行中隐藏，内容完整后显示
- **Composer Diff 集成** — 一键切换到差异视图，精准对比变更
- **ToolApprovalRegistry 动态化** — 声明式配置驱动，消除 8 处硬编码

### 2. 文件编码选择器
Statusbar 右下角新增 EncodingPicker，支持 10 种编码自由切换：
- UTF-8 / CP936 (GBK) / GB2312 / GB18030 / Shift-JIS / EUC-JP / EUC-KR / Big5 / ISO-8859-1 / Windows-1252
- Delphi 生态自动识别 CP936（.pas/.dpr/.dpk/.dfm/.fmx/.inc）
- 切换后文件立即以新编码重新解码，内容实时刷新

### 3. 架构级改进：原生 TextDecoder 替代 iconv-lite
- **完全消除 Node.js Buffer 依赖**，根治 Tauri WKWebView 兼容问题
- 使用 Web 原生 `TextDecoder`/`TextEncoder` API，零 polyfill
- 非 UTF-8 文件写入时自动编码，内容保真

---

## 🛠 修复汇总
- 6 个 StreamingCodeCard 流式竞态条件阻断性 bug
- 审批按钮 truncated 修复
- Buffer.prototype 报错根治
- jschardet Uint8Array 不兼容修复
- Statusbar overflow-hidden 裁剪弹出层修复

---

## 📦 安装与更新

### macOS
```bash
brew upgrade --cask ifai
```

### Windows
运行应用，在设置面板点击"检查更新"。
