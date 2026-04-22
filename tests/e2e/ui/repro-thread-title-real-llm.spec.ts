/**
 * E2E 测试：使用真实 LLM 验证 Tab 自动命名功能
 *
 * 测试目标：通过真实 AI API 完整模拟用户使用流程
 * 这是用户报告问题的真实场景
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Thread: Title Auto-Update with Real LLM', () => {

  test('should auto-update title when sending first message with real AI', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：真实 AI - 首次消息自动更新标题 ==========');

    // 使用真实 AI
    await setupE2ETestEnvironment(page, {
      useRealAI: true,  // 🔥 使用真实 AI
      skipWelcome: true,
    });

    await page.goto('/');
    await page.waitForTimeout(3000);  // 等待更长时间，确保 AI 初始化

    // 等待 stores 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__settingsStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      console.log('[Test] ===== 步骤1: 清空并创建新线程 =====');

      // 清空并创建新线程
      threadStore.getState().reset();
      await new Promise(resolve => setTimeout(resolve, 100));

      const threadId = threadStore.getState().createThread();
      console.log('[Test] 新线程 ID:', threadId.substring(0, 20));

      const initialTitle = threadStore.getState().threads[threadId].title;
      console.log('[Test] 初始标题:', initialTitle);

      // 检查同步状态
      const currentThreadId = chatStore.getState().currentThreadId;
      const activeThreadId = threadStore.getState().activeThreadId;

      console.log('[Test] currentThreadId:', currentThreadId);
      console.log('[Test] activeThreadId:', activeThreadId?.substring(0, 20) || 'null');
      console.log('[Test] 是否同步:', currentThreadId === activeThreadId);

      console.log('[Test] ===== 步骤2: 通过真实 AI 发送消息 =====');

      const testMessage = '帮我实现一个快速排序算法';
      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;

      console.log('[Test] 消息内容:', testMessage);
      console.log('[Test] providerId:', providerId);
      console.log('[Test] model:', model);

      try {
        // 🔥 关键：使用真实的 sendMessage 流程
        await chatStore.getState().sendMessage(testMessage, providerId, model);
        console.log('[Test] sendMessage 调用成功');

        // 等待 AI 响应完成
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('[Test] sendMessage 调用失败:', error);
        throw error;
      }

      console.log('[Test] ===== 步骤3: 验证标题是否更新 =====');

      // 获取更新后的标题
      const updatedThread = threadStore.getState().threads[threadId];
      const updatedTitle = updatedThread?.title || 'null';

      console.log('[Test] 更新后标题:', updatedTitle);

      // 检查消息是否被添加
      const messages = chatStore.getState().messages;
      console.log('[Test] 消息数量:', messages.length);

      return {
        success: true,
        threadId: threadId.substring(0, 20),
        initialTitle,
        updatedTitle,
        titleChanged: initialTitle !== updatedTitle,
        expectedTitle: testMessage,

        // 调试信息
        messageCount: messages.length,
        currentThreadId,
        activeThreadId: activeThreadId?.substring(0, 20) || null,
        synced: currentThreadId === activeThreadId,
      };
    });

    console.log('[DEBUG] ========== 测试结果 ==========');
    console.log('[DEBUG]', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);

    // 🔥 关键断言：标题应该从默认标题更新
    if (!result.titleChanged) {
      console.error('[DEBUG] ❌ 标题没有更新！');
      console.error('[DEBUG]    初始标题:', result.initialTitle);
      console.error('[DEBUG]    更新后标题:', result.updatedTitle);
      console.error('[DEBUG]    currentThreadId:', result.currentThreadId);
      console.error('[DEBUG]    activeThreadId:', result.activeThreadId);
      console.error('[DEBUG]    是否同步:', result.synced);
    }

    expect(result.titleChanged, '标题应该从默认标题更新为消息内容').toBe(true);

    // 验证同步状态
    expect(result.synced, 'currentThreadId 应该与 activeThreadId 同步').toBe(true);

    console.log('[DEBUG] ✅ 真实 AI 测试通过 - 标题自动更新功能正常');
    console.log(`[DEBUG]    初始标题: "${result.initialTitle}"`);
    console.log(`[DEBUG]    更新后标题: "${result.updatedTitle}"`);
  });

  test('should update title for each new thread with real AI', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：真实 AI - 多线程独立命名 ==========');

    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      skipWelcome: true,
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      console.log('[Test] ===== 创建多个线程并各自发送消息 =====');

      // 清空
      threadStore.getState().reset();
      await new Promise(resolve => setTimeout(resolve, 100));

      const testCases = [
        { threadId: null, msg: '如何实现二分查找', expectedTitle: '如何实现二分查找' },
        { threadId: null, msg: 'React 组件性能优化', expectedTitle: 'React 组件性能优化' },
        { threadId: null, msg: 'TypeScript 类型推导', expectedTitle: 'TypeScript 类型推导' },
      ];

      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;

      // 为每个测试用例创建线程并发送消息
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];

        console.log(`[Test] 测试用例 ${i + 1}:`, testCase.msg);

        // 创建新线程
        testCase.threadId = threadStore.getState().createThread();
        console.log(`[Test]   创建线程:`, testCase.threadId.substring(0, 20));

        // 等待状态同步
        await new Promise(resolve => setTimeout(resolve, 100));

        const initialTitle = threadStore.getState().threads[testCase.threadId].title;
        console.log(`[Test]   初始标题:`, initialTitle);

        // 发送消息
        try {
          await chatStore.getState().sendMessage(testCase.msg, providerId, model);
          console.log(`[Test]   sendMessage 成功`);
        } catch (error) {
          console.error(`[Test]   sendMessage 失败:`, error);
        }

        // 等待 AI 响应
        await new Promise(resolve => setTimeout(resolve, 3000));

        const updatedTitle = threadStore.getState().threads[testCase.threadId].title;
        console.log(`[Test]   更新后标题:`, updatedTitle);

        testCase.actualTitle = updatedTitle;
        testCase.updated = initialTitle !== updatedTitle;
      }

      // 获取所有线程
      const allThreads = threadStore.getState().getAllThreads();
      const titles = allThreads.map(t => t.title);

      return {
        success: true,
        testCases: testCases.map(tc => ({
          msg: tc.msg,
          threadId: tc.threadId.substring(0, 20),
          expectedTitle: tc.expectedTitle,
          actualTitle: tc.actualTitle,
          updated: tc.updated,
        })),
        threadCount: allThreads.length,
        titles,
        allUnique: new Set(titles).size === titles.length,
      };
    });

    console.log('[DEBUG] ========== 测试结果 ==========');
    console.log('[DEBUG]', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);
    expect(result.threadCount).toBe(3);

    // 每个线程的标题都应该被更新
    result.testCases.forEach((testCase, index) => {
      console.log(`[DEBUG] 测试用例 ${index + 1}:`);
      console.log(`[DEBUG]   消息: ${testCase.msg}`);
      console.log(`[DEBUG]   预期标题: ${testCase.expectedTitle}`);
      console.log(`[DEBUG]   实际标题: ${testCase.actualTitle}`);
      console.log(`[DEBUG]   是否更新: ${testCase.updated}`);

      expect(testCase.updated, `测试用例 ${index + 1} 的标题应该被更新`).toBe(true);
    });

    // 所有标题应该唯一
    expect(result.allUnique, '所有线程标题应该唯一').toBe(true);

    console.log('[DEBUG] ✅ 真实 AI 多线程测试通过');
    console.log('[DEBUG]    生成的标题:', result.titles.join(', '));
  });
});
