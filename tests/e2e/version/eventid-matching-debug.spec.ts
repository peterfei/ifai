/**
 * EventId 匹配调试测试
 *
 * 目的：检查前端和后端的 eventId 是否匹配
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('EventId 匹配调试', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.waitForTimeout(3000);

    // 配置 AI Provider 和项目路径
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

      // 设置项目路径
      const fileStore = (window as any).__fileStore;
      if (fileStore) {
        fileStore.getState().setRootPath('/Users/mac/project/demo/demo3');
      }
    });
  });

  test('检查 eventId 匹配和事件发送', async ({ page }) => {
    console.log('[调试] 检查 eventId 匹配和事件发送');

    // 设置全局事件追踪
    await page.evaluate(() => {
      const w = window as any;

      // 追踪所有 Tauri 事件监听器注册
      w.__TAURI_LISTENERS__ = [];
      const originalListen = w.__TAURI__?.event?.listen;

      if (originalListen) {
        w.__TAURI__.event.listen = async function(eventId: string, handler: any) {
          console.log('[TAURI LISTEN] 📝 Registering listener for eventId:', eventId);
          w.__TAURI_LISTENERS__.push({
            eventId,
            timestamp: Date.now(),
            registered: true
          });

          // 调用原始 listen
          return originalListen.call(this, eventId, handler);
        };
      }

      // 追踪所有 invoke 调用
      w.__INVOKE_CALLS__ = [];
      const originalInvoke = w.__TAURI__?.core?.invoke;

      if (originalInvoke) {
        w.__TAURI__.core.invoke = async function(cmd: string, args: any) {
          console.log('[INVOKE] 📞 Calling command:', cmd, 'with args:', {
            ...args,
            // 只记录 eventId，不记录完整消息
            messages: args?.messages ? `(${args.messages.length} messages)` : undefined
          });

          w.__INVOKE_CALLS__.push({
            cmd,
            eventId: args?.eventId,
            timestamp: Date.now()
          });

          return originalInvoke.call(this, cmd, args);
        };
      }
    });

    // 发送消息
    console.log('[调试] 发送"你是谁"');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '你是谁',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 监控 10 秒
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);

      const check = await page.evaluate((elapsed: number) => {
        const w = window as any;
        const chatStore = w.__chatStore;
        const state = chatStore?.getState();
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        return {
          elapsedSeconds: elapsed,
          contentLength: (lastMessage?.content || '').length,
          tauriListeners: w.__TAURI_LISTENERS__?.length || 0,
          invokeCalls: w.__INVOKE_CALLS__?.length || 0,
          lastInvoke: w.__INVOKE_CALLS__?.[w.__INVOKE_CALLS__.length - 1] || null
        };
      }, i + 1);

      if (i % 2 === 0) {
        console.log(`[调试] T+${check.elapsedSeconds}s:`, {
          contentLength: check.contentLength,
          tauriListeners: check.tauriListeners,
          invokeCalls: check.invokeCalls,
          lastInvoke: check.lastInvoke
        });
      }

      if (check.contentLength > 0) {
        console.log('[调试] ✅ 收到内容');
        break;
      }
    }

    // 最终分析
    const analysis = await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;
      const state = chatStore?.getState();
      const messages = state?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        content: lastMessage?.content || '',
        contentLength: (lastMessage?.content || '').length,

        // 分析 invoke 调用
        invokeCalls: w.__INVOKE_CALLS__?.map((call: any) => ({
          cmd: call.cmd,
          eventId: call.eventId,
          eventIdFormat: call.eventId?.match(/^chat_[a-f0-9-]+$/) ? 'matches' : 'unknown',
          eventIdPrefix: call.eventId?.substring(0, 20)
        })) || [],

        // 分析 Tauri 监听器
        tauriListeners: w.__TAURI_LISTENERS__?.map((listener: any) => ({
          eventId: listener.eventId,
          eventIdFormat: listener.eventId?.match(/^chat_[a-f0-9-]+(_status|_finish)?$/) ? 'matches' : 'unknown',
          eventIdPrefix: listener.eventId?.substring(0, 30)
        })) || []
      };
    });

    console.log('[调试] 最终分析:');
    console.log('  - 内容长度:', analysis.contentLength);
    console.log('  - Invoke 调用:', JSON.stringify(analysis.invokeCalls, null, 2));
    console.log('  - Tauri 监听器:', JSON.stringify(analysis.tauriListeners, null, 2));

    // 检查 eventId 匹配
    if (analysis.invokeCalls.length > 0 && analysis.tauriListeners.length > 0) {
      const invokeEventId = analysis.invokeCalls[0].eventId;
      const listenerEventIds = analysis.tauriListeners.map((l: any) => l.eventId);

      console.log('[调试] EventId 对比:');
      console.log('  - Invoke eventId:', invokeEventId);
      console.log('  - Listener eventIds:', listenerEventIds);

      const matched = listenerEventIds.some((eventId: string) => {
        // 检查是否是主事件或相关事件
        return eventId === invokeEventId ||
               eventId === `${invokeEventId}_status` ||
               eventId === `${invokeEventId}_finish`;
      });

      if (matched) {
        console.log('[调试] ✅ EventId 匹配');
      } else {
        console.error('[调试] ❌ EventId 不匹配！');
      }
    }
  });
});
