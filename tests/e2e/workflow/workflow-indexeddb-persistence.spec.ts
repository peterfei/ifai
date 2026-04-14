/**
 * 🧪 IndexedDB 持久化测试 - 真实后端版
 *
 * 测试目标：
 * 1. 验证消息存储在 IndexedDB 而不是 localStorage
 * 2. 验证应用启动时恢复正确的 thread
 * 3. 验证刷新后工作流完成结果保留
 *
 * @version v1.0.0 - 使用真实后端和SSE
 */

import { test, expect } from '@playwright/test';

test.describe('🧪 IndexedDB 持久化 - 真实后端', () => {
  test.use({
    skip: !process.env.E2E_USE_REAL_AI, // 默认跳过，只有设置环境变量才运行
    timeout: 180000, // 3分钟超时，避免多次刷新导致的超时
  });

  test.beforeEach(async ({ page }) => {
    // 🔥 简化设置：直接导航到应用并设置真实AI
    await page.goto('http://localhost:1420');
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
  test.skip('✅ 测试1: 消息应该存储在 IndexedDB 而不是 localStorage', async ({ page }) => {
    console.log('\n=== 测试：消息存储在 IndexedDB ===');

    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') ||
          text.includes('[ThreadPersistence]') ||
          text.includes('IndexedDB') ||
          text.includes('localStorage')) {
        console.log('[Browser Console]', text);
      }
    });

    // 发送消息
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const state = settingsStore.getState();
      chatStore.getState().sendMessage(cmd, state.currentProviderId, state.currentModel);
    }, '/explore');

    // 等待工作流完成
    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(30000);

    // 检查 localStorage 内容
    const localStorageCheck = await page.evaluate(() => {
      const localStorageContent = localStorage.getItem('ifai-chat-storage-v4');

      if (!localStorageContent) {
        return {
          exists: false,
          error: 'localStorage content not found'
        };
      }

      try {
        const parsed = JSON.parse(localStorageContent);
        const hasMessages = 'messages' in parsed.state;
        const messages = parsed.state.messages;

        return {
          exists: true,
          hasMessagesField: hasMessages,
          messagesLength: messages?.length || 0,
          messagesContent: messages,
          currentThreadId: parsed.state.currentThreadId
        };
      } catch (e) {
        return {
          exists: true,
          error: 'Failed to parse: ' + e
        };
      }
    });

    console.log('[E2E] localStorage 检查结果:', localStorageCheck);

    // 验证：localStorage 不应该包含 messages
    expect(localStorageCheck.exists).toBe(true, 'localStorage 应该存在');
    expect(localStorageCheck.hasMessagesField).toBe(false, 'localStorage 不应该包含 messages 字段');
    expect(localStorageCheck.messagesLength).toBe(0, 'localStorage 中的 messages 应该为空或不存在');

    // 检查 IndexedDB 内容
    const indexedDBCheck = await page.evaluate(async () => {
      // 打开 IndexedDB
      const request = indexedDB.open('ifai-threads', 1);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result;

          // 获取所有消息
          const transaction = db.transaction(['messages'], 'readonly');
          const objectStore = transaction.objectStore('messages');
          const getAllRequest = objectStore.getAll();

          getAllRequest.onsuccess = () => {
            const messages = getAllRequest.result;

            resolve({
              success: true,
              messageCount: messages.length,
              hasMessages: messages.length > 0,
              sampleMessage: messages[0] || null
            });
          };

          getAllRequest.onerror = () => {
            reject({
              success: false,
              error: 'Failed to get messages from IndexedDB'
            });
          };
        };

        request.onerror = () => {
          reject({
            success: false,
            error: 'Failed to open IndexedDB'
          });
        };
      });
    });

    console.log('[E2E] IndexedDB 检查结果:', indexedDBCheck);

    // 验证：IndexedDB 应该包含消息
    expect(indexedDBCheck.success).toBe(true, 'IndexedDB 应该成功打开');
    expect(indexedDBCheck.hasMessages).toBe(true, 'IndexedDB 应该包含消息');
    expect(indexedDBCheck.messageCount).toBeGreaterThan(0, 'IndexedDB 中应该有消息');

    console.log('[E2E] ✅ 测试通过：消息正确存储在 IndexedDB 而不是 localStorage');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 测试2: 应用启动时应该恢复正确的 thread', async ({ page }) => {
    console.log('\n=== 测试：应用启动时恢复正确的 thread ===');

    // 发送消息并等待完成
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const state = settingsStore.getState();
      chatStore.getState().sendMessage(cmd, state.currentProviderId, state.currentModel);
    }, '/explore');

    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(30000);

    // 记录当前 threadId
    const beforeReload = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const chatState = chatStore.getState();
      const threadState = threadStore.getState();

      return {
        currentThreadId: chatState.currentThreadId,
        activeThreadId: threadState.activeThreadId,
        messageCount: chatState.messages.length,
        threadIds: Object.keys(threadState.threads)
      };
    });

    console.log('[E2E] 刷新前状态:', beforeReload);

    // 验证刷新前有消息
    expect(beforeReload.messageCount).toBeGreaterThan(0, '刷新前应该有消息');
    expect(beforeReload.currentThreadId).toBeTruthy();
    expect(beforeReload.activeThreadId).toBeTruthy();

    // 刷新页面
    console.log('[E2E] 🔄 刷新页面...');
    await page.reload();

    // 等待应用初始化完成
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

    // 检查刷新后状态
    const afterReload = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const chatState = chatStore.getState();
      const threadState = threadStore.getState();

      return {
        currentThreadId: chatState.currentThreadId,
        activeThreadId: threadState.activeThreadId,
        messageCount: chatState.messages.length,
        threadIds: Object.keys(threadState.threads),
        messages: chatState.messages
      };
    });

    console.log('[E2E] 刷新后状态:', afterReload);

    // 验证刷新后恢复了正确的 thread
    expect(afterReload.currentThreadId).toBe(beforeReload.currentThreadId, 'currentThreadId 应该保持一致');
    expect(afterReload.activeThreadId).toBe(beforeReload.activeThreadId, 'activeThreadId 应该保持一致');
    expect(afterReload.messageCount).toBeGreaterThan(0, '刷新后应该有消息');

    // 验证消息内容包含了工作流完成结果
    const hasWorkflowCompletion = afterReload.messages.some((msg: any) =>
      msg.content && (
        msg.content.includes('## ✅ 工作流执行完成') ||
        msg.content.includes('工作流执行完成') ||
        msg.content.includes('✅')
      )
    );

    expect(hasWorkflowCompletion).toBe(true, '刷新后的消息应该包含工作流完成结果');

    console.log('[E2E] ✅ 测试通过：应用启动时正确恢复了 thread');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 测试3: 刷新后工作流完成结果应该保留', async ({ page }) => {
    console.log('\n=== 测试：刷新后工作流完成结果保留 ===');

    // 监听控制台
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') || text.includes('## ✅')) {
        console.log('[Browser Console]', text);
      }
    });

    // 发送消息
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const state = settingsStore.getState();
      chatStore.getState().sendMessage(cmd, state.currentProviderId, state.currentModel);
    }, '/explore');

    // 等待工作流完成
    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(30000);

    // 获取刷新前的消息内容
    const beforeRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMessages = messages.filter((m: any) => m?.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

      if (!lastAssistantMessage) {
        return { error: 'No assistant message' };
      }

      const content = lastAssistantMessage.content || '';

      return {
        contentLength: content.length,
        hasCompletionMarker: content.includes('## ✅ 工作流执行完成'),
        hasWorkflowId: content.includes('工作流 ID'),
        contentPreview: content.substring(0, 200)
      };
    });

    console.log('[E2E] 刷新前消息:', beforeRefresh);

    // 验证刷新前有工作流完成标记
    expect(beforeRefresh.hasCompletionMarker).toBe(true, '刷新前应该有工作流完成标记');

    // 刷新页面
    console.log('[E2E] 🔄 刷新页面...');
    await page.reload();

    // 等待应用初始化完成
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

    // 获取刷新后的消息内容
    const afterRefresh = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMessages = messages.filter((m: any) => m?.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

      if (!lastAssistantMessage) {
        return { error: 'No assistant message after refresh' };
      }

      const content = lastAssistantMessage.content || '';

      return {
        contentLength: content.length,
        hasCompletionMarker: content.includes('## ✅ 工作流执行完成'),
        hasWorkflowId: content.includes('工作流 ID'),
        contentPreview: content.substring(0, 200)
      };
    });

    console.log('[E2E] 刷新后消息:', afterRefresh);

    // 验证刷新后仍有工作流完成标记
    expect(afterRefresh.hasCompletionMarker).toBe(true, '刷新后应该有工作流完成标记');
    expect(afterRefresh.hasWorkflowId).toBe(true, '刷新后应该有工作流 ID');

    // 验证内容长度相近
    const lengthDiff = Math.abs(afterRefresh.contentLength - beforeRefresh.contentLength);
    expect(lengthDiff).toBeLessThan(100, '刷新前后内容长度应该相近');

    console.log('[E2E] ✅ 测试通过：刷新后工作流完成结果正确保留');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 测试4: 多次刷新后消息应该始终保留', async ({ page }) => {
    console.log('\n=== 测试：多次刷新的持久化稳定性 ===');

    // 发送消息
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const state = settingsStore.getState();
      chatStore.getState().sendMessage(cmd, state.currentProviderId, state.currentModel);
    }, '/explore');

    // 等待工作流完成
    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(30000);

    // 多次刷新
    const refreshCount = 3;
    for (let i = 1; i <= refreshCount; i++) {
      console.log(`[E2E] 🔄 第 ${i} 次刷新...`);

      await page.reload();

      // 等待应用和 store 初始化完成（使用条件等待代替硬性等待）
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

      // 验证消息仍然存在
      const check = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore.getState().messages;
        const assistantMessages = messages.filter((m: any) => m?.role === 'assistant');
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        const content = lastMessage?.content || '';

        return {
          hasMessages: messages.length > 0,
          hasCompletion: content.includes('## ✅ 工作流执行完成') ||
                          content.includes('工作流执行完成'),
          contentLength: content.length
        };
      });

      console.log(`[E2E] 第 ${i} 次刷新后:`, check);

      expect(check.hasMessages).toBe(true, `第 ${i} 次刷新后应该有消息`);
      expect(check.hasCompletion).toBe(true, `第 ${i} 次刷新后应该包含工作流完成结果`);
      expect(check.contentLength).toBeGreaterThan(100, `第 ${i} 次刷新后内容不应该为空`);
    }

    console.log('[E2E] ✅ 测试通过：多次刷新后消息始终保留');
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 测试5: IndexedDB 中应该有正确的 threadId', async ({ page }) => {
    console.log('\n=== 测试：IndexedDB 中的 threadId 正确性 ===');

    // 发送消息
    await page.evaluate((cmd) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const state = settingsStore.getState();
      chatStore.getState().sendMessage(cmd, state.currentProviderId, state.currentModel);
    }, '/explore');

    // 等待工作流完成
    console.log('[E2E] ⏳ 等待工作流完成...');
    await page.waitForTimeout(30000);

    // 获取当前 threadId
    const currentInfo = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return {
        currentThreadId: chatStore.getState().currentThreadId
      };
    });

    console.log('[E2E] 当前 threadId:', currentInfo.currentThreadId);

    // 检查 IndexedDB 中的消息
    const indexedDBMessages = await page.evaluate(async (expectedThreadId) => {
      const request = indexedDB.open('ifai-threads', 1);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['messages'], 'readonly');
          const objectStore = transaction.objectStore('messages');
          const getAllRequest = objectStore.getAll();

          getAllRequest.onsuccess = () => {
            const messages = getAllRequest.result;

            // 检查消息的 threadId
            const threadIds = messages.map((m: any) => m.threadId);
            const hasExpectedThreadId = threadIds.includes(expectedThreadId);

            resolve({
              messageCount: messages.length,
              threadIds: threadIds,
              hasExpectedThreadId: hasExpectedThreadId,
              sampleMessages: messages.slice(0, 3).map((m: any) => ({
                id: m.id,
                threadId: m.threadId,
                role: m.role
              }))
            });
          };

          getAllRequest.onerror = () => {
            reject({ error: 'Failed to get messages' });
          };
        };

        request.onerror = () => {
          reject({ error: 'Failed to open IndexedDB' });
        };
      });
    }, currentInfo.currentThreadId);

    console.log('[E2E] IndexedDB 消息:', indexedDBMessages);

    // 验证
    expect(indexedDBMessages.messageCount).toBeGreaterThan(0, 'IndexedDB 应该有消息');
    expect(indexedDBMessages.hasExpectedThreadId).toBe(true, `IndexedDB 中应该有 threadId 为 ${currentInfo.currentThreadId} 的消息`);

    console.log('[E2E] ✅ 测试通过：IndexedDB 中的 threadId 正确');
  });
});
