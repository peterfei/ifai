/**
 * 🧪 工作流刷新后持久化测试 - 真实后端版
 *
 * 测试目标：
 * 1. 使用真实后端（SSE HTTP代理）
 * 2. 验证 /explore 工作流完成后消息内容被正确保存
 * 3. 验证刷新页面后工作流完成结果仍然保留
 *
 * @version v1.0.0 - 使用真实后端和SSE
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('🧪 工作流刷新后持久化 - 真实后端', () => {
  test.use({
    skip: !process.env.E2E_USE_REAL_AI, // 默认跳过，只有设置环境变量才运行
  });

  test.beforeEach(async ({ page }) => {
    // 🔥 简化设置：直接导航到应用并设置真实AI
    await page.goto('http://localhost:1420');

    // 等待应用加载
    await page.waitForTimeout(2000);

    // 设置真实AI配置
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
    });

    // 配置真实AI Provider
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (!settingsStore) {
        console.error('❌ settingsStore 未初始化');
        return;
      }

      // 使用 .env.e2e.local 中的配置
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

      console.log('[E2E] ✅ Provider 配置已设置');
    });

    // 等待设置生效
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

  test('✅ 工作流完成后刷新页面，工作流完成结果应该保留', async ({ page }) => {
    console.log('\n=== 测试：工作流完成后刷新页面的持久化 ===');

    // ========================================
    // Given: 发送 /explore 命令
    // ========================================
    const testCommand = '/explore';

    console.log('[E2E] 📤 发送命令:', testCommand);

    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') ||
          text.includes('workflow:completed') ||
          text.includes('💾') ||
          text.includes('## ✅ 工作流执行完成')) {
        console.log('[Browser Console]', text);
      }
    });

    // 直接调用 sendMessage 方法
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;

      if (!chatStore || !settingsStore) {
        console.error('❌ chatStore 或 settingsStore 未初始化');
        return { success: false, error: 'Stores not initialized' };
      }

      const state = settingsStore.getState();
      const providerId = state.currentProviderId;
      const model = state.currentModel;

      console.log('📤 发送消息:', { cmd, providerId, model });
      chatStore.getState().sendMessage(cmd, providerId, model);
      console.log('✅ 消息已发送');
      return { success: true };
    }, testCommand);

    // ========================================
    // When: 等待工作流完成
    // ========================================
    console.log('[E2E] ⏳ 等待工作流完成...');

    // 等待工作流完成（最长等待60秒）
    const maxWaitTime = 60000;
    const checkInterval = 2000;
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      await page.waitForTimeout(checkInterval);
      elapsedTime += checkInterval;

      // 检查是否有工作流完成的消息
      const hasCompletion = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore?.getState()?.messages || [];

        // 查找最后一条助手消息
        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        if (assistantMessages.length === 0) return false;

        const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
        const content = lastAssistantMessage?.content || '';

        return content.includes('## ✅ 工作流执行完成') ||
               content.includes('工作流执行完成') ||
               content.includes('✅');
      });

      if (hasCompletion) {
        console.log(`[E2E] ✅ 工作流已完成 (等待时间: ${elapsedTime}ms)`);
        break;
      }

      console.log(`[E2E] ⏳ 等待中... (${elapsedTime}ms)`);
    }

    // 额外等待2秒，确保消息被完全保存
    await page.waitForTimeout(2000);

    // ========================================
    // Then: 验证刷新前的消息内容
    // ========================================
    console.log('[E2E] 📊 验证刷新前的消息内容');

    const beforeRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];

      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

      if (!lastAssistantMessage) {
        return {
          error: 'No assistant message found',
          totalMessages: messages.length
        };
      }

      const content = lastAssistantMessage.content || '';

      return {
        totalMessages: messages.length,
        contentLength: content.length,
        contentPreview: content.substring(0, 500),
        hasCompletionMarker: content.includes('## ✅ 工作流执行完成'),
        hasWorkflowCompleted: content.includes('工作流执行完成'),
        hasWorkflowId: content.includes('工作流 ID'),
        hasNodeResults: content.includes('节点执行结果') || content.includes('📊'),
        metadata: lastAssistantMessage.metadata || {}
      };
    });

    console.log('[E2E] 刷新前消息状态:', beforeRefresh);

    // 验证刷新前有工作流完成结果
    expect(beforeRefresh.hasCompletionMarker || beforeRefresh.hasWorkflowCompleted).toBe(true);
    expect(beforeRefresh.hasWorkflowId).toBe(true);

    // 保存刷新前的内容预览用于对比
    const contentPreviewBefore = beforeRefresh.contentPreview;

    // ========================================
    // When: 刷新页面
    // ========================================
    console.log('[E2E] 🔄 刷新页面...');

    await page.reload();
    await page.waitForTimeout(3000);

    // 重新打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    // ========================================
    // Then: 验证刷新后的消息内容
    // ========================================
    console.log('[E2E] 📊 验证刷新后的消息内容');

    const afterRefresh = await page.evaluate(() => {
      // 🔥 DEBUG: 检查 localStorage 内容
      const localStorageContent = localStorage.getItem('ifai-chat-storage-v4');
      console.log('[E2E DEBUG] localStorage exists:', !!localStorageContent);
      console.log('[E2E DEBUG] localStorage length:', localStorageContent?.length || 0);

      if (localStorageContent) {
        try {
          const parsed = JSON.parse(localStorageContent);
          console.log('[E2E DEBUG] localStorage parsed keys:', Object.keys(parsed));
          console.log('[E2E DEBUG] localStorage.state.messages:', parsed?.state?.messages);
          console.log('[E2E DEBUG] localStorage.state.messageCount:', parsed?.state?.messages?.length);
        } catch (e) {
          console.log('[E2E DEBUG] Failed to parse localStorage:', e);
        }
      }

      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];

      console.log('[E2E DEBUG] chatStore.messages.length:', messages.length);
      console.log('[E2E DEBUG] chatStore.messages:', messages);

      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

      if (!lastAssistantMessage) {
        return {
          error: 'No assistant message found after refresh',
          totalMessages: messages.length,
          localStorageExists: !!localStorageContent,
          localStorageLength: localStorageContent?.length || 0,
          localStorageContentPreview: localStorageContent?.substring(0, 200)
        };
      }

      const content = lastAssistantMessage.content || '';

      return {
        totalMessages: messages.length,
        contentLength: content.length,
        contentPreview: content.substring(0, 500),
        hasCompletionMarker: content.includes('## ✅ 工作流执行完成'),
        hasWorkflowCompleted: content.includes('工作流执行完成'),
        hasWorkflowId: content.includes('工作流 ID'),
        hasNodeResults: content.includes('节点执行结果') || content.includes('📊'),
        metadata: lastAssistantMessage.metadata || {}
      };
    });

    console.log('[E2E] 刷新后消息状态:', afterRefresh);

    // ========================================
    // ✅ 断言：验证刷新后工作流结果仍然保留
    // ========================================
    expect(afterRefresh.totalMessages).toBeGreaterThan(0, '刷新后应该有消息');
    expect(afterRefresh.hasCompletionMarker || afterRefresh.hasWorkflowCompleted).toBe(true, '刷新后应该包含工作流完成标记');
    expect(afterRefresh.hasWorkflowId).toBe(true, '刷新后应该包含工作流ID');
    expect(afterRefresh.hasNodeResults).toBe(true, '刷新后应该包含节点执行结果');

    // 验证刷新前后内容长度相近（说明内容没有丢失）
    const lengthDiff = Math.abs(afterRefresh.contentLength - beforeRefresh.contentLength);
    expect(lengthDiff).toBeLessThan(100, '刷新前后内容长度应该相近');

    console.log('[E2E] ✅ 测试通过：工作流完成结果在刷新后正确保留');
  });

  test('✅ 多次快速刷新，工作流完成结果应该始终保留', async ({ page }) => {
    console.log('\n=== 测试：多次快速刷新的持久化稳定性 ===');

    // 发送命令并等待完成
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const state = settingsStore.getState();
      chatStore.getState().sendMessage(cmd, state.currentProviderId, state.currentModel);
    }, '/explore');

    // 等待工作流完成
    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(30000);

    // 多次刷新测试
    const refreshCount = 3;
    for (let i = 1; i <= refreshCount; i++) {
      console.log(`[E2E] 🔄 第 ${i} 次刷新...`);

      await page.reload();
      await page.waitForTimeout(3000);

      // 重新打开聊天面板
      await page.evaluate(() => {
        const layoutStore = (window as any).__layoutStore;
        if (layoutStore) {
          layoutStore.setState({ isChatOpen: true });
        }
      });

      await page.waitForTimeout(2000);

      // 验证消息仍然存在
      const check = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore?.getState()?.messages || [];
        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        const content = lastMessage?.content || '';

        return {
          hasMessages: messages.length > 0,
          hasCompletion: content.includes('## ✅ 工作流执行完成') ||
                         content.includes('工作流执行完成') ||
                         content.includes('✅'),
          contentLength: content.length
        };
      });

      console.log(`[E2E] 第 ${i} 次刷新后:`, check);

      expect(check.hasMessages).toBe(true, `第 ${i} 次刷新后应该有消息`);
      expect(check.hasCompletion).toBe(true, `第 ${i} 次刷新后应该包含工作流完成结果`);
      expect(check.contentLength).toBeGreaterThan(100, `第 ${i} 次刷新后内容不应该为空`);
    }

    console.log('[E2E] ✅ 测试通过：多次刷新后工作流结果始终保留');
  });

  test('✅ 工作流节点的详细结果应该在刷新后保留', async ({ page }) => {
    console.log('\n=== 测试：工作流节点详细结果的持久化 ===');

    // 发送命令
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const state = settingsStore.getState();
      chatStore.getState().sendMessage(cmd, state.currentProviderId, state.currentModel);
    }, '/explore src/stores');

    // 等待工作流完成
    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(30000);

    // 验证刷新前有节点结果
    const beforeNodes = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const content = lastMessage?.content || '';

      return {
        hasReadNode: content.includes('Read') || content.includes('read'),
        hasSearchNode: content.includes('Search') || content.includes('search'),
        hasAgentNode: content.includes('Agent') || content.includes('agent'),
        hasNodeResults: content.includes('节点执行结果') || content.includes('📊'),
        contentLength: content.length
      };
    });

    console.log('[E2E] 刷新前节点状态:', beforeNodes);

    // 刷新页面
    console.log('[E2E] 🔄 刷新页面...');
    await page.reload();
    await page.waitForTimeout(3000);

    // 重新打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    // 验证刷新后仍有节点结果
    const afterNodes = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const content = lastMessage?.content || '';

      return {
        hasReadNode: content.includes('Read') || content.includes('read'),
        hasSearchNode: content.includes('Search') || content.includes('search'),
        hasAgentNode: content.includes('Agent') || content.includes('agent'),
        hasNodeResults: content.includes('节点执行结果') || content.includes('📊'),
        contentLength: content.length
      };
    });

    console.log('[E2E] 刷新后节点状态:', afterNodes);

    // 如果刷新前有节点结果，刷新后也应该有
    if (beforeNodes.hasNodeResults) {
      expect(afterNodes.hasNodeResults).toBe(true, '刷新后应该仍然包含节点执行结果');
    }

    // 验证内容长度相近
    const lengthDiff = Math.abs(afterNodes.contentLength - beforeNodes.contentLength);
    expect(lengthDiff).toBeLessThan(200, '刷新前后内容长度应该相近');

    console.log('[E2E] ✅ 测试通过：节点详细结果在刷新后正确保留');
  });
});
