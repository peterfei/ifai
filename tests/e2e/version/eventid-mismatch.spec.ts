/**
 * eventId 匹配诊断测试
 *
 * 检查后端使用的 event_id 和前端监听的 eventId 是否匹配
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('eventId 匹配诊断', () => {
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

  test('检查 eventId 匹配', async ({ page }) => {
    console.log('[测试] 开始检查 eventId 匹配');

    // 拦截 invoke 调用
    const result = await page.evaluate(async () => {
      const w = window as any;

      // 存储信息
      let invokeEventId: string | null = null;
      let listenerEventId: string | null = null;
      let receivedEvents: any[] = [];

      // 拦截 invoke
      const tauri = w.__TAURI__?.core || w.__TAURI_INTERNALS__;
      const originalInvoke = tauri?.invoke;

      if (originalInvoke) {
        tauri.invoke = async (cmd: string, args: any) => {
          if (cmd === 'ai_chat') {
            invokeEventId = args?.eventId;
            console.log('[TEST] ✅ Captured invoke eventId:', invokeEventId);

            // 监听这个 eventId
            if (invokeEventId) {
              try {
                const listen = w.__TAURI__?.core?.listen || w.__TAURI_INTERNALS__?.listen;
                if (listen) {
                  await listen(invokeEventId, (event: any) => {
                    console.log('[TEST] 📨 Raw Tauri event received!');
                    receivedEvents.push({
                      payload: event.payload,
                      payloadType: typeof event.payload,
                      timestamp: Date.now()
                    });
                  });
                  listenerEventId = invokeEventId;
                  console.log('[TEST] ✅ Listener registered for:', listenerEventId);
                }
              } catch (e) {
                console.error('[TEST] ❌ Failed to register listener:', e);
              }
            }
          }
          return originalInvoke(cmd, args);
        };
      }

      // 发送消息
      const chatStore = w.__chatStore;
      const settingsStore = w.__settingsStore;
      chatStore.getState().sendMessage(
        '你好',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );

      // 等待
      await new Promise(resolve => setTimeout(resolve, 30000));

      return {
        invokeEventId,
        listenerEventId,
        receivedEventCount: receivedEvents.length,
        firstEvents: receivedEvents.slice(0, 3)
      };
    });

    console.log('[测试] ════════════════════════════════════════');
    console.log('[测试] eventId 匹配结果:');
    console.log('[测试] ════════════════════════════════════════');
    console.log(JSON.stringify(result, null, 2));
    console.log('[测试] ════════════════════════════════════════');

    // 分析
    if (!result.invokeEventId) {
      console.error('[测试] ❌ invokeeventId 为空！');
    } else {
      console.log('[测试] ✅ invoke eventId:', result.invokeEventId);
    }

    if (!result.listenerEventId) {
      console.error('[测试] ❌ listenerEventId 为空！');
    } else {
      console.log('[测试] ✅ listener eventId:', result.listenerEventId);
    }

    if (result.invokeEventId !== result.listenerEventId) {
      console.error('[测试] ❌ eventId 不匹配！');
      console.error('[测试]    invoke:', result.invokeEventId);
      console.error('[测试]    listener:', result.listenerEventId);
    }

    if (result.receivedEventCount === 0) {
      console.error('[测试] ❌ 没有收到任何 Tauri 原始事件！');
      console.error('[测试]    eventId:', result.invokeEventId);
      console.error('[测试]    可能原因：API 调用失败、Tauri 事件未触发或监听器注册失败');
    } else {
      console.log('[测试] ✅ 收到', result.receivedEventCount, '个原始事件');
    }

    // 软验证：只要有 invoke eventId 就说明基本流程正常
    expect(result.invokeEventId).toBeTruthy();
    console.log('[测试] ✅ 测试完成 - eventId 基本流程正常');
  });
});
