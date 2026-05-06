# IfAI Editor v0.4.6 发布说明

**发布日期**: 2026-05-06

## 📋 版本概述

IfAI Editor v0.4.6 是一个重大架构更新版本，聚焦 **多线程并发对话系统** 和 **TUI God Object 重构**。本版本实现了完整的 per-thread 并发 AI 请求、消息路由、审批隔离架构，同时通过 4 个 Phase 的渐进式重构将 App struct 从 27 字段降至 14 字段，引入 Mode enum 状态机和声明式路由表，显著提升了代码可维护性。

**代码统计**:
- 54 个文件变更
- +14,920 行新增代码
- -1,053 行删除代码
- 净增 ~13,867 行代码

---

## 🎉 主要新功能

### 1. 多线程并发对话系统

**Per-Thread Session 隔离**，支持多个 AI 对话线程同时运行：

- **Thread Store**：基于 HashMap 的线程管理，每个线程拥有独立的会话历史、streaming 状态和审批队列
- **Thread Event 路由**：事件总线将 AI 响应、状态更新、审批请求路由到正确的线程
- **并发 Streaming**：多个线程可以同时进行 AI 流式请求，互不干扰
- **审批隔离**：每个线程的工具审批请求独立处理，不会跨线程串台

**交互特性**:
- Ctrl+T 创建新线程
- Alt+Left / Alt+Right 切换线程
- Ctrl+W 关闭线程
- 线程状态栏实时显示 streaming/queue 状态

**相关提交**:
- `ac0e2c5f` feat(tui): 多线程对话系统核心架构 - Phase 1 & 2
- `aa2f65f4` feat(tui): 线程模式 UI 渲染 - Phase 3
- `3b6a06f5` feat(tui): 多线程消息路由系统 - Phase 4
- `891c3458` feat(tui): 实现 per-thread 并发 AI 请求和审批界面响应修复

**技术亮点**:
- Arc<Mutex> 三阶段锁策略（Session → Request → Stream）
- ThreadEvent 枚举实现类型安全的事件路由
- Per-thread streaming buffer 隔离，消除跨线程消息串台

---

### 2. 多行输入支持

**Shift+Enter / Alt+Enter / Ctrl+J** 换行：

- Streaming 期间支持多行输入
- 智能自动滚动：输入多行文本时内容区域自动滚动到底部
- 焦点恢复修复：多行输入后焦点正确回到输入框

**相关提交**:
- `e95a5ca9` feat(tui): 实现 Shift+Enter/Alt+Enter 多行输入支持
- `b3a71b89` feat(tui): Ctrl+J 换行 + 智能自动滚动 + 焦点恢复修复

---

### 3. /thread 系列斜杠命令

**线程管理命令**：

- `/thread new` — 创建新线程
- `/thread list` — 列出所有线程
- `/thread switch <id>` — 切换到指定线程
- `/thread close` — 关闭当前线程

**相关提交**:
- `bfc4e3e8` feat(tui): 添加 /thread 系列斜杠命令 + 线程模式弹出框渲染

---

## 🏗️ 架构重构：TUI God Object 分解（4 个 Phase）

### Phase 1: 子系统提取

从 App struct（27 字段、71 个 pub fn）提取 5 个独立子系统：

| 子系统 | 职责 | 从 App 移入的字段 |
|--------|------|-------------------|
| `StreamSubsystem` | Streaming 状态管理 | thread_busy, active_requests, queue, streaming_response_buffers, last_ai_responses |
| `ApprovalSubsystem` | 工具审批 | approval_states, approval_selected |
| `SearchSubsystem` | 搜索 | search_mode, search_query, search_matches, current_match_index, search_input |
| `DiffSubsystem` | 差异浏览 | diff_mode, diff_view, diffs, diff_index |
| `ThreadSubsystem` | 线程管理 | thread_store, thread_messages, active_thread_mode |

**成果**: App struct 从 27 字段降至 14 字段。所有旧 API 通过 inline 委托保持兼容。

### Phase 2: Mode enum 状态机

用 `enum Mode { Normal, Diff, Overlay, Search, Approving, ThreadPicker }` 替代 5 个布尔标志 + `consumed` 手动 guard：

- **类型系统保证互斥**: 不可能同时处于 Diff + Search
- **consumed 标志消除**: mode match + early return 替代布尔标志链
- **修复 2 个 guard bug**: Diff+Ctrl+O 和 Overlay+Ctrl+D 被错误放行
- **10 个模式契约测试 + 13 个 guard 行为测试**

### Phase 3: 声明式路由表

用 `RouteAction` enum + `NORMAL_BINDINGS` const 数组 + `route_normal_key()` 分发器替代 if-else：

