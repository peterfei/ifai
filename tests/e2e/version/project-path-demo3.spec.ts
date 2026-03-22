/**
 * 特定项目路径测试 - /Users/mac/project/demo/demo3
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('特定项目路径测试', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.waitForTimeout(3000);

    // 配置 AI Provider
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        const fileConfig = (window as any).__E2E_REAL_AI_CONFIG__;
        if (fileConfig && fileConfig.realAIApiKey) {
          settingsStore.getState().updateProviderConfig('zhipu', {
            apiKey: fileConfig.realAIApiKey,
            baseUrl: fileConfig.realAIBaseUrl || 'https://open.bigmodel.cn/api/paas/v4'
          });
        }
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4');
      }

      // 🔥 设置测试项目路径
      const fileStore = (window as any).__fileStore;
      if (fileStore) {
        fileStore.getState().setRootPath('/Users/mac/project/demo/demo3');
        console.log('[TEST] ✅ Set project root to: /Users/mac/project/demo/demo3');
      }
    });
  });

  test('在 demo3 项目路径下测试流式响应', async ({ page }) => {
    console.log('[测试] 在 /Users/mac/project/demo/demo3 路径下测试');

    // 设置事件追踪
    await page.evaluate(() => {
      const w = window as any;
      w.__STREAM_EVENT_TRACE__ = [];

      const traceEvent = (eventName: string) => {
        const chatEventBus = w.__chatEventBus;
        if (!chatEventBus) return;

        chatEventBus.on(eventName, (payload: any) => {
          w.__STREAM_EVENT_TRACE__.push({
            event: eventName,
            timestamp: Date.now(),
            correlationId: payload.correlationId,
            delta: payload.delta ? payload.delta.substring(0, 20) : null,
            deltaLength: payload.delta ? payload.delta.length : 0
          });
        });
      };

      traceEvent('chat:stream:start');
      traceEvent('chat:stream:chunk');
      traceEvent('chat:stream:finished');
    });

    // 发送"你是谁"问题
    console.log('[测试] 发送"你是谁"');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '你是谁',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 监控 30 秒
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);

      const check = await page.evaluate((elapsed: number) => {
        const w = window as any;
        const trace = w.__STREAM_EVENT_TRACE__ || [];
        const chatStore = w.__chatStore;
        const state = chatStore?.getState();
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        return {
          elapsedSeconds: elapsed,
          eventCount: trace.length,
          contentLength: (lastMessage?.content || '').length,
          content: (lastMessage?.content || '').substring(0, 50),
          isStreaming: lastMessage?.isStreaming,
          traceSummary: trace.reduce((acc: any, t: any) => {
            acc[t.event] = (acc[t.event] || 0) + 1;
            return acc;
          }, {})
        };
      }, i + 1);

      console.log(`[测试] T+${check.elapsedSeconds}s:`, {
        eventCount: check.eventCount,
        contentLength: check.contentLength,
        content: check.content,
        isStreaming: check.isStreaming,
        traceSummary: check.traceSummary
      });

      // 如果有内容了，提前结束
      if (check.contentLength > 20 && !check.isStreaming) {
        console.log('[测试] ✅ 收到完整内容');
        break;
      }
    }

    // 最终结果
    const finalResult = await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;
      const state = chatStore?.getState();
      const messages = state?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        content: lastMessage?.content || '',
        contentLength: (lastMessage?.content || '').length,
        segmentsCount: (lastMessage?.segments || []).length
      };
    });

    console.log('[测试] 最终结果:');
    console.log('  - 内容长度:', finalResult.contentLength);
    console.log('  - 内容预览:', finalResult.content.substring(0, 100));

    if (finalResult.contentLength === 0) {
      console.error('[测试] ❌ BUG CONFIRMED: 内容长度为 0！');
    }

    expect(finalResult.contentLength).toBeGreaterThan(20);
  });
});
