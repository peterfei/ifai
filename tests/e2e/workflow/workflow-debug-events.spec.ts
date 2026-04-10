/**
 * 🎯 真实后端事件调试测试
 *
 * 这个测试专门用于调试真实后端发送的事件
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('真实后端事件调试', () => {

  test('🔍 调试 /explore 命令的事件流程', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true  // 🔥 使用真实 LLM
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置必要的 store
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;

      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    console.log('📝 [Test] 设置事件监听器');

    // 🔥 设置事件监听器来捕获所有工作流事件
    await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus;
      if (!chatEventBus) {
        console.error('[Test] ❌ chatEventBus not available');
        return;
      }

      // 监听所有工作流事件
      const events = [];
      (window as any).__capturedWorkflowEvents = events;

      const captureEvent = (eventName) => {
        chatEventBus.on(eventName, (payload) => {
          console.log(`[Test] 📨 Event received: ${eventName}`, payload);
          events.push({
            event: eventName,
            payload,
            timestamp: Date.now()
          });
        });
      };

      // 监听所有工作流相关事件
      captureEvent('workflow:started');
      captureEvent('workflow:progress');
      captureEvent('workflow:completed');
      captureEvent('workflow:response');
      captureEvent('workflow:error');

      console.log('[Test] ✅ Event listeners set up');
    });

    console.log('📝 [Test] 发送 /explore 命令');

    // 发送 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    console.log('📝 [Test] 等待 30 秒，收集事件...');

    // 等待 30 秒，让工作流执行并收集事件
    await page.waitForTimeout(30000);

    // 检查捕获的事件
    const capturedEvents = await page.evaluate(() => {
      const events = (window as any).__capturedWorkflowEvents || [];

      // 同时检查全局状态
      const globalState = (window as any).__GLOBAL_WORKFLOW_STATES__;
      const activeWorkflows = (window as any).__GLOBAL_ACTIVE_WORKFLOWS__;

      return {
        eventCount: events.length,
        events: events.map(e => ({
          event: e.event,
          workflowId: e.payload.workflowId || e.payload.workflow_id,
          hasNodeId: !!e.payload.node_id,
          hasToolDetails: !!e.payload.tool_details,
          payloadPreview: JSON.stringify(e.payload).substring(0, 200)
        })),
        globalWorkflowIds: globalState ? Array.from(globalState.keys()) : [],
        activeWorkflowIds: activeWorkflows ? Array.from(activeWorkflows) : []
      };
    });

    console.log('📊 [Test] 捕获的事件统计:', capturedEvents);

    // 🔥 关键断言
    expect(capturedEvents.eventCount).toBeGreaterThan(0, '应该至少有一个工作流事件');

    // 检查是否有 workflow:started 事件
    const hasStartedEvent = capturedEvents.events.some(e => e.event === 'workflow:started');
    console.log('📊 [Test] 有 workflow:started 事件:', hasStartedEvent);

    // 检查是否有 workflow:progress 事件
    const hasProgressEvent = capturedEvents.events.some(e => e.event === 'workflow:progress');
    console.log('📊 [Test] 有 workflow:progress 事件:', hasProgressEvent);

    // 检查 progress 事件是否有 node_id
    const progressWithNodeId = capturedEvents.events.filter(e =>
      e.event === 'workflow:progress' && e.hasNodeId
    );
    console.log('📊 [Test] 有 node_id 的 workflow:progress 事件:', progressWithNodeId.length);

    // 检查 progress 事件是否有 tool_details
    const progressWithToolDetails = capturedEvents.events.filter(e =>
      e.event === 'workflow:progress' && e.hasToolDetails
    );
    console.log('📊 [Test] 有 tool_details 的 workflow:progress 事件:', progressWithToolDetails.length);

    // 打印所有捕获的事件
    console.log('📋 [Test] 所有捕获的事件:');
    capturedEvents.events.forEach((e, index) => {
      console.log(`  ${index + 1}. ${e.event}`);
      console.log(`     workflowId: ${e.workflowId}`);
      console.log(`     hasNodeId: ${e.hasNodeId}`);
      console.log(`     hasToolDetails: ${e.hasToolDetails}`);
      console.log(`     preview: ${e.payloadPreview}`);
    });
  });
});
