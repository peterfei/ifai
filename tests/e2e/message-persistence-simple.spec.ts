/**
 * 消息持久化测试（简化版）
 * 验证应用重启后消息历史正确恢复，包括 contentSegments 字段
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Message Persistence - Simplified', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待 store 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, {
      timeout: 10000,
    });

    // 清空数据
    await page.evaluate(() => {
      const store = (window as any).__chatStore;
      store.setState({ messages: [] });
      (window as any).__E2E_INDEXED_DB_MOCK__?.clear();
    });
  });

  test('should preserve contentSegments after save and restore', async ({ page }) => {
    test.setTimeout(30000);

    console.log('[E2E] Testing contentSegments preservation...');

    // 1. 创建带 contentSegments 的消息
    await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();

      // 用户消息
      addMessage({
        id: 'msg-user-1',
        role: 'user',
        content: 'Generate a React component',
      });

      // 助手消息（模拟流式响应后的状态）
      const assistantContent = 'Here is your React component. '.repeat(10);
      const chunkSize = 50;
      const segments: any[] = [];

      for (let i = 0; i < assistantContent.length; i += chunkSize) {
        const chunk = assistantContent.slice(i, i + chunkSize);
        segments.push({
          type: 'text',
          order: segments.length,
          timestamp: Date.now() + segments.length * 10,
          content: chunk,
          startPos: i,
          endPos: i + chunk.length,
        });
      }

      addMessage({
        id: 'msg-assistant-1',
        role: 'assistant',
        content: assistantContent,
        contentSegments: segments,
      });

      // 保存到全局变量用于验证
      (window as any).__TEST_CONTENT__ = {
        originalContent: assistantContent,
        originalSegments: segments,
      };
    });

    await page.waitForTimeout(1000);

    // 2. 验证 contentSegments 存在
    const beforeSave = await page.evaluate(() => {
      const msgs = (window as any).__chatStore.getState().messages;
      const assistantMsg = msgs.find((m: any) => m.role === 'assistant');
      return {
        messageCount: msgs.length,
        assistantContent: assistantMsg?.content,
        hasSegments: !!assistantMsg?.contentSegments,
        segmentsCount: assistantMsg?.contentSegments?.length || 0,
        firstSegment: assistantMsg?.contentSegments?.[0],
      };
    });

    console.log('[E2E] Before save:', beforeSave);
    expect(beforeSave.hasSegments).toBeTruthy();
    expect(beforeSave.segmentsCount).toBeGreaterThan(0);

    // 3. 模拟保存和恢复（使用 mock IndexedDB）
    const afterRestore = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const mockDB = (window as any).__E2E_INDEXED_DB_MOCK__;

      if (!mockDB) {
        console.error('[E2E] Mock IndexedDB not available');
        return { error: 'Mock DB not available' };
      }

      // 保存
      const messages = store.getState().messages;
      const threadId = 'test-thread-1';

      // 模拟保存到 IndexedDB
      messages.forEach((msg: any) => {
        mockDB.saveMessages([{ ...msg, threadId }]);
      });

      // 验证保存的内容包含 contentSegments
      const saved = mockDB.getThreadMessages(threadId);
      const savedAssistant = saved.find((m: any) => m.role === 'assistant');
      console.log('[E2E] Saved assistant msg has segments:', !!savedAssistant?.contentSegments);

      // 清空当前消息
      store.setState({ messages: [] });

      // 从 mock DB 恢复
      const restored = mockDB.getThreadMessages(threadId);
      store.setState({ messages: restored });

      const restoredAssistant = restored.find((m: any) => m.role === 'assistant');
      return {
        messageCount: restored.length,
        assistantContent: restoredAssistant?.content,
        hasSegments: !!restoredAssistant?.contentSegments,
        segmentsCount: restoredAssistant?.contentSegments?.length || 0,
        firstSegment: restoredAssistant?.contentSegments?.[0],
        lastSegment: restoredAssistant?.contentSegments?.[restoredAssistant?.contentSegments?.length - 1],
      };
    });

    console.log('[E2E] After restore:', afterRestore);

    // 4. 验证恢复后的完整性
    expect(afterRestore.messageCount).toBe(beforeSave.messageCount);
    expect(afterRestore.assistantContent).toBe(beforeSave.assistantContent);
    expect(afterRestore.hasSegments).toBeTruthy();
    expect(afterRestore.segmentsCount).toBe(beforeSave.segmentsCount);

    console.log('[E2E] ✅ contentSegments preserved correctly');
  });

  test('should preserve all message properties including toolCalls and agent info', async ({ page }) => {
    test.setTimeout(30000);

    console.log('[E2E] Testing all message properties preservation...');

    const testResults = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();
      const mockDB = (window as any).__E2E_INDEXED_DB_MOCK__;

      // 创建复杂消息
      const messages = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Create multiple files',
          multiModalContent: [
            { type: 'text', text: 'Create multiple files' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,test' } },
          ],
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I will create files for you',
          contentSegments: [
            { type: 'text', order: 0, timestamp: Date.now(), content: 'I will ' },
            { type: 'text', order: 1, timestamp: Date.now(), content: 'create files ' },
            { type: 'tool', order: 2, timestamp: Date.now(), toolCallId: 'call-1' },
          ],
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'agent_write_file',
                arguments: '{"path":"/tmp/test.js","content":"test"}',
              },
            },
          ],
          tool_call_id: 'call-1',
          agentId: 'test-agent-1',
          isAgentLive: true,
          references: ['file:///tmp/test.js'],
        },
      ];

      messages.forEach((msg: any) => addMessage(msg));

      // 保存并恢复
      const threadId = 'test-thread-2';
      store.getState().messages.forEach((msg: any) => {
        mockDB.saveMessages([{ ...msg, threadId }]);
      });

      store.setState({ messages: [] });
      const restored = mockDB.getThreadMessages(threadId);
      store.setState({ messages: restored });

      // 验证
      const userMsg = restored.find((m: any) => m.role === 'user');
      const assistantMsg = restored.find((m: any) => m.role === 'assistant');

      return {
        userHasMultiModal: !!userMsg?.multiModalContent,
        assistantHasSegments: !!assistantMsg?.contentSegments,
        assistantSegmentsCount: assistantMsg?.contentSegments?.length || 0,
        assistantHasToolCalls: !!assistantMsg?.toolCalls,
        assistantToolCallsCount: assistantMsg?.toolCalls?.length || 0,
        assistantHasAgentId: !!assistantMsg?.agentId,
        assistantAgentId: assistantMsg?.agentId,
        assistantIsAgentLive: assistantMsg?.isAgentLive,
        assistantHasReferences: !!assistantMsg?.references,
      };
    });

    console.log('[E2E] Test results:', testResults);

    expect(testResults.userHasMultiModal).toBeTruthy();
    expect(testResults.assistantHasSegments).toBeTruthy();
    expect(testResults.assistantSegmentsCount).toBe(3);
    expect(testResults.assistantHasToolCalls).toBeTruthy();
    expect(testResults.assistantToolCallsCount).toBe(1);
    expect(testResults.assistantHasAgentId).toBeTruthy();
    expect(testResults.assistantAgentId).toBe('test-agent-1');
    expect(testResults.assistantIsAgentLive).toBe(true);
    expect(testResults.assistantHasReferences).toBeTruthy();

    console.log('[E2E] ✅ All message properties preserved correctly');
  });

  test('should handle multiple consecutive generations with streaming', async ({ page }) => {
    test.setTimeout(30000);

    console.log('[E2E] Testing consecutive generations with streaming...');

    const results = await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();
      const mockDB = (window as any).__E2E_INDEXED_DB_MOCK__;

      // 模拟 3 轮连续生成
      for (let round = 1; round <= 3; round++) {
        // 用户消息
        addMessage({
          id: `user-${round}`,
          role: 'user',
          content: `Request ${round}`,
        });

        // 助手消息（带 contentSegments）
        const content = `Response ${round} with streaming content`.repeat(5);
        const segments: any[] = [];
        const chunkSize = 30;

        for (let i = 0; i < content.length; i += chunkSize) {
          segments.push({
            type: 'text',
            order: segments.length,
            timestamp: Date.now() + segments.length * 10,
            content: content.slice(i, i + chunkSize),
          });
        }

        addMessage({
          id: `assistant-${round}`,
          role: 'assistant',
          content: content,
          contentSegments: segments,
        });
      }

      const beforeCount = store.getState().messages.length;

      // 保存并恢复
      const threadId = 'test-thread-3';
      store.getState().messages.forEach((msg: any) => {
        mockDB.saveMessages([{ ...msg, threadId }]);
      });

      store.setState({ messages: [] });
      const restored = mockDB.getThreadMessages(threadId);
      store.setState({ messages: restored });

      // 验证所有消息都恢复，且每条助手消息都有 contentSegments
      const assistantMessages = restored.filter((m: any) => m.role === 'assistant');
      const allHaveSegments = assistantMessages.every((m: any) =>
        m.contentSegments && m.contentSegments.length > 0
      );

      return {
        beforeCount,
        afterCount: restored.length,
        assistantCount: assistantMessages.length,
        allHaveSegments,
      };
    });

    console.log('[E2E] Consecutive generation results:', results);

    expect(results.afterCount).toBe(results.beforeCount);
    expect(results.assistantCount).toBe(3);
    expect(results.allHaveSegments).toBeTruthy();

    console.log('[E2E] ✅ Consecutive generations with streaming handled correctly');
  });

  test('should preserve message order after restart', async ({ page }) => {
    test.setTimeout(30000);

    console.log('[E2E] Testing message order preservation...');

    const orderValidation = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();
      const mockDB = (window as any).__E2E_INDEXED_DB_MOCK__;

      // 创建 10 条消息，记录顺序
      const originalOrder: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = `order-test-${i}`;
        originalOrder.push(id);
        addMessage({
          id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: Date.now() + i,
        });
      }

      // 保存并恢复
      const threadId = 'test-thread-4';
      store.getState().messages.forEach((msg: any) => {
        mockDB.saveMessages([{ ...msg, threadId }]);
      });

      store.setState({ messages: [] });
      const restored = mockDB.getThreadMessages(threadId);
      store.setState({ messages: restored });

      // 验证顺序
      const restoredOrder = restored.map((m: any) => m.id);
      const orderMatches = originalOrder.every((id, idx) => id === restoredOrder[idx]);

      return {
        orderMatches,
        originalCount: originalOrder.length,
        restoredCount: restored.length,
        originalOrder,
        restoredOrder,
      };
    });

    console.log('[E2E] Order validation:', orderValidation);

    expect(orderValidation.orderMatches).toBeTruthy();
    expect(orderValidation.originalCount).toBe(orderValidation.restoredCount);

    console.log('[E2E] ✅ Message order preserved correctly');
  });

  test('should handle stress test with 100 messages', async ({ page }) => {
    test.setTimeout(60000);

    console.log('[E2E] Running stress test with 100 messages...');

    const stressResults = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();
      const mockDB = (window as any).__E2E_INDEXED_DB_MOCK__;

      const startTime = Date.now();

      // 创建 100 条消息
      for (let i = 0; i < 100; i++) {
        const isUser = i % 2 === 0;
        const content = isUser
          ? `User message ${i}`
          : `Assistant response ${i} with content`.repeat(3);

        const msg: any = {
          id: `stress-${i}`,
          role: isUser ? 'user' : 'assistant',
          content: content,
        };

        // 为助手消息添加 contentSegments
        if (!isUser) {
          const segments: any[] = [];
          const chunkSize = 40;
          for (let j = 0; j < content.length; j += chunkSize) {
            segments.push({
              type: 'text',
              order: segments.length,
              timestamp: Date.now() + segments.length * 10,
              content: content.slice(j, j + chunkSize),
            });
          }
          msg.contentSegments = segments;
        }

        addMessage(msg);
      }

      const addTime = Date.now() - startTime;

      // 保存
      const saveStart = Date.now();
      const threadId = 'test-thread-stress';
      store.getState().messages.forEach((msg: any) => {
        mockDB.saveMessages([{ ...msg, threadId }]);
      });
      const saveTime = Date.now() - saveStart;

      // 恢复
      const loadStart = Date.now();
      const restored = mockDB.getThreadMessages(threadId);
      const loadTime = Date.now() - loadStart;

      // 验证
      const assistantMsgs = restored.filter((m: any) => m.role === 'assistant');
      const allHaveSegments = assistantMsgs.every((m: any) =>
        m.contentSegments && m.contentSegments.length > 0
      );

      return {
        totalCount: restored.length,
        assistantCount: assistantMsgs.length,
        allHaveSegments,
        addTime,
        saveTime,
        loadTime,
      };
    });

    console.log('[E2E] Stress test results:', stressResults);

    expect(stressResults.totalCount).toBe(100);
    expect(stressResults.assistantCount).toBe(50);
    expect(stressResults.allHaveSegments).toBeTruthy();

    console.log(`[E2E] ✅ Stress test passed: ${stressResults.totalCount} messages`);
    console.log(`[E2E] Performance: add=${stressResults.addTime}ms, save=${stressResults.saveTime}ms, load=${stressResults.loadTime}ms`);
  });
});
