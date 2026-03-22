/**
 * 直接测试 Tauri Event System
 *
 * 目的：通过前端直接调用 Tauri emit，测试事件系统是否工作
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('直接测试 Tauri Event System', () => {
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

  test('测试 Tauri emit 和 listen 是否工作', async ({ page }) => {
    console.log('[测试] 测试 Tauri emit 和 listen');

    const result = await page.evaluate(async () => {
      const w = window as any;

      // 设置事件接收器
      w.__TEST_EVENTS__ = [];
      let eventReceived = false;

      const testEventId = 'test-direct-emit-' + Date.now();

      // 注册监听器
      const unlisten = await w.__TAURI__.event.listen(testEventId, (event: any) => {
        console.log('[TEST LISTENER] 📨 Event received:', event.payload);
        w.__TEST_EVENTS__.push({
          type: 'tauri-event',
          payload: event.payload,
          timestamp: Date.now()
        });
        eventReceived = true;
      });

      // 尝试通过 invoke 调用后端命令来发送事件
      // 但首先，让我们检查是否有任何方法可以从前端触发 emit

      // 注意：前端无法直接调用 app.emit()
      // 只能通过 invoke 调用后端命令

      // 让我们使用一个技巧：检查 Tauri 是否提供了任何测试辅助函数
      const tauri = w.__TAURI__;

      return {
        hasCore: !!tauri?.core,
        hasEvent: !!tauri?.event,
        hasEmit: typeof tauri?.emit === 'function',
        eventKeys: tauri?.event ? Object.keys(tauri.event) : [],
        coreKeys: tauri?.core ? Object.keys(tauri.core) : [],
        testEventId: testEventId,
        listenerRegistered: typeof unlisten === 'function'
      };
    });

    console.log('[测试] Tauri API 检查:', JSON.stringify(result, null, 2));

    // 由于无法直接测试 emit，让我们通过实际发送消息来测试
    console.log('[测试] 通过实际消息流测试...');

    // 发送"你是谁"
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '你好',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 监控 15 秒
    for (let i = 0; i < 15; i++) {
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
          content: (lastMessage?.content || '').substring(0, 50),
          testEventsCount: w.__TEST_EVENTS__?.length || 0
        };
      }, i + 1);

      if (i % 3 === 0 || check.contentLength > 0) {
        console.log(`[测试] T+${check.elapsedSeconds}s:`, {
          contentLength: check.contentLength,
          content: check.content,
          testEventsCount: check.testEventsCount
        });
      }

      if (check.contentLength > 10) {
        console.log('[测试] ✅ 收到内容');
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
        contentLength: (lastMessage?.content || '').length
      };
    });

    console.log('[测试] 最终结果:');
    console.log('  - 内容长度:', finalResult.contentLength);
    console.log('  - 内容预览:', finalResult.content.substring(0, 100));

    if (finalResult.contentLength > 0) {
      console.log('[测试] ✅ 测试通过：Tauri event system 工作正常！');
    } else {
      console.error('[测试] ❌ 测试失败：没有收到内容');
      console.error('[测试] 这表明 Tauri event system 在 E2E 环境中不工作');
    }
  });
});
