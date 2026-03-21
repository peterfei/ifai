/**
 * E2E 调试：直接测试 StreamingResponseController
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('直接测试 StreamingResponseController', () => {
  test('直接调用 startListening 并验证事件', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 直接调用 StreamingResponseController
    const testResult = await page.evaluate(async () => {
      const { streamingResponseController } = await import('./src/services/chat/StreamingResponseController');

      // 设置事件监听器
      const events: any[] = [];
      const bus = (window as any).__GLOBAL_CHAT_EVENT_BUS__;

      if (!bus) {
        return { error: 'No bus found' };
      }

      bus.on('chat:stream:start', (payload: any) => {
        console.log('[Test] Received chat:stream:start', payload);
        events.push({ event: 'chat:stream:start', payload });
      });

      // 生成一个测试用的 correlationId
      const correlationId = 'test-' + Date.now();

      try {
        // 调用 startListening
        await streamingResponseController.startListening(correlationId, {
          correlationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });

        // 等待一下让事件触发
        await new Promise(resolve => setTimeout(resolve, 100));

        return {
          success: true,
          eventsReceived: events.length,
          events: events
        };
      } catch (error) {
        return {
          success: false,
          error: String(error)
        };
      }
    });

    console.log('Test Result:', JSON.stringify(testResult, null, 2));
    expect(testResult.success).toBe(true);
  });

  test('检查 StreamingResponseController 实例', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    const controllerInfo = await page.evaluate(async () => {
      try {
        const module = await import('./src/services/chat/StreamingResponseController');
        const controller = module.streamingResponseController;

        return {
          moduleExists: !!module,
          controllerExists: !!controller,
          controllerType: typeof controller,
          hasStartListening: typeof controller?.startListening === 'function',
          hasInitSession: typeof controller?.initSession === 'function',
          controllerKeys: controller ? Object.keys(controller) : []
        };
      } catch (error) {
        return {
          error: String(error)
        };
      }
    });

    console.log('Controller Info:', JSON.stringify(controllerInfo, null, 2));
    expect(controllerInfo.controllerExists).toBe(true);
  });
});
