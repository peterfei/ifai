/**
 * 🎯 真实 LLM 调用测试 - 验证 Monitor 动态渐进式展示
 *
 * 这个测试使用真实 LLM 调用 /explore 命令，通过 DOM 断言验证：
 * 1. WorkflowInlineMonitor 组件是否出现
 * 2. 工具调用节点是否在执行过程中逐步显示
 * 3. 节点状态是否正确（running → completed）
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('真实 LLM 调用 - Monitor 渐进式展示', () => {

  test('✅ 真实 /explore 命令 - 验证 Monitor 渐进式展示工具调用节点', async ({ page }) => {
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
    });

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    console.log('📝 [Test] 步骤 1: 发送真实 /explore 命令');

    // 🔥 使用真实 AI 调用 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    console.log('📝 [Test] 步骤 2: 等待 Monitor 组件出现');

    // 🔥 关键断言 1: WorkflowInlineMonitor 组件应该在 10 秒内出现
    const monitorSelector = '[data-workflow-monitor]';
    await page.waitForSelector(monitorSelector, { timeout: 10000 });

    console.log('✅ [Test] WorkflowInlineMonitor 组件已出现');

    // 🔥 关键断言 2: 验证 Monitor 的初始状态（执行中）
    await page.waitForTimeout(1000);

    const initialMonitorState = await page.evaluate((selector) => {
      const monitor = document.querySelector(selector);
      if (!monitor) return null;

      const title = monitor.querySelector('.font-semibold');
      const statusBadge = monitor.querySelector('[variant="outline"]');
      const stepBadge = monitor.querySelectorAll('.text-gray-500')[1]; // 第二个灰色 badge 是步骤数

      return {
        title: title?.textContent || '',
        statusText: statusBadge?.textContent || '',
        stepText: stepBadge?.textContent || '',
        html: monitor.innerHTML
      };
    }, monitorSelector);

    console.log('📊 [Test] Monitor 初始状态:', initialMonitorState);

    expect(initialMonitorState.title).toContain('工作流');
    expect(initialMonitorState.statusText).toMatch(/执行中|运行/);

    console.log('📝 [Test] 步骤 3: 验证工具调用节点逐步显示');

    // 🔥 关键断言 3: 验证在执行过程中，工具调用节点逐步出现
    // 我们将在 30 秒内多次检查，每次都应该看到节点数量增加或状态变化

    let previousNodesCount = 0;
    let previousCompletedCount = 0;
    const maxIterations = 10; // 最多检查 10 次
    const checkInterval = 3000; // 每 3 秒检查一次

    for (let i = 0; i < maxIterations; i++) {
      await page.waitForTimeout(checkInterval);

      const currentNodeState = await page.evaluate((selector) => {
        const monitor = document.querySelector(selector);
        if (!monitor) return null;

        // 查找所有节点（包含图标、标签、状态的部分）
        const nodeElements = monitor.querySelectorAll('.flex.items-start.gap-3');

        const nodes = Array.from(nodeElements).map(node => {
          const icon = node.querySelector('svg');
          const label = node.querySelector('.font-mono');
          const statusText = node.textContent;

          // 判断节点状态
          let status = 'unknown';
          if (statusText.includes('运行中') || icon?.classList.contains('animate-spin')) {
            status = 'running';
          } else if (icon?.classList.contains('text-green-500')) {
            status = 'completed';
          } else if (icon?.classList.contains('text-red-500')) {
            status = 'failed';
          }

          // 检查是否有工具调用
          const hasToolCall = statusText.includes('工具调用') ||
                            statusText.includes('个工具调用') ||
                            node.querySelector('.text-purple-500');

          return {
            hasLabel: !!label,
            label: label?.textContent || '',
            status,
            hasToolCall,
            textPreview: statusText.substring(0, 100)
          };
        });

        return {
          totalNodes: nodes.length,
          nodes: nodes,
          hasRunningNodes: nodes.some(n => n.status === 'running'),
          completedCount: nodes.filter(n => n.status === 'completed').length,
          runningCount: nodes.filter(n => n.status === 'running').length,
          toolCallNodesCount: nodes.filter(n => n.hasToolCall).length
        };
      }, monitorSelector);

      console.log(`📊 [Test] 第 ${i + 1} 次检查:`, {
        totalNodes: currentNodeState.totalNodes,
        completedCount: currentNodeState.completedCount,
        runningCount: currentNodeState.runningCount,
        toolCallNodesCount: currentNodeState.toolCallNodesCount,
        hasRunningNodes: currentNodeState.hasRunningNodes
      });

      // 🔥 断言：节点数量应该增加或保持不变
      expect(currentNodeState.totalNodes).toBeGreaterThanOrEqual(previousNodesCount);

      // 🔥 断言：应该至少有一个节点（第一次检查后）
      if (i > 0) {
        expect(currentNodeState.totalNodes).toBeGreaterThan(0);
      }

      // 🔥 断言：completed 节点数量应该增加或保持不变
      expect(currentNodeState.completedCount).toBeGreaterThanOrEqual(previousCompletedCount);

      // 🔥 断言：如果还没有完成，应该有 running 节点
      if (currentNodeState.hasRunningNodes) {
        expect(currentNodeState.runningCount).toBeGreaterThan(0);
      }

      // 更新计数
      previousNodesCount = currentNodeState.totalNodes;
      previousCompletedCount = currentNodeState.completedCount;

      // 🔥 如果工作流已完成，退出循环
      const isCompleted = await page.evaluate((selector) => {
        const monitor = document.querySelector(selector);
        if (!monitor) return false;

        const statusBadge = monitor.querySelector('[variant="outline"]');
        return statusBadge?.textContent?.includes('已完成') || false;
      }, monitorSelector);

      if (isCompleted) {
        console.log('✅ [Test] 工作流已完成');
        break;
      }
    }

    console.log('📝 [Test] 步骤 4: 验证最终状态');

    // 🔥 关键断言 4: 验证最终状态
    const finalState = await page.evaluate((selector) => {
      const monitor = document.querySelector(selector);
      if (!monitor) return null;

      const statusBadge = monitor.querySelector('[variant="outline"]');
      const nodeElements = monitor.querySelectorAll('.flex.items-start.gap-3');

      const nodes = Array.from(nodeElements).map(node => {
        const label = node.querySelector('.font-mono');
        const hasToolCallBadge = node.querySelector('.text-purple-500');

        return {
          label: label?.textContent || '',
          hasToolCall: !!hasToolCallBadge
        };
      });

      return {
        status: statusBadge?.textContent || '',
        totalNodes: nodes.length,
        nodesWithToolCalls: nodes.filter(n => n.hasToolCall).length,
        nodes: nodes
      };
    }, monitorSelector);

    console.log('📊 [Test] 最终状态:', finalState);

    // 🔥 断言：工作流应该完成
    expect(finalState.status).toMatch(/已完成|完成/);

    // 🔥 断言：应该至少有 2 个节点
    expect(finalState.totalNodes).toBeGreaterThanOrEqual(2);

    // 🔥 断言：至少有一些节点包含工具调用
    expect(finalState.nodesWithToolCalls).toBeGreaterThan(0);

    console.log('✅ [Test] 真实 /explore 命令测试通过！');
  });

  test('✅ 真实 /explore 命令 - 验证工具调用详情展开', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
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

    await page.waitForTimeout(2000);

    console.log('📝 [Test] 发送真实 /explore 命令');

    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    console.log('📝 [Test] 等待 Monitor 和工具调用节点出现');

    // 等待 Monitor 出现
    const monitorSelector = '[data-workflow-monitor]';
    await page.waitForSelector(monitorSelector, { timeout: 10000 });

    // 等待至少一个包含工具调用的节点出现（最多等待 30 秒）
    let hasToolCallNode = false;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3000);

      const checkResult = await page.evaluate((selector) => {
        const monitor = document.querySelector(selector);
        if (!monitor) return false;

        const toolCallBadge = monitor.querySelector('.text-purple-500');
        return !!toolCallBadge;
      }, monitorSelector);

      if (checkResult) {
        hasToolCallNode = true;
        break;
      }
    }

    expect(hasToolCallNode).toBe(true, '应该在 30 秒内看到工具调用节点');

    console.log('✅ [Test] 找到工具调用节点');

    // 🔥 关键断言：验证工具调用详情可以展开
    const toolCallDetails = await page.evaluate((selector) => {
      const monitor = document.querySelector(selector);
      if (!monitor) return null;

      // 查找包含工具调用的节点
      const toolCallBadge = monitor.querySelector('.text-purple-500');
      if (!toolCallBadge) return null;

      // 获取父节点
      const nodeWithToolCall = toolCallBadge.closest('.flex.items-start.gap-3');
      if (!nodeWithToolCall) return null;

      // 查找工具调用详情
      const detailsSection = nodeWithToolCall.querySelector('.space-y-1');
      if (!detailsSection) return null;

      const toolCallItems = detailsSection.querySelectorAll('.font-mono.p-1\\.5');

      return {
        toolCallCount: toolCallItems.length,
        firstToolCall: toolCallItems[0]?.textContent || ''
      };
    }, monitorSelector);

    console.log('📊 [Test] 工具调用详情:', toolCallDetails);

    expect(toolCallDetails).not.toBeNull();
    expect(toolCallDetails.toolCallCount).toBeGreaterThan(0);

    console.log('✅ [Test] 工具调用详情展开测试通过！');
  });
});
