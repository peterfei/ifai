# E2E 测试编码规范标准

> **重要**: 这是项目 E2E 测试的强制性编码标准。所有新增或修改的 E2E 测试**必须**遵守此标准。

---

## 🚫 强制性规则（必须遵守）

### 1. 导入规范

**✅ 正确**:
```typescript
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from './setup';
```

**❌ 禁止**:
```typescript
// ❌ 禁止使用 setup-utils
import { setupE2ETestEnvironment } from './setup-utils';
```

### 2. 配置获取规范

**✅ 正确** - 使用动态配置:
```typescript
const config = await getRealAIConfig(page);
await page.evaluate(async (payload) => {
  const chatStore = (window as any).__chatStore;
  await chatStore.getState().sendMessage(
    payload.text,
    payload.providerId,
    payload.modelId
  );
}, { text: prompt, providerId: config.providerId, modelId: config.modelId });
```

**❌ 禁止** - 硬编码配置:
```typescript
// ❌ 禁止硬编码 provider/model
await page.evaluate(async () => {
  const chatStore = (window as any).__chatStore;
  await chatStore.getState().sendMessage(prompt, 'real-ai-e2e', 'deepseek-chat');
});
```

### 3. layoutStore 访问规范

**✅ 正确**:
```typescript
await page.evaluate(() => {
  const layoutStore = (window as any).__layoutStore;
  if (layoutStore) {
    const store = layoutStore.useLayoutStore || layoutStore;
    if (store && store.getState && store.getState().toggleChat) {
      store.getState().toggleChat();
    }
  }
});
```

**❌ 禁止**:
```typescript
// ❌ 禁止直接调用 getState()
await page.evaluate(() => {
  const layoutStore = (window as any).__layoutStore;
  layoutStore.getState().toggleChat();
});
```

### 4. 调试代码规范

**❌ 禁止在生产测试中使用调试代码**:
```typescript
// ❌ 禁止大量 console.log
console.log('[Test] Step 1...');
console.log('[Test] 🔍 Checking...');

// ❌ 禁止重复的调试检查
const debugCheck1 = await page.evaluate(() => { /* ... */ });
const debugCheck2 = await page.evaluate(() => { /* ... */ });
```

**✅ 允许** - 最小化调试（开发时）:
```typescript
// ✅ 仅在关键位置添加调试
page.on('console', msg => {
  if (msg.type() === 'error') {
    console.log('[Browser Error]', msg.text());
  }
});
```

### 5. 测试模板规范

**创建新测试时，必须从模板复制**:

```bash
# 真实 AI 测试
cp tests/e2e/templates/real-ai-test.template.spec.ts tests/e2e/your-test.spec.ts

# 基础 E2E 测试
cp tests/e2e/templates/base-e2e-test.template.spec.ts tests/e2e/your-test.spec.ts
```

---

## 📋 推荐做法

### 1. 测试结构

使用 AAA 模式 (Arrange-Act-Assert):

```typescript
test('测试用例名称', async ({ page }) => {
  // Arrange - 准备测试数据
  const testData = { /* ... */ };

  // Act - 执行测试操作
  await page.click('[data-testid="button"]');

  // Assert - 验证结果
  await expect(page.locator('[data-testid="result"]')).toBeVisible();
});
```

### 2. 等待策略

```typescript
// ✅ 使用明确的等待条件
await page.waitForSelector(selector, { state: 'visible' });

// ✅ 使用 waitForFunction
await page.waitForFunction(() => (window as any).__chatStore !== undefined);

// ⚠️ 仅在必要时使用固定等待
await page.waitForTimeout(1000);
```

### 3. 选择器优先级

```typescript
// 1️⃣ 优先使用 data-testid
page.locator('[data-testid="submit-button"]')

// 2️⃣ 使用 role
page.getByRole('button', { name: 'Submit' })

// 3️⃣ 使用 text
page.getByText('Submit')

// ❌ 避免 CSS 选择器（可能因样式变化而失效）
page.locator('button.btn-primary')
```

### 4. Mock 文件系统

```typescript
await page.evaluate(() => {
  const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
  mockFS.set('/path/to/file', 'file content');
});
```

### 5. 测试标记规范 (Test Tags)

使用标记对测试进行分类，便于有选择地运行测试。

