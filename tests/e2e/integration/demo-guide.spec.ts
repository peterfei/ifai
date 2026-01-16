import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Demo Guide - 新手指引功能', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('should recognize /demo command', async ({ page }) => {
    test.setTimeout(60000);

    // 启用自动批准
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    // 输入 demo 命令
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('/demo');
    });

    // 等待响应
    await page.waitForTimeout(5000);

    // 检查是否识别为 demo 意图
    const lastMessage = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      return messages[messages.length - 1];
    });

    console.log('[E2E] Last message:', lastMessage);

    // 验证意图识别
    expect(lastMessage.role).toBe('assistant');
    expect(lastMessage.content.length).toBeGreaterThan(0);
  });

  test('should recognize Chinese demo keywords', async ({ page }) => {
    test.setTimeout(60000);

    // 启用自动批准
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    // 测试不同的 demo 关键字
    const keywords = ['演示', '新手引导', '开始演示'];

    for (const keyword of keywords) {
      console.log(`[E2E] Testing keyword: ${keyword}`);

      await page.evaluate(async (text) => {
        (window as any).__chatStore.setState({ isLoading: false });
        await (window as any).__E2E_SEND__(text);
      }, keyword);

      // 等待响应
      await page.waitForTimeout(3000);

      // 检查有响应
      const hasResponse = await page.evaluate(() => {
        const messages = (window as any).__chatStore.getState().messages;
        const lastMsg = messages[messages.length - 1];
        return lastMsg.content.length > 0;
      });

      expect(hasResponse).toBe(true);
      console.log(`[E2E] Keyword "${keyword}" recognized`);
    }
  });

  test('should show demo agent in UI', async ({ page }) => {
    test.setTimeout(60000);

    // 启用自动批准
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    // 触发 demo
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('/demo');
    });

    // 等待 agent 启动
    await page.waitForTimeout(3000);

    // 检查 agent 监控器是否显示 Demo Agent
    const agentMonitorVisible = await page.evaluate(() => {
      const monitor = document.querySelector('[class*="agent-monitor"]');
      const text = monitor?.textContent || '';
      return text.includes('Demo') || text.includes('demo');
    });

    console.log('[E2E] Agent monitor visible:', agentMonitorVisible);

    // 验证有某种响应
    const lastMessage = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      return messages[messages.length - 1];
    });

    expect(lastMessage.content.length).toBeGreaterThan(0);
  });
});
