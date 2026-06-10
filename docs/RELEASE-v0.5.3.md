# 🎉 IfAI v0.5.3 — StreamingCodeCard 流式预览 + 文件编码切换

> **发布时间**: 2026-06-10
> **里程碑**: AI 文件写入实时预览 + 原生 TextDecoder 编码切换

---

## ✨ 核心亮点

### 📝 StreamingCodeCard 流式文件写入预览

AI 在写入文件时不再让你面对空白等待。v0.5.3 引入了 **StreamingCodeCard**，在代码流式传输过程中实时显示内容预览和 Diff 变更：

- **实时代码显示** — AI 逐块写入文件时，卡片即时渲染最新代码内容，无需等待完成
- **动态审批按钮** — 流式进行中隐藏审批按钮，仅内容完整后显示"审批"操作
- **Composer Diff 集成** — 一键切换到 Diff 视图，精准对比变更前后差异
- **ToolApprovalRegistry 动态化** — 声明式配置驱动工具匹配，消除 8 处硬编码查找表

### 🌐 文件编码切换（EncodingPicker）

终于来了 — Statusbar 右下角新增 **EncodingPicker**，支持在 10 种编码间自由切换：

- UTF-8 / CP936 (GBK) / GB2312 / GB18030 / Shift-JIS / EUC-JP / EUC-KR / Big5 / ISO-8859-1 / Windows-1252
- 特别支持 Delphi 生态（`.pas`/`.dpr`/`.dpk`/`.dfm`）自动识别 CP936
- 切换后文件立即以新编码重新解码，内容实时刷新
- `position: fixed` 弹出层，始终可见

### 🔧 原生 TextDecoder 替代 iconv-lite

**架构级改进** — 完全移除 `iconv-lite` 依赖，使用 Web 原生 `TextDecoder`/`TextEncoder` API：

- 消除 Node.js `Buffer` 依赖（根治 Tauri WKWebView 下 `Buffer.prototype` 报错）
- WKWebView 原生支持 ISO-8859-1、GBK、Shift-JIS 等编码，零 polyfill
- `TextEncoder` 写入 — 非 UTF-8 文件写入时自动编码，内容保真
- 修复 `jschardet` Uint8Array 兼容性问题

---

## 📋 详细变更

### 🚀 新功能

**StreamingCodeCard 流式预览：**
- StreamingCodeCard 组件 — AI 写入文件时实时显示代码内容和 Diff 预览
- ToolApprovalRegistry 动态化 — 声明式 `streamExtract` 配置替代硬编码集合
- `isPartial` 生命周期 — 流式进行中隐藏审批按钮，内容完整后显示
- 补偿渲染 — 投影段替代补偿渲染 + `resolveToolRenderer` 统一决策
- ReadOnly 多层防御 — ReadOnly 工具不显示审批卡片
- 审批按钮 truncated 修复 — 宽高自适应，长文本完整显示

**文件编码：**
- EncodingPicker 组件 — Statusbar 右下角，10 种编码切换
- `changeFileEncoding` store action — TextDecoder 重新解码
- `position: fixed` 定位 — 绕过父级 `overflow-hidden` 裁剪

### 🔧 重构/优化

- **iconv-lite → TextDecoder**：完全移除 iconv-lite + buffer + @types/iconv-lite 依赖（-3 个 npm 包）
- `encoding.ts` 工具模块：`ENCODING_ALIAS` / `TEXT_DECODER_ENCODING` / `EXT_ENCODING_HINT` 声明式表
- `SUPPORTED_ENCODINGS` 配置数组 — 新增编码只需一行数据
- jschardet Uint8Array 兼容性修复

### 🧪 测试

- 19 个新增测试用例，全部通过
- EncodingPicker 交互链路：7 个测试（渲染/点击/选择/关闭/短路逻辑）
- 编码映射逻辑：10 个测试（映射表/binary string/TextDecoder 兼容性）
- fileActions 适配：2 个测试

### 📦 依赖变更

| 包 | 变更 |
|----|------|
| `iconv-lite` | ✅ 移除 |
| `buffer` | ✅ 移除 |
| `@types/iconv-lite` | ✅ 移除 |

---

## 🐛 修复汇总

1. **StreamingCodeCard 6 个阻断性 bug** — 流式预览多个竞态条件修复
2. **审批按钮 truncated** — 长文本按钮完整显示
3. **Buffer.prototype 报错** — iconv-lite → TextDecoder 根治
4. **jschardet Uint8Array 不兼容** — `aBuf.slice(-1).split is not a function` 修复
5. **encoding='UTF-8' 坠落 jschardet** — 条件分支修复
6. **Statusbar overflow-hidden 裁剪** — `position: fixed` 定位

---

## 📦 下载

- **GitHub**: https://github.com/peterfei/ifai

---

## 🙏 致谢

感谢所有贡献者和测试者的支持！

---

*完整提交历史: `git log v0.5.2..v0.5.3`*
