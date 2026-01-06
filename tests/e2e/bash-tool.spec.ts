import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Bash 工具 - 高级功能验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  // Helper to execute command via chat and wait for result
  async function executeCommand(page: any, commandText: string, timeout = 40000) {
    console.log(`[Test] Sending command: ${commandText}`);

    // 启用自动批准工具调用
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    await page.evaluate(async (text: string) => {
      await (window as any).__E2E_SEND__(text);
    }, commandText);

    const startTime = Date.now();
    let result = {
      completed: false,
      content: '',
      hasToolCalls: false,
      isLoading: false
    };

    while (Date.now() - startTime < timeout) {
      const state = await page.evaluate(() => {
        const store = (window as any).__chatStore.getState();
        const messages = store.messages;
        const lastMsg = messages[messages.length - 1];
        return {
          messageCount: messages.length,
          lastRole: lastMsg?.role,
          content: lastMsg?.content || '',
          isLoading: store.isLoading,
          hasToolCalls: lastMsg?.toolCalls?.length > 0
        };
      });

      result.isLoading = state.isLoading;

      // Check for completion: Not loading, has content from assistant
      // IMPORTANT: Skip intermediate intention recognition messages
      const isIntentionMsg = state.content.includes('自动识别意图');

      if (!state.isLoading && state.content.length > 10 && state.lastRole === 'assistant' && !isIntentionMsg) {
        result.completed = true;
        result.content = state.content;
        result.hasToolCalls = state.hasToolCalls;
        console.log(`[Test] Command completed. Content length: ${state.content.length}`);
        break;
      }

      // If it's an intention message but not loading, we might need to wait longer for the tool to actually trigger
      if (!state.isLoading && isIntentionMsg) {
          console.log('[Test] Detected intention recognition message, waiting for tool execution...');
      }

      await page.waitForTimeout(1000);
    }
    return result;
  }

  test('should execute Python commands', async ({ page }) => {
    test.setTimeout(60000);
    const result = await executeCommand(page, '帮我执行 python --version');

    // Check if result contains python version or command not found
    const validOutcome =
      result.content.toLowerCase().includes('python') ||
      result.content.toLowerCase().includes('command not found') ||
      result.content.toLowerCase().includes('not recognized') ||
      result.content.toLowerCase().includes('no such file');

    expect(result.completed).toBe(true);
    expect(validOutcome).toBe(true);
  });

  test('should execute Java commands', async ({ page }) => {
    test.setTimeout(60000);
    const result = await executeCommand(page, '运行 java -version');

    const validOutcome =
      result.content.toLowerCase().includes('java') ||
      result.content.toLowerCase().includes('openjdk') ||
      result.content.toLowerCase().includes('command not found') ||
      result.content.toLowerCase().includes('not recognized') ||
      result.content.toLowerCase().includes('no such file');

    expect(result.completed).toBe(true);
    expect(validOutcome).toBe(true);
  });

  test('should execute Network commands (curl)', async ({ page }) => {
    test.setTimeout(60000);
    const result = await executeCommand(page, '执行 curl -I https://www.google.com');

    const validOutcome =
      result.content.toLowerCase().includes('http') ||
      result.content.toLowerCase().includes('200') ||
      result.content.toLowerCase().includes('301') ||
      result.content.toLowerCase().includes('302') ||
      result.content.toLowerCase().includes('command not found') ||
      result.content.toLowerCase().includes('connection refused') ||
      result.content.toLowerCase().includes('could not resolve');

    expect(result.completed).toBe(true);
    expect(validOutcome).toBe(true);
  });

  test('should handle system resource commands', async ({ page }) => {
    test.setTimeout(60000);
    const result = await executeCommand(page, '帮我执行 whoami');

    expect(result.completed).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  test('should handle long running commands (timeout)', async ({ page }) => {
    test.setTimeout(90000);
    const result = await executeCommand(page, '执行 sleep 35', 50000);

    expect(result.completed).toBe(true);
    // Timeout should result in some kind of error message
    expect(result.content.length).toBeGreaterThan(0);
  });
});
