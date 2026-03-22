/**
 * "你是谁"问题还原测试
 *
 * 问题描述：
 * - 用户询问"你是谁"
 * - AI 回复只显示"用户用户"就停止了
 * - 页面刷新后才有完整内容
 * - 说明数据持久化正确，但实时显示有问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('你是谁问题还原测试', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true  // 🔥 使用真实 LLM
    });

    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // 🔥 DEBUG: 检查监听器是否被注册
    const diagnosticCheck = await page.evaluate(() => {
      const w = window as any;
      const chatEventBus = w.__chatEventBus;

      const result: any = {};

      // 1. 检查 chatEventBus 是否存在
      result.chatEventBusExists = !!chatEventBus;
      if (!chatEventBus) {
        result.error = 'chatEventBus not found';
        return result;
      }

      // 2. 检查 handlers
      const handlers = (chatEventBus as any).handlers || new Map();
      result.handlersType = handlers.constructor.name;
      result.handlersSize = handlers.size || 0;

      // 3. 统计每个事件的监听器数量
      const listenerCounts: any = {};
      handlers.forEach((listeners: any[], event: string) => {
        listenerCounts[event] = listeners.length;
      });
      result.listenerCounts = listenerCounts;

      // 4. 特别检查 chat:stream:chunk
      result.chatStreamChunkListeners = handlers.get('chat:stream:chunk')?.length || 0;

      // 5. 检查是否有 useChatStore
      result.chatStoreExists = !!w.__chatStore;

      // 6. 检查是否有 contentSegmentManager
      result.contentSegmentManagerExists = !!w.__contentSegmentManager;

      // 7. 检查是否有 __APP_READY__
      result.appReady = w.__APP_READY__;

      // 8. 检查是否有 __toolCallManager
      result.toolCallManagerExists = !!w.__toolCallManager;

      // 9. 检查 StoreMapper 是否初始化过（通过查找特定日志）
      result.storeMapperInitLogs = (w as any).__STORE_MAPPER_INIT_LOGS__ || [];

      return result;
    });

    console.log('[DEBUG] ════════════════════════════════════════');
    console.log('[DEBUG] Event listeners registered:');
    console.log('[DEBUG] ════════════════════════════════════════');
    console.log(JSON.stringify(diagnosticCheck, null, 2));
    console.log('[DEBUG] ════════════════════════════════════════');

    // 如果没有 chunk listeners，说明 StoreMapper 没有初始化
    if (diagnosticCheck.chatStreamChunkListeners === 0) {
      console.error('[DEBUG] ❌ CRITICAL: No chat:stream:chunk listeners registered!');
      console.error('[DEBUG]    This means StoreMapper.initStoreMapper() was not called!');
    }

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

  test('问题还原：询问"你是谁"后验证实时显示', async ({ page }) => {
    console.log('[测试] 开始还原"你是谁"问题');

    const chatInput = page.locator('[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible();

    // ========================================
    // 步骤1: 发送"你是谁"问题
    // ========================================
    console.log('[步骤1] 发送"你是谁"');

    await chatInput.fill('你是谁');
    await page.keyboard.press('Enter');

    // 等待流式传输开始
    await page.waitForTimeout(2000);

    // ========================================
    // 步骤2: 监控流式传输过程
    // ========================================
    console.log('[步骤2] 监控流式传输过程');

    const streamSnapshots: string[] = [];
    const segmentsSnapshots: any[] = [];

    // 每2秒捕获一次消息内容
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2000);

      const snapshot = await page.evaluate(() => {
        const store = (window as any).__chatStore;
        const state = store ? store.getState() : null;
        if (!state) return null;

        const messages = state.messages || [];
        const lastMessage = messages[messages.length - 1];

        if (!lastMessage || lastMessage.role !== 'assistant') {
          return null;
        }

        return {
          timestamp: Date.now(),
          contentLength: (lastMessage.content || '').length,
          content: (lastMessage.content || '').substring(0, 100),
          isStreaming: lastMessage.isStreaming,
          segmentsCount: (lastMessage.segments || []).length,
          segments: (lastMessage.segments || []).map((s: any) => ({
            type: s.type,
            order: s.order,
            contentLength: (s.content || '').length,
            content: (s.content || '').substring(0, 50)
          }))
        };
      });

      if (snapshot) {
        streamSnapshots.push(`[T+${i * 2}s] ${JSON.stringify(snapshot)}`);
        segmentsSnapshots.push(snapshot);

        console.log(`[步骤2] T+${i * 2}s:`, {
          contentLength: snapshot.contentLength,
          content: snapshot.content,
          isStreaming: snapshot.isStreaming,
          segmentsCount: snapshot.segmentsCount
        });

        // 如果流式传输完成，提前退出
        if (!snapshot.isStreaming && snapshot.contentLength > 10) {
          console.log('[步骤2] 流式传输已完成');
          break;
        }
      }
    }

    // ========================================
    // 步骤3: 验证最终内容
    // ========================================
    console.log('[步骤3] 验证最终内容');

    const finalContent = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store ? store.getState() : null;
      if (!state) return null;

      const messages = state.messages || [];
      const lastMessage = messages[messages.length - 1];

      if (!lastMessage || lastMessage.role !== 'assistant') {
        return null;
      }

      return {
        content: lastMessage.content || '',
        contentLength: (lastMessage.content || '').length,
        segments: (lastMessage.segments || []).map((s: any) => ({
          type: s.type,
          order: s.order,
          content: s.content || ''
        })),
        segmentsCount: (lastMessage.segments || []).length
      };
    });

    console.log('[步骤3] 最终内容:');
    console.log('  - 完整内容长度:', finalContent?.contentLength);
    console.log('  - Segments 数量:', finalContent?.segmentsCount);
    console.log('  - Segments 详情:', JSON.stringify(finalContent?.segments, null, 2));
    console.log('  - Message.content:', finalContent?.content);

    // 验证：如果 segments 有内容，但 message.content 为空或很短，说明同步有问题
    const segmentsTotalLength = (finalContent?.segments || [])
      .filter((s: any) => s.type === 'text')
      .reduce((sum: number, s: any) => sum + (s.content?.length || 0), 0);

    console.log('[步骤3] Segments 总内容长度:', segmentsTotalLength);

    if (segmentsTotalLength > 50 && (finalContent?.contentLength || 0) < 20) {
      console.error('[步骤3] ⚠️ BUG CONFIRMED: Segments 有完整内容，但 message.content 为空或不完整！');
      console.error('[步骤3]    Segments 长度:', segmentsTotalLength);
      console.error('[步骤3]    Message.content 长度:', finalContent?.contentLength);
    }

    // 验证内容不是"用户用户"
    expect(finalContent?.content).not.toBe('用户用户');
    expect(finalContent?.contentLength).toBeGreaterThan(20);

    // ========================================
    // 步骤4: 验证输入框状态
    // ========================================
    console.log('[步骤4] 验证输入框状态');

    const inputState = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store ? store.getState() : null;
      return {
        isLoading: state ? state.isLoading : null
      };
    });

    console.log('[步骤4] isLoading:', inputState.isLoading);

    // 手动恢复输入框
    if (inputState.isLoading) {
      console.log('[步骤4] 手动恢复输入框');
      await page.evaluate(() => {
        const store = (window as any).__chatStore;
        store.setState({ isLoading: false } as any);
      });
    }

    await page.waitForTimeout(1000);

    // ========================================
    // 步骤5: 刷新页面验证持久化
    // ========================================
    console.log('[步骤5] 刷新页面验证持久化');

    await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store.getState();
      return {
        messageCount: state.messages.length,
        lastContent: state.messages[state.messages.length - 1].content
      };
    }).then((beforeRefresh: any) => {
      console.log('[步骤5] 刷新前:', beforeRefresh);
    });

    // 刷新页面
    await page.reload();

    // 等待应用重新加载
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // 验证刷新后的内容
    const afterRefresh = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store.getState();
      const messages = state.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        messageCount: messages.length,
        lastContent: lastMessage?.content || '',
        lastContentLength: (lastMessage?.content || '').length,
        segments: (lastMessage?.segments || []).map((s: any) => ({
          type: s.type,
          order: s.order,
          content: s.content || ''
        }))
      };
    });

    console.log('[步骤5] 刷新后:', {
      messageCount: afterRefresh.messageCount,
      contentLength: afterRefresh.lastContentLength,
      content: afterRefresh.lastContent.substring(0, 100)
    });

    // 验证刷新后内容是完整的
    expect(afterRefresh.lastContentLength).toBeGreaterThan(20);
    expect(afterRefresh.lastContent).not.toBe('用户用户');

    // ========================================
    // 步骤6: 总结问题
    // ========================================
    console.log('[步骤6] 问题总结');

    if ((finalContent?.contentLength || 0) < 20 && afterRefresh.lastContentLength > 20) {
      console.error('[步骤6] ⚠️ BUG CONFIRMED: 实时显示不完整，但刷新后完整！');
      console.error('[步骤6]    实时 content 长度:', finalContent?.contentLength);
      console.error('[步骤6]    刷新后 content 长度:', afterRefresh.lastContentLength);
    } else {
      console.log('[步骤6] ✅ 问题已修复或未复现');
    }

    console.log('[测试] 测试完成');
  });

  test('验证 message.content 与 segments 的同步时机', async ({ page }) => {
    console.log('[同步测试] 开始验证同步时机');

    const chatInput = page.locator('[data-testid="chat-input"]');

    // 发送问题
    await chatInput.fill('你是谁');
    await page.keyboard.press('Enter');

    // 监控 chat:stream:finished 事件后的状态
    await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus;

      // 监听 stream:finished 事件
      chatEventBus.on('chat:stream:finished', (payload: any) => {
        console.log('[同步测试] stream:finished 事件触发');

        setTimeout(() => {
          const store = (window as any).__chatStore;
          const state = store.getState();
          const lastMessage = state.messages[state.messages.length - 1];

          console.log('[同步测试] stream:finished 后 100ms:', {
            contentLength: (lastMessage.content || '').length,
            content: (lastMessage.content || '').substring(0, 50),
            segmentsCount: (lastMessage.segments || []).length
          });
        }, 100);

        setTimeout(() => {
          const store = (window as any).__chatStore;
          const state = store.getState();
          const lastMessage = state.messages[state.messages.length - 1];

          console.log('[同步测试] stream:finished 后 500ms:', {
            contentLength: (lastMessage.content || '').length,
            content: (lastMessage.content || '').substring(0, 50),
            segmentsCount: (lastMessage.segments || []).length
          });
        }, 500);

        setTimeout(() => {
          const store = (window as any).__chatStore;
          const state = store.getState();
          const lastMessage = state.messages[state.messages.length - 1];

          console.log('[同步测试] stream:finished 后 1000ms:', {
            contentLength: (lastMessage.content || '').length,
            content: (lastMessage.content || '').substring(0, 50),
            segmentsCount: (lastMessage.segments || []).length
          });
        }, 1000);
      });
    });

    // 等待流完成
    await page.waitForTimeout(60000);

    console.log('[同步测试] 测试完成');
  });
});
