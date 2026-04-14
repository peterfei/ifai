/**
 * 🧪 消息顺序持久化测试 - 高保真E2E
 *
 * 测试目标：
 * 验证刷新后消息顺序保持一致，不会乱序
 *
 * @version v1.0.0 - 使用真实后端和SSE
 */

import { test, expect } from '@playwright/test';

test.describe('🧪 消息顺序持久化 - 高保真E2E', () => {
  test.use({
    skip: !process.env.E2E_USE_REAL_AI,
    timeout: 180000, // 3分钟超时
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

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 高保真测试：刷新后消息顺序应该保持一致', async ({ page }) => {
    console.log('\n=== 高保真测试：刷新后消息顺序一致性 ===');

    // 监听控制台
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') || text.includes('[ChatStore]')) {
        console.log('[Browser Console]', text);
      }
    });

    // ========================================
    // 步骤1：发送多条消息，记录顺序
    // ========================================
    const messagesToSend = [
      '第一条消息',
      '第二条消息',
      '/explore'
    ];

    console.log('[E2E] 📤 发送', messagesToSend.length, '条消息');

    for (let i = 0; i < messagesToSend.length; i++) {
      const msg = messagesToSend[i];
      console.log(`[E2E] 📤 发送第 ${i + 1} 条消息:`, msg);

      await page.evaluate((message) => {
        const chatStore = (window as any).__chatStore;
        const settingsStore = (window as any).__settingsStore;

        // Debug: 检查 store 是否可用
        if (!chatStore) {
          console.error('[E2E] ❌ chatStore 不可用');
          return;
        }
        if (!settingsStore) {
          console.error('[E2E] ❌ settingsStore 不可用');
          return;
        }

        const settingsState = settingsStore.getState();
        const chatState = chatStore.getState();

        console.log('[E2E] 📊 Store 状态:', {
          hasChatStore: !!chatStore,
          hasSettingsStore: !!settingsStore,
          hasSendMessage: typeof chatState.sendMessage === 'function',
          currentProviderId: settingsState.currentProviderId,
          currentModel: settingsState.currentModel
        });

        // 调用 sendMessage
        if (typeof chatState.sendMessage === 'function') {
          return chatState.sendMessage(message, settingsState.currentProviderId, settingsState.currentModel);
        } else {
          console.error('[E2E] ❌ sendMessage 不是函数:', typeof chatState.sendMessage);
        }
      }, msg);

      // 等待一段时间，确保消息被处理
      // 根据消息类型等待不同时间
      const waitTime = msg === '/explore' ? 35000 : 10000;
      await page.waitForTimeout(waitTime);
    }

    // 额外等待，确保所有消息都被保存
    await page.waitForTimeout(5000);

    // ========================================
    // 步骤2：记录刷新前的消息顺序
    // ========================================
    const beforeRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        messages: messages.map((msg: any, index: number) => ({
          index,
          id: msg.id,
          role: msg.role,
          content: msg.content?.substring(0, 50) + '...',
          timestamp: msg.timestamp,
          contentPreview: msg.content
        }))
      };
    });

    console.log('[E2E] 📊 刷新前消息顺序:');
    beforeRefresh.messages.forEach((msg: any) => {
      console.log(`  [${msg.index}] ${msg.role}: ${msg.content} (timestamp: ${msg.timestamp})`);
    });

    // 验证刷新前的消息数量
    expect(beforeRefresh.totalMessages).toBeGreaterThan(0, '刷新前应该有消息');

    // 保存消息ID序列和内容序列
    const messageIdsBefore = beforeRefresh.messages.map((m: any) => m.id);
    const messageContentsBefore = beforeRefresh.messages.map((m: any) => m.contentPreview);
    const messageRolesBefore = beforeRefresh.messages.map((m: any) => m.role);

    console.log('[E2E] 💾 消息ID序列:', messageIdsBefore);
    console.log('[E2E] 💾 消息角色序列:', messageRolesBefore);

    // ========================================
    // 步骤3：刷新页面
    // ========================================
    console.log('[E2E] 🔄 刷新页面...');
    await page.reload();

    // 等待应用和 store 初始化完成
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore && chatStore.getState().messages !== undefined;
    }, { timeout: 15000 }).catch(() => {
      console.log('[E2E] ⚠️ 等待 chatStore 初始化超时，继续执行');
    });

    // 重新打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    // 等待消息加载完成
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      return messages.length > 0;
    }, { timeout: 15000 }).catch(() => {
      console.log('[E2E] ⚠️ 等待消息加载超时，继续执行');
    });

    // ========================================
    // 步骤4：记录刷新后的消息顺序
    // ========================================
    const afterRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalMessages: messages.length,
        messages: messages.map((msg: any, index: number) => ({
          index,
          id: msg.id,
          role: msg.role,
          content: msg.content?.substring(0, 50) + '...',
          timestamp: msg.timestamp,
          contentPreview: msg.content
        }))
      };
    });

    console.log('[E2E] 📊 刷新后消息顺序:');
    afterRefresh.messages.forEach((msg: any) => {
      console.log(`  [${msg.index}] ${msg.role}: ${msg.content} (timestamp: ${msg.timestamp})`);
    });

    // ========================================
    // 步骤5：验证消息顺序一致性
    // ========================================
    console.log('[E2E] 🔍 验证消息顺序一致性...');

    const messageIdsAfter = afterRefresh.messages.map((m: any) => m.id);
    const messageContentsAfter = afterRefresh.messages.map((m: any) => m.contentPreview);
    const messageRolesAfter = afterRefresh.messages.map((m: any) => m.role);

    // 验证1：消息数量应该一致
    expect(afterRefresh.totalMessages).toBe(beforeRefresh.totalMessages, '刷新后消息数量应该一致');

    // 验证2：消息ID顺序应该完全一致
    expect(messageIdsAfter).toEqual(messageIdsBefore, '消息ID顺序应该完全一致');
    console.log('[E2E] ✅ 消息ID顺序验证通过');

    // 验证3：消息角色顺序应该一致
    expect(messageRolesAfter).toEqual(messageRolesBefore, '消息角色顺序应该一致');
    console.log('[E2E] ✅ 消息角色顺序验证通过');

    // 验证4：消息内容应该一致（可能顺序不同，但内容应该对应）
    expect(messageContentsAfter).toEqual(messageContentsBefore, '消息内容应该一致');
    console.log('[E2E] ✅ 消息内容验证通过');

    // 验证5：检查是否有工作流完成结果
    const hasWorkflowCompletion = afterRefresh.messages.some((msg: any) =>
      msg.contentPreview && (
        msg.contentPreview.includes('## ✅ 工作流执行完成') ||
        msg.contentPreview.includes('工作流执行完成')
      )
    );

    if (hasWorkflowCompletion) {
      console.log('[E2E] ✅ 工作流完成结果存在');
    }

    console.log('[E2E] ✅ 测试通过：刷新后消息顺序保持完全一致');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 高保真测试：多次刷新后消息顺序应该始终保持一致', async ({ page }) => {
    console.log('\n=== 高保真测试：多次刷新消息顺序一致性 ===');

    // 发送多条消息
    const messagesToSend = ['hello', '什么是AI?', '/explore'];

    for (let i = 0; i < messagesToSend.length; i++) {
      const msg = messagesToSend[i];
      console.log(`[E2E] 📤 发送第 ${i + 1} 条消息:`, msg);

      await page.evaluate((message) => {
        const chatStore = (window as any).__chatStore;
        const settingsStore = (window as any).__settingsStore;
        const settingsState = settingsStore.getState();
        const chatState = chatStore.getState();
        return chatState.sendMessage(message, settingsState.currentProviderId, settingsState.currentModel);
      }, msg);

      // 根据消息类型等待不同时间
      const waitTime = msg === '/explore' ? 35000 : 10000;
      await page.waitForTimeout(waitTime);
    }

    await page.waitForTimeout(5000);

    // 记录初始状态
    const initialState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      return {
        messageIds: messages.map((m: any) => m.id),
        messageRoles: messages.map((m: any) => m.role),
        messageContents: messages.map((m: any) => m.content?.substring(0, 50))
      };
    });

    console.log('[E2E] 💾 初始消息ID序列:', initialState.messageIds);

    // 多次刷新验证
    const refreshCount = 3;
    for (let i = 1; i <= refreshCount; i++) {
      console.log(`[E2E] 🔄 第 ${i} 次刷新...`);

      await page.reload();

      // 等待应用和 store 初始化完成
      await page.waitForFunction(() => {
        const chatStore = (window as any).__chatStore;
        return chatStore && chatStore.getState().messages !== undefined;
      }, { timeout: 15000 }).catch(() => {
        console.log(`[E2E] ⚠️ 第 ${i} 次刷新后等待 chatStore 初始化超时，继续执行`);
      });

      // 重新打开聊天面板
      await page.evaluate(() => {
        const layoutStore = (window as any).__layoutStore;
        if (layoutStore) {
          layoutStore.setState({ isChatOpen: true });
        }
      });

      // 等待消息加载完成
      await page.waitForFunction(() => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore?.getState()?.messages || [];
        return messages.length > 0;
      }, { timeout: 15000 }).catch(() => {
        console.log(`[E2E] ⚠️ 第 ${i} 次刷新后等待消息加载超时，继续执行`);
      });

      // 验证消息顺序
      const currentState = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore.getState().messages;
        return {
          messageIds: messages.map((m: any) => m.id),
          messageRoles: messages.map((m: any) => m.role),
          messageContents: messages.map((m: any) => m.content?.substring(0, 50))
        };
      });

      // 验证
      expect(currentState.messageIds).toEqual(initialState.messageIds, `第 ${i} 次刷新后消息ID顺序应该一致`);
      expect(currentState.messageRoles).toEqual(initialState.messageRoles, `第 ${i} 次刷新后消息角色顺序应该一致`);

      console.log(`[E2E] ✅ 第 ${i} 次刷新后消息顺序验证通过`);
    }

    console.log('[E2E] ✅ 测试通过：多次刷新后消息顺序始终保持一致');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 高保真测试：消息时间戳顺序应该正确', async ({ page }) => {
    console.log('\n=== 高保真测试：消息时间戳顺序 ===');

    // 发送多条消息
    const messagesToSend = ['第一条消息', '第二条消息', '第三条消息'];

    for (let i = 0; i < messagesToSend.length; i++) {
      await page.evaluate((data) => {
        const chatStore = (window as any).__chatStore;
        chatStore.getState().addMessage({
          id: `test-msg-${data.index}`,
          role: 'user',
          content: data.message,
          timestamp: Date.now() + data.index * 1000 // 确保时间戳递增
        });
      }, { message: messagesToSend[i], index: i });

      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(3000);

    // 记录刷新前的时间戳序列
    const beforeRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        timestamps: messages.map((m: any) => m.timestamp),
        contents: messages.map((m: any) => m.content?.substring(0, 30))
      };
    });

    console.log('[E2E] 💾 刷新前时间戳:', beforeRefresh.timestamps);
    console.log('[E2E] 💾 刷新前内容:', beforeRefresh.contents);

    // 刷新
    await page.reload();

    // 等待应用和 store 初始化完成
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore && chatStore.getState().messages !== undefined;
    }, { timeout: 15000 }).catch(() => {
      console.log('[E2E] ⚠️ 等待 chatStore 初始化超时，继续执行');
    });

    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    // 等待消息加载完成
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      return messages.length > 0;
    }, { timeout: 15000 }).catch(() => {
      console.log('[E2E] ⚠️ 等待消息加载超时，继续执行');
    });

    // 记录刷新后的时间戳序列
    const afterRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        timestamps: messages.map((m: any) => m.timestamp),
        contents: messages.map((m: any) => m.content?.substring(0, 30))
      };
    });

    console.log('[E2E] 💾 刷新后时间戳:', afterRefresh.timestamps);
    console.log('[E2E] 💾 刷新后内容:', afterRefresh.contents);

    // 验证时间戳序列应该一致
    expect(afterRefresh.timestamps).toEqual(beforeRefresh.timestamps, '刷新后时间戳序列应该一致');
    expect(afterRefresh.contents).toEqual(beforeRefresh.contents, '刷新后内容顺序应该一致');

    console.log('[E2E] ✅ 测试通过：消息时间戳顺序正确');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 高保真测试：工作流消息应该保持正确的执行顺序', async ({ page }) => {
    console.log('\n=== 高保真测试：工作流消息执行顺序 ===');

    // 发送 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const settingsState = settingsStore.getState();
      const chatState = chatStore.getState();
      return chatState.sendMessage('/explore', settingsState.currentProviderId, settingsState.currentModel);
    });

    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(35000);

    // 记录刷新前的消息结构
    const beforeRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        messageCount: messages.length,
        messages: messages.map((msg: any) => ({
          role: msg.role,
          contentLength: msg.content?.length || 0,
          hasWorkflowStart: msg.content?.includes('正在启动') || msg.content?.includes('工作流已开始'),
          hasWorkflowCompletion: msg.content?.includes('## ✅ 工作流执行完成'),
          segmentsCount: msg.segments?.length || 0,
          timestamp: msg.timestamp
        }))
      };
    });

    console.log('[E2E] 📊 刷新前消息结构:');
    beforeRefresh.messages.forEach((msg: any) => {
      console.log(`  ${msg.role}: ${msg.contentLength} chars, segments: ${msg.segmentsCount}, hasStart: ${msg.hasWorkflowStart}, hasCompletion: ${msg.hasWorkflowCompletion}`);
    });

    // 刷新
    console.log('[E2E] 🔄 刷新页面...');
    await page.reload();

    // 等待应用和 store 初始化完成
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore && chatStore.getState().messages !== undefined;
    }, { timeout: 15000 }).catch(() => {
      console.log('[E2E] ⚠️ 等待 chatStore 初始化超时，继续执行');
    });

    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    // 等待消息加载完成
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      return messages.length > 0;
    }, { timeout: 15000 }).catch(() => {
      console.log('[E2E] ⚠️ 等待消息加载超时，继续执行');
    });

    // 记录刷新后的消息结构
    const afterRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return {
        messageCount: messages.length,
        messages: messages.map((msg: any) => ({
          role: msg.role,
          contentLength: msg.content?.length || 0,
          hasWorkflowStart: msg.content?.includes('正在启动') || msg.content?.includes('工作流已开始'),
          hasWorkflowCompletion: msg.content?.includes('## ✅ 工作流执行完成'),
          segmentsCount: msg.segments?.length || 0,
          timestamp: msg.timestamp
        }))
      };
    });

    console.log('[E2E] 📊 刷新后消息结构:');
    afterRefresh.messages.forEach((msg: any) => {
      console.log(`  ${msg.role}: ${msg.contentLength} chars, segments: ${msg.segmentsCount}, hasStart: ${msg.hasWorkflowStart}, hasCompletion: ${msg.hasWorkflowCompletion}`);
    });

    // 验证消息结构一致
    expect(afterRefresh.messageCount).toBe(beforeRefresh.messageCount, '消息数量应该一致');
    expect(afterRefresh.messages.length).toBe(beforeRefresh.messages.length, '消息数组长度应该一致');

    // 逐个验证消息属性
    for (let i = 0; i < beforeRefresh.messages.length; i++) {
      const beforeMsg = beforeRefresh.messages[i];
      const afterMsg = afterRefresh.messages[i];

      expect(afterMsg.role).toBe(beforeMsg.role, `消息 ${i} 的角色应该一致`);
      expect(afterMsg.contentLength).toBeGreaterThan(0, `消息 ${i} 应该有内容`);
      expect(afterMsg.segmentsCount).toBe(beforeMsg.segmentsCount, `消息 ${i} 的段落数应该一致`);

      if (beforeMsg.hasWorkflowStart) {
        expect(afterMsg.hasWorkflowStart).toBe(true, `消息 ${i} 应该有工作流开始标记`);
      }

      if (beforeMsg.hasWorkflowCompletion) {
        expect(afterMsg.hasWorkflowCompletion).toBe(true, `消息 ${i} 应该有工作流完成标记`);
      }
    }

    console.log('[E2E] ✅ 测试通过：工作流消息结构正确保持');
  });
});
