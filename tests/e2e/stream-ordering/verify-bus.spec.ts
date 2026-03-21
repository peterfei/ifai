/**
 * E2E 调试：直接验证 ChatEventBus
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('直接验证 ChatEventBus', () => {
  test('检查 ChatEventBus 实例和事件', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 直接检查 ChatEventBus
    const busInfo = await page.evaluate(() => {
      const bus = (window as any).__GLOBAL_CHAT_EVENT_BUS__;
      return {
        busExists: !!bus,
        busHasOn: typeof bus?.on === 'function',
        busHasEmit: typeof bus?.emit === 'function',
        busKeys: bus ? Object.keys(bus) : []
      };
    });

    console.log('ChatEventBus Info:', JSON.stringify(busInfo, null, 2));
    expect(busInfo.busExists).toBe(true);
  });

  test('手动触发和监听事件', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 手动触发测试事件
    const testResult = await page.evaluate(() => {
      const bus = (window as any).__GLOBAL_CHAT_EVENT_BUS__;

      if (!bus) {
        return { error: 'No bus found' };
      }

      let received = false;

      // 监听测试事件
      bus.on('test:event', (payload: any) => {
        received = true;
        console.log('Received test:event', payload);
      });

      // 触发测试事件
      bus.emit('test:event', { test: 'data', timestamp: Date.now() });

      return { success: true, received };
    });

    console.log('Test Result:', JSON.stringify(testResult, null, 2));
    expect(testResult.success).toBe(true);
  });

  test('检查 StreamingResponseController 是否触发事件', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 }).catch(async () => {
      await removeJoyrideOverlay(page);
      await page.waitForTimeout(1000);
      return page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
    });

    // 在页面上下文中设置全局监听器
    await page.evaluate(() => {
      (window as any).__E2E_STREAM_EVENTS__ = [];

      const bus = (window as any).__GLOBAL_CHAT_EVENT_BUS__;
      if (bus) {
        const events = ['chat:stream:start', 'chat:stream:chunk', 'chat:tool:call', 'chat:stream:finished'];

        events.forEach(eventName => {
          bus.on(eventName, (payload: any) => {
            console.log('[E2E Stream] Event:', eventName, payload);
            (window as any).__E2E_STREAM_EVENTS__.push({
              event: eventName,
              timestamp: Date.now(),
              payload: payload
            });
          });
        });

        console.log('[E2E] Listeners registered for:', events);
      }
    });

    await removeJoyrideOverlay(page);

    // 发送消息
    await page.fill('[data-testid="chat-input"]', '测试事件');
    await page.click('[data-testid="chat-send-button"]');

    // 等待响应
    await page.waitForTimeout(5000);

    // 获取事件日志
    const streamEvents = await page.evaluate(() => {
      return (window as any).__E2E_STREAM_EVENTS__ || [];
    });

    console.log('\n=== Stream Events ===');
    console.log(JSON.stringify(streamEvents, null, 2));
    console.log('=====================\n');

    // 至少应该有 stream:start 事件
    const hasStreamStart = streamEvents.some(e => e.event === 'chat:stream:start');
    console.log('Has chat:stream:start:', hasStreamStart);
  });
});
