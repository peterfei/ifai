# IfAI v0.4.4 发布说明

<div align="center">
  <h2>CLI 全面升级 — 工业级终端 AI 助手</h2>
  <p>元数据驱动架构 + ratatui 全屏 TUI + 元编程引擎</p>
  <p>2026-04-26</p>
</div>

---

## 概述

v0.4.4 是 IfAI CLI 的里程碑版本，从零开始构建了工业级终端 AI 助手体验。基于元编程架构和配置驱动设计，实现了 Provider 自动注册、权限引擎、Token 追踪、TOML 配置、Pipeline 可视化、循环检测等核心能力，并通过 ratatui + crossterm 实现了全屏 TUI 模式。

**40 个提交 | 6 个阶段 | 49 个 TUI 测试**

---

## 架构设计

本版本遵循 **OpenSpec `optimize-ifai-cli` 提案**，核心理念：

- **配置驱动一切**：不写一个 if/match 来区分 provider，YAML 即配置，零 Rust 代码改动
- **元编程优先**：`#[derive(StatusRender)]` 派生宏、声明式布局 spec、事件路由表
- **DRY 极限化**：复用 GUI 端 provider_metadata、prompt_manager、定价数据
- **零手写渲染逻辑**：数据结构即规格，单一渲染管线

---

## Phase 1: 元数据驱动核心

### Provider Dispatch Table
- `build.rs` 编译时扫描 `providers/registry/*.yaml` 自动生成注册表代码
- 消除所有 `match provider.as_str()` 硬编码分支
- 新增 provider 只需放一个 YAML 文件，零 Rust 代码改动

### System Prompt 模板引擎
- 单一模板 + `{provider_display}` / `{provider_original}` 占位符
- 删除 4 个 provider 各自手写的 90% 相同 system prompt
- 支持 `--system-prompt` 文件覆盖

### 声明式命令注册
- `CommandSpec` 静态数组驱动 REPL 命令发现、帮助生成、权限检查
- spec 与 handler 合一，12 个命令单点变更
- `/help` / `/clear` / `/compact` / `/cost` / `/provider` / `/model` / `/permissions` / `/resume` / `/export` / `/undo` / `/config` / `/exit`

### 事件语义统一
- `ToolStart` = 参数（本地执行），`ToolResult` = 结果（回传）
- 消除 `ToolDone.result` 被当 JSON 参数解析的歧义

### 元编程权限引擎
- 从 GUI 端 `toolApprovalConfig.ts` 自动生成 Rust 权限引擎
- O(1) 工具分类（Safe / Dangerous / Destructive）
- 配置驱动续播限制（Safe=5, Destructive=3）

---

## Phase 2: 交互体验

### 元编程 Token 系统
- **零重复定价定义**：复用 GUI 端 `provider_metadata.rs` 定价数据
- **实时 Token 追踪**：SSE usage 数据流追踪，累计 input/output tokens
- **上下文预警**：四级阈值（<50% Low / <75% Medium / <90% High / >=90% Critical）
- **进度条**：`[████░░░░]` ANSI 彩色可视化
- **成本统计**：`/cost` 命令显示 TokenMetrics 与费用分解

### 流式状态栏
- 紧凑式设计，`\r` 覆盖同行显示
- 状态机驱动（Idle -> Streaming -> ExecutingTool -> Idle）
- 中英文智能 Token 估算（中文 2 字符/token，英文 4 字符/token）

### 会话压缩
- `/compact` 命令手动触发压缩
- 保留 system prompt + 最近 20 条消息
- 75% / 90% 自动预警建议

### 流式渲染增强
- **代码块流式渲染**：实时语法高亮，代码折叠
- **ASCII 回退模式**：无 256 色终端自动降级
- **一键复制提示**：交互式使用体验
- **IfAI Brand Cursor Spinner**：`▊` 字符动画

---

## Phase 3: 配置系统

### TOML 配置文件
- `~/.ifai/config.toml` 标准配置
- 四层优先级链：CLI 参数 > 环境变量 > 配置文件 > YAML 默认值
- `ConfigSource` 追踪每个值的来源
- `/config init` 生成带注释的模板
- `/config show` 可视化优先级链

