/**
 * StoreMapper 初始化诊断测试
 *
 * 简单的测试来验证 initStoreMapper 是否被调用
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('StoreMapper 初始化诊断', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    // 等待应用完全加载
    await page.waitForTimeout(3000);
  });

  test('验证 StoreMapper 初始化状态', async ({ page }) => {
    console.log('[测试] 开始诊断 StoreMapper 初始化状态');

    const diagnosticResult = await page.evaluate(() => {
      const w = window as any;
      const result: any = {};

      // 1. 检查全局标记
      result.USE_CHAT_STORE_LOADED = !!w.__USE_CHAT_STORE_LOADED__;
      result.STORE_MAPPER_CALLED = !!w.__STORE_MAPPER_CALLED__;
      result.STORE_MAPPER_CALL_SUCCEEDED = !!w.__STORE_MAPPER_CALL_SUCCEEDED__;
      result.STORE_MAPPER_CALL_FAILED = !!w.__STORE_MAPPER_CALL_FAILED__;
      result.STORE_MAPPER_CALL_TIME = w.__STORE_MAPPER_CALL_TIME__ || null;
      result.STORE_MAPPER_ERROR = w.__STORE_MAPPER_ERROR__ || null;

      // 2. 检查初始化日志
      result.initLogs = w.__STORE_MAPPER_INIT_LOGS__ || [];

      // 3. 检查 chatEventBus
      const chatEventBus = w.__chatEventBus;
      result.chatEventBusExists = !!chatEventBus;

      if (chatEventBus) {
        const handlers = (chatEventBus as any).handlers || new Map();
        result.handlersSize = handlers.size;

        const listenerCounts: any = {};
        handlers.forEach((listeners: any[], event: string) => {
          listenerCounts[event] = listeners.length;
        });
        result.listenerCounts = listenerCounts;

        // 特别关注的关键事件
        result.chatStreamChunkListeners = handlers.get('chat:stream:chunk')?.length || 0;
        result.chatSegmentUpdatedListeners = handlers.get('chat:segment:updated')?.length || 0;
        result.chatStreamStartListeners = handlers.get('chat:stream:start')?.length || 0;
        result.chatStreamFinishedListeners = handlers.get('chat:stream:finished')?.length || 0;
      }

      // 4. 检查 Stores
      result.chatStoreExists = !!w.__chatStore;
      result.settingsStoreExists = !!w.__settingsStore;

      // 5. 检查其他关键对象
      result.toolCallManagerExists = !!w.__toolCallManager;
      result.contentSegmentManagerExists = !!w.__contentSegmentManager;

      return result;
    });

    console.log('[测试] ════════════════════════════════════════');
    console.log('[测试] StoreMapper 初始化诊断结果:');
    console.log('[测试] ════════════════════════════════════════');
    console.log(JSON.stringify(diagnosticResult, null, 2));
    console.log('[测试] ════════════════════════════════════════');

    // 关键验证
    if (!diagnosticResult.USE_CHAT_STORE_LOADED) {
      console.error('[测试] ❌ useChatStore 模块未加载！');
    }

    if (!diagnosticResult.STORE_MAPPER_CALLED) {
      console.error('[测试] ❌ initStoreMapper() 未被调用！');
      console.error('[测试]    这可能是循环依赖导致模块初始化失败');
    }

    if (diagnosticResult.STORE_MAPPER_CALL_FAILED) {
      console.error('[测试] ❌ initStoreMapper() 调用失败！');
      console.error('[测试]    错误:', diagnosticResult.STORE_MAPPER_ERROR);
    }

    if (diagnosticResult.chatStreamChunkListeners === 0) {
      console.error('[测试] ❌ 没有 chat:stream:chunk 监听器！');
      console.error('[测试]    这会导致消息内容无法更新');
    }

    // 期望的状态
    expect(diagnosticResult.USE_CHAT_STORE_LOADED).toBe(true);
    expect(diagnosticResult.STORE_MAPPER_CALLED).toBe(true);
    expect(diagnosticResult.STORE_MAPPER_CALL_SUCCEEDED).toBe(true);
    expect(diagnosticResult.chatStreamChunkListeners).toBeGreaterThan(0);

    console.log('[测试] ✅ 诊断完成');
  });
});
