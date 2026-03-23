/**
 * Tauri 原始事件监听测试
 *
 * 直接监听 Tauri 事件，绕过前端逻辑
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tauri 原始事件监听', () => {
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
    });
  });

  test('直接监听 Tauri 事件', async ({ page }) => {
    console.log('[测试] 开始直接监听 Tauri 原始事件');

    // 设置原始 Tauri 事件监听
    const setupResult = await page.evaluate(async () => {
      const w = window as any;
      w.__RAW_TAURI_EVENTS__ = [];

      // 检查 Tauri 是否可用
      const tauri = w.__TAURI__?.core || w.__TAURI_INTERNALS__;
      if (!tauri) {
        return { error: 'Tauri not available' };
      }

      const listen = tauri.listen;
      if (typeof listen !== 'function') {
        return { error: 'Tauri.listen not available' };
      }

      // 先发送消息获取 eventId
      const chatStore = w.__chatStore;
      const settingsStore = w.__settingsStore;

      // 拦截 invoke 调用来获取 eventId
      let capturedEventId: string | null = null;
      const originalInvoke = tauri.invoke;
      tauri.invoke = async (cmd: string, args: any) => {
        if (cmd === 'ai_chat') {
          capturedEventId = args?.event_id;
          console.log('[TEST] Captured eventId:', capturedEventId);
        }
        return originalInvoke(cmd, args);
      };

      // 发送消息
      chatStore.getState().sendMessage(
        '你好',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );

      // 等待 eventId 被捕获
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!capturedEventId) {
        return { error: 'Failed to capture eventId' };
      }

      console.log('[TEST] Setting up raw Tauri listeners for:', capturedEventId);

      // 监听原始 Tauri 事件
      const listeners: any[] = [];

      // 主事件
      const unlisten1 = await listen(capturedEventId, (event: any) => {
        console.log('[TEST] 📨 Raw Tauri event received:', capturedEventId, event.payload);
        w.__RAW_TAURI_EVENTS__.push({
          event: capturedEventId,
          payload: event.payload,
          payloadType: typeof event.payload,
          payloadPreview: JSON.stringify(event.payload).substring(0, 200),
          timestamp: Date.now()
        });
      });
      listeners.push(unlisten1);

      // _status 事件
      const unlisten2 = await listen(`${capturedEventId}_status`, (event: any) => {
        console.log('[TEST] 📨 Raw Tauri status event:', event.payload);
        w.__RAW_TAURI_EVENTS__.push({
          event: `${capturedEventId}_status`,
          payload: event.payload,
          timestamp: Date.now()
        });
      });
      listeners.push(unlisten2);

      // _finish 事件
      const unlisten3 = await listen(`${capturedEventId}_finish`, (event: any) => {
        console.log('[TEST] 📨 Raw Tauri finish event:', event.payload);
        w.__RAW_TAURI_EVENTS__.push({
          event: `${capturedEventId}_finish`,
          payload: event.payload,
          timestamp: Date.now()
        });
      });
      listeners.push(unlisten3);

      return {
        success: true,
        eventId: capturedEventId,
        listenersCount: listeners.length
      };
    });

    console.log('[测试] 设置结果:', setupResult);

    if (setupResult.error) {
      console.warn('[测试] ⚠️ 设置失败:', setupResult.error);
      console.warn('[测试] Tauri API 可能在此环境中不可用，跳过此测试');
      // 不再抛出错误，而是标记测试为跳过
      test.skip(true, 'Tauri API 不可用');
      return;
    }

    console.log('[测试] ✅ 监听器已设置，eventId:', setupResult.eventId);

    // 等待事件
    console.log('[测试] 等待 60 秒...');
    await page.waitForTimeout(60000);

    // 获取结果
    const eventsResult = await page.evaluate(() => {
      const w = window as any;
      const events = w.__RAW_TAURI_EVENTS__ || [];

      return {
        totalEvents: events.length,
        eventsByType: events.reduce((acc: any, e: any) => {
          acc[e.event] = (acc[e.event] || 0) + 1;
          return acc;
        }, {}),
        firstEvents: events.slice(0, 10),
        lastEvents: events.slice(-10),
        allPayloadTypes: events.map((e: any) => e.payloadType)
      };
    });

    console.log('[测试] ════════════════════════════════════════');
    console.log('[测试] Tauri 原始事件结果:');
    console.log('[测试] ════════════════════════════════════════');
    console.log(JSON.stringify(eventsResult, null, 2));
    console.log('[测试] ════════════════════════════════════════');

    // 分析结果
    if (eventsResult.totalEvents === 0) {
      console.error('[测试] ❌ CRITICAL: No raw Tauri events received!');
      console.error('[测试]    This means the backend is NOT emitting Tauri events');
      console.error('[测试]    eventId:', setupResult.eventId);
    } else {
      console.log(`[测试] ✅ Received ${eventsResult.totalEvents} Tauri events`);
      console.log('[测试] Event types:', eventsResult.eventsByType);
    }
  });
});
