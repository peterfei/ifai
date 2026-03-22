/**
 * 流式事件追踪测试
 *
 * 追踪 chat:stream:chunk 事件是否被正确发射和接收
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('流式事件追踪', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true  // 使用真实 LLM
    });

    // 等待应用加载
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
    });
  });

  test('追踪流式事件发射', async ({ page }) => {
    console.log('[测试] 开始追踪流式事件');

    // 1. 设置事件监听来捕获所有事件
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
            deltaLength: payload.delta ? payload.delta.length : 0,
            isFinal: payload.isFinal
          });
        });
      };

      // 追踪所有关键事件
      traceEvent('chat:stream:start');
      traceEvent('chat:stream:chunk');
      traceEvent('chat:stream:finished');
      traceEvent('chat:message:sent');
      traceEvent('chat:segment:created');
      traceEvent('chat:segment:updated');
    });

    // 2. 发送消息
    console.log('[测试] 发送消息');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '你是谁',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 3. 等待流完成
    console.log('[测试] 等待流完成...');
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);

      const elapsed = i + 1;
      const check = await page.evaluate((elapsedSeconds: number) => {
        const w = window as any;
        const trace = w.__STREAM_EVENT_TRACE__ || [];
        const chatStore = w.__chatStore;
        const state = chatStore?.getState();
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        return {
          elapsedSeconds: elapsedSeconds,
          eventCount: trace.length,
          lastMessageContent: lastMessage?.content || '',
          lastMessageLength: (lastMessage?.content || '').length,
          isStreaming: lastMessage?.isStreaming,
          tracePreview: trace.slice(-5).map((t: any) => ({
            event: t.event,
            time: new Date(t.timestamp).toLocaleTimeString(),
            deltaLength: t.deltaLength
          }))
        };
      }, elapsed);

      console.log(`[测试] T+${check.elapsedSeconds}s:`, {
        eventCount: check.eventCount,
        contentLength: check.lastMessageLength,
        isStreaming: check.isStreaming,
        recentEvents: check.tracePreview
      });

      // 如果流完成且内容足够长，退出
      if (!check.isStreaming && check.lastMessageLength > 50) {
        console.log('[测试] 流完成且内容足够长');
        break;
      }
    }

    // 4. 获取完整的事件追踪
    const traceResult = await page.evaluate(() => {
      const w = window as any;
      const trace = w.__STREAM_EVENT_TRACE__ || [];
      const chatStore = w.__chatStore;
      const state = chatStore?.getState();
      const messages = state?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        totalEvents: trace.length,
        eventsByType: trace.reduce((acc: any, t: any) => {
          acc[t.event] = (acc[t.event] || 0) + 1;
          return acc;
        }, {}),
        lastMessage: {
          content: lastMessage?.content || '',
          contentLength: (lastMessage?.content || '').length,
          segmentsCount: (lastMessage?.segments || []).length,
          segments: (lastMessage?.segments || []).map((s: any) => ({
            type: s.type,
            order: s.order,
            contentLength: (s.content || '').length,
            contentPreview: (s.content || '').substring(0, 30)
          }))
        },
        fullTrace: trace.map((t: any) => ({
          event: t.event,
          time: new Date(t.timestamp).toLocaleTimeString(),
          correlationId: t.correlationId,
          deltaLength: t.deltaLength,
          deltaPreview: t.delta
        }))
      };
    });

    console.log('[测试] ════════════════════════════════════════');
    console.log('[测试] 事件追踪结果:');
    console.log('[测试] ════════════════════════════════════════');
    console.log(JSON.stringify(traceResult, null, 2));
    console.log('[测试] ════════════════════════════════════════');

    // 5. 分析结果
    if (traceResult.eventsByType['chat:stream:chunk'] === 0) {
      console.error('[测试] ❌ CRITICAL: No chat:stream:chunk events were emitted!');
      console.error('[测试]    This means StreamingResponseController is not emitting chunk events');
    }

    if (traceResult.lastMessage.contentLength === 0 && traceResult.lastMessage.segmentsCount > 0) {
      const segmentsTotalLength = traceResult.lastMessage.segments
        .filter((s: any) => s.type === 'text')
        .reduce((sum: number, s: any) => sum + s.contentLength, 0);

      if (segmentsTotalLength > 0) {
        console.error('[测试] ❌ Segments have content but message.content is empty!');
        console.error('[测试]    Total segments content length:', segmentsTotalLength);
        console.error('[测试]    Message content length:', traceResult.lastMessage.contentLength);
      }
    }

    console.log('[测试] ✅ 追踪完成');
  });
});
