/**
 * E2E 测试：高保真模拟用户真实场景，重现 Tab 自动命名问题
 *
 * 测试目标：通过真实的 sendMessage 流程验证标题自动更新功能
 * 问题现象：用户创建新 Tab 后发送消息，标题仍然是 "xxx的对话"
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Thread: Title Auto-Update (Real User Flow)', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,  // 使用 mock AI，避免实际 API 调用
      skipWelcome: true,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should auto-update title when sending first message via sendMessage', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：真实 sendMessage 流程自动更新标题 ==========');

    // 等待 stores 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      console.log('[Test] ===== 步骤1: 清空并创建新线程 =====');

      // 清空并创建新线程
      threadStore.getState().reset();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 创建新线程（模拟用户点击 + 按钮）
      const threadId = threadStore.getState().createThread();
      console.log('[Test] 新线程 ID:', threadId.substring(0, 20));

      // 获取创建时的默认标题
      const initialTitle = threadStore.getState().threads[threadId].title;
      console.log('[Test] 初始标题:', initialTitle);

      console.log('[Test] ===== 步骤2: 检查初始状态 =====');

      // 检查 chatStore.currentThreadId 是否已同步
      const currentThreadId = chatStore.getState().currentThreadId;
      const activeThreadId = threadStore.getState().activeThreadId;

      console.log('[Test] currentThreadId:', currentThreadId);
      console.log('[Test] activeThreadId:', activeThreadId);
      console.log('[Test] 是否同步:', currentThreadId === activeThreadId);

      // 获取当前 provider 和 model
      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;
      console.log('[Test] providerId:', providerId);
      console.log('[Test] model:', model);

      console.log('[Test] ===== 步骤3: 调用真实的 sendMessage =====');

      // 🔥 关键：使用真实的 sendMessage 函数（而不是手动调用 updateThreadTitleFromMessage）
      const testMessage = '帮我实现快速排序算法';

      try {
        await chatStore.getState().sendMessage(testMessage, providerId, model);
        console.log('[Test] sendMessage 调用成功');
      } catch (error) {
        console.error('[Test] sendMessage 调用失败:', error);
        // 即使 AI 调用失败（因为是 mock），标题更新逻辑应该已经执行
      }

      // 等待状态更新
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('[Test] ===== 步骤4: 验证标题是否更新 =====');

      // 获取更新后的标题
      const updatedTitle = threadStore.getState().threads[threadId]?.title;
      console.log('[Test] 更新后标题:', updatedTitle);

      // 再次检查 currentThreadId
      const finalCurrentThreadId = chatStore.getState().currentThreadId;
      console.log('[Test] final currentThreadId:', finalCurrentThreadId);

      // 检查是否能通过 currentThreadId 找到线程
      const threadByCurrentId = currentThreadId ? threadStore.getState().getThread(currentThreadId) : null;
      const threadByActiveId = threadStore.getState().getThread(activeThreadId);

      console.log('[Test] 通过 currentThreadId 找到线程:', !!threadByCurrentId);
      console.log('[Test] 通过 activeThreadId 找到线程:', !!threadByActiveId);

      return {
        success: true,
        threadId,
        initialTitle,
        updatedTitle,
        titleChanged: initialTitle !== updatedTitle,
        expectedTitle: testMessage,

        // 调试信息
        currentThreadId,
        activeThreadId,
        synced: currentThreadId === activeThreadId,

        threadByCurrentIdFound: !!threadByCurrentId,
        threadByActiveIdFound: !!threadByActiveId,
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);

    // 🔥 这是关键断言：标题应该从默认标题更新为消息内容
    if (!result.titleChanged) {
      console.error('[DEBUG] ❌ 标题没有更新！');
      console.error('[DEBUG]    初始标题:', result.initialTitle);
      console.error('[DEBUG]    更新后标题:', result.updatedTitle);
      console.error('[DEBUG]    currentThreadId:', result.currentThreadId);
      console.error('[DEBUG]    activeThreadId:', result.activeThreadId);
      console.error('[DEBUG]    是否同步:', result.synced);
    }

    expect(result.titleChanged, '标题应该从默认标题更新为消息内容').toBe(true);
    expect(result.updatedTitle, '更新后的标题应该是消息内容').toBe(result.expectedTitle);

    // 验证同步状态
    expect(result.synced, 'currentThreadId 应该与 activeThreadId 同步').toBe(true);

    console.log('[DEBUG] ✅ 标题自动更新功能正常工作');
    console.log(`[DEBUG]    初始标题: "${result.initialTitle}"`);
    console.log(`[DEBUG]    更新后标题: "${result.updatedTitle}"`);
  });

  test('should create multiple threads and each should have unique title', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：多个线程并发创建和发送消息 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      console.log('[Test] ===== 步骤1: 清空并创建多个线程 =====');

      // 清空
      threadStore.getState().reset();
      await new Promise(resolve => setTimeout(resolve, 100));

      const messagesAndThreads = [
        { msg: '如何实现二分查找' },
        { msg: 'React 组件优化技巧' },
        { msg: 'TypeScript 类型推导' },
      ];

      // 创建多个线程并发送消息
      for (const { msg } of messagesAndThreads) {
        // 创建新线程
        const threadId = threadStore.getState().createThread();
        console.log('[Test] 创建线程:', threadId.substring(0, 20), '消息:', msg);

        // 等待状态同步
        await new Promise(resolve => setTimeout(resolve, 50));

        // 发送消息
        const providerId = settingsStore.getState().currentProviderId;
        const model = settingsStore.getState().currentModel;

        try {
          await chatStore.getState().sendMessage(msg, providerId, model);
        } catch (error) {
          console.error('[Test] sendMessage 失败:', error);
        }

        // 等待状态更新
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('[Test] ===== 步骤2: 验证所有线程标题 =====');

      const threads = threadStore.getState().threads;
      const titles = Object.values(threads).map((t: any) => t.title);
      const uniqueTitles = new Set(titles);

      console.log('[Test] 所有线程标题:', titles);

      return {
        success: true,
        threadCount: Object.keys(threads).length,
        titles,
        uniqueTitleCount: uniqueTitles.size,
        allUnique: titles.length === uniqueTitles.size,
        threads: Object.values(threads).map((t: any) => ({
          id: t.id.substring(0, 20),
          title: t.title
        }))
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证：所有线程应该有不同的标题
    expect(result.success).toBe(true);
    expect(result.threadCount).toBe(3);
    expect(result.allUnique, '所有线程标题应该唯一').toBe(true);

    console.log('[DEBUG] ✅ 所有线程标题唯一，无重复');
    console.log('[DEBUG]    生成的标题:', result.titles.join(', '));
  });
});
