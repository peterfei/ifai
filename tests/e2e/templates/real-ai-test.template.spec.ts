/**
 * 真实 AI 测试模板
 *
 * 基于 v0.2.9 成功模式，简洁清晰，易于维护
 *
 * 使用说明：
 * 1. 复制此文件到 tests/e2e/ 目录
 * 2. 修改 test.describe 和测试用例
 * 3. 配置 .env.e2e.local 文件（参考 .env.e2e.example）
 *
 * 配置方式（3选1）：
 *
 * 1. **推荐：使用配置文件**
 *    ```bash
 *    cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e.local
 *    # 编辑 .env.e2e.local 填写你的 API Key
 *    ```
 *
 * 2. 使用环境变量
 *    ```bash
 *    export E2E_AI_API_KEY="your-api-key"
 *    export E2E_AI_BASE_URL="https://api.deepseek.com"
 *    export E2E_AI_MODEL="deepseek-chat"
 *    ```
 *
 * 3. 在测试代码中直接配置（不推荐，会暴露密钥）
 *
 * 运行测试：
 * ```bash
 * npm run test:e2e -- tests/e2e/your-test.spec.ts
 * ```
 *
 * 如果没有配置 API Key，测试将被自动跳过。
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';

test.describe('真实AI测试模板', () => {
  test.beforeEach(async ({ page }) => {
    // 监听浏览器控制台日志（可选，用于调试）
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[E2E') || text.includes('[Chat]')) {
        console.log('[Browser Console]', text);
      }
    });

    // 🔥 使用配置文件或环境变量
    // 优先级：环境变量 > .env.e2e.local 文件
    await setupE2ETestEnvironment(page);

    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);
  });

  test('测试用例模板：AI理解指令并执行工具调用', async ({ page }) => {
    // Given: 设置测试数据（如需要）
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      const fileStore = (window as any).__fileStore;

      // 创建测试文件
      mockFS.set('/test-project/test.txt', 'Test content');

      // 建立文件树
      const currentTree = fileStore.getState().fileTree || { children: [] };
      const testProject = {
        id: 'test-project',
        name: 'test-project',
        kind: 'directory',
        path: '/test-project',
        children: [
          {
            id: 'test-txt',
            name: 'test.txt',
            kind: 'file',
            path: '/test-project/test.txt'
          }
        ]
      };

      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), testProject]
      });

      // 打开文件（如需要）
      const editorStore = (window as any).__editorStore;
      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/test.txt');
      }
    });

    await page.waitForTimeout(1000);

    // When: 发送消息给 AI
    // 🔥 使用 getRealAIConfig 获取动态配置
    const config = await getRealAIConfig(page);
    const prompt = '请读取 test.txt 文件的内容';

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, { text: prompt, providerId: config.providerId, modelId: config.modelId });

    // 等待 AI 响应
    await page.waitForTimeout(15000);

    // Then: 验证结果
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    const lastResponse = assistantMessages[assistantMessages.length - 1].content.toLowerCase();

    // 验证 AI 执行了工具调用并返回了正确结果
    expect(lastResponse).toMatch(/test content|test\.txt/);
  });

  // 可以添加更多测试用例...
});

/**
 * 快速参考：常见测试模式
 */

// 模式1：简单对话测试
test('简单对话测试', async ({ page }) => {
  const config = await getRealAIConfig(page);
  await page.evaluate(async (payload) => {
    const chatStore = (window as any).__chatStore;
    await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
  }, { text: '你好，请介绍一下你自己', providerId: config.providerId, modelId: config.modelId });

  await page.waitForTimeout(10000);

  const messages = await page.evaluate(() => {
    const chatStore = (window as any).__chatStore;
    return chatStore ? chatStore.getState().messages : [];
  });

  const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
  expect(assistantMessages.length).toBeGreaterThan(0);
});

// 模式2：工具调用测试
test('工具调用测试：读取文件', async ({ page }) => {
  // 1. 创建 mock 文件
  await page.evaluate(() => {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    mockFS.set('/test-project/example.txt', 'Hello World');
  });

  // 2. 发送请求
  const config = await getRealAIConfig(page);
  await page.evaluate(async (payload) => {
    const chatStore = (window as any).__chatStore;
    await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
  }, { text: '请读取 example.txt', providerId: config.providerId, modelId: config.modelId });

  await page.waitForTimeout(15000);

  // 3. 验证结果
  const messages = await page.evaluate(() => {
    const chatStore = (window as any).__chatStore;
    return chatStore ? chatStore.getState().messages : [];
  });

  const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
  const content = assistantMessages[assistantMessages.length - 1].content;

  expect(content).toMatch(/Hello World|example\.txt/);
});

// 模式3：多轮对话测试
test('多轮对话测试', async ({ page }) => {
  const config = await getRealAIConfig(page);

  // 第一轮
  await page.evaluate(async (payload) => {
    const chatStore = (window as any).__chatStore;
    await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
  }, { text: '创建一个名为 hello.txt 的文件，内容为 Hello', providerId: config.providerId, modelId: config.modelId });

  await page.waitForTimeout(15000);

  // 第二轮
  await page.evaluate(async (payload) => {
    const chatStore = (window as any).__chatStore;
    await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
  }, { text: '现在读取 hello.txt 的内容', providerId: config.providerId, modelId: config.modelId });

  await page.waitForTimeout(15000);

  // 验证最终结果
  const messages = await page.evaluate(() => {
    const chatStore = (window as any).__chatStore;
    return chatStore ? chatStore.getState().messages : [];
  });

  const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
  const lastContent = assistantMessages[assistantMessages.length - 1].content;

  expect(lastContent).toMatch(/Hello/);
});
