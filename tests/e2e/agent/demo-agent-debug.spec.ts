import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Demo Agent Debug - 调试 Demo Agent', () => {
  test('should diagnose demo agent execution', async ({ page }) => {
    test.setTimeout(120000);

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });

    // 启用自动批准和日志
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }

      // 添加详细日志
      const originalLog = console.log;
      console.log = (...args) => {
        originalLog('[Demo Debug]', ...args);
        (window as any).__demoLogs = (window as any).__demoLogs || [];
        (window as any).__demoLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
      };
    });

    console.log('[Test] Sending /demo command');

    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('/demo');
    });

    // 等待并监控执行过程
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);

      const state = await page.evaluate(() => {
        const store = (window as any).__chatStore.getState();
        const messages = store.messages;
        const lastMsg = messages[messages.length - 1];
        return {
          isLoading: store.isLoading,
          messageCount: messages.length,
          lastContent: lastMsg?.content || '',
          lastRole: lastMsg?.role,
          agentId: lastMsg?.agentId,
          isAgentLive: lastMsg?.isAgentLive,
          logs: (window as any).__demoLogs || []
        };
      });

      console.log(`[Test] Second ${i}: isLoading=${state.isLoading}, role=${state.lastRole}, contentLength=${state.lastContent.length}`);

      // 检查是否有错误
      if (state.lastContent.includes('error') || state.lastContent.includes('Error')) {
        console.log('[Test] ERROR DETECTED:', state.lastContent);
        console.log('[Test] Logs:', state.logs);
        break;
      }

      // 如果完成了
      if (!state.isLoading && state.lastContent.length > 100) {
        console.log('[Test] Agent execution completed');
        console.log('[Test] Final content:', state.lastContent);
        console.log('[Test] Logs:', state.logs);
        break;
      }

      // 超时保护
      if (i >= 59) {
        console.log('[Test] TIMEOUT - Agent did not complete in 60 seconds');
        console.log('[Test] Final state:', state);
        console.log('[Test] Logs:', state.logs);
      }
    }

    // 基本验证
    const finalState = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const messages = store.messages;
      const lastMsg = messages[messages.length - 1];
      return {
        messageCount: messages.length,
        lastContent: lastMsg?.content || '',
        agentId: lastMsg?.agentId
      };
    });

    console.log('[Test] Final state:', finalState);
    expect(finalState.messageCount).toBeGreaterThan(1);
  });
});
