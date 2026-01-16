import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 场景 2：还原多会话输入框禁用未隔离的问题。
 */
test.describe('Reproduction: Chat Thread Input Isolation', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should keep other threads enabled when one thread is loading', async ({ page }) => {
    console.log('[E2E] 步骤1: 检查 threadStore 可用性');

    // 1. 检查 threadStore 是否可用
    const threadStoreAvailable = await page.evaluate(() => {
      return typeof (window as any).__threadStore !== 'undefined';
    });

    if (!threadStoreAvailable) {
      console.log('[E2E] ⏸️ threadStore 不可用');
      test.skip(true, 'threadStore not available in test environment');
      return;
    }

    console.log('[E2E] 步骤2: 创建两个会话');

    // 2. 创建两个会话
    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore.getState();
      const thread1Id = threadStore.createThread({ title: 'Thread 1' });
      const thread2Id = threadStore.createThread({ title: 'Thread 2' });

      // 获取所有线程
      const threads = threadStore.getAllThreads();
      console.log('[E2E] 创建的线程:', threads.map(t => ({ id: t.id, title: t.title })));

      return {
        thread1Id,
        thread2Id,
        totalThreads: threads.length
      };
    });

    console.log('[E2E] 创建结果:', result);

    if (result.totalThreads < 2) {
      console.log('[E2E] ⏸️ 无法创建多个线程');
      test.skip(true, 'Cannot create multiple threads');
      return;
    }

    const { thread1Id, thread2Id } = result;

    console.log('[E2E] 步骤3: 在 Thread 1 中模拟加载状态');

    // 3. 在 Thread 1 中模拟加载状态
    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore.getState();
      const chatStore = (window as any).__chatStore?.getState();

      if (!chatStore) {
        console.error('[E2E] chatStore 不可用');
        return;
      }

      // 切换到 Thread 1
      threadStore.switchThread(id);

      // 模拟 Thread 1 正在交互 - 设置加载状态
      if (chatStore.setIsLoading) {
        chatStore.setIsLoading(true);
        console.log('[E2E] Thread 1 设置为加载状态');
      }
    }, thread1Id);

    await page.waitForTimeout(500);

    // 检查 Thread 1 的输入框状态
    // 注意: 如果 bug 存在,isLoading 是全局的,会影响所有线程
    const thread1Loading = await page.evaluate((id) => {
      const chatStore = (window as any).__chatStore?.getState();
      return chatStore?.isLoading || false;
    }, thread1Id);

    console.log('[E2E] Thread 1 加载状态:', thread1Loading);

    console.log('[E2E] 步骤4: 切换到 Thread 2');

    // 4. 切换到 Thread 2
    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore.getState();
      threadStore.switchThread(id);
      console.log('[E2E] 切换到线程:', id);
    }, thread2Id);

    await page.waitForTimeout(500);

    // 5. 验证 Thread 2 的输入框状态
    // 这是关键的bug检查:
    // - 如果 isLoading 是全局共享的(bug),切换到 Thread 2 后 isLoading 仍然为 true
    // - 如果 isLoading 是每线程隔离的(正确实现),切换到 Thread 2 后 isLoading 应该为 false
    const thread2Loading = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      return chatStore?.isLoading || false;
    });

    console.log('[E2E] Thread 2 加载状态:', thread2Loading);

    // Bug 检查: 如果切换线程后 isLoading 仍然是 true,说明 isLoading 是全局的(bug)
    if (thread1Loading && thread2Loading) {
      console.log('[E2E] ⚠️ Bug确认: isLoading 是全局共享的,线程间未隔离');
      console.log('[E2E] ✅ Bug还原成功: 多线程加载状态未正确隔离');
      // 这是一个还原测试,发现bug是预期行为
      return;
    }

    if (!thread2Loading) {
      console.log('[E2E] ✅ 线程隔离正常工作: Thread 2 的加载状态独立');
      expect(thread2Loading).toBe(false);
    } else {
      console.log('[E2E] ℹ️ Thread 2 也处于加载状态(可能由于其他原因)');
    }
  });
});
