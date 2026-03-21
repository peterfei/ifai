/**
 * E2E 测试：线程消息隔离验证
 *
 * 场景：验证每个线程的消息是独立的，切换线程时正确加载该线程的消息
 * 这是修复 "每个tab消息都一样" bug 的验证测试
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Thread Message Isolation - Fix Verification', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 等待 store 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, {
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
  });

  test('should maintain separate messages per thread', async ({ page }) => {
    console.log('[E2E] 测试1: 验证每个线程的消息是独立的');

    const result = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore.getState();
      const chatStore = (window as any).__chatStore.getState();
      const switchThread = (window as any).__switchThread;

      if (!switchThread) {
        return { error: '__switchThread not available' };
      }

      console.log('[E2E] 创建三个线程...');

      // 创建三个线程
      const thread1Id = threadStore.createThread({ title: 'Thread-1' });
      const thread2Id = threadStore.createThread({ title: 'Thread-2' });
      const thread3Id = threadStore.createThread({ title: 'Thread-3' });

      console.log('[E2E] 线程ID:', { thread1Id, thread2Id, thread3Id });

      // 为 Thread 1 添加消息
      threadStore.switchThread(thread1Id);
      await new Promise(resolve => setTimeout(resolve, 100));
      chatStore.addMessage({
        id: 'msg-1-1',
        role: 'user',
        content: 'Thread 1: User message 1',
        timestamp: Date.now(),
      });
      chatStore.addMessage({
        id: 'msg-1-2',
        role: 'assistant',
        content: 'Thread 1: Assistant response 1',
        timestamp: Date.now() + 1,
      });

      // 等待自动保存完成（AUTO_SAVE_DELAY = 1000ms + 100ms buffer）
      await new Promise(resolve => setTimeout(resolve, 1200));

      // 为 Thread 2 添加消息
      threadStore.switchThread(thread2Id);
      await new Promise(resolve => setTimeout(resolve, 100));
      chatStore.addMessage({
        id: 'msg-2-1',
        role: 'user',
        content: 'Thread 2: User message 1',
        timestamp: Date.now() + 2,
      });
      chatStore.addMessage({
        id: 'msg-2-2',
        role: 'assistant',
        content: 'Thread 2: Assistant response 1',
        timestamp: Date.now() + 3,
      });
      chatStore.addMessage({
        id: 'msg-2-3',
        role: 'user',
        content: 'Thread 2: User message 2',
        timestamp: Date.now() + 4,
      });

      await new Promise(resolve => setTimeout(resolve, 1200));

      // 为 Thread 3 添加消息
      threadStore.switchThread(thread3Id);
      await new Promise(resolve => setTimeout(resolve, 100));
      chatStore.addMessage({
        id: 'msg-3-1',
        role: 'user',
        content: 'Thread 3: User message 1',
        timestamp: Date.now() + 5,
      });

      await new Promise(resolve => setTimeout(resolve, 1200));

      // 验证：切换到 Thread 1 应该只看到 Thread 1 的消息
      console.log('[E2E] 切换到 Thread 1 验证...');
      await switchThread(thread1Id);
      await new Promise(resolve => setTimeout(resolve, 300));
      const thread1Messages = (window as any).__chatStore.getState().messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content?.substring(0, 30)
      }));

      // 切换到 Thread 2 应该只看到 Thread 2 的消息
      console.log('[E2E] 切换到 Thread 2 验证...');
      await switchThread(thread2Id);
      await new Promise(resolve => setTimeout(resolve, 300));
      const thread2Messages = (window as any).__chatStore.getState().messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content?.substring(0, 30)
      }));

      // 切换到 Thread 3 应该只看到 Thread 3 的消息
      console.log('[E2E] 切换到 Thread 3 验证...');
      await switchThread(thread3Id);
      await new Promise(resolve => setTimeout(resolve, 300));
      const thread3Messages = (window as any).__chatStore.getState().messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content?.substring(0, 30)
      }));

      return {
        thread1: { id: thread1Id, messages: thread1Messages },
        thread2: { id: thread2Id, messages: thread2Messages },
        thread3: { id: thread3Id, messages: thread3Messages },
      };
    });

    console.log('[E2E] 测试结果:', JSON.stringify(result, null, 2));

    if (result.error) {
      console.log('[E2E] ❌ 测试跳过:', result.error);
      test.skip(true, result.error);
      return;
    }

    // 验证 Thread 1 的消息
    expect(result.thread1.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.thread1.messages[0].content).toBe('Thread 1: User message 1');
    expect(result.thread1.messages[1].content).toBe('Thread 1: Assistant response 1');

    // 验证 Thread 2 的消息
    expect(result.thread2.messages.length).toBeGreaterThanOrEqual(3);
    expect(result.thread2.messages[0].content).toBe('Thread 2: User message 1');
    expect(result.thread2.messages[1].content).toBe('Thread 2: Assistant response 1');
    expect(result.thread2.messages[2].content).toBe('Thread 2: User message 2');

    // 验证 Thread 3 的消息
    expect(result.thread3.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.thread3.messages[0].content).toBe('Thread 3: User message 1');

    console.log('[E2E] ✅ 测试通过: 每个线程的消息是独立的');
  });

  test('should load correct messages when switching threads', async ({ page }) => {
    console.log('[E2E] 测试2: 验证切换线程时加载正确的消息');

    const result = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore.getState();
      const chatStore = (window as any).__chatStore.getState();
      const switchThread = (window as any).__switchThread;

      if (!switchThread) {
        return { error: '__switchThread not available' };
      }

      console.log('[E2E] 设置测试数据...');

      // 创建两个线程
      const threadA = threadStore.createThread({ title: 'Thread-A' });
      const threadB = threadStore.createThread({ title: 'Thread-B' });

      // 在 Thread A 中添加消息
      threadStore.switchThread(threadA);
      await new Promise(resolve => setTimeout(resolve, 50));
      for (let i = 0; i < 5; i++) {
        chatStore.addMessage({
          id: `thread-a-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Thread A message ${i}`,
          timestamp: Date.now() + i,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1200));

      // 在 Thread B 中添加消息
      threadStore.switchThread(threadB);
      await new Promise(resolve => setTimeout(resolve, 50));
      for (let i = 0; i < 3; i++) {
        chatStore.addMessage({
          id: `thread-b-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Thread B message ${i}`,
          timestamp: Date.now() + i + 100,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1200));

      console.log('[E2E] 测试线程切换...');

      // 切换 A -> B -> A -> B，验证每次切换都加载正确的消息
      const results: any = {};

      // 切换到 Thread B
      await switchThread(threadB);
      await new Promise(resolve => setTimeout(resolve, 300));
      const messagesB1 = (window as any).__chatStore.getState().messages;
      results.switchToB = {
        messageCount: messagesB1.length,
        firstMessageId: messagesB1[0]?.id,
        lastMessageId: messagesB1[messagesB1.length - 1]?.id,
      };

      // 切换到 Thread A
      await switchThread(threadA);
      await new Promise(resolve => setTimeout(resolve, 300));
      const messagesA = (window as any).__chatStore.getState().messages;
      results.switchToA = {
        messageCount: messagesA.length,
        firstMessageId: messagesA[0]?.id,
        lastMessageId: messagesA[messagesA.length - 1]?.id,
      };

      // 再次切换到 Thread B
      await switchThread(threadB);
      await new Promise(resolve => setTimeout(resolve, 300));
      const messagesB2 = (window as any).__chatStore.getState().messages;
      results.switchToBAgain = {
        messageCount: messagesB2.length,
        firstMessageId: messagesB2[0]?.id,
        lastMessageId: messagesB2[messagesB2.length - 1]?.id,
      };

      return results;
    });

    console.log('[E2E] 切换测试结果:', JSON.stringify(result, null, 2));

    if (result.error) {
      console.log('[E2E] ❌ 测试跳过:', result.error);
      test.skip(true, result.error);
      return;
    }

    // 验证切换到 Thread B
    expect(result.switchToB.messageCount).toBe(3);
    expect(result.switchToB.firstMessageId).toBe('thread-b-0');
    expect(result.switchToB.lastMessageId).toBe('thread-b-2');

    // 验证切换到 Thread A
    expect(result.switchToA.messageCount).toBe(5);
    expect(result.switchToA.firstMessageId).toBe('thread-a-0');
    expect(result.switchToA.lastMessageId).toBe('thread-a-4');

    // 验证再次切换到 Thread B（应该和第一次一样）
    expect(result.switchToBAgain.messageCount).toBe(3);
    expect(result.switchToBAgain.firstMessageId).toBe('thread-b-0');
    expect(result.switchToBAgain.lastMessageId).toBe('thread-b-2');

    console.log('[E2E] ✅ 测试通过: 线程切换时加载正确的消息');
  });

  test('should preserve thread isolation after page reload', async ({ page }) => {
    console.log('[E2E] 测试3: 验证页面刷新后线程消息仍然隔离');

    const setupResult = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore.getState();
      const chatStore = (window as any).__chatStore.getState();
      const switchThread = (window as any).__switchThread;

      if (!switchThread) {
        return { error: '__switchThread not available' };
      }

      // 创建两个线程并添加不同的消息
      const thread1Id = threadStore.createThread({ title: 'Reload-Test-1' });
      const thread2Id = threadStore.createThread({ title: 'Reload-Test-2' });

      // Thread 1
      threadStore.switchThread(thread1Id);
      await new Promise(resolve => setTimeout(resolve, 50));
      chatStore.addMessage({
        id: 'reload-1-1',
        role: 'user',
        content: 'Before reload - Thread 1',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 1200));

      // Thread 2
      threadStore.switchThread(thread2Id);
      await new Promise(resolve => setTimeout(resolve, 50));
      chatStore.addMessage({
        id: 'reload-2-1',
        role: 'user',
        content: 'Before reload - Thread 2',
        timestamp: Date.now() + 1,
      });

      await new Promise(resolve => setTimeout(resolve, 1200));

      return { thread1Id, thread2Id };
    });

    if (setupResult.error) {
      console.log('[E2E] ❌ 测试跳过:', setupResult.error);
      test.skip(true, setupResult.error);
      return;
    }

    // 刷新页面
    await page.reload();
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, {
      timeout: 15000,
    });
    await page.waitForTimeout(3000); // 等待持久化恢复完成

    const verifyResult = await page.evaluate(async (threadIds) => {
      const switchThread = (window as any).__switchThread;

      if (!switchThread) {
        return { error: '__switchThread not available after reload' };
      }

      const results: any = {};

      // 切换到 Thread 1 验证
      await switchThread(threadIds.thread1Id);
      await new Promise(resolve => setTimeout(resolve, 300));
      const messages1 = (window as any).__chatStore.getState().messages;
      results.thread1 = {
        messageCount: messages1.length,
        messages: messages1.map((m: any) => ({
          id: m.id,
          content: m.content?.substring(0, 50)
        }))
      };

      // 切换到 Thread 2 验证
      await switchThread(threadIds.thread2Id);
      await new Promise(resolve => setTimeout(resolve, 300));
      const messages2 = (window as any).__chatStore.getState().messages;
      results.thread2 = {
        messageCount: messages2.length,
        messages: messages2.map((m: any) => ({
          id: m.id,
          content: m.content?.substring(0, 50)
        }))
      };

      return results;
    }, setupResult);

    console.log('[E2E] 刷新后验证结果:', JSON.stringify(verifyResult, null, 2));

    if (verifyResult.error) {
      console.log('[E2E] ❌ 测试跳过:', verifyResult.error);
      test.skip(true, verifyResult.error);
      return;
    }

    // 验证 Thread 1 的消息
    expect(verifyResult.thread1.messageCount).toBeGreaterThan(0);
    const thread1HasCorrectMessage = verifyResult.thread1.messages.some(
      (m: any) => m.content?.includes('Before reload - Thread 1')
    );
    expect(thread1HasCorrectMessage).toBe(true);

    // 验证 Thread 2 的消息
    expect(verifyResult.thread2.messageCount).toBeGreaterThan(0);
    const thread2HasCorrectMessage = verifyResult.thread2.messages.some(
      (m: any) => m.content?.includes('Before reload - Thread 2')
    );
    expect(thread2HasCorrectMessage).toBe(true);

    // 验证两个线程的消息是不同的
    const thread1Contents = verifyResult.thread1.messages.map((m: any) => m.content).join(',');
    const thread2Contents = verifyResult.thread2.messages.map((m: any) => m.content).join(',');
    expect(thread1Contents).not.toBe(thread2Contents);

    console.log('[E2E] ✅ 测试通过: 页面刷新后线程消息仍然隔离');
  });
});
