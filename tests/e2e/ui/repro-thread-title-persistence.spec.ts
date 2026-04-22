/**
 * E2E 测试：持久化恢复后的标题自动更新
 *
 * 测试目标：模拟用户重新打开应用（数据从持久化恢复）
 * 这是用户报告问题最可能出现的场景
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Thread: Title Auto-Update After Persistence Restore', () => {

  test('should update title when sending message after persistence restore', async ({ page, context }) => {
    console.log('[DEBUG] ========== 测试：持久化恢复后发送消息 ==========');

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 等待 stores 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 步骤1：创建一个线程并发送消息（模拟用户第一次使用）
    console.log('[DEBUG] ===== 步骤1：创建线程并发送消息 =====');

    const step1Result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      // 清空并创建线程
      threadStore.getState().reset();
      await new Promise(resolve => setTimeout(resolve, 100));
      const threadId = threadStore.getState().createThread();

      const initialTitle = threadStore.getState().threads[threadId].title;
      console.log('[Test] 创建线程，初始标题:', initialTitle);

      // 发送消息
      const testMessage = '如何实现快速排序算法';
      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;

      await chatStore.getState().sendMessage(testMessage, providerId, model);
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedTitle = threadStore.getState().threads[threadId].title;
      console.log('[Test] 发送消息后标题:', updatedTitle);

      // 获取持久化状态
      const currentThreadId = chatStore.getState().currentThreadId;
      const activeThreadId = threadStore.getState().activeThreadId;

      return {
        threadId: threadId.substring(0, 20),
        initialTitle,
        updatedTitle,
        titleUpdated: initialTitle !== updatedTitle,
        currentThreadId,
        activeThreadId,
      };
    });

    console.log('[DEBUG] 步骤1结果:', JSON.stringify(step1Result, null, 2));
    expect(step1Result.titleUpdated).toBe(true);

    // 步骤2：模拟应用重新加载（刷新页面）
    console.log('[DEBUG] ===== 步骤2：模拟应用重新加载 =====');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 等待 stores 重新初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 步骤3：验证恢复后的状态
    console.log('[DEBUG] ===== 步骤3：验证恢复后的状态 =====');

    const step3Result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;

      console.log('[Test] 检查恢复后的状态...');

      const currentThreadId = chatStore.getState().currentThreadId;
      const activeThreadId = threadStore.getState().activeThreadId;

      console.log('[Test] currentThreadId:', currentThreadId);
      console.log('[Test] activeThreadId:', activeThreadId?.substring(0, 20) || 'null');

      // 获取所有线程
      const allThreads = threadStore.getState().getAllThreads();
      console.log('[Test] 线程总数:', allThreads.length);

      if (allThreads.length > 0) {
        const firstThread = allThreads[0];
        console.log('[Test] 第一个线程:');
        console.log('[Test]   ID:', firstThread.id.substring(0, 20));
        console.log('[Test]   标题:', firstThread.title);

        return {
          hasThreads: true,
          threadCount: allThreads.length,
          firstThreadId: firstThread.id.substring(0, 20),
          firstThreadTitle: firstThread.title,
          currentThreadId,
          activeThreadId: activeThreadId?.substring(0, 20) || null,
          synced: activeThreadId === currentThreadId,
          threadMatchesActive: firstThread.id === activeThreadId,
          threadMatchesCurrent: firstThread.id === currentThreadId,
        };
      }

      return {
        hasThreads: false,
        threadCount: 0,
        currentThreadId,
        activeThreadId: activeThreadId?.substring(0, 20) || null,
      };
    });

    console.log('[DEBUG] 步骤3结果:', JSON.stringify(step3Result, null, 2));

    // 验证：应该有线程被恢复
    expect(step3Result.hasThreads).toBe(true);
    expect(step3Result.threadCount).toBeGreaterThan(0);

    // 验证：标题应该保持更新后的值
    expect(step3Result.firstThreadTitle).toBe('如何实现快速排序算法');

    // 步骤4：在恢复的线程中发送新消息
    console.log('[DEBUG] ===== 步骤4：在恢复的线程中发送新消息 =====');

    const step4Result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      // 获取线程
      const allThreads = threadStore.getState().getAllThreads();
      const thread = allThreads[0];

      const titleBefore = thread.title;
      console.log('[Test] 发送消息前标题:', titleBefore);

      // 发送新消息
      const newMessage = 'React 性能优化技巧';
      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;

      await chatStore.getState().sendMessage(newMessage, providerId, model);
      await new Promise(resolve => setTimeout(resolve, 200));

      const titleAfter = threadStore.getState().threads[thread.id].title;
      console.log('[Test] 发送消息后标题:', titleAfter);

      return {
        titleBefore,
        titleAfter,
        titleChanged: titleBefore !== titleAfter,
        // 由于标题已经不是默认标题，不应该再更新
        shouldNotChange: titleBefore === titleAfter,
      };
    });

    console.log('[DEBUG] 步骤4结果:', JSON.stringify(step4Result, null, 2));

    // 验证：由于标题已经是自定义的，不应该再更新
    expect(step4Result.shouldNotChange).toBe(true);

    console.log('[DEBUG] ✅ 持久化恢复测试完成');
  });
});
