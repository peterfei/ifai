# E2E 测试失败清单

> 最后更新：2026-03-20
> 总计：74个失败测试

---

## 🎯 按分类整理

### 1️⃣ Chat Store 相关 (8个)

| 文件 | 测试名称 | 状态 |
|------|---------|------|
| `chat-store/agent-high-fidelity-v2.spec.ts` | Agent 高保真链路验证 V2 | ❌ |
| `chat-store/full-pipeline-orchestration.spec.ts` | 全管道编排集成验证 | ❌ |
| `chat-store/tool-lifecycle-fidelity.spec.ts` | 工具生命周期验证 | ❌ |
| `chat/message-persistence-simple.spec.ts` | 消息持久化 (5个测试) | ❌ |

---

### 2️⃣ Agent 回归测试 (23个)

| 文件 | 测试数量 | 状态 | 优先级 |
|------|---------|------|--------|
| `agent-read-file.spec.ts` | 3 | ❌ | 🔴 高 |
| `agent-list-dir-char-array.spec.ts` | 2 | ❌ | 🔴 高 |
| `agent-list-dir-display.spec.ts` | 5 | ❌ | 🟡 中 |
| `agent-tool-approval-debug.spec.ts` | 1 | ❌ | 🟡 中 |
| `agent-zhipu-*.spec.ts` | 8 | ❌ | 🟢 低 |
| `agent-backend-toolcall-test.spec.ts` | 1 | ❌ | 🟡 中 |
| `agent-error-echo.spec.ts` | 1 | ❌ | 🟡 中 |
| `command-execution.spec.ts` | 3 | ❌ | 🟡 中 |

---

### 3️⃣ Bash 工具测试 (12个)

| 文件 | 测试数量 | 主要问题 | 优先级 |
|------|---------|---------|--------|
| `bash-tool.spec.ts` | 4 | 命令执行 | 🔴 高 |
| `bash-tool-result.spec.ts` | 5 | **结果为空** | 🔴 高 |
| `bash-tool-perf.spec.ts` | 2 | 性能问题 | 🟡 中 |
| `command-execution.spec.ts` | 3 | 命令输出 | 🟡 中 |

**关键问题**：`bash 命令结果应该包含实际输出内容` - 返回空字符串

---

### 4️⃣ UI 测试 (11个)

| 文件 | 测试数量 | 问题类型 | 优先级 |
|------|---------|---------|--------|
| `button-state-update.spec.ts` | 2 | 状态更新 | 🔴 高 |
| `console-display-verification.spec.ts` | 3 | 控制台显示 | 🟡 中 |
| `repro-thread-click-first.spec.ts` | 2 | 线程切换 | 🟡 中 |
| `repro-ui-blocking.spec.ts` | 1 | UI 阻塞 | 🟡 中 |
| `tool-rendering-fidelity.spec.ts` | 2 | 工具渲染 | 🟡 中 |

---

### 5️⃣ 集成测试 (5个)

| 文件 | 测试数量 | 问题类型 |
|------|---------|---------|
| `demo-guide.spec.ts` | 3 | Demo 指南 |
| `real-llm-clean-flow.spec.ts` | 1 | LLM 集成 |
| `tauri-commercial-real-llm.spec.ts` | 1 | 商业版 LLM |

---

### 6️⃣ 其他 (15个)

- `chat_mention_system.spec.ts`
- `chat_symbol_precision.spec.ts`
- `debug-rollback-ui.spec.ts`
- `diff/` (2个测试)
- `performance/file-read-performance.spec.ts`
- `pivo-task-breakdown.spec.ts`
- `v0_3_3/` (3个测试)
- `v0.2.9/code-review.spec.ts` (2个测试)
- `v0.3.0/` (2个测试)

---

## 🔥 已修复的问题

### ✅ Tauri Bridge 初始化问题
- **问题**：`TypeError: Cannot read properties of undefined (reading 'transformCallback')`
- **影响**：几乎所有测试
- **修复**：
  - `src/utils/tauriInitializer.ts` - 增加真实 Tauri 环境超时到 30s
  - `src/stores/agentStore.ts` - 动态导入 + bridge 检查
  - `src/components/AIChat/AIChat.tsx` - 动态导入
  - `src/utils/tokenCounter.ts` - 动态导入
  - `src/stores/chat/generateResponse/StreamingResponseController.ts` - 动态导入
- **状态**：✅ 完成

---

## ⏳ 进行中的修复

### 🔄 formatToolResultToMarkdown 函数暴露
- **问题**：`window.__formatToolResultToMarkdown` 未找到
- **影响**：agent-read-file 等 10+ 测试
- **修复**：
  - `src/App.tsx` - 添加函数暴露
  - `src/utils/toolResultFormatter.tsx` - 添加字符数组处理逻辑
- **状态**：⏳ 进行中

---

## 🎯 待修复的主要问题

### 1. Bash 工具结果为空 (12个测试)
**症状**：
```
expect(toolMessageContent).toBeTruthy()
Received: undefined
```

**可能原因**：
- ToolApproval 组件未正确渲染结果
- bash 工具返回的数据格式未正确解析

**相关文件**：
- `src/components/AIChat/ToolApproval.tsx`
- `src/utils/toolResultFormatter.tsx`

---

### 2. UI 状态更新问题 (5个测试)
**症状**：
```
expect(stateAfterClick.status).not.toBe('pending')
Received: 'pending'
```

**可能原因**：
- 批准按钮点击后状态未及时更新
- 流式响应导致状态更新延迟

**相关文件**：
- `src/components/AIChat/ToolApproval.tsx`
- `src/stores/useChatStore.ts`

---

## 📊 修复进度跟踪

| 优先级 | 问题类型 | 测试数量 | 已修复 | 进行中 | 待修复 |
|-------|---------|---------|--------|--------|--------|
| 🔴 高 | Tauri Bridge 初始化 | 74 | ✅ 74 | - | - |
| 🔴 高 | formatToolResultToMarkdown | 10+ | - | ⏳ | - |
| 🔴 高 | Bash 工具结果为空 | 12 | - | - | ❌ |
| 🟡 中 | UI 状态更新 | 5 | - | - | ❌ |
| 🟡 中 | Agent 集成 | 20 | - | - | ❌ |
| 🟢 低 | 其他 | ~27 | - | - | ❌ |

---

## 🚀 下一步行动

1. ✅ **完成** `formatToolResultToMarkdown` 暴露
2. 🔴 **调查** Bash 工具结果为空的根本原因
3. 🟡 **分析** UI 状态更新延迟问题
4. 🟢 **逐步**修复其他测试

---

## 📝 修复记录

### 2026-03-20

#### 修复 1：Tauri Bridge 初始化
- 修改文件：
  - `src/utils/tauriInitializer.ts`
  - `src/stores/agentStore.ts`
  - `src/components/AIChat/AIChat.tsx`
  - `src/utils/tokenCounter.ts`
  - `src/stores/chat/generateResponse/StreamingResponseController.ts`
- 效果：消除了 `transformCallback` 错误
- 状态：✅ 完成

#### 修复 2：formatToolResultToMarkdown 暴露
- 修改文件：
  - `src/App.tsx` - 添加函数暴露
  - `src/utils/toolResultFormatter.tsx` - 添加字符数组处理
- 状态：⏳ 进行中

---

## 🔗 相关链接

- 原始测试输出：`/var/folders/gh/54w67t6n7_b8pv7t76xw5_qm0000gn/T/claude/-Users-mac-project-aieditor-ifainew/tasks/b23bc7e.output`
- 失败测试列表：`/tmp/failed_tests.txt`
