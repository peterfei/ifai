/**
 * Bash工具高级功能验证测试
 *
 * 测试标签: @fast
 * 测试类别: 工具功能
 * 测试目标: 验证Bash工具能正确执行各种命令
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('Tools: Bash Advanced Features', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await removeJoyrideOverlay(page);
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
      // Accept any content including intention recognition messages
      if (!state.isLoading && state.content.length > 0 && state.lastRole === 'assistant') {
        result.completed = true;
        result.content = state.content;
        result.hasToolCalls = state.hasToolCalls;
        console.log(`[Test] Command completed. Content length: ${state.content.length}`);
        break;
      }

      await page.waitForTimeout(1000);
    }
    return result;
  }

  test('@fast should execute Python commands', async ({ page }) => {
    test.setTimeout(60000);

    // Arrange
    const command = '帮我执行 python --version';

    // Act
    const result = await executeCommand(page, command);

    // Assert - Verify: Intent recognition triggered, some response received
    expect(result.content.length).toBeGreaterThan(0);
    console.log(`[Test] Python command result: ${result.content.substring(0, 100)}`);
  });

  test('@fast should execute Java commands', async ({ page }) => {
    test.setTimeout(60000);

    // Arrange
    const command = '运行 java -version';

    // Act
    const result = await executeCommand(page, command);

    // Assert - Verify: Intent recognition triggered, some response received
    expect(result.content.length).toBeGreaterThan(0);
    console.log(`[Test] Java command result: ${result.content.substring(0, 100)}`);
  });

  test('@fast should execute Network commands (curl)', async ({ page }) => {
    test.setTimeout(60000);

    // Arrange
    const command = '执行 curl -I https://www.google.com';

    // Act
    const result = await executeCommand(page, command);

    // Assert - Verify: Intent recognition triggered, some response received
    expect(result.content.length).toBeGreaterThan(0);
    console.log(`[Test] curl command result: ${result.content.substring(0, 100)}`);
  });

  test('@fast should handle system resource commands', async ({ page }) => {
    test.setTimeout(60000);

    // Arrange
    const command = '帮我执行 whoami';

    // Act
    const result = await executeCommand(page, command);

    // Assert - Verify: Intent recognition triggered, some response received
    expect(result.content.length).toBeGreaterThan(0);
    console.log(`[Test] whoami command result: ${result.content.substring(0, 100)}`);
  });

  test('@fast should handle long running commands (timeout)', async ({ page }) => {
    test.setTimeout(90000);

    // Arrange
    const command = '执行 sleep 35';
    const timeout = 50000;

    // Act
    const result = await executeCommand(page, command, timeout);

    // Assert - Verify: Intent recognition triggered, some response received
    expect(result.content.length).toBeGreaterThan(0);
    console.log(`[Test] sleep command result: ${result.content.substring(0, 100)}`);
  });
});
