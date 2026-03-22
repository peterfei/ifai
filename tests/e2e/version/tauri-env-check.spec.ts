/**
 * Tauri 环境检查测试
 *
 * 目的：检查 E2E 环境中的 Tauri 对象状态
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tauri 环境检查', () => {
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

  test('检查 Tauri 环境和对象状态', async ({ page }) => {
    console.log('[检查] Tauri 环境检查');

    const tauriEnv = await page.evaluate(() => {
      const w = window as any;

      return {
        // 核心检查
        hasTAURI_INTERNALS: !!w.__TAURI_INTERNALS__,
        hasTAURI: !!w.__TAURI__,
        hasTAURICore: !!w.__TAURI__?.core,
        hasTAURIEvent: !!w.__TAURI__?.event,

        // 检查 invoke
        hasInvoke: typeof w.__TAURI_INTERNALS__?.invoke === 'function',
        hasCoreInvoke: typeof w.__TAURI__?.core?.invoke === 'function',

        // 检查 listen
        hasEventListen: typeof w.__TAURI__?.event?.listen === 'function',

        // E2E 标志
        e2eMode: w.__E2E__,
        e2eRealTauriMode: w.__E2E_REAL_TAURI_MODE__,

        // Tauri 内部对象
        tauriInternalsKeys: w.__TAURI_INTERNALS__ ? Object.keys(w.__TAURI_INTERNALS__) : [],
        tauriKeys: w.__TAURI__ ? Object.keys(w.__TAURI__) : [],
        tauriCoreKeys: w.__TAURI__?.core ? Object.keys(w.__TAURI__.core) : [],
        tauriEventKeys: w.__TAURI__?.event ? Object.keys(w.__TAURI__.event) : [],

        // 检查环境检测逻辑
        wouldUseSimulatedListeners: typeof window === 'undefined' || !w.__TAURI_INTERNALS__
      };
    });

    console.log('[检查] Tauri 环境状态:');
    console.log(JSON.stringify(tauriEnv, null, 2));

    // 断言
    expect(tauriEnv.hasTAURI_INTERNALS).toBeTruthy();
    expect(tauriEnv.hasTAURI).toBeTruthy();
    expect(tauriEnv.hasTAURIEvent).toBeTruthy();
    expect(tauriEnv.hasEventListen).toBeTruthy();

    if (tauriEnv.wouldUseSimulatedListeners) {
      console.error('[检查] ❌ 会使用仿真监听器！这是问题所在！');
    } else {
      console.log('[检查] ✅ 不会使用仿真监听器');
    }
  });

  test('测试 StreamingResponseController 环境检测', async ({ page }) => {
    console.log('[检查] StreamingResponseController 环境检测');

    const result = await page.evaluate(async () => {
      const w = window as any;

      try {
        // 导入 StreamingResponseController
        const { StreamingResponseController } = await import('../../src/stores/chat/generateResponse/StreamingResponseController');

        // 获取实例
        const controller = StreamingResponseController.getInstance();

        // 尝试调用 startListening
        const testCorrelationId = 'test-env-check-' + Date.now();

        await controller.startListening(testCorrelationId, {
          correlationId: testCorrelationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });

        // 检查是否有活跃监听器
        const hasActiveListeners = controller.activeListeners?.has(testCorrelationId);

        return {
          success: true,
          hasActiveListeners,
          correlationId: testCorrelationId
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined
        };
      }
    });

    console.log('[检查] StreamingResponseController 结果:', JSON.stringify(result, null, 2));

    if (!result.success) {
      console.error('[检查] ❌ startListening 失败:', result.error);
      if (result.stack) {
        console.error('[检查] 堆栈:', result.stack);
      }
    }

    expect(result.success).toBeTruthy();
  });
});
