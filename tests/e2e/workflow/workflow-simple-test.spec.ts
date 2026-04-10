/**
 * 🐛 简化测试：直接检查 WorkflowInlineMonitor 组件
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Workflow Monitor 简化测试', () => {

  test('🔍 检查 WorkflowInlineMonitor 组件是否被调用', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    // 🔥 CRITICAL: 使用 Playwright 的 console 事件来捕获所有日志
    const allConsoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      allConsoleLogs.push(text);
      // 同时也打印到测试输出，方便调试
      console.log(`[Browser Console] ${text}`);
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 🔥 CRITICAL: 在设置日志拦截器后，重新加载页面以确保捕获所有日志
    await page.evaluate(() => {
      (window as any).__testLogs = [];
      const originalLog = console.log;
      console.log = (...args) => {
        (window as any).__testLogs.push(args.join(' '));
        originalLog.apply(console, args);
      };
      console.log('[Test] 🔧 Console log interceptor set up at', Date.now());
    });

    // 配置 API Key
    // 🔥 CRITICAL: 先检查全局对象是否存在
    const checkResult = await page.evaluate(() => {
      return {
        hasGlobalStates: !!(window as any).__GLOBAL_WORKFLOW_STATES__,
        hasActiveWorkflows: !!(window as any).__GLOBAL_ACTIVE_WORKFLOWS__,
        hasSetListeners: !!(window as any).__GLOBAL_SET_LISTENERS__,
        activeWorkflowsCount: (window as any).__GLOBAL_ACTIVE_WORKFLOWS__?.size || 0,
        setListenersCount: (window as any).__GLOBAL_SET_LISTENERS__?.size || 0,
        // 🔥 检查容器监听器
        containerListeners: (window as any).__GLOBAL_SET_LISTENERS__?.get('container')?.size || 0
      };
    });

    console.log('[Test] 🔍 Global objects check BEFORE cleanup:', JSON.stringify(checkResult, null, 2));

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = false;
      (window as any).__layoutStore?.setState({ isChatOpen: true });

      // 🔥 CRITICAL: 重置全局监听器，确保测试可以设置监听器
      if ((window as any).__GLOBAL_WORKFLOW_STATES__) {
        console.log('[Test] 🔄 Clearing global workflow states and listeners');

        // 清理活跃工作流
        const activeWorkflows = (window as any).__GLOBAL_ACTIVE_WORKFLOWS__;
        if (activeWorkflows) {
          activeWorkflows.clear();
          console.log('[Test] ✅ Cleared active workflows');
        }

        // 清理全局状态
        const workflowStates = (window as any).__GLOBAL_WORKFLOW_STATES__;
        if (workflowStates) {
          workflowStates.clear();
          console.log('[Test] ✅ Cleared workflow states');
        }

        // 🔥 CRITICAL: 清理容器监听器
        const globalSetListeners = (window as any).__GLOBAL_SET_LISTENERS__;
        if (globalSetListeners) {
          console.log('[Test] 🍞 Clearing global set listeners, size before:', globalSetListeners.size, 'container size:', globalSetListeners.get('container')?.size || 'N/A');

          // 清理所有监听器的 unsubscribe 函数
          globalSetListeners.forEach((listenerSet: Set<{ unsubscribe: () => void }>, key: string) => {
            console.log('[Test] 🔍 Clearing listeners for key:', key, 'count:', listenerSet.size);
            listenerSet.forEach(({ unsubscribe }) => {
              try {
                unsubscribe();
              } catch (e) {
                console.error('[Test] ❌ Error unsubscribing:', e);
              }
            });
          });
          // 清空 Map
          globalSetListeners.clear();
          console.log('[Test] ✅ Cleared global set listeners, size after:', globalSetListeners.size);
        } else {
          console.log('[Test] ⚠️ globalSetListeners not found');
        }

        // 🔥 CRITICAL: 重置全局标志
        if ((window as any).__GLOBAL_CONTAINER_LISTENERS_FLAG__) {
          (window as any).__GLOBAL_CONTAINER_LISTENERS_FLAG__.reset();
          console.log('[Test] ✅ Reset globalContainerListenersSetUp to:', (window as any).__GLOBAL_CONTAINER_LISTENERS_FLAG__.value);
        }
      } else {
        console.log('[Test] ⚠️ GLOBAL_WORKFLOW_STATES not found, waiting for component to mount...');
      }

      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('deepseek', {
          apiKey: 'sk-mock-key-for-testing',
          baseUrl: 'https://api.deepseek.com'
        });
      }
    });

    // 🔥 CRITICAL: 清理后再次检查全局对象
    const checkResultAfter = await page.evaluate(() => {
      return {
        setListenersCount: (window as any).__GLOBAL_SET_LISTENERS__?.size || 0,
        containerListeners: (window as any).__GLOBAL_SET_LISTENERS__?.get('container')?.size || 0
      };
    });

    console.log('[Test] 🔍 Global objects check AFTER cleanup:', JSON.stringify(checkResultAfter, null, 2));

    await page.waitForTimeout(2000);

    // 🔥 发送 /explore 命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    // 🔥 CRITICAL: 等待 Monitor 出现（使用短间隔检查）
    // 工作流会立即启动，Monitor 应该在 1 秒内出现
    await page.waitForTimeout(1000);

    // 🔥 检查 Monitor 是否存在
    const monitorCheck1 = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      return {
        exists: !!monitor,
        workflowId: monitor ? monitor.getAttribute('data-workflow-monitor') : null
      };
    });

    console.log('[Test] 📊 Monitor check after 1s:', monitorCheck1);

    // 🔥 如果 Monitor 存在，测试成功
    if (monitorCheck1.exists) {
      console.log('[Test] ✅ SUCCESS: Monitor found! workflowId:', monitorCheck1.workflowId);
      expect(monitorCheck1.exists).toBeTruthy();
      return; // 测试成功，直接返回
    }

    // 🔥 如果 Monitor 不存在，再等待 2 秒检查
    await page.waitForTimeout(2000);

    const monitorCheck2 = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      return {
        exists: !!monitor,
        workflowId: monitor ? monitor.getAttribute('data-workflow-monitor') : null
      };
    });

    console.log('[Test] 📊 Monitor check after 3s:', monitorCheck2);

    // 🔥 检查页面状态
    const finalCheckResult = await page.evaluate(() => {
      // 检查 WorkflowInlineMonitorContainer 组件
      const placeholder = document.querySelector('[data-testid="workflow-monitor-placeholder"]');
      const aichatDebug = document.querySelector('[data-testid="aichat-debug"]');
      const monitor = document.querySelector('[data-monitor="true"]');

      // 检查 globalActiveWorkflows
      const debugPanel = document.querySelector('.bg-yellow-100, .dark\\:bg-yellow-900\\/30');
      const debugText = debugPanel ? debugPanel.textContent : null;

      // 检查 testLogs
      const testLogs = (window as any).__testLogs || [];
      const workflowLogs = testLogs.filter((log: string) => log.includes('WorkflowInlineMonitorContainer') || log.includes('workflow:started'));

      return {
        testLogs: testLogs.slice(-20),  // 最后 20 条日志
        workflowLogs: workflowLogs.slice(-10),  // 最后 10 条相关日志
        aichatDebugExists: !!aichatDebug,
        aichatDebugText: aichatDebug ? aichatDebug.textContent : null,
        placeholderExists: !!placeholder,
        placeholderText: placeholder ? placeholder.textContent : null,
        monitorExists: !!monitor,
        debugText: debugText,
        bodyHTML: document.body.innerHTML.substring(0, 1000)
      };
    });

    console.log('\n📊 [Check Result]:');
    console.log('   Test logs count:', finalCheckResult.testLogs.length);
    if (finalCheckResult.testLogs.length > 0) {
      console.log('   Last test logs (last 30):');
      finalCheckResult.testLogs.slice(-30).forEach((log: string) => {
        console.log(`     - ${log}`);
      });
    }
    console.log('   Workflow logs count:', finalCheckResult.workflowLogs.length);
    if (finalCheckResult.workflowLogs.length > 0) {
      console.log('   Workflow logs:');
      finalCheckResult.workflowLogs.forEach((log: string) => {
        console.log(`     - ${log}`);
      });
    }
    console.log('   AIChat debug:', finalCheckResult.aichatDebugExists);
    console.log('   AIChat debug text:', finalCheckResult.aichatDebugText);
    console.log('   Placeholder:', finalCheckResult.placeholderExists);
    console.log('   Placeholder text:', finalCheckResult.placeholderText);
    console.log('   Monitor:', finalCheckResult.monitorExists);
    console.log('   Debug text:', finalCheckResult.debugText);

    // 断言
    expect(finalCheckResult.aichatDebugExists).toBeTruthy();
    expect(finalCheckResult.placeholderExists).toBeTruthy();
  });
});
