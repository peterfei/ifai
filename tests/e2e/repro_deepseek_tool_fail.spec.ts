/**
 * Bug Reproduction Script: DeepSeek Tool Call Failure
 *
 * Scenario:
 * User asks DeepSeek model (e.g., deepseek-chat) to read a file (e.g., dev.log).
 * The model receives the request but fails to trigger the 'agent_read_file' tool,
 * resulting in a text-only response or silence regarding the file content.
 *
 * Expected Behavior:
 * The model should generate a tool_call, which the frontend executes, displaying the file content.
 *
 * @deprecated 请使用 tests/e2e/templates/real-ai-test.template.spec.ts 作为新测试的模板
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from './setup';

test.describe('Reproduction: DeepSeek Tool Call Failure', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // 监听浏览器控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[E2E') || text.includes('[Chat]')) {
        console.log('[Browser Console]', text);
      }
    });

    // 自动读取配置文件
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.reload();
    await page.waitForTimeout(3000);

    // 等待 stores 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore.useLayoutStore || layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
    await page.waitForTimeout(1000);
  });

  test('should invoke agent_read_file when asked to read a file', async ({ page }) => {
    // 创建 mock 文件
    const targetFileName = 'dev.log';
    const targetFileContent = 'Content of dev.log: [INFO] System initialized successfully. [WARN] Low memory.';
    const projectRoot = '/Users/mac/mock-project';

    await page.evaluate(({ fileName, content, rootPath }) => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFS) {
        const filePath = `${rootPath}/${fileName}`.replace(/\/\//g, '/');
        mockFS.set(filePath, content);
      }
    }, { fileName: targetFileName, content: targetFileContent, rootPath: projectRoot });

    // 获取动态配置
    const config = await getRealAIConfig(page);
    const prompt = `Read the content of ${targetFileName} file in the current directory`;

    // 发送消息
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
      }
    }, { text: prompt, providerId: config.providerId, modelId: config.modelId });

    // 等待 AI 响应
    await page.waitForTimeout(30000);

    // 验证结果
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    // 检查是否包含文件内容
    const contentFound = assistantMessages.some((msg: any) => {
      const content = msg.content || '';
      return content.includes(targetFileContent) || content.includes('[INFO] System initialized');
    });

    expect(contentFound, 'Expected file content to be displayed in chat').toBe(true);
  });

  test('should handle DeepSeek streaming tool calls (id: null chunks)', async ({ page }) => {
    // 创建 mock 文件
    const targetFileName = 'dev.log';
    const targetFileContent = 'DeepSeek streaming test: [INFO] System working!';
    const projectRoot = '/Users/mac/mock-project';

    await page.evaluate(({ fileName, content, rootPath }) => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFS) {
        const filePath = `${rootPath}/${fileName}`.replace(/\/\//g, '/');
        mockFS.set(filePath, content);
      }
    }, { fileName: targetFileName, content: targetFileContent, rootPath: projectRoot });

    // 获取动态配置
    const config = await getRealAIConfig(page);
    const prompt = `Read ${targetFileName}`;

    // 发送消息
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
      }
    }, { text: prompt, providerId: config.providerId, modelId: config.modelId });

    // 等待 AI 响应
    await page.waitForTimeout(30000);

    // 验证结果
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

    // 验证文件内容已显示
    const contentFound = assistantMessages.some((msg: any) => {
      const content = msg.content || '';
      return content.includes(targetFileContent) || content.includes('[INFO] System working!');
    });

    expect(contentFound, 'Expected file content to be displayed').toBe(true);
  });
});
