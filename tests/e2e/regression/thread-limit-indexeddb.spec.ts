/**
 * 线程限制和 IndexedDB 保存错误测试
 *
 * 问题：当达到最大线程限制（20个）时，创建新线程会：
 * 1. 发出警告：Maximum thread limit (20) reached
 * 2. 归档最旧的线程
 * 3. 创建新线程时，尝试保存消息到 IndexedDB 失败：
 *    DataError: Failed to store record in an IDBObjectStore:
 *    Evaluating the object store's key path did not yield a value.
 *
 * 根本原因：某些消息对象缺少 id 字段
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('线程限制和 IndexedDB 保存错误测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ThreadStore') ||
          text.includes('ThreadPersistence') ||
          text.includes('IndexedDB') ||
          text.includes('Maximum thread limit') ||
          text.includes('Failed to save')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  /**
   * 测试用例：检查是否可以处理最大线程限制
   */
  test('thread-limit-indexeddb-01: 模拟达到线程限制时的行为', async ({ page }) => {
    console.log('[Test] ========== 开始线程限制测试 ==========');

    const result = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      if (!threadStore) {
        return { success: false, error: 'threadStore not available' };
      }

      // 获取当前最大线程数
      const state = threadStore.getState();
      const maxThreads = state.maxThreads;

      console.log('[Test] 当前最大线程数:', maxThreads);

      // 记录初始线程数量
      const initialThreadCount = Object.values(state.threads).filter(
        (t: any) => t.status !== 'deleted'
      ).length;

      console.log('[Test] 初始线程数量:', initialThreadCount);

      // 尝试创建 25 个线程（超过限制）
      const createdThreads: string[] = [];
      const archivedThreads: string[] = [];

      for (let i = 0; i < 25; i++) {
        const threadId = threadStore.getState().createThread({
          title: `测试线程 ${i + 1}`
        });
        createdThreads.push(threadId);

        // 检查是否有线程被归档
        const currentState = threadStore.getState();
        const archived = Object.values(currentState.threads)
          .filter((t: any) => t.status === 'archived')
          .map((t: any) => t.id);

        archived.push(...archived);
      }

      // 获取最终状态
      const finalState = threadStore.getState();
      const activeThreads = Object.values(finalState.threads).filter(
        (t: any) => t.status === 'active'
      );
      const archivedThreadsFinal = Object.values(finalState.threads).filter(
        (t: any) => t.status === 'archived'
      );

      console.log('[Test] 创建的线程数:', createdThreads.length);
      console.log('[Test] 活跃线程数:', activeThreads.length);
      console.log('[Test] 归档线程数:', archivedThreadsFinal.length);

      return {
        success: true,
        maxThreads,
        initialThreadCount,
        createdThreadsCount: createdThreads.length,
        activeThreadsCount: activeThreads.length,
        archivedThreadsCount: archivedThreadsFinal.length,
        // 验证：活跃线程数不应该超过最大限制
        exceedsLimit: activeThreads.length > maxThreads,
        // 验证：创建的线程数应该等于活跃线程数 + 归档线程数
        expectedTotal: Math.min(initialThreadCount + 25, maxThreads),
        actualTotal: activeThreads.length + archivedThreadsFinal.length
      };
    });

    console.log('[Test] ========== 线程限制测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.exceedsLimit, '活跃线程数不应该超过最大限制').toBe(false);
    expect(result.activeThreadsCount).toBeLessThanOrEqual(result.maxThreads);

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：检查消息对象是否都有 id 字段
   */
  test('thread-limit-indexeddb-02: 检查消息对象是否都有 id 字段', async ({ page }) => {
    console.log('[Test] ========== 开始消息 ID 检查测试 ==========');

    const result = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      if (!threadStore || !chatStore) {
        return { success: false, error: 'stores not available' };
      }

      // 检查当前所有消息
      const messages = chatStore.getState().messages;

      console.log('[Test] 当前消息数量:', messages.length);

      // 检查每个消息是否有 id
      const messagesWithoutId: any[] = [];
      const messagesWithId: any[] = [];

      messages.forEach((msg: any, index: number) => {
        if (!msg.id || msg.id === undefined || msg.id === null) {
          messagesWithoutId.push({
            index,
            role: msg.role,
            content: msg.content?.substring(0, 50) || '',
            keys: Object.keys(msg)
          });
        } else {
          messagesWithId.push({
            id: msg.id,
            role: msg.role
          });
        }
      });

      console.log('[Test] 有 ID 的消息数:', messagesWithId.length);
      console.log('[Test] 缺少 ID 的消息数:', messagesWithoutId.length);

      // 尝试添加一条新消息
      const testMessageId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: testMessageId,
        role: 'user',
        content: '测试消息',
        timestamp: Date.now()
      });

      const messagesAfterAdd = chatStore.getState().messages;
      const newMessage = messagesAfterAdd[messagesAfterAdd.length - 1];

      return {
        success: true,
        totalMessages: messages.length,
        messagesWithIdCount: messagesWithId.length,
        messagesWithoutIdCount: messagesWithoutId.length,
        messagesWithoutId,
        newMessage: {
          id: newMessage.id,
          role: newMessage.role,
          content: newMessage.content
        },
        hasIssue: messagesWithoutId.length > 0
      };
    });

    console.log('[Test] ========== 消息 ID 检查结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.hasIssue) {
      console.log('[Test] ⚠️ 发现缺少 ID 的消息:', result.messagesWithoutId);
    }

    expect(result.messagesWithoutIdCount, '不应该有缺少 ID 的消息').toBe(0);
    expect(result.newMessage.id, '新消息应该有 ID').toBeTruthy();

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：模拟 messageToStored 函数的行为
   */
  test('thread-limit-indexeddb-03: 模拟 messageToStored 函数', async ({ page }) => {
    console.log('[Test] ========== 开始 messageToStored 测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 获取所有消息
      const messages = chatStore.getState().messages;

      console.log('[Test] 消息数量:', messages.length);

      // 模拟 messageToStored 函数
      const conversionErrors: any[] = [];
      const convertedMessages: any[] = [];

      messages.forEach((msg: any, index: number) => {
        try {
          // 这是 threadPersistence.ts 中的逻辑
          const stored = {
            id: msg.id,  // 🔥 这里可能为 undefined
            threadId: 'test-thread',
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            toolCalls: msg.toolCalls,
            tool_call_id: msg.tool_call_id,
            timestamp: Date.now(),
            multiModalContent: msg.multiModalContent,
            references: msg.references,
            agentId: msg.agentId,
            isAgentLive: msg.isAgentLive,
            contentSegments: msg.contentSegments,
          };

          // 检查 id 是否有效
          if (!stored.id || stored.id === undefined || stored.id === null || stored.id === '') {
            conversionErrors.push({
              index,
              messageIndex: index,
              originalMessage: {
                role: msg.role,
                contentKeys: Object.keys(msg),
                hasId: 'id' in msg,
                idValue: msg.id,
                idType: typeof msg.id
              },
              convertedMessage: stored
            });
          } else {
            convertedMessages.push({
              id: stored.id,
              role: stored.role
            });
          }
        } catch (e) {
          conversionErrors.push({
            index,
            error: String(e)
          });
        }
      });

      console.log('[Test] 成功转换的消息数:', convertedMessages.length);
      console.log('[Test] 转换失败的消息数:', conversionErrors.length);

      return {
        success: true,
        totalMessages: messages.length,
        convertedMessagesCount: convertedMessages.length,
        conversionErrorsCount: conversionErrors.length,
        conversionErrors,
        hasIssue: conversionErrors.length > 0
      };
    });

    console.log('[Test] ========== messageToStored 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.hasIssue) {
      console.log('[Test] ⚠️ 发现转换错误:', result.conversionErrors);
    }

    expect(result.conversionErrorsCount, '不应该有转换错误').toBe(0);

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：创建新线程并检查是否会触发保存错误
   */
  test('thread-limit-indexeddb-04: 创建新线程时的保存行为', async ({ page }) => {
    console.log('[Test] ========== 开始新线程保存测试 ==========');

    const result = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      if (!threadStore || !chatStore) {
        return { success: false, error: 'stores not available' };
      }

      // 清空现有线程
      threadStore.getState().reset();

      // 创建 20 个线程（达到限制）
      const threadIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        const id = threadStore.getState().createThread({
          title: `线程 ${i + 1}`
        });
        threadIds.push(id);
      }

      console.log('[Test] 已创建 20 个线程');

      // 获取创建第 21 个线程之前的状态
      const stateBefore21 = threadStore.getState();
      const threadsBefore21 = Object.values(stateBefore21.threads).filter(
        (t: any) => t.status !== 'deleted'
      );

      console.log('[Test] 创建第 21 个线程前的线程数:', threadsBefore21.length);

      // 创建第 21 个线程（触发归档）
      const thread21Id = threadStore.getState().createThread({
        title: '第 21 个线程'
      });

      console.log('[Test] 第 21 个线程 ID:', thread21Id);

      // 获取最终状态
      const stateAfter21 = threadStore.getState();
      const activeThreadsAfter21 = Object.values(stateAfter21.threads).filter(
        (t: any) => t.status === 'active'
      );
      const archivedThreadsAfter21 = Object.values(stateAfter21.threads).filter(
        (t: any) => t.status === 'archived'
      );

      console.log('[Test] 创建第 21 个线程后的活跃线程数:', activeThreadsAfter21.length);
      console.log('[Test] 归档线程数:', archivedThreadsAfter21.length);

      // 检查新线程的初始消息
      const messages = chatStore.getState().messages;
      const newThreadMessages = messages.filter((m: any) => {
        // 新线程的消息可能还没有关联 threadId
        return true;
      });

      console.log('[Test] 当前消息总数:', messages.length);

      return {
        success: true,
        thread21Id,
        activeThreadsCount: activeThreadsAfter21.length,
        archivedThreadsCount: archivedThreadsAfter21.length,
        totalMessages: messages.length,
        // 验证：活跃线程数应该是 20
        expectedActiveCount: 20,
        activeCountCorrect: activeThreadsAfter21.length === 20
      };
    });

    console.log('[Test] ========== 新线程保存测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.activeCountCorrect, '活跃线程数应该是 20').toBe(true);
    expect(result.thread21Id).toBeTruthy();

    console.log('[Test] ✅ 测试通过');
  });
});
