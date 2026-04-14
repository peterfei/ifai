/**
 * 🎯 工作流流畅监控测试
 *
 * 验证工作流监控器能够：
 * 1. 在工作流开始时立即显示所有计划节点（pending 状态）
 * 2. 渐进式更新节点状态（pending → running → completed）
 * 3. 提供流畅的用户体验，没有长时间等待
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('工作流流畅监控测试', () => {

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 验证 /explore 命令的流畅监控体验', async ({ page }) => {
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
      (window as any).__E2E_REAL_TAURI_MODE__ = true;  // 使用真实 HTTP API
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });

    await page.waitForTimeout(1000);

    // 🔥 设置 workflow:started 事件监听器，验证是否包含计划节点
    await page.evaluate(() => {
      (window as any).__monitorState = {
        startedReceived: false,
        plannedNodesCount: 0,
        plannedNodes: [],
        progressEvents: []
      };

      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;
      if (chatEventBus) {
        // 监听 workflow:started 事件
        chatEventBus.on('workflow:started' as any, (data: any) => {
          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
          }

          console.log('[Test] 📋 workflow:started received:', parsedData);
          (window as any).__monitorState.startedReceived = true;
          (window as any).__monitorState.plannedNodesCount = parsedData.nodes?.length || 0;
          (window as any).__monitorState.plannedNodes = parsedData.nodes || [];
        });

        // 监听 workflow:progress 事件
        chatEventBus.on('workflow:progress' as any, (data: any) => {
          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
          }

          console.log('[Test] 📊 workflow:progress received:', parsedData);
          (window as any).__monitorState.progressEvents.push({
            event_type: parsedData.event_type,
            node_id: parsedData.node_id,
            message: parsedData.message,
            timestamp: Date.now()
          });
        });
      }
    });

    await page.waitForTimeout(500);

    console.log('📝 [Test] 发送 /explore 命令');

    // 发送 /explore 命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    console.log('[Test] ⏳ 等待工作流执行和进度事件...');
    await page.waitForTimeout(15000);  // 等待 15 秒

    // 检查结果
    const result = await page.evaluate(() => {
      const w = window as any;
      return {
        startedReceived: w.__monitorState?.startedReceived || false,
        plannedNodesCount: w.__monitorState?.plannedNodesCount || 0,
        plannedNodes: w.__monitorState?.plannedNodes || [],
        progressEvents: w.__monitorState?.progressEvents || [],
        hasChatStore: !!w.__chatStore,
        hasChatEventBus: !!(w.__chatEventBus || w.__GLOBAL_CHAT_EVENT_BUS__),
      };
    });

    console.log('📊 [Test] 测试结果:', result);

    // ✅ 验证关键指标
    expect(result.hasChatStore).toBe(true);
    expect(result.hasChatEventBus).toBe(true);
    expect(result.startedReceived).toBe(true);

    // ✅ 验证计划节点数量（explore 工作流应该有 1 个节点）
    expect(result.plannedNodesCount).toBeGreaterThan(0);
    console.log(`✅ [Test] 计划节点数量: ${result.plannedNodesCount}`);

    // ✅ 验证计划节点包含必要信息
    if (result.plannedNodes.length > 0) {
      const firstNode = result.plannedNodes[0];
      console.log('✅ [Test] 第一个计划节点:', firstNode);
      expect(firstNode.id).toBeDefined();
      expect(firstNode.label).toBeDefined();
      expect(firstNode.agent_type).toBeDefined();
    }

    // ✅ 验证进度事件
    expect(result.progressEvents.length).toBeGreaterThan(0);
    console.log(`✅ [Test] 进度事件数量: ${result.progressEvents.length}`);

    // 🎯 验证流畅体验：计划节点应该在 progress 事件之前显示
    const firstProgressEvent = result.progressEvents[0];
    const timeDiff = firstProgressEvent.timestamp - result.plannedNodes[0]?.timestamp;
    console.log(`✅ [Test] 节点预显示时间差: ${timeDiff}ms`);

    // 打印所有进度事件
    result.progressEvents.forEach((evt: any, i: number) => {
      console.log(`   ${i + 1}. ${evt.event_type}: ${evt.message || '(no message)'}`);
    });

    console.log('✅ [Test] 流畅监控体验验证通过！');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 验证监控器状态转换：pending → running → completed', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = true;
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });

    await page.waitForTimeout(1000);

    // 监控节点状态变化
    await page.evaluate(() => {
      (window as any).__nodeStates = [];

      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;
      if (chatEventBus) {
        chatEventBus.on('workflow:progress' as any, (data: any) => {
          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
          }

          const eventType = parsedData.event_type;
          const nodeId = parsedData.node_id;

          if (eventType === 'node_started' || eventType === 'node_completed') {
            (window as any).__nodeStates.push({
              event: eventType,
              node: nodeId,
              timestamp: Date.now()
            });
          }
        });
      }
    });

    // 发送命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    await page.waitForTimeout(15000);

    // 验证状态转换
    const result = await page.evaluate(() => {
      const w = window as any;
      const states = w.__nodeStates || [];
      return {
        totalStates: states.length,
        states: states,
        hasNodeStarted: states.some((s: any) => s.event === 'node_started'),
        hasNodeCompleted: states.some((s: any) => s.event === 'node_completed'),
      };
    });

    console.log('📊 [Test] 状态转换结果:', result);

    // 验证状态转换序列
    expect(result.totalStates).toBeGreaterThan(0);
    expect(result.hasNodeStarted).toBe(true);
    expect(result.hasNodeCompleted).toBe(true);

    // 打印状态转换序列
    result.states.forEach((state: any, i: number) => {
      console.log(`   ${i + 1}. ${state.event} - ${state.node}`);
    });

    console.log('✅ [Test] 状态转换验证通过！');
  });
});
