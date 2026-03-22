/**
 * Tauri Listen 修复验证测试
 *
 * 目的：验证 getTauriListen() 修复是否生效
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tauri Listen 修复验证', () => {
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

  test('测试 getTauriListen 函数是否可用', async ({ page }) => {
    console.log('[测试] 测试 getTauriListen 函数');

    const result = await page.evaluate(async () => {
      const w = window as any;

      // 尝试使用全局 Tauri listen
      if (w.__TAURI__?.event?.listen) {
        const testEventId = 'test-' + Date.now();

        try {
          const unlisten = await w.__TAURI__.event.listen(testEventId, () => {
            console.log('[Test] Event received');
          });

          // 清理
          if (unlisten) {
            unlisten();
          }

          return {
            success: true,
            method: 'global',
            hasUnlisten: typeof unlisten === 'function'
          };
        } catch (e) {
          return {
            success: false,
            method: 'global',
            error: e instanceof Error ? e.message : String(e)
          };
        }
      }

      return {
        success: false,
        method: 'none',
        error: 'Tauri event.listen not available'
      };
    });

    console.log('[测试] 结果:', JSON.stringify(result, null, 2));

    // 断言
    expect(result.success).toBeTruthy();
  });

  test('测试 StreamingResponseController.startListening', async ({ page }) => {
    console.log('[测试] 测试 StreamingResponseController.startListening');

    const result = await page.evaluate(async () => {
      const w = window as any;

      // 导入 StreamingResponseController
      const { StreamingResponseController } = await import('../../src/stores/chat/generateResponse/StreamingResponseController');

      // 获取实例
      const controller = StreamingResponseController.getInstance();

      // 尝试调用 startListening
      try {
        await controller.startListening('test-message-id', {
          correlationId: 'test-correlation',
          sessionId: 'test-session',
          timestamp: Date.now()
        });

        // 检查是否有活跃的监听器
        const hasListeners = controller.hasActiveListeners?.('test-correlation');

        return {
          success: true,
          hasListeners,
          error: null
        };
      } catch (e) {
        return {
          success: false,
          hasListeners: false,
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined
        };
      }
    });

    console.log('[测试] 结果:', JSON.stringify(result, null, 2));

    // 断言
    if (!result.success) {
      console.error('[测试] ❌ startListening 失败:', result.error);
      if (result.stack) {
        console.error('[测试] 堆栈:', result.stack);
      }
    }

    expect(result.success).toBeTruthy();
  });

  test('测试发送"你是谁"并检查是否收到内容', async ({ page }) => {
    console.log('[测试] 测试发送"你是谁"');

    // 发送消息
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
        const chatStore = w.__chatStore;
        const state = chatStore?.getState();
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        return {
          elapsedSeconds: elapsed,
          contentLength: (lastMessage?.content || '').length,
          content: (lastMessage?.content || '').substring(0, 50),
          isStreaming: lastMessage?.isStreaming
        };
      }, i + 1);

      if (i % 5 === 0 || check.contentLength > 0) {
        console.log(`[测试] T+${check.elapsedSeconds}s:`, {
          contentLength: check.contentLength,
          content: check.content,
          isStreaming: check.isStreaming
        });
      }

      // 如果有足够内容且流完成，提前结束
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
        contentLength: (lastMessage?.content || '').length
      };
    });

    console.log('[测试] 最终结果:');
    console.log('  - 内容长度:', finalResult.contentLength);
    console.log('  - 内容预览:', finalResult.content.substring(0, 100));

    if (finalResult.contentLength > 0) {
      console.log('[测试] ✅ 成功收到内容！');
    } else {
      console.error('[测试] ❌ 内容长度为 0！');
    }
  });
});
