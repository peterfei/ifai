/**
 * Tauri Event System 初始化检查
 *
 * 目的：检查在 E2E 环境中，Tauri event system 是否正确初始化
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tauri Event System 检查', () => {
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

  test('检查 Tauri event system 可用性', async ({ page }) => {
    console.log('[检查] 开始 Tauri event system 检查');

    // 检查 Tauri 全局对象
    const tauriCheck = await page.evaluate(() => {
      const w = window as any;
      return {
        // 基础 Tauri 对象
        hasTAURI: !!w.__TAURI__,
        hasTAURI_INTERNALS: !!w.__TAURI_INTERNALS__,

        // Core invoke
        hasCore: !!w.__TAURI__?.core,
        hasCoreInvoke: typeof w.__TAURI__?.core?.invoke === 'function',

        // Event system
        hasEvent: !!w.__TAURI__?.event,
        hasEventListen: typeof w.__TAURI__?.event?.listen === 'function',

        // E2E 模式
        e2eMode: w.__E2E__,
        e2eRealTauriMode: w.__E2E_REAL_TAURI_MODE__,

        // 检查 invoke 是否可用
        invokeType: typeof w.__TAURI__?.core?.invoke,
        listenType: typeof w.__TAURI__?.event?.listen,

        // 尝试获取 Tauri API 模块的导出
        tauriKeys: w.__TAURI__ ? Object.keys(w.__TAURI__) : [],
        coreKeys: w.__TAURI__?.core ? Object.keys(w.__TAURI__.core) : [],
        eventKeys: w.__TAURI__?.event ? Object.keys(w.__TAURI__.event) : [],
      };
    });

    console.log('[检查] Tauri 对象检查结果:');
    console.log(JSON.stringify(tauriCheck, null, 2));

    // 测试动态导入 listen 函数
    const dynamicImportCheck = await page.evaluate(async () => {
      try {
        // 动态导入 @tauri-apps/api/event
        const eventModule = await import('@tauri-apps/api/event');
        return {
          success: true,
          hasListen: typeof eventModule.listen === 'function',
          listenType: typeof eventModule.listen,
          exports: Object.keys(eventModule)
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    });

    console.log('[检查] 动态导入检查结果:');
    console.log(JSON.stringify(dynamicImportCheck, null, 2));

    // 尝试注册一个测试监听器
    const listenerTest = await page.evaluate(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const testEventId = 'test-event-' + Date.now();

        let receivedEvent = false;
        let unlistenResult = null;

        // 尝试注册监听器
        const unlisten = await listen(testEventId, () => {
          receivedEvent = true;
        });

        unlistenResult = typeof unlisten === 'function';

        // 尝试清理
        if (unlisten) {
          unlisten();
        }

        return {
          success: true,
          registered: true,
          receivedEvent,
          unlistenResult,
          testEventId
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined
        };
      }
    });

    console.log('[检查] 监听器测试结果:');
    console.log(JSON.stringify(listenerTest, null, 2));

    // 断言
    expect(tauriCheck.hasTAURI).toBeTruthy();
    expect(tauriCheck.e2eRealTauriMode).toBe(true);

    if (!tauriCheck.hasEventListen) {
      console.error('[检查] ❌ Tauri event.listen 不可用！');
      console.error('[检查] 这可能是导致流式事件无法接收的原因');
    }

    if (!dynamicImportCheck.success) {
      console.error('[检查] ❌ 动态导入 @tauri-apps/api/event 失败:', dynamicImportCheck.error);
    }

    if (!listenerTest.success) {
      console.error('[检查] ❌ 监听器注册失败:', listenerTest.error);
      if (listenerTest.stack) {
        console.error('[检查] 堆栈:', listenerTest.stack);
      }
    }
  });

  test('检查 StreamingResponseController 初始化', async ({ page }) => {
    console.log('[检查] 检查 StreamingResponseController 初始化');

    const controllerCheck = await page.evaluate(() => {
      const w = window as any;

      // 检查 StoreMapper 是否已初始化
      const storeMapperInitialized = w.__STORE_MAPPER_CALL_SUCCEEDED__;
      const storeMapperCalled = w.__STORE_MAPPER_CALLED__;
      const storeMapperError = w.__STORE_MAPPER_ERROR__;

      // 检查 chatEventBus
      const chatEventBus = w.__chatEventBus;
      const eventBusKeys = chatEventBus ? Object.keys(chatEventBus) : [];

      // 检查 StoreMapper
      const storeMapper = w.__storeMapper;
      const storeMapperKeys = storeMapper ? Object.keys(storeMapper) : [];

      // 检查 chatStreamChunkListeners 数量
      const chunkListeners = chatEventBus?.listeners?.['chat:stream:chunk']?.length || 0;

      return {
        storeMapperInitialized,
        storeMapperCalled,
        storeMapperError,
        hasChatEventBus: !!chatEventBus,
        hasStoreMapper: !!storeMapper,
        chunkListeners,
        eventBusKeys,
        storeMapperKeys
      };
    });

    console.log('[检查] StreamingResponseController 初始化结果:');
    console.log(JSON.stringify(controllerCheck, null, 2));

    // 断言
    expect(controllerCheck.hasChatEventBus).toBeTruthy();
    expect(controllerCheck.chunkListeners).toBeGreaterThan(0);
  });

  test('测试手动发送事件和接收', async ({ page }) => {
    console.log('[检查] 测试手动事件发送和接收');

    const testResult = await page.evaluate(async () => {
      const w = window as any;
      const chatEventBus = w.__chatEventBus;

      if (!chatEventBus) {
        return { error: 'chatEventBus not found' };
      }

      // 设置事件追踪
      const receivedEvents: any[] = [];
      const testEventId = 'manual-test-' + Date.now();

      // 监听 chat:stream:chunk
      const unlisten = chatEventBus.on('chat:stream:chunk', (payload: any) => {
        receivedEvents.push({
          event: 'chat:stream:chunk',
          correlationId: payload.correlationId,
          delta: payload.delta?.substring(0, 20),
          timestamp: Date.now()
        });
      });

      // 手动发送事件
      chatEventBus.emit('chat:stream:chunk', {
        correlationId: 'test-correlation',
        sessionId: 'test-session',
        timestamp: Date.now(),
        delta: 'Test content chunk'
      });

      // 等待一下
      await new Promise(resolve => setTimeout(resolve, 100));

      // 清理
      unlisten();

      return {
        success: true,
        receivedCount: receivedEvents.length,
        receivedEvents,
        testEventId
      };
    });

    console.log('[检查] 手动事件测试结果:');
    console.log(JSON.stringify(testResult, null, 2));

    // 断言
    expect(testResult.success).toBeTruthy();
    expect(testResult.receivedCount).toBeGreaterThan(0);
  });
});