**可用标记**:

| 标记 | 说明 | 运行命令 | 使用场景 |
|------|------|----------|----------|
| `@fast` | 快速测试 | `npm run test:e2e:fast` | 单元测试、简单 UI 验证 |
| `@medium` | 中等速度测试 | `npm run test:e2e:medium` | 功能测试、表单交互 |
| `@slow` | 慢速测试 | `npm run test:e2e:slow` | 完整工作流、性能测试 |
| `@regression` | 回归测试 | `npm run test:e2e:regression` | 修复 Bug 的验证测试 |
| `@tauri` | 需要真实后端 | `npm run test:e2e:tauri` | 必须使用真实 Tauri 后端 |

**使用示例**:

```typescript
// 单个标记
test('@fast should validate input format', async ({ page }) => { });

// 多个标记
test('@regression @tauri should verify streaming with real backend', async ({ page }) => { });

// 回归测试（tests/e2e/regression/ 目录下的所有测试必须使用）
test('@regression should fix bug-123: empty bubble display', async ({ page }) => { });
```

**目录与标记对应规则**:

| 目录 | 必需标记 | 说明 |
|------|----------|------|
| `tests/e2e/regression/` | `@regression` | 所有回归测试必须标记 |
| 需要真实后端 | `@tauri` | 在 mock 模式下无法运行的测试 |

**特殊说明**:
- `@tauri` 标记的测试会使用真实的 Tauri 后端（`TAURI_DEV=true`）
- 普通测试使用 mock 的 Tauri API，运行更快
- 如果测试在普通模式下失败但在 Tauri 模式下通过，应该添加 `@tauri` 标记

---

## ⚠️ 禁止事项

| 禁止行为 | 原因 |
|----------|------|
| 硬编码 provider/model ID | 不支持动态配置 |
| 直接调用 layoutStore.getState() | 不兼容新的 store 结构 |
| 大量 console.log 调试代码 | 增加代码噪音 |
| 重复的 invoke 检查 | 已有 setup 自动处理 |
| 创建新的 setup 模块 | 必须使用现有的 setup/ |
| 从头写测试 | 必须从模板复制 |

---

## 📝 标准测试模板

### 真实 AI 测试模板

```typescript
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from './setup';

test.describe('功能名称', () => {
  test.beforeEach(async ({ page }) => {
    // 监听错误（可选）
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Browser Error]', msg.text());
      }
    });

    // 设置测试环境
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 打开聊天面板（如需要）
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore.useLayoutStore || layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
  });

  test('测试用例描述', async ({ page }) => {
    // 创建 mock 数据（如需要）
    await page.evaluate(() => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      mockFS.set('/test/file.txt', 'content');
    });

    // 获取动态配置
    const config = await getRealAIConfig(page);

    // 发送消息
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage(
        payload.text,
        payload.providerId,
        payload.modelId
      );
    }, { text: '测试提示词', providerId: config.providerId, modelId: config.modelId });

    // 等待响应
    await page.waitForTimeout(15000);

    // 验证结果
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);
  });
});
```

### 基础 UI 测试模板

```typescript
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup';

test.describe('UI 功能名称', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
  });

  test('UI 元素应该可见', async ({ page }) => {
    await expect(page.locator('[data-testid="element"]')).toBeVisible();
  });

  test('点击按钮应该触发操作', async ({ page }) => {
    await page.click('[data-testid="button"]');
    await expect(page.locator('[data-testid="result"]')).toContainText('Expected');
  });
});
```

---

## 🔍 LLM 生成测试时的检查清单

生成 E2E 测试前，LLM 必须：

- [ ] 使用 `./setup` 而不是 `./setup-utils`
- [ ] 使用 `getRealAIConfig(page)` 获取动态配置
- [ ] 使用 layoutStore 的安全访问模式
- [ ] 从模板文件复制而不是从头写
- [ ] 移除所有调试 console.log
- [ ] 使用 data-testid 选择器
- [ ] 设置合理的超时时间

---

## 🚨 常见错误示例

### 错误 1: 硬编码配置

