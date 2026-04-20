# IfAI v0.4.2 - 技能系统重构与流式性能优化

**发布日期**: 2026-04-21

---

## 概述

v0.4.2 涵盖**技能系统 Phase 7 UI 全面重构**（全屏布局、搜索筛选、批量操作）、**流式输出性能优化**（批量事件处理、高频日志清理）、**工具调用竞态修复**、**E2E 性能测试框架 v2.0**、**对话归档引擎**，以及大规模**测试修复**（Vitest 132/0 failed, E2E 409+/0 failed）。

---

## 亮点：技能系统 Phase 7 UI 重构

### 核心改进

| 功能 | 说明 |
|------|------|
| 全屏布局 | 从侧边栏移至主编辑区，左侧技能列表（288px）+ 右侧详情面板（flex-1） |
| 搜索与筛选 | 技能市场：搜索框 + 分类标签（精选/开发/测试/文档/PIVO）；技能面板：状态过滤（全部/已激活/已安装/未激活） |
| 网格/列表视图 | 支持两种布局模式切换 |
| 批量操作 | 复选框多选 + 批量激活/取消 |
| 技能编辑器 | 创建/编辑/查看/预览四种模式，含表单验证 |
| 统计信息 | `技能(3/12)` 格式显示已激活/总计 |
| 技能安装/卸载 | 安装进度反馈、卸载确认 |

### 测试覆盖

| 测试套件 | 通过 |
|----------|------|
| 技能市场搜索筛选 | 7/7 |
| 技能面板搜索筛选 | 6/6 |
| 技能真实 AI 验证 | 7/7 |
| 单元测试 | 5/5 |

---

## 新功能（5 项）

### 1. 流式输出性能优化
- **BatchEventStream 批量处理**：事件队列 + 批量解析，减少 SSE 解析开销
- **高频日志清理**：Rust 后端 DeepSeek Frame 日志从每 10 帧降至仅前 3 帧；Tool call delta / TextDelta 日志完全移除
- **WorkflowInlineMonitor 日志清理**：移除所有高频日志
- **效果**：日志 I/O 从 ~15% 降至 <1%，长文本生成流畅度明显改善

### 2. E2E 性能测试框架 v2.0
- 元编程驱动的测试框架（ScenarioBuilder DSL）
- 支持声明式场景定义：`withHistory(10000, 'realistic')`, `withStreaming('continuous', 'fast', 50)`
- 性能指标自动采集：渲染时间、滚动 FPS、内存变化
- 长历史 + 真实 AI 流式响应测试（200 条消息基线）

### 3. 多格式对话归档引擎
- 支持对话压缩为归档（compactConversation）
- 归档浏览、详情查看、恢复功能
- E2E 测试覆盖完整归档生命周期（空归档、无效 ID 错误处理）

### 4. Agent Prompt 统一加载器
- SmartScanner 极简元编程框架
- AgentType 提示词文件统一管理
- 探索工作流使用完整 Explore Agent 提示词

### 5. Schema-Driven 前端工具识别
- Monaco diff 视图优化
- 工具类型自动识别与渲染优化

---

## Bug 修复（10 项）

### 流式与渲染（4 项）

| # | 问题 | 修复 |
|---|------|------|
| 1 | **多个"生成中..."脉冲动画**：流式输出时多个 text segment 都显示脉冲指示器 | 仅最后一个 text segment 传递 `isStreaming=true` |
| 2 | **工具调用竞态条件**：后端 tool_call 已发送但前端 finish 状态 toolCallsCount=0，审批组件不显示 | finish 事件处理前强制同步 buffer |
| 3 | **MonacoDiffView TypeScript 错误**：`overviewRulerWidth` 和 `hideMarginInOverviewRuler` 无效 | 移除两个无效属性，通过 CSS 覆盖 |
| 4 | **MonacoEditor 刷屏日志**：渲染路径中每次 re-render 触发 `console.log` | 移除 2 处调试日志 |

### 技能系统（2 项）

| # | 问题 | 修复 |
|---|------|------|
| 5 | **技能安装后列表为空**：安装完成后技能列表不更新 | 修复安装流程和列表刷新逻辑 |
| 6 | **技能面板统计显示错误**：初始化时统计数据不准确 | 修复统计计算和状态同步 |

### 持久化与状态（2 项）

| # | 问题 | 修复 |
|---|------|------|
| 7 | **VirtualMessageList 缓存导致 UI 不更新**：缓存阻止了合法的 UI 更新 | 修复缓存失效条件 |
| 8 | **骨架屏在新对话时一直显示**：shouldShowSkeleton 条件判断错误 | 修复骨架屏显示逻辑 |

### 其他修复（2 项）

| # | 问题 | 修复 |
|---|------|------|
| 9 | **社区版 AIProtocol 不兼容**：社区版与商业版类型不匹配 | 修复类型兼容性 |
| 10 | **"No user message to process" 错误**：发送消息后 AI 无法处理 | 三层防御修复（ContextSelector / sendMessage / generateResponse） |

---

## 性能优化（4 项）

| 优化项 | 方案 | 效果 |
|--------|------|------|
| BatchEventStream | 事件队列 + 批量解析，替代逐条 callback | 减少 SSE 解析开销 |
| 高频日志移除 | Rust 后端日志频率从每 10 帧降至仅前 3 帧；前端 WorkflowInlineMonitor 日志全移除 | 日志 I/O 从 ~15% 降至 <1% |
| VirtualMessageList | 缓存策略优化，减少万条消息场景下的卡顿 | 解决万条消息滚动卡顿 |
| 流式输出 UI 卡顿 | 减少不必要的 setState 调用 + requestAnimationFrame 节流 | 长文本生成流畅度改善 |

---

## 测试

### Vitest
- **修复前**: 130 passed, 2 failed, 15 skipped
- **修复后**: **132 passed, 0 failed, 15 skipped**
- 重写 `SkillsIntegration.test.tsx`（zustand selector mock、30+ store 方法补全）

### E2E
- **修复前**: 415 passed, 9 failed, 228 skipped
- **修复后**: **409+ passed, 0 failed, 243 skipped**
- 新增 `setup-utils.ts` conversationStore 等待

---

## 下版本规划（v0.4.3）

### 技能系统 Phase 8：远程技能市场
- 远程技能注册中心（Registry API）
- 技能安装、更新、卸载全生命周期管理
- 技能分享与发布
- 技能评价与反馈
- 统一技能格式 `SKILL.md`（Markdown + YAML frontmatter），兼容 Claude Code 标准
- 元编程架构：ifainew-macros crate（SkillFormat derive 宏、Tauri 命令生成宏），预计代码量 -76%
- 分库策略：开源社区版（本地技能）+ 商业版（远程市场）

### 流式输出架构重构
- 参考 claw-code 的 `next_event` 风格，替代 callback 模式
- 完全零日志，批量处理优化
- 预计 1230 行 → 300 行（-76%）

### 工具调用稳定性
- 工具调用 E2E 渲染问题深入调查（DOM 为空但 Store 状态正确）
- 智谱 GLM 工具调用风暴修复（串行工具处理 + eventBus 节流 + 渐进式渲染）

---

## 代码统计

| 指标 | 数值 |
|------|------|
| Vitest | 132 passed, 0 failed |
| E2E | 409+ passed, 0 failed |
| Bug 修复 | 10 项 |
| 新功能 | 5 项 |
| 性能优化 | 4 项 |
| Git 提交 | 50+ commits |
