/**
 * 🧪 消息顺序快速测试 - 简化版
 *
 * 测试目标：
 * 快速验证刷新后消息顺序保持一致
 *
 * @version v1.0.0 - 简化版，不使用 /explore
 */

import { test, expect } from '@playwright/test';

test.describe('🧪 消息顺序快速测试', () => {
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

  test('✅ 快速测试：刷新后消息顺序应该保持一致', async ({ page }) => {
    console.log('\n=== 快速测试：刷新后消息顺序一致性 ===');

    // 监听控制台
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') || text.includes('[ChatStore]') || text.includes('[E2E]')) {
        console.log('[Browser Console]', text);
      }
    });

    // 发送3条简单消息（不使用 /explore 避免长等待）
    const messagesToSend = ['第一条消息', '第二条消息', '第三条消息'];

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

      // 等待消息处理完成（每个消息等待8秒）
      await page.waitForTimeout(8000);
    }

    // 额外等待，确保所有消息都被保存
    await page.waitForTimeout(3000);

    // ========================================
    // 记录刷新前的消息顺序
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
    // 刷新页面
    // ========================================
    console.log('[E2E] 🔄 刷新页面...');
    await page.reload();
    await page.waitForTimeout(5000);

    // 重新打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(3000);

    // ========================================
    // 记录刷新后的消息顺序
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
    // 验证消息顺序一致性
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

    // 验证4：消息内容应该一致
    expect(messageContentsAfter).toEqual(messageContentsBefore, '消息内容应该一致');
    console.log('[E2E] ✅ 消息内容验证通过');

    console.log('[E2E] ✅ 测试通过：刷新后消息顺序保持完全一致');
  });
});
