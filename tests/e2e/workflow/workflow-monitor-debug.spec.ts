/**
 * 🐛 调试测试：验证 WorkflowInlineMonitor 组件是否渲染
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Workflow Monitor 调试', () => {

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('🔍 验证 Monitor 组件渲染', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false  // 使用 Mock 模式
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = false;
      (window as any).__layoutStore?.setState({ isChatOpen: true });

      // 🔥 CRITICAL: 配置 Mock API Key，让聊天面板正常显示
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        console.log('[Test] 🔧 Configuring Mock API Key using updateProviderConfig...');
        // 使用正确的配置方法
        settingsStore.getState().updateProviderConfig('deepseek', {
          apiKey: 'sk-mock-key-for-testing',
          baseUrl: 'https://api.deepseek.com'
        });
        console.log('[Test] ✅ Mock API Key configured');
      } else {
        console.log('[Test] ⚠️ settingsStore not found');
      }
    });

    await page.waitForTimeout(1000);

    // 🔥 发送命令前检查 activeWorkflows
    const beforeCommand = await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;
      const globalChatEventBus = (window as any).__GLOBAL_CHAT_EVENT_BUS__;

      // 🔥 尝试访问 globalActiveWorkflows（通过调试面板）
      const debugText = document.querySelector('.bg-yellow-100, .dark\\:bg-yellow-900\\/30')?.textContent || null;
      const hasActiveWorkflow = debugText?.includes('hasActiveWorkflow: true') || false;

      return {
        hasEventBus: !!chatEventBus,
        eventBusType: chatEventBus ? chatEventBus.constructor.name : null,
        hasGlobalChatEventBus: !!globalChatEventBus,
        debugText,
        hasActiveWorkflow
      };
    });
    console.log('📊 [Before] Command state:', beforeCommand);

    // 🔥 监听 workflow:started 事件
    await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;
      if (chatEventBus) {
        // 🔥 检查是否有其他监听器
        console.log('[Test] 🔍 ChatEventBus listeners before registration:',
          Object.keys(chatEventBus.events || {}).length);

        chatEventBus.on('workflow:started' as any, (data: any) => {
          console.log('[Test Listener] 📋 workflow:started received:', data);
          (window as any).__workflowStartedReceived = true;
          (window as any).__workflowStartedData = data;

          // 🔥 检查是否有全局 activeWorkflows
          const globalActiveWorkflows = (window as any).globalActiveWorkflowsForDebug;
          console.log('[Test Listener] 🔍 globalActiveWorkflows at workflow:started:',
            globalActiveWorkflows ? JSON.stringify(Array.from(globalActiveWorkflows)) : 'not available');
        });

        chatEventBus.on('workflow:progress' as any, (data: any) => {
          console.log('[Test Listener] 📊 workflow:progress received:', data);
          (window as any).__workflowProgressReceived = true;
          (window as any).__workflowProgressEvents = (window as any).__workflowProgressEvents || [];
          (window as any).__workflowProgressEvents.push(data);
        });

        // 🔥 监听所有事件（用于调试）
        chatEventBus.on('*' as any, (eventName: string, data: any) => {
          console.log('[Test Listener] ⭐ Event received:', eventName, data);
        });

        console.log('[Test] ✅ Event listeners registered');
      }
    });

    // 发送命令
    console.log('📝 [Test] Sending /explore command');
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    // 等待 5 秒
    console.log('[Test] ⏳ Waiting 5 seconds...');
    await page.waitForTimeout(5000);

    // 额外等待：使用条件等待确保事件被处理和组件渲染
    await page.waitForFunction(() => {
      // 等待 workflow:started 事件被接收
      return (window as any).__workflowStartedReceived === true;
    }, { timeout: 10000 }).catch(() => {
      console.log('[Test] ⚠️ 等待 workflow:started 事件超时');
    });

    // 等待 Monitor DOM 渲染
    await page.waitForFunction(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      return !!monitor;
    }, { timeout: 10000 }).catch(() => {
      console.log('[Test] ⚠️ 等待 Monitor DOM 渲染超时');
    });

    // 🔥 检查状态
    const afterCommand = await page.evaluate(() => {
      // 🔥 读取 console.log 日志
      const consoleLogs = (window as any).__testConsoleLogs || [];

      // 检查事件是否被接收
      const workflowStartedReceived = (window as any).__workflowStartedReceived;
      const workflowStartedData = (window as any).__workflowStartedData;
      const workflowProgressReceived = (window as any).__workflowProgressReceived;
      const workflowProgressEvents = (window as any).__workflowProgressEvents || [];

      // 🔥 检查 globalActiveWorkflows
      // 注意：globalActiveWorkflows 是在 WorkflowInlineMonitor.tsx 中定义的
      // 但它是一个模块级别的全局变量，不直接暴露给 window
      // 我们需要检查 WorkflowInlineMonitorContainer 的状态

      // 检查 DOM
      const monitorElement = document.querySelector('[data-monitor="true"]');
      const monitorExists = !!monitorElement;
      const monitorHTML = monitorElement ? monitorElement.innerHTML.substring(0, 500) : null;

      // 🔥 检查 AIChat 组件是否存在
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      const chatPanelExists = !!chatPanel;
      const chatPanelHTML = chatPanel ? chatPanel.innerHTML.substring(0, 1000) : null;  // 增加到 1000 字符

      // 🔥 检查 AIChat 组件的所有子元素
      const chatPanelChildren = chatPanel ? Array.from(chatPanel.children).map(child => ({
        tagName: child.tagName,
        testId: child.getAttribute('data-testid'),
        textContent: child.textContent?.substring(0, 100)
      })) : [];

      // 🔥 检查 placeholder div 是否存在
      const placeholder = document.querySelector('[data-testid="workflow-monitor-placeholder"]');
      const placeholderExists = !!placeholder;
      const placeholderText = placeholder ? placeholder.textContent : null;

      // 🔥 检查 aichat-debug div 是否存在
      const aichatDebug = document.querySelector('[data-testid="aichat-debug"]');
      const aichatDebugExists = !!aichatDebug;
      const aichatDebugText = aichatDebug ? aichatDebug.textContent : null;

      // 检查调试面板
      const debugPanel = document.querySelector('.bg-yellow-100, .dark\\:bg-yellow-900\\/30');
      const debugText = debugPanel ? debugPanel.textContent : null;

      // 检查节点
      const nodeElements = monitorElement ? monitorElement.querySelectorAll('[data-node-id]') : [];
      const nodeCount = nodeElements.length;

      return {
        consoleLogs,
        workflowStartedReceived,
        workflowStartedData,
        workflowProgressReceived,
        workflowProgressEventCount: workflowProgressEvents.length,
        monitorExists,
        monitorHTML,
        chatPanelExists,
        chatPanelHTML,
        chatPanelChildren,
        placeholderExists,
        placeholderText,
        aichatDebugExists,
        aichatDebugText,
        debugText,
        nodeCount,
        allProgressEvents: workflowProgressEvents.map((e: any) => ({
          event_type: e.event_type,
          node_id: e.node_id,
          message: e.message
        }))
      };
    });

    console.log('\n📊 [After] Command state:');
    console.log('   Console logs count:', afterCommand.consoleLogs.length);
    if (afterCommand.consoleLogs.length > 0) {
      console.log('   Console logs (last 10):');
      afterCommand.consoleLogs.slice(-10).forEach((log: string) => {
        console.log(`     - ${log}`);
      });
    }
    console.log('   workflow:started received:', afterCommand.workflowStartedReceived);
    console.log('   workflow:progress received:', afterCommand.workflowProgressReceived);
    console.log('   progress event count:', afterCommand.workflowProgressEventCount);
    console.log('   AIChat panel exists:', afterCommand.chatPanelExists);
    console.log('   AIChat children count:', afterCommand.chatPanelChildren.length);
    afterCommand.chatPanelChildren.forEach((child: any, i: number) => {
      console.log(`     ${i + 1}. ${child.tagName} - ${child.testId || '(no testId)'} - ${child.textContent?.substring(0, 50) || '(no text)'}`);
    });
    console.log('   AIChat debug exists:', afterCommand.aichatDebugExists);
    console.log('   Placeholder exists:', afterCommand.placeholderExists);
    console.log('   Monitor exists:', afterCommand.monitorExists);
    console.log('   Debug panel:', afterCommand.debugText);
    console.log('   Node count:', afterCommand.nodeCount);

    if (afterCommand.allProgressEvents.length > 0) {
      console.log('\n📝 Progress events:');
      afterCommand.allProgressEvents.forEach((evt: any, i: number) => {
        console.log(`   ${i + 1}. ${evt.event_type}: ${evt.message || '(no message)'}`);
      });
    }

    // 断言
    expect(afterCommand.workflowStartedReceived).toBeTruthy();
    expect(afterCommand.workflowProgressReceived).toBeTruthy();
    expect(afterCommand.monitorExists).toBeTruthy();
    expect(afterCommand.nodeCount).toBeGreaterThan(0);
  });
});
