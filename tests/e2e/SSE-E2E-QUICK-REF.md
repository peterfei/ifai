# SSE E2E 测试快速参考

> 📖 **完整文档**：请查看 [SSE-E2E-GUIDE.md](./SSE-E2E-GUIDE.md)

---

## 🚀 快速开始

### 1. 确保环境配置

```bash
export ENABLE_HTTP_API=true
# 启动 Tauri 应用（HTTP API 会自动启动在 3333 端口）
```

### 2. 测试模板

```typescript
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test('SSE E2E 测试模板', async ({ page }) => {
  // 🎯 步骤 1: 设置环境
  await setupE2ETestEnvironment(page, {
    skipWelcome: true,
    useRealAI: false
  });
  await page.goto('/');
  await page.waitForTimeout(2000);

  // 🎯 步骤 2: 配置关键标志
  await page.evaluate(() => {
    (window as any).__E2E__ = true;
    (window as any).__E2E_REAL_TAURI_MODE__ = true;  // 必须设置！
  });

  // 🎯 步骤 3: 设置事件监听
  await page.evaluate(() => {
    (window as any).__testEvents = [];

    const chatEventBus = (window as any).__chatEventBus ||
                         (window as any).__GLOBAL_CHAT_EVENT_BUS__;

    const eventHandler = (data: any) => {
      let parsed = data;
      if (typeof data === 'string') parsed = JSON.parse(data);

      (window as any).__testEvents.push({
        workflowId: parsed.workflow_id,
        eventType: parsed.event_type,
        message: parsed.message
      });
    };

    chatEventBus.on('workflow:progress', eventHandler);
  });

  // 🎯 步骤 4: 执行操作
  await page.evaluate(() => {
    const chatStore = (window as any).__chatStore;
    chatStore.getState().sendMessage('/explore');
  });

  // 🎯 步骤 5: 等待并验证
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => ({
    events: (window as any).__testEvents || [],
    count: (window as any).__testEvents?.length || 0
  }));

  expect(result.count).toBeGreaterThan(0);
});
```

---

## 🔑 关键配置

### 必须设置的标志

```typescript
(window as any).__E2E__ = true;                 // 启用 E2E 模式
(window as any).__E2E_REAL_TAURI_MODE__ = true;  // 使用真实 HTTP API
```

### chatEventBus 访问

```typescript
// 使用 fallback 确保获取到实例
const chatEventBus = (window as any).__chatEventBus ||
                     (window as any).__GLOBAL_CHAT_EVENT_BUS__;
```

### 事件数据解析

```typescript
// SSE 事件可能是 JSON 字符串
let parsedData = data;
if (typeof data === 'string') {
  parsedData = JSON.parse(data);
}
```

---

## 📊 事件类型

| 类型 | 说明 |
|-----|------|
| `workflow:started` | 工作流启动 |
| `workflow_started` | 工作流开始执行 |
| `node_started` | 节点开始执行 |
| `node_completed` | 节点执行完成 |
| `workflow:completed` | 工作流完成 |
| `workflow:error` | 工作流错误 |

---

## 🐛 常见问题速查

| 问题 | 解决方案 |
|-----|---------|
| HTTP API 无法启动 | 检查 `ENABLE_HTTP_API=true` |
| SSE 监听器不启动 | 检查 `isE2EMark` 标记 |
| 事件数据为 undefined | 添加 `JSON.parse(data)` |
| chatEventBus 不可用 | 检查两个可能的位置 |
| 使用 mock 执行 | 设置 `__E2E_REAL_TAURI_MODE__` |

---

## 📁 相关文件

```
核心文件：
├── src-tauri/src/http_api.rs                    # HTTP API 服务器
├── src/utils/sseProgressMonitor.ts              # SSE 监听器
├── src/stores/chat/sendMessage/
│   └── WorkflowIntentHandler.ts                 # 工作流处理器
├── tests/e2e/setup-utils.ts                     # E2E 环境设置
└── tests/e2e/workflow/
    └── workflow-explore-progress.spec.ts        # 完整示例

文档：
├── tests/e2e/SSE-E2E-GUIDE.md                   # 完整指南
└── tests/e2e/SSE-E2E-QUICK-REF.md               # 本文件
```

---

## 🔍 调试命令

```bash
# 检查 HTTP API
curl -X POST http://localhost:3333/api/health

# 测试 SSE 流
curl -N http://localhost:3333/api/workflow/progress

# 运行测试
npm run test:e2e tests/e2e/workflow/workflow-explore-progress.spec.ts
```

---

**提示**：复制上面的模板作为新测试的起点，确保遵循所有步骤！