```typescript
// ❌ 错误
await page.evaluate(async () => {
  const chatStore = (window as any).__chatStore;
  await chatStore.getState().sendMessage(msg, 'real-ai-e2e', 'deepseek-chat');
});

// ✅ 正确
const config = await getRealAIConfig(page);
await page.evaluate(async (payload) => {
  const chatStore = (window as any).__chatStore;
  await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
}, { text: msg, providerId: config.providerId, modelId: config.modelId });
```

### 错误 2: layoutStore 直接调用

```typescript
// ❌ 错误
await page.evaluate(() => {
  const layoutStore = (window as any).__layoutStore;
  layoutStore.getState().toggleChat();
});

// ✅ 正确
await page.evaluate(() => {
  const layoutStore = (window as any).__layoutStore;
  if (layoutStore) {
    const store = layoutStore.useLayoutStore || layoutStore;
    if (store && store.getState && store.getState().toggleChat) {
      store.getState().toggleChat();
    }
  }
});
```

### 错误 3: 过多调试代码

```typescript
// ❌ 错误
test('测试', async ({ page }) => {
  console.log('[Test] Starting...');
  const check1 = await page.evaluate(() => { /* ... */ });
  console.log('[Test] Check 1:', check1);
  const check2 = await page.evaluate(() => { /* ... */ });
  console.log('[Test] Check 2:', check2);
  // ... 更多调试代码
});

// ✅ 正确
test('测试', async ({ page }) => {
  // 仅在必要时监听错误
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[Browser Error]', msg.text());
    }
  });

  // 测试逻辑...
});
```

### 错误 4: Mock 文件系统路径错误

```typescript
// ❌ 错误 - agent_read_file 使用 rootPath/relPath 格式，默认 rootPath 为 /Users/mac/mock-project
await page.evaluate(() => {
  const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
  mockFS.set('/test-project/data.txt', 'content');  // AI 工具可能找不到
});

// ✅ 正确 - 使用实际工作空间路径
await page.evaluate(() => {
  const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
  mockFS.set('/Users/mac/mock-project/data.txt', 'content');
});
```

**说明**: AI 工具（`agent_read_file`, `agent_write_file`）使用 `rootPath/relPath` 格式访问文件。
- 默认 `rootPath` 为 `/Users/mac/mock-project`
- 创建文件时应使用完整路径或预期的工作空间路径

### 错误 5: 多步工作流测试过于复杂

```typescript
// ⚠️ 谨慎使用 - 多步工作流测试可能不稳定
test('AI 执行复杂工作流', async ({ page }) => {
  // 要求 AI 依次执行多个操作
  await sendMessage('读取 A，处理 B，创建 C');

  // 问题：AI 可能只执行部分操作
  expect(fileExists).toBe(true);  // 可能失败
});

// ✅ 推荐 - 拆分为多个简单测试
test('AI 能读取文件', async ({ page }) => {
  await sendMessage('读取 A.txt');
  // 验证读取结果
});

test('AI 能创建文件', async ({ page }) => {
  await sendMessage('创建 B.txt');
  // 验证文件创建
});
```

**说明**:
- 多步工作流测试依赖于 AI 模型的工具调用可靠性
- 不同 AI 模型表现不一致（moonshot-v1-8k-vision-preview 在复杂任务中可能只执行部分操作）
- 如需测试多步工作流，考虑使用 `test.skip()` 并添加说明

---

## 📚 相关文档

- [E2E 测试指南](./README.md)
- [真实 AI 测试模板](./templates/real-ai-test.template.spec.ts)
- [基础 E2E 测试模板](./templates/base-e2e-test.template.spec.ts)
- [环境配置说明](./.env.e2e.example)

---

## 🎯 快速参考

### 创建新测试的标准流程

1. **复制模板**:
   ```bash
   cp tests/e2e/templates/real-ai-test.template.spec.ts tests/e2e/your-test.spec.ts
   ```

2. **修改测试描述和用例**

3. **运行测试验证**:
   ```bash
   npm run test:e2e -- tests/e2e/your-test.spec.ts
   ```

### 导入语句标准

```typescript
// 所有测试必须使用以下导入
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from './setup';
```

### 标准的 beforeEach

```typescript
test.beforeEach(async ({ page }) => {
  await setupE2ETestEnvironment(page);
  await page.goto('/');
  await page.waitForTimeout(3000);
});
```

---

**版本**: v1.0
**最后更新**: 2026-01-16
**维护者**: E2E 测试团队
