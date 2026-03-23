/**
 * Zhipu API 诊断测试
 *
 * 检查 Zhipu API 是否正确发送 finish_reason 字段
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Zhipu API 诊断', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    // 等待 store 初始化
    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined,
      { timeout: 30000 }
    );
    await page.waitForTimeout(1000);

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

    // 捕获所有控制台日志，并监听事件总线
    await page.evaluate(() => {
      (window as any).__allLogs = [];
      (window as any).__rawChunks = [];

      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      const captureLog = (type: string, args: any[]) => {
        const message = args.map(a => {
          if (typeof a === 'object') {
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }
          return String(a);
        }).join(' ');

        (window as any).__allLogs.push({
          type,
          message,
          timestamp: Date.now(),
          raw: args
        });
      };

      console.log = (...args) => {
        captureLog('log', args);
        originalLog.apply(console, args);
      };

      console.warn = (...args) => {
        captureLog('warn', args);
        originalWarn.apply(console, args);
      };

      console.error = (...args) => {
        captureLog('error', args);
        originalError.apply(console, args);
      };

      // 监听事件总线上的流事件
      try {
        const chatEventBus = (window as any).__chatEventBus;
        if (chatEventBus) {
          // 监听所有流事件
          const events = ['chat:stream:start', 'chat:stream:chunk', 'chat:stream:finished', 'chat:tool:call', 'chat:tool:completed'];
          events.forEach(eventName => {
            chatEventBus.on(eventName, (payload: any) => {
              (window as any).__allLogs.push({
                type: 'event',
                event: eventName,
                payload: JSON.stringify(payload),
                timestamp: Date.now()
              });
            });
          });
        }
      } catch (e) {
        console.log('[DIAG] Failed to listen to event bus:', e);
      }
    });
  });

  test('诊断: 检查 Zhipu API 响应和流完成事件', async ({ page }) => {
    console.log('[DIAG] 开始诊断测试...');

    // 发送简单消息
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      await store.getState().sendMessage('你好', 'zhipu', 'glm-4');
    });

    // 等待响应
    console.log('[DIAG] 等待 LLM 响应...');
    await page.waitForTimeout(30000);

    // 获取所有日志
    const logs = await page.evaluate(() => {
      return (window as any).__allLogs || [];
    });

    console.log('[DIAG] === 控制台日志摘要 ===');

    // 查找关键日志
    const finishLogs = logs.filter((l: any) =>
      l && l.message && (
        l.message.includes('finish') ||
        l.message.includes('Finish') ||
        l.message.includes('finished')
      )
    );

    const streamControllerLogs = logs.filter((l: any) =>
      l && l.message && l.message.includes('StreamController')
    );

    const errorLogs = logs.filter((l: any) => l && l.type === 'error');

    console.log('[DIAG] Finish 相关日志:', finishLogs.length);
    finishLogs.forEach((log: any) => {
      console.log(`  [${log.type}] ${log.message.substring(0, 200)}`);
    });

    console.log('[DIAG] StreamController 日志:', streamControllerLogs.length);
    streamControllerLogs.slice(0, 10).forEach((log: any) => {
      console.log(`  [${log.type}] ${log.message.substring(0, 200)}`);
    });

    console.log('[DIAG] 错误日志:', errorLogs.length);
    errorLogs.forEach((log: any) => {
      console.log(`  [ERROR] ${log.message.substring(0, 200)}`);
    });

    // 检查是否有 finish 事件
    const hasFinishEvent = finishLogs.some((log: any) =>
      log.message.includes('Finish event received') ||
      log.message.includes('emitFinished')
    );

    const hasFinishReason = finishLogs.some((log: any) =>
      log.message.includes('finish_reason')
    );

    console.log('[DIAG] === 诊断结果 ===');
    console.log('[DIAG] 有 finish 事件:', hasFinishEvent);
    console.log('[DIAG] 有 finish_reason:', hasFinishReason);

    // 注意：不能在浏览器中使用 fs.writeFile，日志已在控制台输出
    console.log('[DIAG] 完整日志数量:', logs.length);

    expect(true).toBe(true); // 测试总是通过，目的是收集日志
  });
});
