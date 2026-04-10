/**
 * 🐛 简单诊断测试：验证监听器设置
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('🐛 诊断测试', () => {
  let testCounter = 0;

  test('检查监听器是否正常工作', async ({ page }) => {
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.text()}`);
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // 🔥 CRITICAL: 强制重新加载页面来重置所有组件状态
    // 这样可以确保 WorkflowInlineMonitorContainer 重新挂载并设置监听器
    console.log('[E2E] 🔄 Reloading page to reset component state...');
    await page.reload();
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });
    await page.waitForTimeout(2000);

    // 🔥 CRITICAL FIX: 配置 AI provider，否则 AIChat 组件不会渲染实际内容
    console.log('[Test] 🔧 配置 AI provider...');
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        // 使用一个假的 API key 来"配置" provider
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'test-e2e-api-key-12345',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4-flash'
        });
        console.log('[Test] ✅ Provider 配置完成');
      } else {
        console.error('[Test] ❌ settingsStore 不可用');
      }
    });
    await page.waitForTimeout(2000); // 等待状态更新和组件重新渲染

    // 🔥 DEBUG: 检查 AIChat 组件是否被渲染
    const componentCheck = await page.evaluate(() => {
      const workflowMonitorPlaceholder = document.querySelector('[data-testid="workflow-monitor-placeholder"]');
      const aiChatElement = document.querySelector('[data-testid="aichat-debug"]');
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');

      return {
        hasWorkflowMonitorPlaceholder: !!workflowMonitorPlaceholder,
        hasAichatDebug: !!aiChatElement,
        hasChatPanel: !!chatPanel,
        workflowMonitorPlaceholderText: workflowMonitorPlaceholder?.textContent,
        aichatDebugText: aiChatElement?.textContent,
        chatOpen: (window as any).__layoutStore?.getState().isChatOpen
      };
    });
    console.log('🔍 组件渲染检查:', componentCheck);

    // 如果组件没有被渲染，等待更长时间
    if (!componentCheck.hasWorkflowMonitorPlaceholder) {
      console.log('⚠️ WorkflowInlineMonitorContainer 未渲染，等待 5 秒...');
      await page.waitForTimeout(5000);

      const componentCheck2 = await page.evaluate(() => {
        const workflowMonitorPlaceholder = document.querySelector('[data-testid="workflow-monitor-placeholder"]');
        return {
          hasWorkflowMonitorPlaceholder: !!workflowMonitorPlaceholder,
          workflowMonitorPlaceholderText: workflowMonitorPlaceholder?.textContent
        };
      });
      console.log('🔍 第二次组件检查:', componentCheck2);
    }

    // 检查全局状态
    const globalState = await page.evaluate(() => {
      return {
        // 检查全局对象是否存在
        hasGlobalStates: !!(window as any).__GLOBAL_WORKFLOW_STATES__,
        hasActiveWorkflows: !!(window as any).__GLOBAL_ACTIVE_WORKFLOWS__,
        hasSetListeners: !!(window as any).__GLOBAL_SET_LISTENERS__,
        containerListenersSetUp: (window as any).__GLOBAL_CONTAINER_LISTENERS_FLAG__?.value || false,
        activeWorkflowsCount: (window as any).__GLOBAL_ACTIVE_WORKFLOWS__?.size || 0,
        chatEventBus: !!(window as any).chatEventBus || !!(window as any).__chatEventBus
      };
    });

    console.log('📊 全局状态检查:', globalState);

    // 手动触发事件测试
    const testResult = await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;

      if (!chatEventBus) {
        return { error: 'chatEventBus not found' };
      }

      console.log('[Test] 📤 手动触发 workflow:progress 事件');

      // 触发一个测试事件
      chatEventBus.emit('workflow:progress', {
        workflowId: 'test-workflow-123',
        event_type: 'node_started',
        node_id: 'test-node',
        message: '测试消息'
      });

      // 等待一下
      return { success: true };
    });

    await page.waitForTimeout(2000);

    // 再次检查全局状态
    const afterEventState = await page.evaluate(() => {
      return {
        activeWorkflowsCount: (window as any).__GLOBAL_ACTIVE_WORKFLOWS__?.size || 0,
        activeWorkflows: Array.from((window as any).__GLOBAL_ACTIVE_WORKFLOWS__ || [])
      };
    });

    console.log('📊 事件后状态:', afterEventState);

    // 🔥 核心验证：检查手动触发的事件是否被正确处理
    // 从事件后状态可以看到，test-workflow-123 已经被正确添加到活跃工作流
    console.log('✅ 核心功能验证: workflow:progress 事件 → 监听器 → 添加到活跃工作流');
    expect(afterEventState.activeWorkflowsCount).toBeGreaterThan(0);
    expect(afterEventState.activeWorkflows).toContain('test-workflow-123');

    // 🔥 可选：发送真实的 /explore 命令（如果 chatStore 可用）
    console.log('[Test] 📤 尝试发送 /explore 命令...');
    const exploreResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      // 🔥 CRITICAL FIX: 更安全的空值检查
      if (!chatStore) {
        return { success: false, reason: 'chatStore is null' };
      }
      const state = chatStore.getState();
      if (!state) {
        return { success: false, reason: 'chatStore.getState() returned null' };
      }
      if (typeof state.sendMessage !== 'function') {
        return { success: false, reason: 'sendMessage is not a function' };
      }
      state.sendMessage('/explore');
      return { success: true };
    });

    if (exploreResult.success) {
      console.log('[Test] ✅ /explore 命令已发送');
      await page.waitForTimeout(10000);
    } else {
      console.log('[Test] ⚠️ 跳过 /explore 命令:', exploreResult.reason);
      // 手动触发更多测试事件来模拟 /explore 的效果
      await page.evaluate(() => {
        const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
        if (chatEventBus) {
          // 模拟更多节点事件
          for (let i = 1; i <= 3; i++) {
            chatEventBus.emit('workflow:progress', {
              workflowId: 'test-workflow-123',
              event_type: 'node_completed',
              node_id: `test-node-${i}`,
              message: `测试节点 ${i} 完成`
            });
          }
        }
      });
      await page.waitForTimeout(2000);
    }

    // 最终状态检查
    const finalState = await page.evaluate(() => {
      const activeWorkflows = Array.from((window as any).__GLOBAL_ACTIVE_WORKFLOWS__ || []);
      const monitorExists = !!document.querySelector('[data-monitor="true"]');
      const monitorCount = document.querySelectorAll('[data-monitor="true"]').length;

      return {
        activeWorkflows,
        activeWorkflowsCount: activeWorkflows.length,
        monitorExists,
        monitorCount,
        allMonitors: Array.from(document.querySelectorAll('[data-monitor="true"]')).map(el => ({
          workflowId: el.getAttribute('data-workflow-monitor'),
          hasNodes: !!el.querySelector('[data-node-id]'),
          nodeCount: el.querySelectorAll('[data-node-id]').length
        }))
      };
    });

    console.log('📊 最终状态:', finalState);

    // 断言
    expect(finalState.activeWorkflowsCount).toBeGreaterThan(0);
    expect(finalState.monitorExists).toBeTruthy();
  });
});
