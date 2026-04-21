# E2E 测试用例开发指南 - SSE 实时事件流版本

> **重要说明**：本文档定义了 E2E 测试的标准实现模式，所有后续 E2E 测试都应遵循此规范。

---

## 📋 目录

- [概述](#概述)
- [架构设计](#架构设计)
- [核心组件](#核心组件)
- [实现步骤](#实现步骤)
- [完整示例](#完整示例)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 概述

### 什么是 SSE E2E 测试？

SSE (Server-Sent Events) E2E 测试是一种端到端测试方法，通过 HTTP API 和 SSE 事件流来验证后端工作流的实时进度事件。

### 为什么使用 SSE 模式？

1. **真实后端调用**：通过 HTTP API 调用真实的 Rust 后端逻辑
2. **实时事件验证**：捕获和验证工作流执行过程中的 progress 事件
3. **测试环境隔离**：不依赖 Tauri IPC，使用 HTTP + SSE
4. **完整流程覆盖**：从命令发送到事件接收的完整链路

### 适用场景

- ✅ 工作流执行测试（`/explore`、`/review` 等）
- ✅ 长时间运行任务的进度监控
- ✅ 多步骤流程的事件验证
- ✅ 实时状态更新测试
- ✅ AI Chat 流式响应测试（`/api/ai/chat/stream`）

---

## 架构设计

### 系统架构图

```
┌─────────────────┐
│   E2E Test      │
│  (Playwright)   │
└────────┬────────┘
         │ 1. send /explore
         ▼
┌─────────────────┐
│  Frontend App   │
│  (Workflow      │
│  IntentHandler) │
└────────┬────────┘
         │ 2. HTTP POST /api/workflow/execute
         ▼
┌─────────────────┐
│  HTTP API       │
│  (Axum Server)  │
│  Port: 3333     │
└────────┬────────┘
         │ 3. Execute Workflow
         ▼
┌─────────────────┐
│  WorkflowRunner │
│  (Rust Backend) │
└────────┬────────┘
         │ 4. Progress Events
         ▼
┌─────────────────┐
│  SSE Stream     │
│  /api/workflow/ │
│  progress       │
└────────┬────────┘
         │ 5. SSE Events
         ▼
┌─────────────────┐
│ SSE Monitor     │
│ (Frontend)      │
└────────┬────────┘
         │ 6. Emit to chatEventBus
         ▼
┌─────────────────┐
│  chatEventBus   │
└────────┬────────┘
         │ 7. Event Listener
         ▼
┌─────────────────┐
│   E2E Test      │
│  (Assertion)    │
└─────────────────┘
```

### 数据流向

1. **命令发送**：E2E 测试 → 前端 → WorkflowIntentHandler
2. **工作流执行**：WorkflowIntentHandler → HTTP API → Rust Backend
3. **事件广播**：Rust Backend → SSE Stream
4. **事件接收**：SSE Monitor → chatEventBus
5. **事件验证**：chatEventBus → E2E Test Assertion

---

## 核心组件

### 1. HTTP API 服务器

**位置**：`src-tauri/src/http_api.rs`

**端口**：3333（可通过 `HTTP_API_PORT` 环境变量配置）

**关键端点**：

```rust
POST /api/workflow/execute     // 执行工作流
GET  /api/workflow/progress     // SSE 事件流
POST /api/health               // 健康检查
POST /api/ai/chat              // AI 聊天（非流式，未实现）
POST /api/ai/chat/stream       // AI 聊天（SSE 流式）✨
```

#### AI Chat 端点详情

**POST /api/ai/chat/stream**

功能：提供 AI 聊天的 SSE 流式响应

请求格式：
```json
{
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "provider_config": {
    "name": "deepseek",
    "api_key": "sk-xxx",
    "base_url": "https://api.deepseek.com"
  },
  "model": "deepseek-chat",
  "enable_tools": false
}
```

SSE 响应事件：
```json
// 内容增量事件
{"event_type":"content_delta","content_delta":"你好","tool_call":null,"error":null,"finish_reason":null}

// 完成事件
{"event_type":"done","content_delta":null,"tool_call":null,"error":null,"finish_reason":"stop"}

// 错误事件
{"event_type":"error","content_delta":null,"tool_call":null,"error":{"code":"AI_ERROR","message":"..."},"finish_reason":null}
```

**启动条件**：
- 环境变量 `ENABLE_HTTP_API=true`
- 在 `lib.rs` 中使用 `tauri::async_runtime::spawn` 启动

### 2. SSE Progress 监听器

**位置**：`src/utils/sseProgressMonitor.ts`

**关键方法**：

```typescript
// 启动 SSE 监听（自动检测 E2E 环境）
export async function startSSEProgressMonitoringIfNeeded(): Promise<boolean>

// 获取全局 SSE 监听器实例
export function getSSEProgressMonitor(): SSEProgressMonitor

// 监听特定事件
sseMonitor.on('event_type', (event) => { ... })
```

**启动逻辑**：

```typescript
// 检测 E2E 环境
const isE2E = (window as any).__E2E__ === true;

// 检测真实 Tauri（非 mock）
const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
const isMock = (invoke as any)?.isE2EMock === true;

// 只在 E2E + Mock Tauri 环境启动 SSE
if (isE2E && isMock) {
  await monitor.connect('http://localhost:3333/api/workflow/progress');
}
```

### 3. WorkflowIntentHandler 集成

**位置**：`src/stores/chat/sendMessage/WorkflowIntentHandler.ts`

**关键代码**：

```typescript
// 启动 SSE Progress 监听（E2E 测试环境）
const { startSSEProgressMonitoringIfNeeded, getSSEProgressMonitor } =
  await import('../../../utils/sseProgressMonitor');
const sseStarted = await startSSEProgressMonitoringIfNeeded();

if (sseStarted) {
  const sseMonitor = getSSEProgressMonitor();

  // 监听所有 progress 事件并转发到 chatEventBus
  sseMonitor.on('*', (progressEvent) => {
    chatEventBus.emit('workflow:progress', progressEvent);
  });
}
```

### 4. E2E Mock Invoke 代理

**位置**：`tests/e2e/setup-utils.ts`

**关键功能**：

```typescript
// HTTP API 代理：execute_quick_workflow 通过真实后端调用
if (cmd === 'execute_quick_workflow') {
  const response = await fetch('http://localhost:3333/api/workflow/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_type: args.workflowType,
      target_path: args.targetPath,
      // ... 其他参数
    }),
  });

  if (response.ok) {
    const data = await response.json();
    return data.data.workflow_id;
  }
}
```

**Mock 检测标记**：

```typescript
// 给 interceptor 添加标记，用于检测是否是 mock
const interceptor = (originalInvoke) => {
  const wrapped = async (cmd, args) => { ... };
  wrapped.isE2EMock = true;  // 🔥 关键标记
  return wrapped;
};
```

---

## 实现步骤

### Step 1: 确保 HTTP API 启动

**检查环境变量**：

```bash
export ENABLE_HTTP_API=true
```

**验证 HTTP API 运行**：

```bash
curl -X POST http://localhost:3333/api/health
# 预期响应：{"success":true,"data":{"status":"ok",...}}
```

### Step 2: 设置 E2E 测试环境

```typescript
test.beforeEach(async ({ page }) => {
  await setupE2ETestEnvironment(page, {
    skipWelcome: true,
    useRealAI: false  // 使用 Mock 模式
  });

  await page.goto('/');
  await page.waitForTimeout(2000);

  // 🔥 关键配置
  await page.evaluate(() => {
    localStorage.setItem('tour_completed', 'true');
    (window as any).__E2E__ = true;
    (window as any).__E2E_REAL_TAURI_MODE__ = true;  // 使用真实 HTTP API
  });
});
```

### Step 3: 设置事件监听器

```typescript
// 监听浏览器控制台日志
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('Workflow') || text.includes('progress')) {
    console.log('[Browser Console]', text);
  }
});

// 设置 workflow:progress 事件监听
await page.evaluate(() => {
  (window as any).__progressEvents = [];

  const chatEventBus = (window as any).__chatEventBus ||
                       (window as any).__GLOBAL_CHAT_EVENT_BUS__;

  if (chatEventBus) {
    const progressHandler = (data: any) => {
      // 🔥 SSE 事件可能是 JSON 字符串，需要解析
      let parsedData = data;
      if (typeof data === 'string') {
        parsedData = JSON.parse(data);
      }

      // 映射字段名（snake_case → camelCase）
      const mappedData = {
        workflowId: parsedData.workflow_id,
        event_type: parsedData.event_type,
        node_id: parsedData.node_id,
        message: parsedData.message,
        timestamp: parsedData.timestamp
      };

      (window as any).__progressEvents.push({
        event: 'workflow:progress',
        data: mappedData,
        timestamp: Date.now()
      });
    };

    chatEventBus.on('workflow:progress', progressHandler);
  }
});
```

### Step 4: 发送命令并验证

```typescript
// 发送命令
await page.evaluate(async () => {
  const chatStore = (window as any).__chatStore;
  chatStore.getState().sendMessage('/explore');
});

// 等待工作流执行
await page.waitForTimeout(10000);

// 验证结果
const result = await page.evaluate(() => {
  const w = window as any;
  return {
    progressEvents: w.__progressEvents || [],
    totalEvents: (w.__progressEvents || []).length
  };
});

// 断言
expect(result.totalEvents).toBeGreaterThan(0);
expect(result.progressEvents[0].data.workflowId).toBeDefined();
expect(result.progressEvents[0].data.message).toContain('工作流');
```

---

## 完整示例

### 示例：验证 /explore 命令的 workflow:progress 事件

**文件**：`tests/e2e/workflow/workflow-explore-progress.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('/explore 命令 Progress 事件测试', () => {

  test('✅ 验证 /explore 命令发送 workflow:progress 事件', async ({ page }) => {
    // 1. 设置 E2E 环境
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 2. 配置测试环境
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = true;  // 关键！
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });

    // 3. 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Workflow') || text.includes('progress')) {
        console.log('[Browser Console]', text);
      }
    });

    // 4. 设置事件监听器
    await page.evaluate(() => {
      (window as any).__progressEvents = [];

      const chatEventBus = (window as any).__chatEventBus ||
                           (window as any).__GLOBAL_CHAT_EVENT_BUS__;

      if (chatEventBus) {
        const progressHandler = (data: any) => {
          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
          }

          const mappedData = {
            workflowId: parsedData.workflow_id,
            event_type: parsedData.event_type,
            node_id: parsedData.node_id,
            message: parsedData.message,
            timestamp: parsedData.timestamp
          };

          (window as any).__progressEvents.push({
            event: 'workflow:progress',
            data: mappedData,
            timestamp: Date.now()
          });
        };

        chatEventBus.on('workflow:progress', progressHandler);
      }
    });

    // 5. 发送命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    // 6. 等待工作流执行
    await page.waitForTimeout(10000);

    // 7. 验证结果
    const result = await page.evaluate(() => {
      const w = window as any;
      return {
        progressEvents: w.__progressEvents || [],
        hasChatStore: !!w.__chatStore,
        hasChatEventBus: !!(w.__chatEventBus || w.__GLOBAL_CHAT_EVENT_BUS__),
        totalEvents: (w.__progressEvents || []).length
      };
    });

    console.log('📊 测试结果:', result);

    // 8. 断言
    expect(result.hasChatStore).toBe(true);
    expect(result.hasChatEventBus).toBe(true);
    expect(result.totalEvents).toBeGreaterThan(0);

    // 验证第一个事件的数据
    const firstEvent = result.progressEvents[0];
    expect(firstEvent.data.workflowId).toBeDefined();
    expect(firstEvent.data.message).toBeDefined();

    // 打印所有事件
    result.progressEvents.forEach((evt: any, i: number) => {
      console.log(`   ${i + 1}. ${evt.data.event_type}: ${evt.data.message}`);
    });
  });
});
```

---

## 最佳实践

### 1. 事件监听器管理

**❌ 不推荐**：使用通配符监听所有事件

```typescript
chatEventBus.on('*', (event, data) => {
  // event 参数会是 undefined（ChatEventBus 的 bug）
});
```

**✅ 推荐**：直接监听特定事件

```typescript
chatEventBus.on('workflow:progress', (data) => {
  // data 参数正确接收事件数据
});
```

### 2. 数据类型处理

**❌ 不推荐**：假设 data 总是对象

```typescript
const workflowId = data.workflow_id;  // 如果 data 是字符串会失败
```

**✅ 推荐**：添加类型检查和解析

```typescript
let parsedData = data;
if (typeof data === 'string') {
  parsedData = JSON.parse(data);
}
const workflowId = parsedData.workflow_id;
```

### 3. 等待时间设置

**❌ 不推荐**：固定短等待时间

```typescript
await page.waitForTimeout(2000);  // 可能不够
```

**✅ 推荐**：根据工作流复杂度设置合理等待

```typescript
await page.waitForTimeout(10000);  // 确保有足够时间完成
```

### 4. 错误处理

**❌ 不推荐**：忽略错误

```typescript
const result = await someAsyncOperation();
// 没有错误处理
```

**✅ 推荐**：添加 try-catch 和日志

```typescript
try {
  const result = await someAsyncOperation();
  console.log('✅ 操作成功:', result);
} catch (error) {
  console.error('❌ 操作失败:', error);
  throw error;  // 重新抛出以让测试失败
}
```

### 5. 测试隔离

**❌ 不推荐**：依赖测试执行顺序

```typescript
// Test 1 设置全局状态
// Test 2 依赖 Test 1 的状态
```

**✅ 推荐**：每个测试独立设置

```typescript
test.beforeEach(async ({ page }) => {
  // 清理和重置状态
  await page.evaluate(() => {
    localStorage.clear();
    (window as any).__progressEvents = [];
  });
});
```

---

## 常见问题

### Q1: HTTP API 无法启动

**症状**：
```
curl: (7) Failed to connect to localhost port 3333
```

**解决方案**：

1. 检查环境变量：
   ```bash
   echo $ENABLE_HTTP_API  # 应该输出 "true"
   ```

2. 检查端口占用：
   ```bash
   lsof -i :3333
   ```

3. 查看 Tauri 启动日志：
   ```bash
   # 应该看到：
   # [HttpAPI] 🚀 Starting HTTP API server on 0.0.0.0:3333
   # [HttpAPI] ✅ Server listening on 0.0.0.0:3333
   ```

### Q2: SSE 监听器无法启动

**症状**：
```
sseStarted: false
hasSSEMonitor: false
```

**解决方案**：

1. 检查 `__E2E__` 标志：
   ```typescript
   await page.evaluate(() => {
     console.log((window as any).__E2E__);  // 应该是 true
   });
   ```

2. 检查 mock invoke 标记：
   ```typescript
   await page.evaluate(() => {
     const invoke = (window as any).__TAURI_INTERNALS__?.invoke;
     console.log(invoke?.isE2EMock);  // 应该是 true
   });
   ```

3. 检查 SSE 连接日志：
   ```
   [SSEProgressMonitor] 🔄 Connecting to SSE stream: http://localhost:3333/api/workflow/progress
   [SSEProgressMonitor] ✅ SSE connection opened
   ```

### Q3: 事件数据为 undefined

**症状**：
```
[Test] 📨 Mapped data: {workflowId: undefined, ...}
```

**解决方案**：

1. 检查数据类型：
   ```typescript
   console.log('[Test] 📨 data type:', typeof data);
   ```

2. 添加 JSON 解析：
   ```typescript
   let parsedData = data;
   if (typeof data === 'string') {
     parsedData = JSON.parse(data);
   }
   ```

3. 检查原始数据：
   ```typescript
   console.log('[Test] 📨 Original data:', data);
   ```

### Q4: chatEventBus 不可用

**症状**：
```
hasChatEventBus: false
```

**解决方案**：

1. 检查两个可能的位置：
   ```typescript
   const w = window as any;
   console.log('w.__chatEventBus:', !!w.__chatEventBus);
   console.log('w.__GLOBAL_CHAT_EVENT_BUS__:', !!w.__GLOBAL_CHAT_EVENT_BUS__);
   ```

2. 修改测试等待条件：
   ```typescript
   await page.waitForFunction(() => {
     const w = window as any;
     return w.__chatEventBus || w.__GLOBAL_CHAT_EVENT_BUS__;
   }, { timeout: 30000 });
   ```

### Q5: 工作流使用 mock 执行

**症状**：
```
[WorkflowIntentHandler] 🧪 Using mock workflow execution (E2E mode)
```

**解决方案**：

设置 `__E2E_REAL_TAURI_MODE__` 标志：
```typescript
await page.evaluate(() => {
  (window as any).__E2E_REAL_TAURI_MODE__ = true;
});
```

---

## 附录

### A. 事件类型参考

| 事件类型 | 描述 | 示例数据 |
|---------|------|---------|
| `workflow:started` | 工作流启动 | `{"event_type":"workflow:started","workflow_id":"quick-exploration","message":"工作流已启动"}` |
| `workflow_started` | 工作流开始执行 | `{"event_type":"workflow_started","workflow_id":"quick-exploration","message":"工作流开始执行: 快速探索"}` |
| `node_started` | 节点开始执行 | `{"event_type":"node_started","workflow_id":"quick-exploration","node_id":"explore","message":"开始执行节点: 快速探索"}` |
| `node_completed` | 节点执行完成 | `{"event_type":"node_completed","workflow_id":"quick-exploration","node_id":"explore","message":"节点执行完成: 快速探索"}` |
| `workflow:completed` | 工作流完成 | `{"event_type":"workflow:completed","workflow_id":"quick-exploration","message":"工作流执行完成"}` |
| `workflow:error` | 工作流错误 | `{"event_type":"workflow:error","workflow_id":"quick-exploration","message":"执行失败: ..."}` |

### B. 字段映射表

| SSE 事件字段 (snake_case) | chatEventBus 字段 (camelCase) |
|---------------------------|------------------------------|
| `workflow_id` | `workflowId` |
| `event_type` | `event_type` |
| `node_id` | `node_id` |
| `tool_details` | `tool_details` |
| `timestamp` | `timestamp` |

### C. 相关文件清单

```
后端文件：
├── src-tauri/src/http_api.rs                    # HTTP API 服务器
├── src-tauri/src/lib.rs                         # HTTP API 启动逻辑
└── src-tauri/src/commands/workflow_commands.rs  # 工作流命令处理

前端文件：
├── src/utils/sseProgressMonitor.ts              # SSE 监听器
├── src/stores/chat/sendMessage/
│   ├── WorkflowIntentHandler.ts                 # 工作流意图处理器
│   └── IntentHandler.ts                         # 意图识别
├── src/stores/chat/eventBus/ChatEventBus.ts     # 事件总线
└── src/stores/chat/StoreMapper.ts               # 状态映射

测试文件：
├── tests/e2e/setup-utils.ts                     # E2E 环境设置
└── tests/e2e/workflow/
    └── workflow-explore-progress.spec.ts        # SSE 测试示例
```

### D. 调试命令

```bash
# 检查 HTTP API 状态
curl -X POST http://localhost:3333/api/health

# 测试 SSE 连接（需要保持连接打开）
curl -N http://localhost:3333/api/workflow/progress

# 查看端口占用
lsof -i :3333

# 运行特定测试
npm run test:e2e tests/e2e/workflow/workflow-explore-progress.spec.ts

# 运行所有 E2E 测试
npm run test:e2e

# 查看 Playwright 报告
npx playwright show-report
```

---

**文档版本**：v1.0.0
**最后更新**：2025-01-10
**维护者**：E2E 测试团队

---

## 变更日志

### v1.0.0 (2025-01-10)
- ✅ 初始版本
- ✅ 基于 `/explore` 命令的 SSE 测试实现
- ✅ 完整的架构设计和实现步骤
- ✅ 最佳实践和常见问题解答
