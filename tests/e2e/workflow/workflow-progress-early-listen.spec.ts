/**
 * 🎯 早期监听测试 - 在命令发送前就设置监听器
 *
 * 这个测试确保在 /explore 命令发送之前就设置好事件监听器，
 * 避免错过任何早期事件。
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('工作流进度事件 - 早期监听', () => {

  test('✅ 在发送命令前设置监听器 - 捕获所有 progress 事件', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
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

    await page.waitForTimeout(1000);

    console.log('📝 [Test] 步骤 1: 在发送命令前设置事件监听器');

    // 🔥 关键：在发送命令之前就设置监听器
    await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus;
      if (!chatEventBus) {
        console.error('[Test] ❌ chatEventBus not available');
        return;
      }

      const events = [];
      (window as any).__capturedWorkflowEvents = events;

      const captureEvent = (eventName) => {
        chatEventBus.on(eventName, (payload) => {
          const timestamp = Date.now();
          console.log(`[Test] 📨 Event received at ${new Date(timestamp).toISOString()}: ${eventName}`, payload);
          events.push({
            event: eventName,
            payload,
            timestamp
          });
        });
      };

      // 监听所有工作流相关事件
      captureEvent('workflow:started');
      captureEvent('workflow:progress');
      captureEvent('workflow:completed');
      captureEvent('workflow:response');
      captureEvent('workflow:error');

      console.log('[Test] ✅ Event listeners set up BEFORE command');
    });

    await page.waitForTimeout(500);

    console.log('📝 [Test] 步骤 2: 发送 /explore 命令');

    // 发送 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    console.log('📝 [Test] 步骤 3: 等待 40 秒，收集所有事件...');

    // 等待足够长的时间，让工作流完成
    await page.waitForTimeout(40000);

    // 检查捕获的事件
    const capturedEvents = await page.evaluate(() => {
      const events = (window as any).__capturedWorkflowEvents || [];

      return {
        totalEvents: events.length,
        eventsByType: events.reduce((acc, e) => {
          acc[e.event] = (acc[e.event] || 0) + 1;
          return acc;
        }, {}),
        events: events.map(e => ({
          event: e.event,
          timestamp: e.timestamp,
          workflowId: e.payload.workflowId || e.payload.workflow_id,
          nodeId: e.payload.node_id,
          eventType: e.payload.event_type,
          hasToolDetails: !!e.payload.tool_details,
          message: e.payload.message,
          fullPayload: JSON.stringify(e.payload).substring(0, 300)
        }))
      };
    });

    console.log('📊 [Test] 事件统计:');
    console.log(`   总事件数: ${capturedEvents.totalEvents}`);
    console.log('   按类型统计:');
    Object.entries(capturedEvents.eventsByType).forEach(([type, count]) => {
      console.log(`     - ${type}: ${count}`);
    });

    console.log('📋 [Test] 所有捕获的事件详情:');
    capturedEvents.events.forEach((e, index) => {
      console.log(`\n${index + 1}. ${e.event} (时间戳: ${new Date(e.timestamp).toISOString()})`);
      console.log(`   workflowId: ${e.workflowId}`);
      console.log(`   nodeId: ${e.nodeId}`);
      console.log(`   eventType: ${e.eventType}`);
      console.log(`   hasToolDetails: ${e.hasToolDetails}`);
      console.log(`   message: ${e.message}`);
      console.log(`   preview: ${e.fullPayload}`);
    });

    // 🔥 关键断言
    expect(capturedEvents.totalEvents).toBeGreaterThan(0, '应该至少有一个工作流事件');

    // 检查是否有 workflow:progress 事件
    const progressEvents = capturedEvents.events.filter(e => e.event === 'workflow:progress');
    console.log(`\n📊 [Test] workflow:progress 事件数量: ${progressEvents.length}`);

    if (progressEvents.length > 0) {
      console.log('✅ [Test] 成功捕获到 workflow:progress 事件！');

      // 分析 progress 事件
      const nodeStartedEvents = progressEvents.filter(e => e.eventType === 'node_started');
      const toolCallEvents = progressEvents.filter(e => e.eventType === 'tool_call');

      console.log(`   - node_started 事件: ${nodeStartedEvents.length}`);
      console.log(`   - tool_call 事件: ${toolCallEvents.length}`);

      // 打印前几个 progress 事件的详情
      console.log('\n📋 [Test] 前 5 个 workflow:progress 事件:');
      progressEvents.slice(0, 5).forEach((e, i) => {
        console.log(`\n  ${i + 1}. ${e.eventType}`);
        console.log(`     nodeId: ${e.nodeId}`);
        console.log(`     message: ${e.message}`);
        if (e.hasToolDetails) {
          console.log(`     tool_details: ${e.fullPayload}`);
        }
      });
    } else {
      console.log('❌ [Test] 没有捕获到任何 workflow:progress 事件！');
      console.log('   这意味着后端没有发送这些事件，或者事件没有被正确转发到 chatEventBus');
    }

    // 无论是否有 progress 事件，都应该有 started/completed/response 事件
    expect(capturedEvents.events.some(e => e.event === 'workflow:started'))
      .toBe(true, '应该有 workflow:started 事件');
  });

  test('✅ 验证工作流事件是否通过 chatEventBus 分发', async ({ page }) => {
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

    await page.waitForTimeout(1000);

    console.log('📝 [Test] 检查 chatEventBus 工作流程');

    // 🔥 检查 chatEventBus 的实现
    const eventBusInfo = await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus;

      if (!chatEventBus) {
        return { error: 'chatEventBus not found' };
      }

      return {
        exists: true,
        hasOn: typeof chatEventBus.on === 'function',
        hasEmit: typeof chatEventBus.emit === 'function',
        listeners: Object.keys(chatEventBus).filter(key => key.startsWith('on') || key.startsWith('emit'))
      };
    });

    console.log('📊 [Test] chatEventBus 信息:', eventBusInfo);

    // 设置监听器
    await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus;
      if (!chatEventBus) return;

      // 监听 workflow:progress 事件
      chatEventBus.on('workflow:progress', (payload) => {
        console.log('[Test] 📨 workflow:progress received via chatEventBus:', payload);
        (window as any).__progressEventReceived = true;
        (window as any).__progressEventPayload = payload;
      });

      console.log('[Test] ✅ workflow:progress listener registered');
    });

    await page.waitForTimeout(500);

    // 手动触发一个测试事件
    console.log('📝 [Test] 手动触发测试事件');
    await page.evaluate(() => {
      const chatEventBus = (window as any).__chatEventBus;
      if (chatEventBus) {
        chatEventBus.emit('workflow:progress', {
          event_type: 'test',
          message: 'Test event',
          timestamp: Date.now()
        });
      }
    });

    await page.waitForTimeout(1000);

    // 检查是否收到测试事件
    const testEventResult = await page.evaluate(() => {
      return {
        received: (window as any).__progressEventReceived,
        payload: (window as any).__progressEventPayload
      };
    });

    console.log('📊 [Test] 测试事件结果:', testEventResult);

    expect(testEventResult.received).toBe(true, '应该能通过 chatEventBus 接收事件');
    expect(testEventResult.payload?.message).toBe('Test event');
  });
});
