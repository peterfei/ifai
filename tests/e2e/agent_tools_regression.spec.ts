/**
 * Agent Tools Regression Test Suite
 *
 * Tests all agent tools to ensure the fix for DeepSeek streaming behavior
 * (id: null parameter chunks) works correctly across all tools.
 *
 * @deprecated 请使用 tests/e2e/templates/real-ai-test.template.spec.ts 作为新测试的模板
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from './setup';

test.describe('Agent Tools Regression Tests', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // 监听浏览器控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[E2E') || text.includes('[Chat]')) {
        console.log(`[Browser Console] [${msg.type()}] ${text}`);
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
        const store = layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
    await page.waitForTimeout(1000);
  });

  // 辅助函数：创建 mock 文件
  async function createMockFiles(page: any, files: Record<string, string>) {
    await page.evaluate((fileMap) => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFS) {
        Object.entries(fileMap).forEach(([path, content]) => {
          mockFS.set(path, content);
        });
      }
    }, files);
  }

  // 辅助函数：验证工具调用结果
  async function verifyToolCallResult(page: any, expectedContent: string[]) {
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

    const contentFound = assistantMessages.some((msg: any) => {
      const content = msg.content || '';
      return expectedContent.some(expected => content.includes(expected));
    });

    expect(contentFound, `Expected content not found in any assistant message`).toBe(true);
    return contentFound;
  }

  // 辅助函数：发送消息给 AI
  async function sendMessage(page: any, prompt: string) {
    const config = await getRealAIConfig(page);
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
      }
    }, { text: prompt, providerId: config.providerId, modelId: config.modelId });
  }

  test('agent_read_file', async ({ page }) => {
    await createMockFiles(page, {
      '/Users/mac/mock-project/test.txt': 'Test file content for agent_read_file'
    });

    await sendMessage(page, 'Please read the content of test.txt file');
    await page.waitForTimeout(35000);

    await verifyToolCallResult(page, ['Test file content', 'test.txt']);
  });

  test('agent_write_file', async ({ page }) => {
    await sendMessage(page, 'Please write "Hello World" to hello.txt');
    await page.waitForTimeout(35000);

    await verifyToolCallResult(page, ['hello.txt', 'Hello World']);
  });

  test('agent_list_dir', async ({ page }) => {
    await sendMessage(page, 'Please list files in the current directory');
    await page.waitForTimeout(35000);

    await verifyToolCallResult(page, ['src/', 'tests/', 'package.json']);
  });

  test('agent_delete_file', async ({ page }) => {
    await createMockFiles(page, {
      '/Users/mac/mock-project/to_delete.txt': 'This file will be deleted'
    });

    await sendMessage(page, 'Please delete to_delete.txt');
    await page.waitForTimeout(35000);

    await verifyToolCallResult(page, ['to_delete.txt', 'deleted']);
  });

  test('agent_read_file_range', async ({ page }) => {
    await createMockFiles(page, {
      '/Users/mac/mock-project/multiline.txt': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
    });

    await sendMessage(page, 'Please read lines 2-4 from multiline.txt');
    await page.waitForTimeout(35000);

    await verifyToolCallResult(page, ['Line 2', 'Line 3', 'Line 4']);
  });

  test('patchedGenerateResponse multi-round tool calls (运行vite)', async ({ page }) => {
    test.setTimeout(90000);

    await createMockFiles(page, {
      '/Users/mac/mock-project/package.json': JSON.stringify({
        name: "demo-project",
        scripts: { dev: "vite", build: "vite build" }
      }, null, 2),
      '/Users/mac/mock-project/vite.config.ts': 'export default defineConfig({})'
    });

    // 这个测试还原用户场景："运行vite" -> AI 先列出目录，然后读取 package.json
    await sendMessage(page, '运行vite');
    await page.waitForTimeout(50000);

    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const content = lastMessage?.content || '';

    // 验证响应包含项目相关信息
    const hasRelevantInfo = content.length > 20 && (
      content.includes('vite') ||
      content.includes('package') ||
      content.includes('运行') ||
      content.includes('scripts') ||
      content.includes('package.json')
    );

    expect(hasRelevantInfo, 'Expected final response to contain relevant project info').toBe(true);
  });
});
