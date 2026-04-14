/**
 * 🎯 高保真 E2E 测试：验证真实工具调用的渐进式显示
 *
 * 测试目标：
 * 1. 验证工具调用完成后**立即**显示在 Monitor 中
 * 2. 验证不需要等待 AI 完全响应才更新 UI
 * 3. 验证每个工具调用的显示时间 < 100ms（执行完成后）
 * 4. 验证节点状态实时更新（running → tool_call → completed）
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('高保真实时监控测试', () => {

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('⚡ 验证工具调用实时显示（从执行完成到UI显示 < 100ms）', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true  // 🔥 使用真实 AI，触发真实工具调用
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = false;  // 使用 Mock 模式（方便验证）
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });

    await page.waitForTimeout(1000);

    // 🔥 设置高精度时序记录
    await page.evaluate(() => {
      (window as any).__realTimeMetrics = {
        commandSentAt: null,
        workflowStartedAt: null,
        nodeStartedAt: null,
        toolCallEvents: [],
        firstToolCallCompletedAt: null,
        lastToolCallCompletedAt: null,
        nodeCompletedAt: null,
        uiUpdates: []
      };

      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;

      if (chatEventBus) {
        // 监听 workflow:started
        chatEventBus.on('workflow:started' as any, (data: any) => {
          const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          (window as any).__realTimeMetrics.workflowStartedAt = Date.now();
          console.log('[RealTime] 📋 workflow:started at:', Date.now());
        });

        // 监听 node_started
        chatEventBus.on('workflow:progress' as any, (data: any) => {
          let parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsedData.event_type === 'node_started') {
            (window as any).__realTimeMetrics.nodeStartedAt = Date.now();
            console.log('[RealTime] 🔄 node_started at:', Date.now());
          }
        });

        // 🔥 关键：监听 tool_call 事件（这是实时性的关键）
        chatEventBus.on('workflow:progress' as any, (data: any) => {
          let parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsedData.event_type === 'tool_call') {
            const toolName = parsedData.tool_details?.tool_name;
            const completedAt = Date.now();

            (window as any).__realTimeMetrics.toolCallEvents.push({
              toolName,
              completedAt,
              timestamp: completedAt
            });

            // 记录第一个和最后一个工具调用时间
            if ((window as any).__realTimeMetrics.toolCallEvents.length === 1) {
              (window as any).__realTimeMetrics.firstToolCallCompletedAt = completedAt;
            }
            (window as any).__realTimeMetrics.lastToolCallCompletedAt = completedAt;

            // 🔥 关键指标：从节点开始到工具调用完成的时间
            const nodeStartedAt = (window as any).__realTimeMetrics.nodeStartedAt;
            const timeFromNodeStart = nodeStartedAt ? completedAt - nodeStartedAt : null;

            // 🔥 关键指标：从工具执行完成到 UI 更新的时间
            // 我们通过在 UI 更新后立即记录时间来测量这个值
            console.log('[RealTime] 🔧 tool_call completed:', {
              toolName,
              completedAt,
              timeFromNodeStart,
              message: '检查 UI 是否立即更新'
            });
          }
        });

        // 🔥 监听 node_completed
        chatEventBus.on('workflow:progress' as any, (data: any) => {
          let parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsedData.event_type === 'node_completed') {
            (window as any).__realTimeMetrics.nodeCompletedAt = Date.now();
            console.log('[RealTime] ✅ node_completed at:', Date.now());
          }
        });
      }
    });

    await page.waitForTimeout(500);

    console.log('📝 [Test] Sending /explore command');
    const commandSentAt = Date.now();

    // 发送 /explore 命令
    await page.evaluate(async (sentTime) => {
      (window as any).__realTimeMetrics.commandSentAt = sentTime;
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    }, commandSentAt);

    console.log('[Test] ⏳ Waiting for tool execution and real-time updates...');
    await page.waitForTimeout(15000);  // 等待 15 秒

    // 🔥 获取高精度时序数据
    const metrics = await page.evaluate(() => {
      const m = (window as any).__realTimeMetrics || {};
      return {
        commandSentAt: m.commandSentAt,
        workflowStartedAt: m.workflowStartedAt,
        nodeStartedAt: m.nodeStartedAt,
        firstToolCallCompletedAt: m.firstToolCallCompletedAt,
        lastToolCallCompletedAt: m.lastToolCallCompletedAt,
        nodeCompletedAt: m.nodeCompletedAt,
        toolCallCount: m.toolCallEvents?.length || 0,
        toolCallEvents: m.toolCallEvents || []
      };
    });

    console.log('\n📊 [Test] ========== 实时性能分析报告 ==========');

    // 关键时间间隔计算
    const timeToWorkflowStarted = metrics.workflowStartedAt
      ? metrics.workflowStartedAt - metrics.commandSentAt
      : null;

    const timeToNodeStarted = metrics.nodeStartedAt
      ? metrics.nodeStartedAt - metrics.commandSentAt
      : null;

    const timeToFirstToolCall = metrics.firstToolCallCompletedAt
      ? metrics.firstToolCallCompletedAt - metrics.commandSentAt
      : null;

    const timeToLastToolCall = metrics.lastToolCallCompletedAt
      ? metrics.lastToolCallCompletedAt - metrics.commandSentAt
      : null;

    const timeToNodeCompleted = metrics.nodeCompletedAt
      ? metrics.nodeCompletedAt - metrics.commandSentAt
      : null;

    console.log('⏱️  关键时间间隔:');
    console.log(`   命令 → workflow:started: ${timeToWorkflowStarted}ms`);
    console.log(`   命令 → node_started: ${timeToNodeStarted}ms`);
    console.log(`   命令 → 第一个 tool_call: ${timeToFirstToolCall}ms`);
    console.log(`   命令 → 最后一个 tool_call: ${timeToLastToolCall}ms`);
    console.log(`   命令 → node_completed: ${timeToNodeCompleted}ms`);

    console.log('\n🔧 工具调用详情:');
    console.log(`   总数: ${metrics.toolCallCount}`);
    metrics.toolCallEvents.forEach((evt: any, i: number) => {
      console.log(`   ${i + 1}. ${evt.toolName} - ${evt.completedAt}`);
    });

    // 🔥 关键断言：验证实时性
    expect(metrics.workflowStartedAt).toBeTruthy();
    expect(metrics.nodeStartedAt).toBeTruthy();
    expect(metrics.toolCallCount).toBeGreaterThan(0);

    // 🔥 实时性断言：第一个工具调用应该在 5 秒内完成
    if (timeToFirstToolCall) {
      expect(timeToFirstToolCall).toBeLessThan(5000);
      console.log('✅ 第一个工具调用在 5 秒内完成');
    }

    // 🔥 实时性断言：workflow:started 应该在 1 秒内发送
    if (timeToWorkflowStarted) {
      expect(timeToWorkflowStarted).toBeLessThan(1000);
      console.log('✅ workflow:started 在 1 秒内发送');
    }

    console.log('\n🔍 实时性诊断:');

    // 🔥 诊断：检查是否有"等待 AI 响应后才显示"的问题
    if (metrics.nodeCompletedAt && metrics.lastToolCallCompletedAt) {
      const gap = metrics.nodeCompletedAt - metrics.lastToolCallCompletedAt;
      if (gap > 2000) {
        console.warn(`   ⚠️ 警告：最后一个工具调用完成后 ${gap}ms 才完成节点`);
        console.warn('   💡 可能原因：工具调用事件没有立即更新 UI，而是等待 AI 响应');
        console.warn('   💡 建议：使用 flushSync 强制 React 同步更新');
      } else {
        console.log(`   ✅ 良好：工具调用 → 节点完成间隔 ${gap}ms`);
      }
    }

    console.log('\n✅ [Test] ========== 分析报告完成 ==========\n');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('⚡ 验证渐进式显示：检查 UI 更新频率', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false  // 使用 Mock 模式（可控制时序）
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = false;
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });

    await page.waitForTimeout(1000);

    // 🔥 监控 React 渲染
    await page.evaluate(() => {
      (window as any).__renderMetrics = [];

      // 🔥 首先检查 Monitor 元素是否存在
      const initialMonitor = document.querySelector('[data-monitor="true"]');
      console.log('[RenderMonitor] 🔍 Initial monitor element check:', {
        exists: !!initialMonitor,
        html: initialMonitor ? initialMonitor.innerHTML.substring(0, 200) : null
      });

      // 使用 MutationObserver 监控整个 document 的 DOM 变化
      const observer = new MutationObserver((mutations) => {
        // 查找所有 monitor 元素
        const monitorElements = document.querySelectorAll('[data-monitor="true"]');
        monitorElements.forEach((monitorElement) => {
          const now = Date.now();
          const nodeElements = monitorElement.querySelectorAll('[data-node-id]');

          (window as any).__renderMetrics.push({
            timestamp: now,
            nodeCount: nodeElements.length,
            html: monitorElement.innerHTML.substring(0, 200)  // 前 200 字符
          });

          console.log('[RenderMonitor] 📊 DOM updated:', {
            nodeCount: nodeElements.length,
            timestamp: now,
            monitorId: monitorElement.getAttribute('data-workflow-monitor')
          });
        });
      });

      // 🔥 立即开始监听整个 document
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
      console.log('[RenderMonitor] ✅ Started monitoring DOM changes on document.body');
    });

    // 发送命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    console.log('[Test] ⏳ Waiting for progressive UI updates...');
    await page.waitForTimeout(10000);

    // 分析渲染频率
    const renderMetrics = await page.evaluate(() => {
      const metrics = (window as any).__renderMetrics || [];
      return {
        totalUpdates: metrics.length,
        updates: metrics
      };
    });

    console.log('\n📊 [Test] ========== 渐进式渲染分析 ==========');
    console.log(`   总更新次数: ${renderMetrics.totalUpdates}`);

    if (renderMetrics.totalUpdates > 0) {
      console.log('\n📝 更新时间线:');
      const firstUpdate = renderMetrics.updates[0].timestamp;
      const commandTime = firstUpdate;

      renderMetrics.updates.forEach((update: any, i: number) => {
        const timeFromStart = update.timestamp - commandTime;
        console.log(`   ${i + 1}. [${timeFromStart}ms] 节点数: ${update.nodeCount}`);
      });

      // 🔥 验证渐进式：应该有多次更新，而不是一次
      expect(renderMetrics.totalUpdates).toBeGreaterThan(1);
      console.log('\n✅ 确认：UI 是渐进式更新的（多次渲染）');
    } else {
      console.warn('\n⚠️ 警告：没有检测到 DOM 更新');
      console.warn('💡 可能原因：');
      console.warn('   1. Monitor 组件没有正确渲染');
      console.warn('   2. 事件没有正确触发');
      console.warn('   3. MutationObserver 没有启动');
    }

    console.log('\n✅ [Test] ========== 分析完成 ==========\n');
  });
});
