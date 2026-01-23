# E2E测试快速参考指南

> **🚨 强制性规范**: 在创建或修改任何 E2E 测试之前，**必须**阅读并遵守 [E2E 测试编码规范标准](./CODING_STANDARDS.md)。这是项目强制性要求，所有 LLM 生成代码时都必须遵守此标准。

## 📚 目录

- [强制性规范](#强制性规范) ⚠️
- [快速开始](#快速开始)
- [Setup 模块 (新增)](#setup-模块-新增)
- [测试模板](#测试模板)
- [辅助工具](#辅助工具)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 🚨 强制性规范 ⚠️

### 创建新测试时必须遵守：

1. **从模板复制，不要从头写**:
   ```bash
   cp tests/e2e/templates/real-ai-test.template.spec.ts tests/e2e/your-test.spec.ts
   ```

2. **使用正确的导入**:
   ```typescript
   import { setupE2ETestEnvironment, getRealAIConfig } from './setup';
   // ❌ 禁止: import from './setup-utils'
   ```

3. **使用动态配置**:
   ```typescript
   const config = await getRealAIConfig(page);
   // ❌ 禁止: 硬编码 'real-ai-e2e', 'deepseek-chat'
   ```

4. **禁止大量调试代码**:
   - 不要添加 `console.log('[Test] 🔍 ...')` 等调试代码
   - 保持测试代码简洁

**完整规范请参阅**: [CODING_STANDARDS.md](./CODING_STANDARDS.md)

---

## 🚀 快速开始

### 运行测试

```bash
# 运行所有E2E测试
npm run test:e2e

# 运行快速测试（开发时使用）
npm run test:e2e:fast

# 运行特定测试文件
npx playwright test tests/e2e/chat/ai-chat-reply.spec.ts

# 调试模式（浏览器保持打开）
npx playwright test --debug

# 查看测试报告
npx playwright show-report
```

### 创建新测试

1. 复制测试模板：
```bash
cp tests/e2e/templates/feature-test.template.spec.ts tests/e2e/chat/my-feature.spec.ts
```

2. 替换模板中的占位符：
- `[功能名称]` → 你的功能名称
- `[期望行为]` → 具体的测试场景

3. 运行测试：
```bash
npx playwright test tests/e2e/chat/my-feature.spec.ts
```

---

## 🔧 Setup 模块 (新增)

### 概述

新的 `setup/` 模块提供了模块化的 E2E 测试设置功能，支持动态配置和更好的可维护性。

### 目录结构

```
tests/e2e/
├── setup/
│   ├── index.ts              # 统一导出接口（推荐使用）
│   └── env-config.ts         # 环境配置加载
├── templates/
│   ├── real-ai-test.template.spec.ts  # 真实AI测试模板
│   └── base-e2e-test.template.spec.ts # 基础E2E测试模板
├── setup-utils.ts            # 向后兼容（已废弃）
└── .env.e2e.local            # 本地配置（不提交）
```

### 使用方法

**推荐方式**：使用新的 `setup` 模块

```typescript
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from './setup';

test.describe('你的测试', () => {
  test.beforeEach(async ({ page }) => {
    // 自动读取配置文件
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
  });

  test('测试用例', async ({ page }) => {
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
    }, { text: '你的提示词', providerId: config.providerId, modelId: config.modelId });

    // 验证结果
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    expect(messages.filter((m: any) => m.role === 'assistant').length).toBeGreaterThan(0);
  });
});
```

### 配置方式

创建 `.env.e2e.local` 文件：

```bash
# 真实 AI 配置
E2E_AI_API_KEY=your-api-key-here
E2E_AI_BASE_URL=https://api.deepseek.com
E2E_AI_MODEL=deepseek-chat

# 可选：自定义 provider 和 model ID
E2E_AI_PROVIDER_ID=real-ai-e2e
E2E_AI_MODEL_ID=deepseek-chat
```

### 迁移指南

**旧代码**：

```typescript
import { setupE2ETestEnvironment } from './setup-utils';

// 手动加载配置
const envConfig = loadEnvConfig('.env.e2e.local');
const apiKey = envConfig.E2E_AI_API_KEY;

await setupE2ETestEnvironment(page, {
  useRealAI: true,
  realAIApiKey: apiKey,
  // ...
});
```

**新代码**：

```typescript
import { setupE2ETestEnvironment, getRealAIConfig } from './setup';

// 自动读取配置
await setupE2ETestEnvironment(page);

// 获取动态配置
const config = await getRealAIConfig(page);
```

---

## 📋 测试模板

### 功能测试模板

适用于测试完整的功能流程。

**位置**：`tests/e2e/templates/feature-test.template.spec.ts`

**使用场景**：
- 用户交互流程
- 多步骤操作
- 跨组件功能

### 组件测试模板

适用于测试单个UI组件。

**位置**：`tests/e2e/templates/component-test.template.spec.ts`

**使用场景**：
- 单一组件行为
- 状态变化
- 用户交互

---

## 🛠️ 辅助工具

### 等待函数 (`wait-helpers.ts`)

```typescript
import { waitForChatReady, waitForEditorReady, waitForAgentComplete } from '../helpers';

// 等待聊天就绪
await waitForChatReady(page);

// 等待编辑器就绪
await waitForEditorReady(page);

// 等待Agent完成
await waitForAgentComplete(page);

// 等待特定消息
await waitForMessage(page, 'Hello');

// 等待加载完成
await waitForLoading(page);
```

### 断言函数 (`assert-helpers.ts`)

```typescript
import {
  assertMessageContent,
  assertEditorState,
  assertVisible,
  assertText
} from '../helpers';

// 断言消息内容
await assertMessageContent(page, 'expected text');

// 断言编辑器状态
await assertEditorState(page, {
  content: 'Hello World',
  readOnly: false
});

// 断言元素可见
await assertVisible(page.locator('.my-element'), true);

// 断言文本内容
await assertText(page.locator('.title'), 'Expected Title');
```

### 数据生成器 (`data-generators.ts`)

```typescript
import {
  createMockThread,
  createMockMessage,
  createMockFile,
  mockData
} from '../helpers';

// 创建模拟线程
const thread = createMockThread({
  title: 'Test Thread'
});

// 创建模拟消息
const message = createMockMessage({
  role: 'user',
  content: { Text: 'Hello' }
});

// 创建模拟文件
const file = createMockFile({
  name: 'test.ts',
  content: 'export default 42;'
});

// 使用便捷导出
const conversation = mockData.conversation(3);
```

### Fixtures (`fixtures/`)

```typescript
import {
  setupChatTest,
  setupChatTestWithMessages,
  sendTestMessage
} from '../fixtures/chat.fixture';

// 设置聊天测试
const { page } = await setupChatTest(page);

// 设置带预设消息的测试
const { page } = await setupChatTestWithMessages(page, [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
]);

// 发送测试消息
await sendTestMessage(page, 'Test message');
```

---

## ✅ 最佳实践

### 1. 测试命名

**✅ 好的命名**：
```typescript
test('should save file when clicking save button', async () => { ... });
test('should display error message for invalid input', async () => { ... });
```

**❌ 不好的命名**：
```typescript
test('test1', async () => { ... });
test('it works', async () => { ... });
```

### 2. 元素定位

**✅ 优先使用 data-testid**：
```typescript
page.locator('[data-testid="submit-button"]')
```

**⚠️ 谨慎使用CSS选择器**：
```typescript
page.locator('button.btn-primary') // 可能因样式变化而失效
```

**❌ 避免使用文本选择器**：
```typescript
page.locator('text=Submit') // 多语言支持问题
```

### 3. 等待策略

**✅ 等待特定状态**：
```typescript
await page.waitForSelector(selector, { state: 'visible' });
```

**❌ 避免固定等待**：
```typescript
await page.waitForTimeout(5000); // 浪费时间且不稳定
```

### 4. 测试结构

使用 AAA 模式（Arrange-Act-Assert）：

```typescript
test('should update user profile', async ({ page }) => {
  // Arrange - 准备
  const userData = { name: 'John', email: 'john@example.com' };

  // Act - 执行
  await page.fill('[data-testid="name-input"]', userData.name);
  await page.click('[data-testid="save-button"]');

  // Assert - 验证
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
});
```

### 5. 测试独立性

每个测试应该独立运行：

```typescript
test.beforeEach(async ({ page }) => {
  // 每个测试前重置状态
  await setupE2ETestEnvironment(page);
  await clearAllData(page);
});
```

### 6. 测试标签

使用标签对测试分类：

```typescript
test('@fast should validate input', async () => { ... });
test('@medium should load file', async () => { ... });
test('@slow should complete workflow', async () => { ... });
test('@regression should fix bug-123', async () => { ... });
test('@tauri should verify real backend behavior', async () => { ... });

// 组合多个标签
test('@regression @tauri should verify streaming with real backend', async () => { ... });
```

**可用标签说明**:

| 标签 | 运行命令 | 说明 |
|------|----------|------|
| `@fast` | `npm run test:e2e:fast` | 快速测试（< 5秒） |
| `@medium` | `npm run test:e2e:medium` | 中等速度测试（5-30秒） |
| `@slow` | `npm run test:e2e:slow` | 慢速测试（> 30秒） |
| `@regression` | `npm run test:e2e:regression` | 回归测试（Bug 修复验证） |
| `@tauri` | `npm run test:e2e:tauri` | 需要真实 Tauri 后端 |

---

## 🔍 常见问题

### Q: 测试不稳定，时好时坏？

**A**: Flaky测试通常由以下原因引起：
- 不正确的等待策略 → 使用明确的等待条件
- 竞态条件 → 确保操作顺序
- 外部依赖 → 使用Mock隔离

### Q: 测试运行太慢？

**A**: 优化策略：
- 使用 `@fast` 标签，开发时只运行快速测试
- 减少不必要的等待
- 并行执行测试
- 使用fixture共享设置

### Q: 如何测试第三方组件？

**A**:
- 优先测试行为而非实现细节
- 使用 `data-testid` 标记测试点
- 如果可能，包装第三方组件添加测试钩子

### Q: 如何调试测试？

**A**:
```bash
# 调试模式
npx playwright test --debug

# 查看 traces
npx playwright show-trace test-results/[test-name]/trace.zip

# 截图和视频
# 配置中已启用，失败时自动保存
```

### Q: 如何测试异步操作？

**A**:
```typescript
// 等待网络请求
await page.waitForResponse(response => response.url().includes('/api/data'));

// 等待UI更新
await page.waitForSelector('[data-testid="result"]', { state: 'visible' });

// 等待状态变化
await page.waitForFunction(() => {
  return (window as any).__store?.getState().isLoaded === true;
});
```

---

## 📖 延伸阅读

- [Playwright官方文档](https://playwright.dev)
- [测试最佳实践指南](../../openspec/changes/add-e2e-driven-development/design.md)
- [TDD工作流指南](../../openspec/changes/add-e2e-driven-development/tasks.md)

---

## 💡 提示

- 从小开始，逐步扩展
- 保持测试简单和可读
- 定期重构测试代码
- 关注测试的价值，而非覆盖率数字
- 让测试成为开发流程的一部分，而非负担
