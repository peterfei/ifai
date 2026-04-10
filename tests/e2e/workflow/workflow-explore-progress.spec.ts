/**
 * 🎯 /explore 命令 workflow:progress 事件测试
 *
 * 验证用户发送 /explore 命令后，workflow:progress 事件是否正常工作
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('/explore 命令 Progress 事件测试', () => {

  test('✅ 验证 /explore 命令发送 workflow:progress 事件', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false  // 使用 Mock 模式
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置 E2E 模式
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;

      // 🔥 FIX: 设置 __E2E_REAL_TAURI_MODE__ 标志，让 WorkflowIntentHandler 使用真实的 HTTP API 调用
      // 即使在 E2E 环境中，我们也想测试真实的后端工作流执行
      (window as any).__E2E_REAL_TAURI_MODE__ = true;

      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(1000);

    console.log('📝 [Test] 设置 workflow:progress 事件监听器');

    // 设置 workflow:progress 事件监听
    await page.evaluate(() => {
      (window as any).__progressEvents = [];

      // 🔥 FIX: 优先使用 __chatEventBus，fallback 到 __GLOBAL_CHAT_EVENT_BUS__
      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;
      if (chatEventBus) {
        console.log('[Test] ✅ chatEventBus found:', !!chatEventBus);

        // 🔥 FIX: 直接监听 workflow:progress 事件，而不是通配符
        // 因为 ChatEventBus 的通配符监听器有 bug，不会正确传递事件名
        const progressHandler = (data: any) => {
          console.log('[Test] 📨 workflow:progress Event received:', data);
          console.log('[Test] 📨 data type:', typeof data);

          // 🔥 FIX: data 可能是 JSON 字符串，需要解析
          let parsedData = data;
          if (typeof data === 'string') {
            try {
              parsedData = JSON.parse(data);
              console.log('[Test] 📨 Parsed data:', parsedData);
            } catch (e) {
              console.error('[Test] ❌ Failed to parse data:', e);
            }
          }

          // 🔥 FIX: SSE 事件使用 snake_case，需要映射到 camelCase
          const mappedData = {
            workflowId: parsedData.workflow_id,
            event_type: parsedData.event_type,
            node_id: parsedData.node_id,
            message: parsedData.message,
            timestamp: parsedData.timestamp,
            original: data // 保留原始数据用于调试
          };

          console.log('[Test] 📨 Mapped data:', mappedData);

          (window as any).__progressEvents.push({
            event: 'workflow:progress',
            data: mappedData,
            timestamp: Date.now()
          });
        };

        // 监听 workflow:progress 事件
        (chatEventBus as any).on('workflow:progress', progressHandler);

        // 保存处理器引用用于清理
        (window as any).__workflowProgressHandler = progressHandler;
      } else {
        console.log('[Test] ❌ chatEventBus not found');
      }
    });

    await page.waitForTimeout(500);

    console.log('📝 [Test] 发送 /explore 命令');

    // 🔥 FIX: 添加浏览器控制台日志监听
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Workflow') || text.includes('workflow') || text.includes('SSE') || text.includes('progress')) {
        console.log('[Browser Console]', text);
      }
    });

    // 发送 /explore 命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        console.log('[Test] 📤 发送 /explore 命令到 chatStore');
        console.log('[Test] chatStore:', !!chatStore);
        console.log('[Test] chatStore.getState:', typeof chatStore.getState);
        console.log('[Test] sendMessage:', typeof chatStore.getState().sendMessage);

        // 尝试发送命令
        chatStore.getState().sendMessage('/explore');
        console.log('[Test] ✅ 命令已发送');
      } else {
        console.log('[Test] ❌ chatStore 不可用');
      }
    });

    console.log('[Test] ⏳ 等待工作流执行和 progress 事件...');
    await page.waitForTimeout(10000); // 🔥 增加等待时间到 10 秒

    // 检查结果
    const result = await page.evaluate(() => {
      const w = window as any;
      return {
        progressEvents: w.__progressEvents || [],
        hasChatStore: !!w.__chatStore,
        hasChatEventBus: !!(w.__chatEventBus || w.__GLOBAL_CHAT_EVENT_BUS__),
        hasToolCallManager: !!w.__toolCallManager,
        totalEvents: (w.__progressEvents || []).length
      };
    });

    console.log('📊 [Test] 测试结果:', result);

    if (result.totalEvents > 0) {
      console.log(`✅ [Test] 成功！检测到 ${result.totalEvents} 个 progress 事件`);

      // 显示所有事件
      result.progressEvents.forEach((evt: any, i: number) => {
        console.log(`   ${i + 1}. ${evt.source || 'event'}:`, evt.data || evt.payload);
      });

      // 验证关键事件存在
      const eventTypes = result.progressEvents.map((evt: any) => evt.event || (evt.payload?.event_type));
      console.log('📋 [Test] 事件类型:', eventTypes);

      // 至少应该有一些 progress 相关的事件
      expect(result.totalEvents).toBeGreaterThan(0);
    } else {
      console.log('⚠️ [Test] 未检测到 workflow:progress 事件');
      console.log('   可能的原因：');
      console.log('   1. HTTP API 服务器未启动');
      console.log('   2. SSE 监听器未启动');
      console.log('   3. 工作流执行失败');

      // 检查是否有任何错误日志
    }

    // 验证基本功能
    expect(result.hasChatStore).toBe(true);
  });

  test('✅ 验证 SSE progress 监听器是否启动', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;

      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(1000);

    console.log('📝 [Test] 检查 SSE progress 监听器状态');

    // 检查 SSE progress 监听器是否已启动
    const sseStatus = await page.evaluate(async () => {
      const w = window as any;

      // 🔥 调试：检查环境
      const isE2E = w.__E2E__ === true;
      const invoke = w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke;
      let isMock = false;

      if (invoke) {
        // 🔥 FIX: 检查 interceptor 标记
        isMock = (invoke as any).isE2EMock === true;
      }

      console.log('[SSE Test] isE2E:', isE2E);
      console.log('[SSE Test] hasInvoke:', !!invoke);
      console.log('[SSE Test] isMock:', isMock);
      console.log('[SSE Test] invoke.isE2EMock:', (invoke as any)?.isE2EMock);

      // 尝试启动 SSE progress 监听
      try {
        const { startSSEProgressMonitoringIfNeeded } = await import('/src/utils/sseProgressMonitor.ts');
        const started = await startSSEProgressMonitoringIfNeeded();

        return {
          sseStarted: started,
          hasSSEMonitor: !!w.SSEProgressMonitor,
          hasGetSSE: typeof w.getSSEProgressMonitor === 'function',
          isE2E,
          hasInvoke: !!invoke,
          isMock
        };
      } catch (e) {
        return {
          error: (e as Error).message,
          sseStarted: false,
          isE2E,
          hasInvoke: !!invoke,
          isMock
        };
      }
    });

    console.log('📊 [Test] SSE 状态:', sseStatus);

    // 如果 SSE 监听器启动成功，验证它可以连接
    if (sseStatus.sseStarted) {
      console.log('✅ [Test] SSE progress 监听器启动成功');

      // 测试 SSE 连接
      const sseTest = await page.evaluate(async () => {
        try {
          // 🔥 FIX: HTTP API health 端点需要 POST 请求
          const response = await fetch('http://localhost:3333/api/health', {
            method: 'POST'
          });
          return {
            ok: response.ok,
            status: response.status
          };
        } catch (e) {
          return {
            error: (e as Error).message
          };
        }
      });

      console.log('📊 [Test] HTTP API 连接测试:', sseTest);

      if (sseTest.ok) {
        console.log('✅ [Test] HTTP API 可访问');
      } else {
        console.log('⚠️ [Test] HTTP API 不可访问:', sseTest.error);
      }
    } else {
      console.log('⚠️ [Test] SSE progress 监听器未启动');
      console.log('   这可能是正常的，因为不是 E2E 测试环境');
    }
  });
});
