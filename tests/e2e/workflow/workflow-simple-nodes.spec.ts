/**
 * 🎯 简单测试：验证计划节点是否正确发送
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('计划节点测试', () => {

  test('✅ 验证 workflow:started 包含计划节点', async ({ page }) => {
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
      (window as any).__E2E_REAL_TAURI_MODE__ = false;  // 🔥 使用 Mock 模式
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });

    await page.waitForTimeout(1000);

    // 🔥 捕获控制台日志
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      console.log('[Browser Console]', text);
    });

    // 🔥 设置事件监听
    await page.evaluate(() => {
      (window as any).__testResults = {
        workflowStartedReceived: false,
        plannedNodesCount: 0,
        plannedNodes: [],
        events: []
      };

      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;

      if (chatEventBus) {
        console.log('[Test] ✅ chatEventBus found');

        chatEventBus.on('workflow:started' as any, (data: any) => {
          console.log('[Test] 📋 workflow:started received, raw data:', data);
          console.log('[Test] 📋 data type:', typeof data);
          console.log('[Test] 📋 data.nodes:', data.nodes);
          console.log('[Test] 📋 data.nodes type:', typeof data.nodes);
          console.log('[Test] 📋 data.nodes length:', data.nodes?.length);

          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
            console.log('[Test] 📋 parsed data:', parsedData);
            console.log('[Test] 📋 parsed.nodes:', parsedData.nodes);
          }

          // 🔥 FIX: 只在第一次收到事件时记录结果（避免后续无节点的事件覆盖）
          const currentResults = (window as any).__testResults;
          if (!currentResults.workflowStartedReceived || currentResults.plannedNodesCount === 0) {
            (window as any).__testResults.workflowStartedReceived = true;
            (window as any).__testResults.plannedNodesCount = parsedData.nodes?.length || 0;
            (window as any).__testResults.plannedNodes = parsedData.nodes || [];
            console.log('[Test] ✅ Test results updated:', (window as any).__testResults);
          } else {
            console.log('[Test] ⚠️ Ignoring duplicate event, preserving first result');
          }
        });
      } else {
        console.log('[Test] ❌ chatEventBus NOT found!');
      }
    });

    await page.waitForTimeout(500);

    console.log('[Test] 📝 Sending /explore command');

    // 发送 /explore 命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    console.log('[Test] ⏳ Waiting for workflow execution...');
    await page.waitForTimeout(10000);  // 等待 10 秒

    // 获取测试结果
    const result = await page.evaluate(() => {
      const w = window as any;
      return {
        workflowStartedReceived: w.__testResults?.workflowStartedReceived || false,
        plannedNodesCount: w.__testResults?.plannedNodesCount || 0,
        plannedNodes: w.__testResults?.plannedNodes || [],
        hasChatStore: !!w.__chatStore,
        hasChatEventBus: !!(w.__chatEventBus || w.__GLOBAL_CHAT_EVENT_BUS__),
        consoleLogs: (window as any).__consoleLogs || []
      };
    });

    console.log('\n📊 [Test] ===== 测试结果 =====');
    console.log('workflowStartedReceived:', result.workflowStartedReceived);
    console.log('plannedNodesCount:', result.plannedNodesCount);
    console.log('plannedNodes:', result.plannedNodes);
    console.log('hasChatStore:', result.hasChatStore);
    console.log('hasChatEventBus:', result.hasChatEventBus);
    console.log('========================\n');

    // 打印控制台日志（查找我们添加的调试日志）
    console.log('\n📋 [Browser Console Logs]');
    const relevantLogs = consoleLogs.filter(log =>
      log.includes('[WorkflowIntentHandler]') ||
      log.includes('[Test]') ||
      log.includes('Mock planned nodes')
    );
    relevantLogs.forEach(log => console.log('  ', log));
    console.log('========================\n');

    // 断言
    expect(result.workflowStartedReceived).toBe(true);
    expect(result.plannedNodesCount).toBeGreaterThan(0);
    expect(result.plannedNodes.length).toBeGreaterThan(0);

    // 验证第一个节点
    const firstNode = result.plannedNodes[0];
    expect(firstNode.id).toBeDefined();
    expect(firstNode.label).toBeDefined();
    expect(firstNode.agent_type).toBeDefined();

    console.log('✅ [Test] 所有断言通过！');
  });
});
