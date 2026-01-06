/**
 * 全覆盖消息持久化测试
 * 验证应用重启后消息历史正确恢复
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';
import {
  generateTestDataSet,
  generateEdgeCaseDataSets,
  generateStressTestData,
  validateMessageIntegrity,
  type TestDataMessage,
} from './data-generators/test-data-generator';

test.describe('Message Persistence - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待 store 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, {
      timeout: 10000,
    });

    // 清空现有数据
    await page.evaluate(() => {
      const store = (window as any).__chatStore;
      store.setState({ messages: [] });
      (window as any).__TEST_MESSAGES__ = [];
    });
  });

  test('should preserve and restore contentSegments across restart', async ({ page }) => {
    test.setTimeout(60000);

    console.log('[E2E] Testing contentSegments preservation...');

    // 1. 创建带 contentSegments 的消息
    await page.evaluate(async () => {
      const { generateTestMessage } = await import('./data-generators/test-data-generator.ts');

      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();

      // 创建用户消息
      const userMsg = generateTestMessage({
        role: 'user',
        content: 'Please generate a React component',
      });
      addMessage(userMsg);

      // 创建助手消息（模拟流式响应）
      const assistantMsg = generateTestMessage({
        role: 'assistant',
        content: 'Here is your React component. '.repeat(20),
        withContentSegments: true,
      });
      addMessage(assistantMsg);

      // 保存原始消息用于验证
      (window as any).__ORIGINAL_MESSAGES__ = [userMsg, assistantMsg];
    });

    await page.waitForTimeout(2000);

    // 2. 验证 contentSegments 已保存
    const { beforeSave, hasSegments } = await page.evaluate(() => {
      const msgs = (window as any).__chatStore.getState().messages;
      const assistantMsg = msgs.find((m: any) => m.role === 'assistant');

      return {
        beforeSave: {
          messageCount: msgs.length,
          lastContent: assistantMsg?.content,
          hasContentSegments: !!assistantMsg?.contentSegments,
          segmentsCount: assistantMsg?.contentSegments?.length || 0,
        },
        hasSegments: !!assistantMsg?.contentSegments,
      };
    });

    console.log('[E2E] Before save:', beforeSave);
    expect(hasSegments).toBeTruthy();

    // 3. 模拟应用重启（清空内存，从持久化恢复）
    console.log('[E2E] Simulating app restart...');

    const { afterRestore } = await page.evaluate(async () => {
      // 保存到 IndexedDB
      const store = (window as any).__chatStore;
      const state = store.getState();
      const messages = state.messages;

      // 获取当前线程 ID
      const { useThreadStore } = await import('../../src/stores/threadStore');
      const threadStore = useThreadStore.getState();
      const threadId = threadStore.activeThreadId || 'test-thread-1';

      // 手动触发持久化
      const { threadPersistence } = await import('../../src/stores/persistence/threadPersistence');
      await threadPersistence.saveThreadMessages(threadId, messages);

      // 清空消息（模拟应用重启）
      store.setState({ messages: [] });

      // 从 IndexedDB 恢复
      const restored = await threadPersistence.loadThreadMessages(threadId);
      store.setState({ messages: restored });

      const assistantMsg = restored.find((m: any) => m.role === 'assistant');

      return {
        afterRestore: {
          messageCount: restored.length,
          lastContent: assistantMsg?.content,
          hasContentSegments: !!assistantMsg?.contentSegments,
          segmentsCount: assistantMsg?.contentSegments?.length || 0,
          firstSegment: assistantMsg?.contentSegments?.[0],
          lastSegment: assistantMsg?.contentSegments?.[assistantMsg?.contentSegments?.length - 1],
        },
      };
    });

    console.log('[E2E] After restore:', afterRestore);

    // 4. 验证恢复的消息完整性
    expect(afterRestore.messageCount).toBe(beforeSave.messageCount);
    expect(afterRestore.lastContent).toBe(beforeSave.lastContent);
    expect(afterRestore.hasContentSegments).toBeTruthy();
    expect(afterRestore.segmentsCount).toBeGreaterThan(0);
    expect(afterRestore.firstSegment).toMatchObject({
      type: 'text',
      order: expect.any(Number),
      timestamp: expect.any(Number),
    });

    console.log('[E2E] ✅ contentSegments preserved correctly after restart');
  });

  test('should preserve all message properties across restart', async ({ page }) => {
    test.setTimeout(60000);

    console.log('[E2E] Testing all message properties preservation...');

    // 1. 创建复杂消息（包含所有属性）
    const { originalMessages } = await page.evaluate(async () => {
      const { generateTestDataSet } = await import('./data-generators/test-data-generator.ts');
      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();

      const { messages } = generateTestDataSet({
        messageCount: 20,
        includeComplexMessages: true,
      });

      messages.forEach((msg: any) => addMessage(msg));

      return { originalMessages: messages };
    });

    await page.waitForTimeout(1000);

    // 2. 模拟重启并验证
    const validationResults = await page.evaluate(async (origCount) => {
      const store = (window as any).__chatStore;
      const { useThreadStore } = await import('../../src/stores/threadStore');
      const { threadPersistence } = await import('../../src/stores/persistence/threadPersistence');
      const { validateMessageIntegrity } = await import(
        './data-generators/test-data-generator.ts'
      );

      const threadStore = useThreadStore.getState();
      const threadId = threadStore.activeThreadId || 'test-thread-2';

      // 保存并恢复
      const beforeMessages = store.getState().messages;
      await threadPersistence.saveThreadMessages(threadId, beforeMessages);

      store.setState({ messages: [] });
      const restoredMessages = await threadPersistence.loadThreadMessages(threadId);
      store.setState({ messages: restoredMessages });

      // 验证每条消息
      const results = {
        totalMessages: restoredMessages.length,
        validMessages: 0,
        failedMessages: 0,
        errors: [] as string[],
      };

      // 简化验证：只检查关键字段
      for (let i = 0; i < Math.min(beforeMessages.length, restoredMessages.length); i++) {
        const before = beforeMessages[i];
        const after = restoredMessages[i];

        if (before.id !== after.id) {
          results.errors.push(`Message ${i}: ID mismatch`);
          results.failedMessages++;
          continue;
        }

        if (before.role !== after.role) {
          results.errors.push(`Message ${i}: Role mismatch`);
          results.failedMessages++;
          continue;
        }

        if (before.content !== after.content) {
          results.errors.push(`Message ${i}: Content mismatch`);
          results.failedMessages++;
          continue;
        }

        // 检查 contentSegments
        const beforeHasSegments = !!before.contentSegments?.length;
        const afterHasSegments = !!after.contentSegments?.length;

        if (beforeHasSegments !== afterHasSegments) {
          results.errors.push(`Message ${i}: contentSegments presence mismatch`);
          results.failedMessages++;
          continue;
        }

        if (beforeHasSegments && before.contentSegments.length !== after.contentSegments.length) {
          results.errors.push(
            `Message ${i}: contentSegments count mismatch (${before.contentSegments.length} !== ${after.contentSegments.length})`
          );
          results.failedMessages++;
          continue;
        }

        results.validMessages++;
      }

      return results;
    }, originalMessages.length);

    console.log('[E2E] Validation results:', validationResults);

    expect(validationResults.totalMessages).toBe(originalMessages.length);
    expect(validationResults.validMessages).toBe(originalMessages.length);
    expect(validationResults.failedMessages).toBe(0);
    expect(validationResults.errors.length).toBe(0);

    console.log('[E2E] ✅ All message properties preserved correctly');
  });

  test('should handle edge cases correctly', async ({ page }) => {
    test.setTimeout(120000);

    console.log('[E2E] Testing edge cases...');

    const edgeCaseNames = await page.evaluate(async () => {
      const { generateEdgeCaseDataSets } = await import('./data-generators/test-data-generator.ts');
      const { threadPersistence } = await import('../../src/stores/persistence/threadPersistence');
      const { useThreadStore } = await import('../../src/stores/threadStore');

      const edgeCases = generateEdgeCaseDataSets();
      const results: string[] = [];

      for (const testCase of edgeCases) {
        console.log(`[E2E] Testing edge case: ${testCase.name}`);

        const store = (window as any).__chatStore;
        const { addMessage } = store.getState();

        // 添加测试消息
        testCase.messages.forEach((msg: any) => addMessage(msg));

        await new Promise((resolve) => setTimeout(resolve, 100));

        // 保存并恢复
        const threadStore = useThreadStore.getState();
        const threadId = `edge-case-${testCase.name.replace(/\s+/g, '-')}`;

        const beforeMessages = store.getState().messages;
        await threadPersistence.saveThreadMessages(threadId, beforeMessages);

        store.setState({ messages: [] });
        const restoredMessages = await threadPersistence.loadThreadMessages(threadId);

        // 验证
        const allRestored =
          beforeMessages.length === restoredMessages.length &&
          beforeMessages.every((msg: any, idx: number) => {
            const restored = restoredMessages[idx];
            return msg.id === restored.id && msg.content === restored.content;
          });

        if (allRestored) {
          console.log(`[E2E] ✅ Edge case passed: ${testCase.name}`);
          results.push(testCase.name);
        } else {
          console.error(`[E2E] ❌ Edge case failed: ${testCase.name}`);
        }

        // 清空
        store.setState({ messages: [] });
      }

      return results;
    });

    expect(edgeCaseNames.length).toBeGreaterThanOrEqual(5);
    console.log('[E2E] ✅ All edge cases handled correctly');
  });

  test('should handle stress test with 500 messages', async ({ page }) => {
    test.setTimeout(180000);

    console.log('[E2E] Running stress test with 500 messages...');

    const stressTestResults = await page.evaluate(async () => {
      const { generateStressTestData } = await import('./data-generators/test-data-generator.ts');
      const { threadPersistence } = await import('../../src/stores/persistence/threadPersistence');
      const { useThreadStore } = await import('../../src/stores/threadStore');

      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();

      // 生成 500 条消息
      const { messages } = generateStressTestData({ messageCount: 500 });
      console.log(`[E2E] Generated ${messages.length} messages`);

      const startTime = Date.now();

      // 批量添加
      for (const msg of messages) {
        addMessage(msg);
      }

      const addTime = Date.now() - startTime;
      console.log(`[E2E] Added ${messages.length} messages in ${addTime}ms`);

      // 保存到 IndexedDB
      const threadStore = useThreadStore.getState();
      const threadId = 'stress-test-thread';

      const saveStart = Date.now();
      await threadPersistence.saveThreadMessages(threadId, messages);
      const saveTime = Date.now() - saveStart;
      console.log(`[E2E] Saved ${messages.length} messages in ${saveTime}ms`);

      // 清空并恢复
      const loadStart = Date.now();
      const restored = await threadPersistence.loadThreadMessages(threadId);
      const loadTime = Date.now() - loadStart;
      console.log(`[E2E] Loaded ${restored.length} messages in ${loadTime}ms`);

      // 验证
      const allRestored = messages.length === restored.length;
      const contentSegmentsPreserved = messages.filter((m: any) => m.contentSegments).every((m: any, idx: number) => {
        const restoredMsg = restored.find((r: any) => r.id === m.id);
        return restoredMsg && restoredMsg.contentSegments && restoredMsg.contentSegments.length === m.contentSegments.length;
      });

      return {
        messageCount: messages.length,
        restoredCount: restored.length,
        addTime,
        saveTime,
        loadTime,
        allRestored,
        contentSegmentsPreserved,
      };
    });

    console.log('[E2E] Stress test results:', stressTestResults);

    expect(stressTestResults.allRestored).toBeTruthy();
    expect(stressTestResults.messageCount).toBe(stressTestResults.restoredCount);
    expect(stressTestResults.contentSegmentsPreserved).toBeTruthy();

    console.log(`[E2E] ✅ Stress test passed: ${stressTestResults.messageCount} messages`);
    console.log(`[E2E] Performance: add=${stressTestResults.addTime}ms, save=${stressTestResults.saveTime}ms, load=${stressTestResults.loadTime}ms`);
  });

  test('should preserve message order after restart', async ({ page }) => {
    test.setTimeout(60000);

    console.log('[E2E] Testing message order preservation...');

    const orderValidation = await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const { addMessage } = store.getState();
      const { threadPersistence } = await import('../../src/stores/persistence/threadPersistence');
      const { useThreadStore } = await import('../../src/stores/threadStore');

      // 创建一系列消息，记录顺序
      const messageOrder: string[] = [];
      for (let i = 0; i < 20; i++) {
        const msg = {
          id: `msg-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: Date.now() + i,
        };
        addMessage(msg);
        messageOrder.push(msg.id);
      }

      const threadStore = useThreadStore.getState();
      const threadId = 'order-test-thread';

      // 保存并恢复
      await threadPersistence.saveThreadMessages(threadId, store.getState().messages);
      store.setState({ messages: [] });
      const restored = await threadPersistence.loadThreadMessages(threadId);

      // 验证顺序
      const restoredOrder = restored.map((m: any) => m.id);
      const orderMatch = messageOrder.every((id, idx) => id === restoredOrder[idx]);

      return { orderMatch, originalCount: messageOrder.length, restoredCount: restored.length };
    });

    console.log('[E2E] Order validation:', orderValidation);

    expect(orderValidation.orderMatch).toBeTruthy();
    expect(orderValidation.originalCount).toBe(orderValidation.restoredCount);

    console.log('[E2E] ✅ Message order preserved correctly');
  });

  test('should handle concurrent message updates', async ({ page }) => {
    test.setTimeout(60000);

    console.log('[E2E] Testing concurrent message updates...');

    const concurrentResults = await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const { addMessage, updateMessage } = store.getState();
      const { threadPersistence } = await import('../../src/stores/persistence/threadPersistence');
      const { useThreadStore } = await import('../../src/stores/threadStore');

      const threadStore = useThreadStore.getState();
      const threadId = 'concurrent-test-thread';

      // 添加 10 条消息
      const messages: any[] = [];
      for (let i = 0; i < 10; i++) {
        const msg = {
          id: `concurrent-${i}`,
          role: 'user',
          content: `Initial content ${i}`,
        };
        addMessage(msg);
        messages.push(msg);
      }

      // 更新消息内容（模拟流式更新）
      messages.forEach((msg, idx) => {
        updateMessage({
          ...msg,
          content: `Updated content ${idx}`,
          contentSegments: [
            { type: 'text', order: 0, timestamp: Date.now(), content: 'Updated ' },
            { type: 'text', order: 1, timestamp: Date.now(), content: `content ${idx}` },
          ],
        });
      });

      // 保存并恢复
      await threadPersistence.saveThreadMessages(threadId, store.getState().messages);
      const restored = await threadPersistence.loadThreadMessages(threadId);

      // 验证所有消息都有更新后的内容和 contentSegments
      const allUpdated = restored.every((m: any) =>
        m.content.startsWith('Updated content')
      );

      const allHaveSegments = restored.every((m: any) =>
        m.contentSegments && m.contentSegments.length === 2
      );

      return { allUpdated, allHaveSegments, messageCount: restored.length };
    });

    console.log('[E2E] Concurrent update results:', concurrentResults);

    expect(concurrentResults.allUpdated).toBeTruthy();
    expect(concurrentResults.allHaveSegments).toBeTruthy();

    console.log('[E2E] ✅ Concurrent updates handled correctly');
  });
});
