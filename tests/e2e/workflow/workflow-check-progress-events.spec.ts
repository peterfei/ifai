/**
 * 🎯 简单测试：检查 progress 事件是否被 Tauri 发送
 *
 * 这个测试通过监听原始 Tauri 事件来验证后端是否发送了 workflow:progress 事件
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('检查 Progress 事件发送', () => {

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 验证 Tauri 是否发送 workflow:progress 事件', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置必要的 store
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = true;  // 🔥 启用真实 Tauri 模式

      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(1000);

    console.log('📝 [Test] 设置原始 Tauri 事件监听器');

    // 🔥 直接监听 Tauri 的原始事件
    await page.evaluate(() => {
      (window as any).__rawProgressEvents = [];

      // 🔥 确保 __TAURI__.event 存在（可能在 E2E mock 环境中未设置）
      if (!(window as any).__TAURI__) {
        (window as any).__TAURI__ = {};
      }
      if (!(window as any).__TAURI__.event) {
        // 如果 event API 不存在，创建一个 mock
        const eventListeners = new Map<string, Function[]>();
        (window as any).__TAURI__.event = {
          listen: (event: string, handler: Function) => {
            console.log(`[Test Mock] 📞 Listening to event: ${event}`);
            if (!eventListeners.has(event)) {
              eventListeners.set(event, []);
            }
            eventListeners.get(event)!.push(handler);
            return Promise.resolve(() => {
              const handlers = eventListeners.get(event);
              if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) handlers.splice(index, 1);
              }
            });
          },
          emit: (event: string, payload?: any) => {
            const handlers = eventListeners.get(event);
            if (handlers) {
              handlers.forEach(handler => {
                try { handler({ event, payload }); } catch (e) { /* ignore */ }
              });
            }
          }
        };
        console.log('[Test Mock] ⚠️ __TAURI__.event 不存在，已创建 mock');
      }

      // 🔥 使用 Tauri API（真实或 mock）
      const { listen } = (window as any).__TAURI__.event;

      // 监听 workflow:progress 事件
      listen('workflow:progress', (event: any) => {
        console.log('[Test] 📨 Raw workflow:progress event from Tauri:', event);
        (window as any).__rawProgressEvents.push({
          event: 'workflow:progress',
          payload: event.payload,
          timestamp: Date.now()
        });
      }).then((unlisten: any) => {
        (window as any).__unlistenProgress = unlisten;
      });

      // 同时监听其他事件用于对比
      (window as any).__allEvents = [];
      const eventTypes = ['workflow:started', 'workflow:response', 'workflow:completed', 'workflow:error', 'workflow:progress'];

      eventTypes.forEach(eventType => {
        listen(eventType, (event: any) => {
          console.log(`[Test] 📨 Raw ${eventType} event:`, event);
          (window as any).__allEvents.push({
            event: eventType,
            payload: event.payload,
            timestamp: Date.now()
          });
        });
      });

      console.log('[Test] ✅ Raw Tauri event listeners set up');
    });

    await page.waitForTimeout(500);

    console.log('📝 [Test] 发送 /explore 命令');

    // 🔥 检查 chatStore 状态
    const chatStoreCheck = await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;

      return {
        hasChatStore: !!chatStore,
        hasGetState: chatStore && typeof chatStore.getState === 'function',
        hasSendMessage: chatStore && typeof chatStore.getState?.()?.sendMessage === 'function',
        hasRealTauriMode: !!w.__E2E_REAL_TAURI_MODE__
      };
    });

    console.log('📊 [Test] chatStore 状态:', JSON.stringify(chatStoreCheck));

    // 发送 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      console.log('[Test Inside] 📤 About to call sendMessage');
      if (chatStore) {
        console.log('[Test Inside] ✅ chatStore exists');
        const state = chatStore.getState();
        console.log('[Test Inside] ✅ state:', state);
        console.log('[Test Inside] ✅ sendMessage:', typeof state?.sendMessage);
        if (state && state.sendMessage) {
          console.log('[Test Inside] 📤 Calling sendMessage("/explore")');
          state.sendMessage('/explore');
          console.log('[Test Inside] ✅ sendMessage called');
        } else {
          console.log('[Test Inside] ❌ sendMessage not available');
        }
      } else {
        console.log('[Test Inside] ❌ chatStore not found');
      }
    });

    console.log('📝 [Test] 等待 30 秒...');

    // 等待 30 秒
    await page.waitForTimeout(30000);

    // 检查结果
    const result = await page.evaluate(() => {
      const rawProgressEvents = (window as any).__rawProgressEvents || [];
      const allEvents = (window as any).__allEvents || [];

      return {
        rawProgressEventCount: rawProgressEvents.length,
        allEventCount: allEvents.length,
        eventsByType: allEvents.reduce((acc: any, e: any) => {
          acc[e.event] = (acc[e.event] || 0) + 1;
          return acc;
        }, {}),
        rawProgressEvents: rawProgressEvents.map((e: any) => ({
          event_type: e.payload.event_type,
          workflow_id: e.payload.workflow_id,
          node_id: e.payload.node_id,
          message: e.payload.message,
          timestamp: e.timestamp
        })),
        allEventsDetailed: allEvents.map((e: any) => ({
          event: e.event,
          workflow_id: e.payload.workflow_id || e.payload.workflowId,
          event_type: e.payload.event_type,
          message: e.payload.message || e.payload.response?.substring(0, 50),
          timestamp: e.timestamp
        }))
      };
    });

    console.log('📊 [Test] 事件统计:');
    console.log(`   原始 workflow:progress 事件数: ${result.rawProgressEventCount}`);
    console.log(`   所有事件数: ${result.allEventCount}`);
    console.log('   按类型统计:', result.eventsByType);

    if (result.allEventCount > 0) {
      console.log('✅ [Test] 捕获到原始 Tauri 事件！');
      console.log('📋 [Test] 所有事件详情:');
      result.allEventsDetailed.forEach((e: any, i: number) => {
        console.log(`   ${i + 1}. ${e.event}`);
        console.log(`      workflow_id: ${e.workflow_id}`);
        console.log(`      event_type: ${e.event_type}`);
        console.log(`      message: ${e.message}`);
      });
    } else {
      console.log('❌ [Test] 没有捕获到任何原始 Tauri 事件！');
      console.log('   这意味着原始 Tauri 监听器设置有问题');
    }

    if (result.rawProgressEventCount > 0) {
      console.log('✅ [Test] 成功！Tauri 发送了 workflow:progress 事件！');
      console.log('📋 [Test] Progress 事件详情:');
      result.rawProgressEvents.forEach((e: any, i: number) => {
        console.log(`   ${i + 1}. event_type: ${e.event_type}, node_id: ${e.node_id}, message: ${e.message}`);
      });
    } else {
      console.log('❌ [Test] 失败！Tauri 没有发送任何 workflow:progress 事件！');
      console.log('   这意味着后端的 progress_callback 没有被调用');
    }

    // 关键断言
    expect(result.rawProgressEventCount).toBeGreaterThan(0, 'Tauri 应该发送至少一个 workflow:progress 事件');
  });
});