### 输入模式
- REPL 交互模式（rustyline 命令历史 + Ctrl+R 反向搜索）
- stdin 管道输入（非 TTY 自动检测）
- `--json` 标志输出 JSON 格式
- `--no-tool` 标志禁用工具调用
- `--resume <name>` 恢复会话

### 会话持久化
- `/save <name>` 保存至 `~/.ifai/sessions/`
- `/resume list` 列出所有会话
- `/resume <name>` 恢复指定会话
- `/export <file>` 导出为 Markdown

---

## Phase 5: Pipeline 元编程可视化

### 派生宏 `#[derive(StatusRender)]`
- `ifai-render-macro` proc-macro crate
- 属性驱动：`#[status(symbol = "✓", zh = "成功", en = "Success", theme = "success")]`
- 编译期生成渲染逻辑，零手写代码
- 13 个宏测试全部通过

### Pipeline 跟踪器
- `PipelineStepStatus` 枚举：InProgress / Success / Failed / Skipped / Warning
- `PipelineTracker` 管理工具执行全生命周期
- 智能输出截断（10 行预览）

---

## Phase 6: 循环检测引擎

### 配置驱动的通用引擎
- `LoopDetector` — JSON 配置驱动，零硬编码
- 规则 1：完全相同调用检测（`max_identical_calls: 3`）
- 规则 2：连续相同工具检测（`max_consecutive_same_tool: 10`）
- 规则 3：50% 警告阈值
- 声明式 API：`LoopDetectionStatus`（Normal / Warning / Blocked）

---

## 智能 Glob 搜索

- 防止上下文爆炸的智能文件搜索
- 支持 `src/**/*` 等 glob 模式匹配
- 路径匹配优化与调试信息

---

## ratatui 全屏 TUI 模式

### 架构（元编程 v3）
- 基于 ratatui + crossterm 的完整 TUI 框架
- 事件路由表 `KEY_BINDINGS` 替代巨型 match
- 声明式布局 `LAYOUT_SPEC` 消除魔法索引
- `RenderBackend` trait 统一 TTY / non-TTY

### 功能
- 固定底部输入框和状态栏
- 工具审批 Overlay（Y/N 确认）
- 非交互模式自动降级

### 测试
- 49 个 TUI 模块单元测试
- 覆盖状态转换、Token 估算、渲染输出等核心逻辑

---

## Homebrew 发布

- Homebrew Cask 发布指南文档
- 自动化发布脚本
- 版本管理与 CI 集成

---

## 技术亮点

| 维度 | 实现方式 |
|------|---------|
| **架构** | 元数据驱动 + 配置驱动，零硬编码 |
| **渲染** | `#[derive(StatusRender)]` 派生宏，零手写 |
| **布局** | `LAYOUT_SPEC` 声明式 + `KEY_BINDINGS` 路由表 |
| **权限** | GUI 配置自动生成 Rust 引擎 |
| **定价** | 100% 复用 GUI 端 provider_metadata |
| **检测** | JSON 配置驱动的通用循环检测引擎 |
| **TUI** | ratatui + crossterm 元编程架构 v3 |
| **测试** | 49 个单元测试，TDD 红绿开发 |

---

## 修复项

- 修复配置文件 `api_key` / `base_url` 查找失败
- 修复 glob 模式匹配优先级
- 修复智能 Glob 搜索的路径匹配问题
- 修复 CLI 测试编译错误和测试失败
- 修复 Pipeline 工具参数为空问题
- 移除流式阶段的重复状态显示
- 适配 StreamEvent 类型变更
- 修复加载动画显示和调试日志控制

---

## 安装与更新

### macOS
```bash
brew upgrade --cask ifai
```

### Windows
运行应用，在设置面板点击"检查更新"。

### CLI（独立使用）
```bash
# 从源码构建
git clone https://github.com/peterfei/ifai.git
cd ifai
cargo build --release --bin ifai

# 或使用 Homebrew
brew install ifai
```

---

## 提交统计

- **v0.4.3 ... HEAD**: 40 个提交
- **主要贡献领域**: CLI 架构、TUI 模式、元编程引擎、权限系统、配置系统、测试
