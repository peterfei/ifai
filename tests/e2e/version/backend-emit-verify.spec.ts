/**
 * 后端事件发送验证测试
 *
 * 目的：验证后端是否真的在发送事件到 Tauri event system
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('后端事件发送验证', () => {
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

  test('手动调用 invoke 并检查结果', async ({ page }) => {
    console.log('[验证] 手动调用 invoke 并检查结果');

    const result = await page.evaluate(async () => {
      const w = window as any;

      // 设置事件监听器
      w.__TEST_EVENTS__ = [];

      const testEventId = 'test-manual-' + Date.now();

      // 注册监听器
      const unlisten = await w.__TAURI__.event.listen(testEventId, (event: any) => {
        console.log('[TEST] 📨 Event received:', event.payload);
        w.__TEST_EVENTS__.push({
          type: 'event',
          payload: event.payload,
          timestamp: Date.now()
        });
      });

      // 调用 ai_chat 命令
      try {
        const { invoke } = w.__TAURI__.core;

        // 使用简单的消息
        const messages = [
          { role: 'user', content: '测试' }
        ];

        const result = await invoke('ai_chat', {
          providerConfig: {
            id: 'zhipu',
            apiKey: (w as any).__E2E_REAL_AI_CONFIG__?.realAIApiKey || '',
            baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
            models: ['glm-4']
          },
          messages: messages,
          eventId: testEventId,
          enableTools: false,
          projectRoot: '/Users/mac/project/demo/demo3',
          mode: 'vibe'
        });

        // 等待一下让事件到达
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 清理
        unlisten();

        return {
          success: true,
          invokeResult: result,
          eventCount: w.__TEST_EVENTS__.length,
          events: w.__TEST_EVENTS__
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined
        };
      }
    });

    console.log('[验证] 结果:', JSON.stringify(result, null, 2));

    // 等待更长时间，让流式响应完成
    for (let i = 0; i < 30; i++) {
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
          content: (lastMessage?.content || '').substring(0, 50)
        };
      }, i + 1);

      if (i % 5 === 0 || check.contentLength > 0) {
        console.log(`[验证] T+${check.elapsedSeconds}s:`, {
          contentLength: check.contentLength,
          content: check.content
        });
      }

      if (check.contentLength > 20) {
        console.log('[验证] ✅ 收到内容');
        break;
      }
    }
  });
});
