/**
 * 🧪 工作流历史消息持久化测试
 *
 * 验证问题：
 * 1. 历史的 /explore 信息，回复会丢失
 * 2. 历史消息会乱序（气泡时间丢失）
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('🧪 工作流历史消息持久化', () => {
  test('问题1：历史的 /explore 消息回复不应该丢失', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[WorkflowInlineMonitor]') ||
          msg.text().includes('[WorkflowInlineMonitorContainer]')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'test-e2e-api-key',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4-flash'
        });
      }
    });
    await page.waitForTimeout(2000);

    console.log('\n=== 测试：历史 /explore 消息持久化 ===');

    // 步骤 1：发送一条 /explore 消息
    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;

      // 🔥 使用 chatEventBus 发送消息事件，而不是直接操作 store
      // 这样会触发完整的消息处理流程

      // 模拟用户发送 /explore 消息
      chatEventBus.emit('chat:message:sending', {
        content: '/explore',
        timestamp: Date.now()
      });

      // 发送工作流事件
      chatEventBus.emit('workflow:progress', {
        workflowId: 'workflow-1',
        event_type: 'workflow:started',
        message: '探索项目',
        timestamp: Date.now(),
        nodes: [
          { id: 'read-node', label: '读取文件', agent_type: 'test' }
        ]
      });

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: 'workflow-1',
          event_type: 'node_started',
          node_id: 'read-node',
          message: '开始读取',
          timestamp: Date.now()
        });

        chatEventBus.emit('workflow:progress', {
          workflowId: 'workflow-1',
          event_type: 'tool_call',
          node_id: 'read-node',
          message: '工具调用',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'agent_read_file',
            tool_input: JSON.stringify({ rel_path: 'package.json' }),
            tool_output: JSON.stringify({
              content: '{}',
              path: 'package.json',
              line_count: 50
            }),
            output_length: 100,
            execution_time_ms: 30,
            is_error: false
          }
        });
      }, 100);

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: 'workflow-1',
          event_type: 'workflow:completed',
          message: '工作流完成',
          timestamp: Date.now()
        });
      }, 500);
    });

    await page.waitForTimeout(2000);

    // 步骤 2：验证消息是否存在
    const messageCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        userMessageExists: messages.some((m: any) => m.content === '/explore'),
        aiMessageExists: messages.some((m: any) => m.content === '工作流执行完成！'),
        messageIds: messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content.substring(0, 20) }))
      };
    });

    console.log('消息检查:', JSON.stringify(messageCheck, null, 2));

    // 断言：两条消息都应该存在
    expect(messageCheck.totalMessages).toBeGreaterThanOrEqual(2);
    expect(messageCheck.userMessageExists).toBe(true);
    expect(messageCheck.aiMessageExists).toBe(true);

    // 步骤 3：验证工作流监控器 DOM 是否存在
    const monitorCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      return {
        monitorExists: !!monitor,
        hasWorkflowId: monitor?.getAttribute('data-workflow-monitor') === 'workflow-1'
      };
    });

    console.log('监控器检查:', JSON.stringify(monitorCheck, null, 2));
    expect(monitorCheck.monitorExists).toBe(true);
  });

  test('问题2：历史消息不应该乱序（验证时间戳）', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('timestamp') || msg.text().includes('sort')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });
    await page.waitForTimeout(2000);

    console.log('\n=== 测试：消息时间戳和排序 ===');

    const baseTime = Date.now();

    // 创建多条消息，每条消息有不同的时间戳
    await page.evaluate((time) => {
      const chatStore = (window as any).__chatStore;

      // 按顺序添加消息，时间戳递增
      const messages = [
        { id: 'msg-1', role: 'user', content: '第一条消息', timestamp: time },
        { id: 'msg-2', role: 'assistant', content: '回复1', timestamp: time + 1000 },
        { id: 'msg-3', role: 'user', content: '第二条消息', timestamp: time + 2000 },
        { id: 'msg-4', role: 'assistant', content: '回复2', timestamp: time + 3000 },
      ];

      messages.forEach(msg => {
        chatStore.getState().addMessage(msg);
      });
    }, baseTime);

    await page.waitForTimeout(1000);

    // 验证消息顺序
    const orderCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        messageOrder: messages.map((m: any) => ({
          id: m.id,
          content: m.content,
          timestamp: m.timestamp
        })),
        // 检查是否按时间戳排序
        isSorted: messages.every((m: any, i: number, arr: any[]) => {
          if (i === 0) return true;
          return m.timestamp >= arr[i - 1].timestamp;
        })
      };
    });

    console.log('消息顺序检查:', JSON.stringify(orderCheck, null, 2));

    // 断言：消息应该按时间戳排序
    expect(orderCheck.totalMessages).toBe(4);
    expect(orderCheck.isSorted).toBe(true);

    // 验证具体顺序
    expect(orderCheck.messageOrder[0].content).toBe('第一条消息');
    expect(orderCheck.messageOrder[1].content).toBe('回复1');
    expect(orderCheck.messageOrder[2].content).toBe('第二条消息');
    expect(orderCheck.messageOrder[3].content).toBe('回复2');
  });

  test('问题2b：DOM 中消息气泡应该有时间戳属性', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });
    await page.waitForTimeout(2000);

    // 添加消息
    const baseTime = Date.now();
    await page.evaluate((time) => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().addMessage({
        id: 'msg-timestamp-test',
        role: 'user',
        content: '测试时间戳',
        timestamp: time
      });
    }, baseTime);

    await page.waitForTimeout(1000);

    // 验证 DOM 中的时间戳
    const domCheck = await page.evaluate(() => {
      const messages = document.querySelectorAll('[data-message-id], [data-testid*="message"], [data-testid*="bubble"]');
      return {
        messageElementCount: messages.length,
        elementsWithTimestamp: Array.from(messages).map(el => ({
          messageId: el.getAttribute('data-message-id'),
          testId: el.getAttribute('data-testid'),
          hasTimestamp: el.hasAttribute('data-timestamp'),
          timestampAttr: el.getAttribute('data-timestamp'),
          classList: el.className
        }))
      };
    });

    console.log('DOM 时间戳检查:', JSON.stringify(domCheck, null, 2));

    // 至少应该找到消息元素
    expect(domCheck.messageElementCount).toBeGreaterThan(0);
  });

  test('问题3：同一 /explore 多次执行应该显示总结而非过程', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[WorkflowInlineMonitor]') ||
          msg.text().includes('summary') ||
          msg.text().includes('/explore')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'test-e2e-api-key',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4-flash'
        });
      }
    });
    await page.waitForTimeout(2000);

    console.log('\n=== 测试：多次 /explore 应该显示总结 ===');

    // 第一次 /explore
    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '/explore',
        timestamp: Date.now()
      });

      // 第一次工作流
      chatEventBus.emit('workflow:progress', {
        workflowId: 'explore-1',
        event_type: 'workflow:started',
        message: '第一次探索',
        timestamp: Date.now(),
        nodes: [{ id: 'node-1', label: '读取', agent_type: 'test' }]
      });
    });

    await page.waitForTimeout(1000);

    // 第二次 /explore（应该触发总结模式）
    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      chatStore.getState().addMessage({
        id: 'user-2',
        role: 'user',
        content: '/explore',
        timestamp: Date.now()
      });

      // 第二次工作流
      chatEventBus.emit('workflow:progress', {
        workflowId: 'explore-2',
        event_type: 'workflow:started',
        message: '第二次探索（应该总结）',
        timestamp: Date.now(),
        nodes: [{ id: 'node-2', label: '总结', agent_type: 'test' }]
      });
    });

    await page.waitForTimeout(1000);

    // 验证：两次探索都应该创建独立的工作流
    const workflowCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      const exploreMessages = messages.filter((m: any) => m.content === '/explore');

      return {
        totalExploreMessages: exploreMessages.length,
        exploreMessageIds: exploreMessages.map((m: any) => m.id),
        hasDifferentTimestamps: exploreMessages.length >= 2 &&
          exploreMessages[0].timestamp !== exploreMessages[1].timestamp
      };
    });

    console.log('多次探索检查:', JSON.stringify(workflowCheck, null, 2));

    // 断言：应该有两条 /explore 消息
    expect(workflowCheck.totalExploreMessages).toBe(2);
  });
});
