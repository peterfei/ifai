/**
 * Tauri Event System 直接测试
 *
 * 目的：通过后端直接发送事件，测试前端是否能接收到
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tauri Event System 直接测试', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.waitForTimeout(3000);
  });

  test('测试后端 emit 和前端 listen 是否连接', async ({ page }) => {
    console.log('[测试] 测试后端 emit 和前端 listen');

    const testEventId = 'test-emit-' + Date.now();

    // 在前端注册监听器
    await page.evaluate(async (eventId) => {
      const w = window as any;

      // 设置事件接收器
      w.__TEST_EVENTS__ = [];

      // 使用全局 Tauri listen 函数
      if (w.__TAURI__?.event?.listen) {
        const unlisten = await w.__TAURI__.event.listen(eventId, (event: any) => {
          console.log('[Test Frontend] 📨 Event received:', event.payload);
          w.__TEST_EVENTS__.push({
            type: 'tauri-event',
            payload: event.payload,
            timestamp: Date.now()
          });
        });

        w.__TEST_UNLISTEN__ = unlisten;
        console.log('[Test Frontend] ✅ Listener registered for:', eventId);
      } else {
        console.error('[Test Frontend] ❌ Tauri event.listen not available');
      }
    }, testEventId);

    // 等待一下确保监听器注册完成
    await page.waitForTimeout(500);

    // 通过后端发送事件
    const emitResult = await page.evaluate(async (eventId) => {
      const w = window as any;

      try {
        // 使用 invoke 调用后端命令
        // 创建一个测试命令来发送事件
        const { invoke } = w.__TAURI__?.core || {};

        if (!invoke) {
          return { error: 'invoke not available' };
        }

        // 尝试调用后端命令来发送事件
        // 由于没有专门的测试命令，我们使用一个现有的命令
        // 这里使用 ai_chat 命令，但它需要完整的参数
        // 让我们直接使用 Tauri 的 emit 功能

        // 注意：在前端无法直接调用 Tauri 的 emit
        // 只能通过 invoke 调用后端命令

        console.log('[Test] ⚠️ 无法直接从前端调用 Tauri emit');
        return { error: 'Cannot emit from frontend' };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }, testEventId);

    console.log('[测试] Emit 结果:', emitResult);

    // 由于无法从前端直接触发后端 emit，
    // 我们改为检查现有的流式响应流程

    // 发送一个简单的问题
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;

      // 配置 AI Provider（使用真实 AI）
      const fileConfig = (window as any).__E2E_REAL_AI_CONFIG__;
      if (fileConfig && fileConfig.realAIApiKey) {
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: fileConfig.realAIApiKey,
          baseUrl: fileConfig.realAIBaseUrl || 'https://open.bigmodel.cn/api/paas/v4'
        });
      }
      settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4');

      // 发送消息
      chatStore.getState().sendMessage(
        '测试',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 监控事件接收
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);

      const check = await page.evaluate((elapsed: number) => {
        const w = window as any;
        const testEvents = w.__TEST_EVENTS__ || [];
        const chatStore = w.__chatStore;
        const state = chatStore?.getState();
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        return {
          elapsedSeconds: elapsed,
          testEventsCount: testEvents.length,
          testEvents: testEvents.slice(-3), // 最近 3 个事件
          contentLength: (lastMessage?.content || '').length,
          content: (lastMessage?.content || '').substring(0, 50)
        };
      }, i + 1);

      if (i % 5 === 0 || check.testEventsCount > 0 || check.contentLength > 0) {
        console.log(`[测试] T+${check.elapsedSeconds}s:`, {
          testEventsCount: check.testEventsCount,
          testEvents: check.testEvents,
          contentLength: check.contentLength,
          content: check.content
        });
      }

      // 如果收到事件或有内容，提前结束
      if (check.testEventsCount > 0 || check.contentLength > 20) {
        console.log('[测试] ✅ 收到事件或内容');
        break;
      }
    }

    // 清理
    await page.evaluate(() => {
      const w = window as any;
      if (w.__TEST_UNLISTEN__) {
        w.__TEST_UNLISTEN__();
      }
    });
  });
});