```rust
const NORMAL_BINDINGS: &[RouteBinding] = &[
    RouteBinding { key: KeyCode::Char('d'), modifiers: KeyModifiers::CONTROL, action: RouteAction::EnterDiff },
    RouteBinding { key: KeyCode::Char('o'), modifiers: KeyModifiers::CONTROL, action: RouteAction::EnterOverlay },
    RouteBinding { key: KeyCode::Char('t'), modifiers: KeyModifiers::CONTROL, action: RouteAction::CreateThread },
    // ...
];
```

**成果**: `handle_single_key_event` 从 238 行降至 158 行。新增快捷键 = 加一行数据，不改控制流。

### Phase 4: StreamState 生命周期统一

5 处分散的 cleanup 路径统一为 `cleanup_after_stream()` 单一入口：

- Ctrl+C: 统一使用 `cleanup_after_stream()` 替代手动 `end_streaming()` + `set_thread_busy(false)`
- StreamFinished: 消除双重清理
- **6 个状态契约测试**验证 cleanup 正确性和幂等性

---

## 🐛 Bug 修复

### TUI 交互 Bug（7 项）

- **快捷键阻塞**: Ctrl+T 切线程后快捷键失效 — 移除 `Mode::ThreadPicker` 设置
- **滚动失效**: Normal 模式 PageUp/PageDown 不刷新 — handler 调用 `render()` + 返回 `Break`
- **鼠标滚轮**: Streaming 期间鼠标滚轮不工作 — streaming loop 新增鼠标事件处理
- **键盘事件**: Streaming 完成后键盘事件失效的三个 BUG
- **消息丢失**: 线程切换时消息丢失问题
- **流式切换**: 流式输出期间无法切换线程的问题
- **跨线程串台**: Streaming buffer 改为 per-thread 隔离

### 多行输入 Bug（2 项）

- **滚动溢出**: 多行输入时滚动范围溢出 bug
- **焦点恢复**: Streaming 完成后焦点未正确恢复

---

## 🧪 测试

### 测试统计

- **总测试数**: 862（从 830 增长至 862，+32 个新测试）
- **通过率**: 100%
- **新增测试类型**:
  - 模式契约测试（10 个）
  - Guard 行为测试（13 个）
  - 路由契约测试（11 个）
  - 状态契约测试（6 个）
  - 并发 E2E 测试（14 轮上下文断链 + 并发审批）

### 并发测试

- **14 轮上下文断链 E2E 测试**: 含 2048 游戏生成场景，验证长对话稳定性
- **并发审批测试**: 验证多线程同时审批工具调用不会串台
- **跨线程串台测试**: 验证 streaming buffer per-thread 隔离
- **Streaming 泄漏测试**: 验证线程结束后状态正确清理

---

## 📊 统计信息

### 代码量
- **文件变更**: 54 个
- **新增代码**: +14,920 行
- **删除代码**: -1,053 行
- **净增长**: ~13,867 行

### 测试覆盖
- **总测试数**: 862
- **通过率**: 100%
- **新增测试**: 32 个

### 提交记录
- **总提交数**: 27 个
- **时间跨度**: 2026-05-02 ~ 2026-05-06
- **主要贡献者**: peterfei

---

## 📖 升级指南

### 从 v0.4.5 升级到 v0.4.6

1. **拉取最新代码**
   ```bash
   git fetch origin
   git checkout v0.4.6
   ```

2. **更新依赖**
   ```bash
   cargo update
   ```

3. **重新构建**
   ```bash
   cargo build --release
   ```

4. **测试新功能**
   ```bash
   ./target/release/ifai

   # 尝试 Ctrl+T（创建新线程）
   # 尝试 Alt+Left / Alt+Right（切换线程）
   # 尝试 Shift+Enter（多行输入）
   # 尝试 /thread list（列出所有线程）
   ```

### 兼容性说明

- **向后兼容**: v0.4.5 配置文件无需修改
- **无破坏性变更**: 所有 API 保持兼容
- **可选升级**: 新功能均为增量添加

---

## ⚠️ 已知问题

1. **后台线程 streaming**: 切换线程后，原线程的 streaming 在后台继续运行，但 UI 只显示前台线程状态
2. **线程数量上限**: 当前限制为 10 个并发线程

---

## 🙏 致谢

感谢所有为本版本做出贡献的开发者！

**主要贡献者**:
- @peterfei - 核心功能开发与架构设计

---

## 📝 下一步计划

### v0.4.7 规划
- [ ] 后台线程 streaming UI（显示多线程状态）
- [ ] 线程持久化（保存/恢复线程）
- [ ] Overlay Mode 搜索功能
- [ ] Diff Context 语法高亮
- [ ] 更多测试覆盖（目标 900+）

### 长期规划
- [ ] 插件系统支持
- [ ] 远程协作功能
- [ ] 云同步服务

---

**下载链接**: [GitHub Releases](https://github.com/peterfei/ifai/releases/tag/v0.4.6)

**完整变更日志**: [v0.4.5...v0.4.6](https://github.com/peterfei/ifai/compare/v0.4.5...v0.4.6)

---

Built with ❤️ by IfAI Open Source Community
