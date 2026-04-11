/**
 * 🧪 消息显示顺序高保真测试
 *
 * 测试目标：
 * 1. 验证刷新后消息的显示顺序正确
 * 2. 验证刷新后消息的位置正确（不会跑到最上面）
 * 3. 验证消息的时间戳正确
 *
 * @version v1.0.0 - 高保真还原场景
 */

import { test, expect } from '@playwright/test';

test.describe('🧪 消息显示顺序高保真测试', () => {
  test.use({
    skip: !process.env.E2E_USE_REAL_AI,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForTimeout(2000);

    // 设置测试环境
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
    });

    // 配置真实AI
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (!settingsStore) return;

      const newProvider = {
        id: 'real-ai-e2e',
        name: 'Real AI E2E',
        protocol: 'openai' as const,
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: 'f2dd2a52dc5d4a549cff1347dd428961.TTxPCu0w2uPMLZ5Q',
        models: ['glm-4.7'],
        enabled: true,
        isCustom: false,
      };

      const currentState = settingsStore.getState();
      const existingProviders = currentState.providers || [];
      const existingIndex = existingProviders.findIndex((p: any) => p.id === 'real-ai-e2e');

      let newProviders;
      if (existingIndex >= 0) {
        newProviders = [...existingProviders];
        newProviders[existingIndex] = newProvider;
      } else {
        newProviders = [...existingProviders, newProvider];
      }

      settingsStore.setState({
        providers: newProviders,
        currentProviderId: 'real-ai-e2e',
        currentModel: 'glm-4.7',
      });
    });

    await page.waitForTimeout(1000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(1000);
  });

  test('✅ 高保真测试：发送消息后刷新，验证消息显示位置和顺序', async ({ page }) => {
    console.log('\n=== 高保真测试：消息显示位置和顺序 ===');

    // 监听所有控制台日志
    page.on('console', msg => {
      const text = msg.text();
      console.log('[Browser]', text);
    });

    // ========================================
    // 步骤1：发送多条消息
    // ========================================
    const messagesToSend = [
      '第一条消息',
      '第二条消息',
      '第三条消息'
    ];

    console.log('[E2E] 📤 发送', messagesToSend.length, '条消息');

    for (let i = 0; i < messagesToSend.length; i++) {
      const msg = messagesToSend[i];
      console.log(`[E2E] 📤 发送第 ${i + 1} 条消息:`, msg);

      await page.evaluate((message) => {
        const chatStore = (window as any).__chatStore;
        const settingsStore = (window as any).__settingsStore;

        if (!chatStore || !settingsStore) {
          console.error('[E2E] ❌ Store 不可用');
          return;
        }

        const settingsState = settingsStore.getState();
        const chatState = chatStore.getState();

        if (typeof chatState.sendMessage === 'function') {
          return chatState.sendMessage(message, settingsState.currentProviderId, settingsState.currentModel);
        } else {
          console.error('[E2E] ❌ sendMessage 不是函数');
        }
      }, msg);

      // 等待消息处理完成
      await page.waitForTimeout(10000);
    }

    // 额外等待，确保所有消息都被保存
    await page.waitForTimeout(5000);

    // ========================================
    // 步骤2：记录刷新前的详细状态
    // ========================================
    const beforeRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        // 获取所有消息的详细信息
        messageDetails: messages.map((msg: any, index: number) => ({
          index,
          id: msg.id,
          role: msg.role,
          content: msg.content?.substring(0, 100),
          timestamp: msg.timestamp,
          // 检查消息是否在正确的位置
          expectedPosition: index,
          actualContent: msg.content
        })),
        // 检查第一条消息
        firstMessage: messages.length > 0 ? {
          role: messages[0].role,
          content: messages[0].content?.substring(0, 50),
          timestamp: messages[0].timestamp
        } : null,
        // 检查最后一条消息
        lastMessage: messages.length > 0 ? {
          role: messages[messages.length - 1].role,
          content: messages[messages.length - 1].content?.substring(0, 50),
          timestamp: messages[messages.length - 1].timestamp
        } : null
      };
    });

    console.log('[E2E] 📊 刷新前详细状态:');
    console.log('[E2E] 总消息数:', beforeRefresh.totalMessages);
    console.log('[E2E] 第一条消息:', beforeRefresh.firstMessage);
    console.log('[E2E] 最后一条消息:', beforeRefresh.lastMessage);
    console.log('[E2E] 所有消息详情:');
    beforeRefresh.messageDetails.forEach((msg: any) => {
      console.log(`  [位置${msg.index}] ${msg.role}: ${msg.content} (timestamp: ${msg.timestamp})`);
    });

    // 验证刷新前的状态
    expect(beforeRefresh.totalMessages).toBeGreaterThan(0, '刷新前应该有消息');
    expect(beforeRefresh.firstMessage?.role).toBe('user', '第一条消息应该是用户消息');
    expect(beforeRefresh.lastMessage?.role).toBe('assistant', '最后一条消息应该是助手消息');

    // 保存关键数据用于刷新后对比
    const expectedFirstMessageContent = beforeRefresh.firstMessage?.content;
    const expectedLastMessageContent = beforeRefresh.lastMessage?.content;
    const expectedMessageOrder = beforeRefresh.messageDetails.map((m: any) => ({
      role: m.role,
      content: m.content
    }));

    // ========================================
    // 步骤3：刷新页面
    // ========================================
    console.log('[E2E] 🔄 刷新页面...');

    // 🔥 CRITICAL: 在刷新前添加新的 console 监听器
    // 因为刷新后旧的监听器会失效
    let refreshLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[App]') || text.includes('[ThreadStore]') || text.includes('[ChatStore]')) {
        console.log('[Browser After Refresh]', text);
        refreshLogs.push(text);
      }
    });

    await page.reload();
    await page.waitForTimeout(7000); // 增加等待时间，确保 App 完全加载

    // 重新打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(5000); // 增加等待时间，确保 thread 恢复完成

    // 打印刷新后的关键日志
    console.log('[E2E] 📋 刷新后捕获的日志:');
    refreshLogs.forEach(log => {
      if (log.includes('[App]') || log.includes('[ThreadStore]') || log.includes('[ChatStore]')) {
        console.log('  ', log);
      }
    });

    // ========================================
    // 步骤4：记录刷新后的详细状态
    // ========================================
    const afterRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        messageDetails: messages.map((msg: any, index: number) => ({
          index,
          id: msg.id,
          role: msg.role,
          content: msg.content?.substring(0, 100),
          timestamp: msg.timestamp,
          expectedPosition: index,
          actualContent: msg.content
        })),
        firstMessage: messages.length > 0 ? {
          role: messages[0].role,
          content: messages[0].content?.substring(0, 50),
          timestamp: messages[0].timestamp
        } : null,
        lastMessage: messages.length > 0 ? {
          role: messages[messages.length - 1].role,
          content: messages[messages.length - 1].content?.substring(0, 50),
          timestamp: messages[messages.length - 1].timestamp
        } : null
      };
    });

    console.log('[E2E] 📊 刷新后详细状态:');
    console.log('[E2E] 总消息数:', afterRefresh.totalMessages);
    console.log('[E2E] 第一条消息:', afterRefresh.firstMessage);
    console.log('[E2E] 最后一条消息:', afterRefresh.lastMessage);
    console.log('[E2E] 所有消息详情:');
    afterRefresh.messageDetails.forEach((msg: any) => {
      console.log(`  [位置${msg.index}] ${msg.role}: ${msg.content} (timestamp: ${msg.timestamp})`);
    });

    // ========================================
    // 步骤5：验证消息位置和顺序
    // ========================================
    console.log('[E2E] 🔍 验证消息位置和顺序...');

    // 验证1：消息数量应该一致
    expect(afterRefresh.totalMessages).toBe(beforeRefresh.totalMessages, '刷新后消息数量应该一致');
    console.log('[E2E] ✅ 消息数量一致:', afterRefresh.totalMessages);

    // 验证2：第一条消息应该相同（不会跑到最上面）
    expect(afterRefresh.firstMessage?.content).toBe(expectedFirstMessageContent, '刷新后第一条消息内容应该一致');
    console.log('[E2E] ✅ 第一条消息位置正确:', afterRefresh.firstMessage?.content);

    // 验证3：最后一条消息应该相同
    expect(afterRefresh.lastMessage?.content).toBe(expectedLastMessageContent, '刷新后最后一条消息内容应该一致');
    console.log('[E2E] ✅ 最后一条消息位置正确:', afterRefresh.lastMessage?.content);

    // 验证4：消息顺序应该完全一致
    const actualMessageOrder = afterRefresh.messageDetails.map((m: any) => ({
      role: m.role,
      content: m.content
    }));

    for (let i = 0; i < expectedMessageOrder.length; i++) {
      const expected = expectedMessageOrder[i];
      const actual = actualMessageOrder[i];

      expect(actual.role).toBe(expected.role, `位置 ${i} 的消息角色应该一致`);
      expect(actual.content).toBe(expected.content, `位置 ${i} 的消息内容应该一致`);

      console.log(`[E2E] ✅ 位置 ${i} 验证通过: ${actual.role} - ${actual.content?.substring(0, 30)}...`);
    }

    // 验证5：检查时间戳是否有效
    for (let i = 0; i < afterRefresh.messageDetails.length; i++) {
      const msg = afterRefresh.messageDetails[i];
      expect(msg.timestamp).toBeDefined();
      expect(msg.timestamp).not.toBeUndefined();
      expect(typeof msg.timestamp).toBe('number');
    }
    console.log('[E2E] ✅ 所有时间戳有效');

    console.log('[E2E] ✅ 测试通过：刷新后消息位置和顺序完全正确');
  });

  test('✅ 高保真测试：包含工作流的消息显示顺序', async ({ page }) => {
    console.log('\n=== 高保真测试：包含工作流的消息显示顺序 ===');

    // 监听所有控制台日志
    page.on('console', msg => {
      const text = msg.text();
      console.log('[Browser]', text);
    });

    // 发送普通消息
    await page.evaluate((message) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const settingsState = settingsStore.getState();
      return chatStore.getState().sendMessage(message, settingsState.currentProviderId, settingsState.currentModel);
    }, '第一条消息');

    await page.waitForTimeout(10000);

    // 发送 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const settingsState = settingsStore.getState();
      return chatStore.getState().sendMessage('/explore', settingsState.currentProviderId, settingsState.currentModel);
    });

    await page.waitForTimeout(35000);

    // 再发送一条普通消息
    await page.evaluate((message) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const settingsState = settingsStore.getState();
      return chatStore.getState().sendMessage(message, settingsState.currentProviderId, settingsState.currentModel);
    }, '最后一条消息');

    await page.waitForTimeout(10000);

    // 记录刷新前状态
    const beforeRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        firstMessage: messages[0] ? { role: messages[0].role, content: messages[0].content?.substring(0, 50) } : null,
        lastMessage: messages[messages.length - 1] ? { role: messages[messages.length - 1].role, content: messages[messages.length - 1].content?.substring(0, 50) } : null,
        messageOrder: messages.map((m: any) => ({ role: m.role, content: m.content?.substring(0, 30) }))
      };
    });

    console.log('[E2E] 刷新前:', {
      total: beforeRefresh.totalMessages,
      first: beforeRefresh.firstMessage,
      last: beforeRefresh.lastMessage
    });

    // 刷新
    console.log('[E2E] 🔄 刷新页面...');
    await page.reload();
    await page.waitForTimeout(5000);

    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(3000);

    // 记录刷新后状态
    const afterRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        firstMessage: messages[0] ? { role: messages[0].role, content: messages[0].content?.substring(0, 50) } : null,
        lastMessage: messages[messages.length - 1] ? { role: messages[messages.length - 1].role, content: messages[messages.length - 1].content?.substring(0, 50) } : null,
        messageOrder: messages.map((m: any) => ({ role: m.role, content: m.content?.substring(0, 30) }))
      };
    });

    console.log('[E2E] 刷新后:', {
      total: afterRefresh.totalMessages,
      first: afterRefresh.firstMessage,
      last: afterRefresh.lastMessage
    });

    // 验证
    expect(afterRefresh.totalMessages).toBe(beforeRefresh.totalMessages, '消息数量应该一致');
    expect(afterRefresh.firstMessage?.content).toBe(beforeRefresh.firstMessage?.content, '第一条消息应该相同');
    expect(afterRefresh.lastMessage?.content).toBe(beforeRefresh.lastMessage?.content, '最后一条消息应该相同');

    // 验证消息顺序
    for (let i = 0; i < beforeRefresh.messageOrder.length; i++) {
      expect(afterRefresh.messageOrder[i].role).toBe(beforeRefresh.messageOrder[i].role);
      expect(afterRefresh.messageOrder[i].content).toBe(beforeRefresh.messageOrder[i].content);
    }

    console.log('[E2E] ✅ 测试通过：包含工作流的消息顺序正确');
  });
});
