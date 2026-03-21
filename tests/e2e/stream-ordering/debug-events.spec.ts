/**
 * E2E 调试：EventBus 事件追踪
 *
 * 验证 EventBus 事件是否正确触发
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('EventBus 事件调试', () => {
  test.beforeEach(async ({ page }) => {
    // 设置事件监听器来追踪 EventBus 事件
    await page.addInitScript(() => {
      (window as any).__E2E_EVENT_LOG__ = [];

      // 尝试监听 EventBus 事件
      const setupEventListeners = () => {
        const chatEventBus = (window as any).__GLOBAL_CHAT_EVENT_BUS__ ||
                             (window as any).chatEventBus;

        if (chatEventBus && chatEventBus.on) {
          console.log('[E2E] ✅ Found chatEventBus, setting up listeners');

          const events = [
            'chat:stream:start',
            'chat:stream:chunk',
            'chat:tool:call',
            'chat:segment:created',
            'chat:phase:changed'
          ];

          events.forEach(eventName => {
            chatEventBus.on(eventName, (payload: any) => {
              (window as any).__E2E_EVENT_LOG__.push({
                event: eventName,
                timestamp: Date.now(),
                payload: payload
              });
              console.log(`[E2E] 📡 Event: ${eventName}`, payload);
            });
          });
        } else {
          console.warn('[E2E] ⚠️ chatEventBus not found');
        }
      };

      // 延迟设置监听器，等待应用初始化
      setTimeout(setupEventListeners, 1000);
    });
  });

  test('追踪 EventBus 事件', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 等待聊天输入框可见
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 }).catch(async () => {
      await removeJoyrideOverlay(page);
      await page.waitForTimeout(1000);
      return page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
    });

    await removeJoyrideOverlay(page);

    // 清空事件日志
    await page.evaluate(() => {
      (window as any).__E2E_EVENT_LOG__ = [];
    });

    // 发送消息
    await page.fill('[data-testid="chat-input"]', '你好');
    await page.click('[data-testid="chat-send-button"]');

    // 等待响应
    await page.waitForTimeout(5000);

    // 获取事件日志
    const eventLog = await page.evaluate(() => {
      return (window as any).__E2E_EVENT_LOG__ || [];
    });

    console.log('\n=== EventBus Event Log ===');
    console.log(JSON.stringify(eventLog, null, 2));
    console.log('========================\n');

    // 检查是否有事件被触发
    expect(eventLog.length).toBeGreaterThan(0);

    // 检查特定事件
    const hasStreamStart = eventLog.some(e => e.event === 'chat:stream:start');
    console.log('Has chat:stream:start:', hasStreamStart);

    const hasChunk = eventLog.some(e => e.event === 'chat:stream:chunk');
    console.log('Has chat:stream:chunk:', hasChunk);

    const hasSegmentCreated = eventLog.some(e => e.event === 'chat:segment:created');
    console.log('Has chat:segment:created:', hasSegmentCreated);
  });

  test('检查 Store 中的 segments 字段', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 }).catch(async () => {
      await removeJoyrideOverlay(page);
      await page.waitForTimeout(1000);
      return page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
    });

    await removeJoyrideOverlay(page);

    // 发送消息
    await page.fill('[data-testid="chat-input"]', '测试');
    await page.click('[data-testid="chat-send-button"]');

    await page.waitForTimeout(3000);

    // 检查 Store 状态
    const storeInfo = await page.evaluate(() => {
      const store = (window as any).__chatStore;

      if (!store) {
        return { error: 'Store not found' };
      }

      const state = store.getState();
      const messages = state.messages || [];

      return {
        messagesCount: messages.length,
        lastMessage: messages[messages.length - 1],
        allMessageKeys: messages.map(m => ({
          id: m.id,
          role: m.role,
          hasSegments: !!m.segments,
          segmentsCount: m.segments?.length || 0
        }))
      };
    });

    console.log('\n=== Store Info ===');
    console.log(JSON.stringify(storeInfo, null, 2));
    console.log('=================\n');
  });
});
