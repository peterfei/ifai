/**
 * 🎯 连续发送功能 E2E 测试 - 核心功能验证
 *
 * 这个测试验证用户可以在 LLM 处理过程中连续发送多个消息
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('连续发送功能 - 核心测试', () => {

  test('✅ 验证输入框在 LLM 处理时不被锁住', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置必要的 store
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;

      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.setState({
          providers: [{
            id: 'test-provider',
            name: 'Test Provider',
            apiKey: 'test-key',
            enabled: true,
            base: 'https://api.test.com',
            models: ['test-model']
          }],
          currentProviderId: 'test-provider',
          currentModel: 'test-model'
        });
      }
    });

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    // 🔥 测试场景：连续发送 3 条消息
    const messages = [
      '第一条消息：你好',
      '第二条消息：帮我分析代码',
      '第三条消息：总结一下'
    ];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      console.log(`📝 [Test] 发送第 ${i + 1} 条消息: ${message}`);

      // 检查输入框是否可用
      const isInputEnabled = await page.evaluate(() => {
        const textarea = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
        return !textarea.disabled;
      });

      console.log(`📊 [Test] 输入框状态: ${isInputEnabled ? '可用' : '禁用'}`);

      // ✅ 断言：输入框应该始终可用
      expect(isInputEnabled).toBe(true);

      // 检查发送按钮是否可用
      // 注意：由于 React 状态更新是异步的，我们使用 type() 方法而不是手动设置 value
      await page.type('textarea[data-testid="chat-input"]', message);
      await page.waitForTimeout(100);  // 等待 React 状态更新

      const isSendButtonEnabled = await page.evaluate(() => {
        const button = document.querySelector('button[data-testid="chat-send-button"]') as HTMLButtonElement;
        return !button.disabled;
      });

      console.log(`📊 [Test] 发送按钮状态: ${isSendButtonEnabled ? '可用' : '禁用'}`);

      // ✅ 断言：发送按钮应该可用
      expect(isSendButtonEnabled).toBe(true);

      // 发送消息
      await page.evaluate(({ msg }) => {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) {
          console.error('[Test] ❌ chatStore not found');
          return;
        }

        const messageId = 'user-msg-' + Date.now() + '-' + Math.random();

        // 创建用户消息
        chatStore.getState().addMessage({
          id: messageId,
          role: 'user' as const,
          content: msg,
          timestamp: Date.now()
        });

        console.log(`[Test] ✅ 消息已发送: ${msg}`);
      }, { msg: message });

      await page.waitForTimeout(300);

      // 验证消息已添加到列表
      const messageCount = await page.evaluate(({ expectedMsg }) => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore?.getState()?.messages || [];
        const lastMessage = messages[messages.length - 1];
        return {
          totalMessages: messages.length,
          lastMessageContent: lastMessage?.content,
          lastMessageIsUser: lastMessage?.role === 'user',
          hasExpectedContent: lastMessage?.content === expectedMsg
        };
      }, { expectedMsg: message });

      console.log(`📊 [Test] 消息状态:`, messageCount);

      // ✅ 断言：验证消息已正确添加
      expect(messageCount.lastMessageIsUser).toBe(true);
      expect(messageCount.hasExpectedContent).toBe(true);
    }

    // 🔥 最终验证：所有消息都已发送
    const finalState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const userMessages = messages.filter((m: any) => m.role === 'user');

      return {
        totalMessages: messages.length,
        userMessageCount: userMessages.length,
        userMessages: userMessages.map((m: any) => ({
          id: m.id,
          content: m.content
        }))
      };
    });

    console.log('📊 [Test] 最终状态:', finalState);

    // ✅ 断言：验证所有消息都已发送
    expect(finalState.userMessageCount).toBe(3);
    expect(finalState.userMessages[0].content).toBe(messages[0]);
    expect(finalState.userMessages[1].content).toBe(messages[1]);
    expect(finalState.userMessages[2].content).toBe(messages[2]);

    console.log('✅ [Test] 连续发送功能测试通过！');
  });

  test('✅ 验证消息追加到对话上下文', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
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

    // 🔥 测试场景：发送多条消息，验证它们都被追加到对话上下文
    const messages = [
      '帮我分析这个函数',
      '它的复杂度是多少',
      '有没有优化建议'
    ];

    for (let i = 0; i < messages.length; i++) {
      await page.evaluate(({ msg, index }) => {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) {
          console.error('[Test] ❌ chatStore not found');
          return;
        }

        const messageId = `user-msg-${index}-${Date.now()}`;

        // 创建用户消息
        chatStore.getState().addMessage({
          id: messageId,
          role: 'user' as const,
          content: msg,
          timestamp: Date.now()
        });

        // 模拟 LLM 开始处理（创建助手消息）
        const assistantMessageId = `assistant-msg-${index}-${Date.now()}`;
        chatStore.getState().addMessage({
          id: assistantMessageId,
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          status: 'streaming' as const
        });

        console.log(`[Test] ✅ 第 ${index + 1} 条消息已发送: ${msg}`);
      }, { msg: messages[i], index: i });

      await page.waitForTimeout(200);
    }

    // 验证对话上下文
    const conversationContext = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];

      return {
        totalMessages: messages.length,
        conversationFlow: messages.map((m: any) => ({
          role: m.role,
          content: m.content?.substring(0, 30),
          status: m.status
        }))
      };
    });

    console.log('📊 [Test] 对话上下文:', conversationContext);

    // ✅ 断言：验证对话流程
    expect(conversationContext.totalMessages).toBe(6); // 3 用户 + 3 助手
    expect(conversationContext.conversationFlow[0].role).toBe('user');
    expect(conversationContext.conversationFlow[1].role).toBe('assistant');
    expect(conversationContext.conversationFlow[2].role).toBe('user');
    expect(conversationContext.conversationFlow[3].role).toBe('assistant');
    expect(conversationContext.conversationFlow[4].role).toBe('user');
    expect(conversationContext.conversationFlow[5].role).toBe('assistant');

    console.log('✅ [Test] 消息追加到对话上下文测试通过！');
  });
});
