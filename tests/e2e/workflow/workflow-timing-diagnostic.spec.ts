/**
 * 🎯 工作流时序诊断测试
 *
 * 详细记录工作流每个阶段的出现时长，找出性能瓶颈
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('工作流时序诊断', () => {

  test('🔍 详细记录工作流各阶段时长', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置 E2E 模式
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = true;
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });

    await page.waitForTimeout(1000);

    // 🔥 设置详细的时序记录
    await page.evaluate(() => {
      (window as any).__timingLog = {
        testStartTime: Date.now(),
        commandSentTime: null,
        workflowStartedReceived: false,
        workflowStartedTime: null,
        plannedNodesReceived: false,
        plannedNodesCount: 0,
        plannedNodesTime: null,
        firstNodeStartedReceived: false,
        firstNodeStartedTime: null,
        firstToolCallReceived: false,
        firstToolCallTime: null,
        lastProgressReceived: false,
        lastProgressTime: null,
        workflowCompletedReceived: false,
        workflowCompletedTime: null,
        events: [],
        nodes: []
      };

      const chatEventBus = (window as any).__chatEventBus || (window as any).__GLOBAL_CHAT_EVENT_BUS__;

      if (chatEventBus) {
        // 🔥 监听 workflow:started 事件
        chatEventBus.on('workflow:started' as any, (data: any) => {
          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
          }

          const now = Date.now();
          const testStartTime = (window as any).__timingLog.testStartTime;
          const commandSentTime = (window as any).__timingLog.commandSentTime;

          console.log('[Timing] 📋 workflow:started received at', now, 'ms');
          console.log('[Timing]   - Time from test start:', now - testStartTime, 'ms');
          console.log('[Timing]   - Time from command sent:', commandSentTime ? now - commandSentTime : 'N/A', 'ms');
          console.log('[Timing]   - Planned nodes:', parsedData.nodes?.length || 0);

          (window as any).__timingLog.workflowStartedReceived = true;
          (window as any).__timingLog.workflowStartedTime = now;
          (window as any).__timingLog.plannedNodesReceived = !!(parsedData.nodes && parsedData.nodes.length > 0);
          (window as any).__timingLog.plannedNodesCount = parsedData.nodes?.length || 0;
          (window as any).__timingLog.plannedNodesTime = now;

          // 🔥 记录计划节点详情
          if (parsedData.nodes) {
            (window as any).__timingLog.nodes = parsedData.nodes.map((node: any) => ({
              id: node.id,
              label: node.label,
              agent_type: node.agent_type,
              receivedAt: now
            }));
          }

          (window as any).__timingLog.events.push({
            type: 'workflow:started',
            timestamp: now,
            data: {
              plannedNodesCount: parsedData.nodes?.length || 0,
              workflowId: parsedData.workflowId || parsedData.workflow_id,
              workflowType: parsedData.workflowType || parsedData.workflow_type,
              nodes: parsedData.nodes || [],  // 🔥 包含完整的 nodes 数组
              hasNodesField: 'nodes' in parsedData  // 🔥 检查是否有 nodes 字段
            }
          });
        });

        // 🔥 监听 workflow:progress 事件
        chatEventBus.on('workflow:progress' as any, (data: any) => {
          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
          }

          const now = Date.now();
          const testStartTime = (window as any).__timingLog.testStartTime;
          const commandSentTime = (window as any).__timingLog.commandSentTime;
          const workflowStartedTime = (window as any).__timingLog.workflowStartedTime;

          console.log('[Timing] 📊 workflow:progress received at', now, 'ms');
          console.log('[Timing]   - Time from test start:', now - testStartTime, 'ms');
          console.log('[Timing]   - Time from command sent:', commandSentTime ? now - commandSentTime : 'N/A', 'ms');
          console.log('[Timing]   - Time from workflow:started:', workflowStartedTime ? now - workflowStartedTime : 'N/A', 'ms');
          console.log('[Timing]   - Event type:', parsedData.event_type);
          console.log('[Timing]   - Node ID:', parsedData.node_id);
          console.log('[Timing]   - Message:', parsedData.message);

          (window as any).__timingLog.lastProgressReceived = true;
          (window as any).__timingLog.lastProgressTime = now;

          // 🔥 检查是否是第一个 node_started 事件
          if (parsedData.event_type === 'node_started' && !(window as any).__timingLog.firstNodeStartedReceived) {
            (window as any).__timingLog.firstNodeStartedReceived = true;
            (window as any).__timingLog.firstNodeStartedTime = now;
          }

          // 🔥 检查是否是第一个 tool_call 事件
          if (parsedData.event_type === 'tool_call' && !(window as any).__timingLog.firstToolCallReceived) {
            (window as any).__timingLog.firstToolCallReceived = true;
            (window as any).__timingLog.firstToolCallTime = now;
          }

          (window as any).__timingLog.events.push({
            type: 'workflow:progress',
            timestamp: now,
            data: {
              eventType: parsedData.event_type,
              nodeId: parsedData.node_id,
              message: parsedData.message,
              hasToolDetails: !!parsedData.tool_details,
              toolName: parsedData.tool_details?.tool_name
            }
          });
        });

        // 🔥 监听 workflow:completed 事件
        chatEventBus.on('workflow:completed' as any, (data: any) => {
          let parsedData = data;
          if (typeof data === 'string') {
            parsedData = JSON.parse(data);
          }

          const now = Date.now();
          const testStartTime = (window as any).__timingLog.testStartTime;
          const commandSentTime = (window as any).__timingLog.commandSentTime;

          console.log('[Timing] ✅ workflow:completed received at', now, 'ms');
          console.log('[Timing]   - Time from test start:', now - testStartTime, 'ms');
          console.log('[Timing]   - Time from command sent:', commandSentTime ? now - commandSentTime : 'N/A', 'ms');

          (window as any).__timingLog.workflowCompletedReceived = true;
          (window as any).__timingLog.workflowCompletedTime = now;

          (window as any).__timingLog.events.push({
            type: 'workflow:completed',
            timestamp: now,
            data: {
              workflowId: parsedData.workflow_id,
              status: parsedData.status
            }
          });
        });
      }
    });

    await page.waitForTimeout(500);

    console.log('📝 [Test] 发送 /explore 命令');
    const commandSentTime = Date.now();

    // 🔥 记录命令发送时间
    await page.evaluate((sentTime) => {
      (window as any).__timingLog.commandSentTime = sentTime;
      console.log('[Timing] 🚀 Command sent at', sentTime, 'ms');
    }, commandSentTime);

    // 发送 /explore 命令
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    console.log('[Test] ⏳ 等待工作流执行和进度事件...');
    await page.waitForTimeout(30000);  // 等待 30 秒

    // 🔥 获取详细的时间日志
    const timingResult = await page.evaluate(() => {
      const log = (window as any).__timingLog;
      const testStartTime = log.testStartTime;
      const commandSentTime = log.commandSentTime;

      // 🔥 计算关键时间间隔
      const timeToWorkflowStarted = log.workflowStartedTime ? log.workflowStartedTime - commandSentTime : null;
      const timeToFirstNodeStarted = log.firstNodeStartedTime ? log.firstNodeStartedTime - commandSentTime : null;
      const timeToFirstToolCall = log.firstToolCallTime ? log.firstToolCallTime - commandSentTime : null;
      const timeToCompleted = log.workflowCompletedTime ? log.workflowCompletedTime - commandSentTime : null;
      const timeFromStartedToFirstNode = log.workflowStartedTime && log.firstNodeStartedTime
        ? log.firstNodeStartedTime - log.workflowStartedTime
        : null;

      return {
        // 基本指标
        workflowStartedReceived: log.workflowStartedReceived,
        plannedNodesReceived: log.plannedNodesReceived,
        plannedNodesCount: log.plannedNodesCount,
        firstNodeStartedReceived: log.firstNodeStartedReceived,
        firstToolCallReceived: log.firstToolCallReceived,
        workflowCompletedReceived: log.workflowCompletedReceived,

        // 关键时间间隔（毫秒）
        timeToWorkflowStarted,
        timeToFirstNodeStarted,
        timeToFirstToolCall,
        timeToCompleted,
        timeFromStartedToFirstNode,

        // 节点信息
        nodes: log.nodes,

        // 所有事件
        events: log.events,

        // 事件总数
        totalEvents: log.events.length,
        progressEvents: log.events.filter((e: any) => e.type === 'workflow:progress').length
      };
    });

    console.log('\n📊 [Test] ========== 时序诊断报告 ==========');
    console.log('📊 [Test] 基本指标:');
    console.log(`   - workflow:started 收到: ${timingResult.workflowStartedReceived ? '✅' : '❌'}`);
    console.log(`   - 计划节点收到: ${timingResult.plannedNodesReceived ? '✅' : '❌'}`);
    console.log(`   - 计划节点数量: ${timingResult.plannedNodesCount}`);
    console.log(`   - 第一个节点启动: ${timingResult.firstNodeStartedReceived ? '✅' : '❌'}`);
    console.log(`   - 第一个工具调用: ${timingResult.firstToolCallReceived ? '✅' : '❌'}`);
    console.log(`   - 工作流完成: ${timingResult.workflowCompletedReceived ? '✅' : '❌'}`);

    console.log('\n⏱️ [Test] 关键时间间隔:');
    console.log(`   - 命令 → workflow:started: ${timingResult.timeToWorkflowStarted ? timingResult.timeToWorkflowStarted + 'ms' : 'N/A'}`);
    console.log(`   - 命令 → 第一个 node_started: ${timingResult.timeToFirstNodeStarted ? timingResult.timeToFirstNodeStarted + 'ms' : 'N/A'}`);
    console.log(`   - workflow:started → 第一个 node_started: ${timingResult.timeFromStartedToFirstNode ? timingResult.timeFromStartedToFirstNode + 'ms' : 'N/A'}`);
    console.log(`   - 命令 → 第一个 tool_call: ${timingResult.timeToFirstToolCall ? timingResult.timeToFirstToolCall + 'ms' : 'N/A'}`);
    console.log(`   - 命令 → workflow:completed: ${timingResult.timeToCompleted ? timingResult.timeToCompleted + 'ms' : 'N/A'}`);

    console.log('\n📋 [Test] 计划节点详情:');
    if (timingResult.nodes && timingResult.nodes.length > 0) {
      timingResult.nodes.forEach((node: any, i: number) => {
        console.log(`   ${i + 1}. ${node.label} (${node.agent_type}) - ${node.id}`);
      });
    } else {
      console.log('   ⚠️ 没有收到计划节点！');
    }

    console.log('\n📨 [Test] 事件流:');
    console.log(`   - 总事件数: ${timingResult.totalEvents}`);
    console.log(`   - progress 事件数: ${timingResult.progressEvents}`);

    if (timingResult.events.length > 0) {
      console.log('\n📝 [Test] 详细事件列表:');
      const firstEventTime = timingResult.events[0].timestamp;
      timingResult.events.forEach((evt: any, i: number) => {
        const timeFromStart = evt.timestamp - firstEventTime;
        const dataStr = JSON.stringify(evt.data).substring(0, 100);
        console.log(`   ${i + 1}. [${timeFromStart}ms] ${evt.type}: ${dataStr}`);
      });
    }

    console.log('\n🔍 [Test] 诊断分析:');

    // 🔥 分析问题1：是否收到计划节点
    if (!timingResult.plannedNodesReceived) {
      console.log('   ❌ 问题：没有收到计划节点！');
      console.log('   💡 建议：检查后端是否在 workflow:started 事件中包含 nodes 字段');
    } else {
      console.log('   ✅ 计划节点收到，数量:', timingResult.plannedNodesCount);
    }

    // 🔥 分析问题2：workflow:started 是否及时
    if (timingResult.timeToWorkflowStarted > 5000) {
      console.log('   ⚠️ 问题：workflow:started 事件延迟超过 5 秒！');
      console.log('   💡 建议：检查后端工作流启动速度');
    } else {
      console.log('   ✅ workflow:started 事件及时');
    }

    // 🔥 分析问题3：是否有第一个节点启动
    if (!timingResult.firstNodeStartedReceived) {
      console.log('   ❌ 问题：没有收到 node_started 事件！');
      console.log('   💡 建议：检查后端是否发送 node_started 事件');
    } else {
      console.log('   ✅ node_started 事件收到');

      // 分析 workflow:started → node_started 的间隔
      if (timingResult.timeFromStartedToFirstNode > 10000) {
        console.log(`   ❌ 问题：workflow:started → node_started 间隔过长 (${timingResult.timeFromStartedToFirstNode}ms)！`);
        console.log('   💡 建议：检查后端工作流执行速度，第一个节点应该很快启动');
      } else {
        console.log(`   ✅ workflow:started → node_started 间隔正常 (${timingResult.timeFromStartedToFirstNode}ms)`);
      }
    }

    // 🔥 分析问题4：是否有工具调用
    if (!timingResult.firstToolCallReceived) {
      console.log('   ⚠️ 警告：没有收到 tool_call 事件');
      console.log('   💡 可能原因：节点没有调用工具，或者工具调用事件未发送');
    } else {
      console.log('   ✅ tool_call 事件收到');

      // 分析命令 → tool_call 的间隔
      if (timingResult.timeToFirstToolCall > 15000) {
        console.log(`   ⚠️ 警告：命令 → 第一个 tool_call 间隔较长 (${timingResult.timeToFirstToolCall}ms)`);
      }
    }

    console.log('\n✅ [Test] ========== 诊断报告结束 ==========\n');

    // 🔥 关键断言
    expect(timingResult.workflowStartedReceived).toBe(true);
    expect(timingResult.plannedNodesReceived).toBe(true);
    expect(timingResult.plannedNodesCount).toBeGreaterThan(0);
    expect(timingResult.firstNodeStartedReceived).toBe(true);

    // 🔥 性能断言
    if (timingResult.timeToWorkflowStarted) {
      expect(timingResult.timeToWorkflowStarted).toBeLessThan(5000);  // workflow:started 应该在 5 秒内到达
    }

    if (timingResult.timeFromStartedToFirstNode) {
      expect(timingResult.timeFromStartedToFirstNode).toBeLessThan(10000);  // 第一个节点应该在 10 秒内启动
    }
  });
});
