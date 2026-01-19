/**
 * E2E 测试：验证基于消息内容的线程标题自动生成
 *
 * 功能：类似豆包，使用首条消息内容自动生成线程标题
 *
 * 测试场景：
 * 1. 创建线程后发送消息，标题应自动更新为消息摘要
 * 2. 多个线程的标题应该各不相同
 * 3. 用户自定义的标题不应被自动更新覆盖
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Thread: Title Auto-Generation from Message Content', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should update thread title from first message content', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：从消息内容生成线程标题 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      // 清空并创建新线程
      threadStore.getState().reset();
      const threadId = threadStore.getState().createThread();

      // 获取创建时的默认标题
      const initialTitle = threadStore.getState().threads[threadId].title;

      // 模拟发送第一条用户消息
      const userMessage = '帮我实现一个二分查找算法';
      chatStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      });

      // 触发标题更新（模拟 sendMessage 中的逻辑）
      threadStore.getState().updateThreadTitleFromMessage(threadId, userMessage);

      // 获取更新后的标题
      const updatedTitle = threadStore.getState().threads[threadId].title;

      return {
        success: true,
        threadId,
        initialTitle,
        updatedTitle,
        titleChanged: initialTitle !== updatedTitle,
        expectedTitle: '帮我实现一个二分查找算法'
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证：标题应该从默认标题更新为消息内容
    expect(result.success).toBe(true);
    expect(result.titleChanged).toBe(true);
    expect(result.updatedTitle).toBe(result.expectedTitle);

    console.log('[DEBUG] ✅ 标题自动更新功能正常工作');
    console.log(`[DEBUG]    初始标题: "${result.initialTitle}"`);
    console.log(`[DEBUG]    更新后标题: "${result.updatedTitle}"`);
  });

  test('should generate unique titles for different threads', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：多个线程生成不同标题 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      // 清空并创建多个线程
      threadStore.getState().reset();

      // 创建第一个线程
      const thread1Id = threadStore.getState().createThread();
      const msg1 = '如何实现快速排序';
      chatStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg1,
        timestamp: Date.now()
      });
      threadStore.getState().updateThreadTitleFromMessage(thread1Id, msg1);

      // 创建第二个线程
      const thread2Id = threadStore.getState().createThread();
      const msg2 = 'React 组件性能优化技巧';
      chatStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg2,
        timestamp: Date.now()
      });
      threadStore.getState().updateThreadTitleFromMessage(thread2Id, msg2);

      // 创建第三个线程
      const thread3Id = threadStore.getState().createThread();
      const msg3 = 'TypeScript 类型推导';
      chatStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg3,
        timestamp: Date.now()
      });
      threadStore.getState().updateThreadTitleFromMessage(thread3Id, msg3);

      const threads = threadStore.getState().threads;
      const titles = Object.values(threads).map((t: any) => t.title);
      const uniqueTitles = new Set(titles);

      return {
        success: true,
        threadCount: Object.keys(threads).length,
        titles,
        uniqueTitleCount: uniqueTitles.size,
        allUnique: titles.length === uniqueTitles.size,
        threads: Object.values(threads).map((t: any) => ({
          id: t.id,
          title: t.title
        }))
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证：所有线程应该有不同的标题
    expect(result.success).toBe(true);
    expect(result.threadCount).toBe(3);
    expect(result.allUnique).toBe(true);

    console.log('[DEBUG] ✅ 所有线程标题唯一，无重复');
    console.log('[DEBUG]    生成的标题:', result.titles.join(', '));
  });

  test('should NOT override custom user-defined titles', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：不覆盖用户自定义标题 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      // 清空并创建线程
      threadStore.getState().reset();
      const threadId = threadStore.getState().createThread();

      // 用户自定义标题
      const customTitle = '我的重要项目';
      threadStore.getState().updateThread(threadId, { title: customTitle });

      // 发送消息
      const userMessage = '帮我写代码';
      chatStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      });

      // 尝试触发标题更新
      threadStore.getState().updateThreadTitleFromMessage(threadId, userMessage);

      // 验证标题没有被改变
      const finalTitle = threadStore.getState().threads[threadId].title;

      return {
        success: true,
        customTitle,
        finalTitle,
        titlePreserved: finalTitle === customTitle
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证：自定义标题应该被保留
    expect(result.success).toBe(true);
    expect(result.titlePreserved).toBe(true);
    expect(result.finalTitle).toBe(result.customTitle);

    console.log('[DEBUG] ✅ 用户自定义标题被保留，未被自动更新覆盖');
  });

  test('should handle long message content by truncating', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：长消息内容截断处理 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      // 清空并创建线程
      threadStore.getState().reset();
      const threadId = threadStore.getState().createThread();

      // 发送超长消息（超过30字符）
      const longMessage = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的消息标题';
      chatStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: longMessage,
        timestamp: Date.now()
      });

      threadStore.getState().updateThreadTitleFromMessage(threadId, longMessage);

      const finalTitle = threadStore.getState().threads[threadId].title;

      return {
        success: true,
        originalLength: longMessage.length,
        finalTitle,
        finalLength: finalTitle.length,
        hasEllipsis: finalTitle.endsWith('...'),
        maxLength: 33  // 30 characters + '...'
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证：长消息应该被截断并添加省略号
    expect(result.success).toBe(true);
    expect(result.finalLength).toBeLessThanOrEqual(result.maxLength);
    expect(result.hasEllipsis).toBe(true);

    console.log('[DEBUG] ✅ 长消息正确截断处理');
    console.log(`[DEBUG]    原始长度: ${result.originalLength}`);
    console.log(`[DEBUG]    截断后: "${result.finalTitle}"`);
  });

  test('should use counter for default titles in same time period', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：同时间段默认标题计数器 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;

      // 清空
      threadStore.getState().reset();

      // 创建多个线程但不发送消息（测试默认标题）
      const thread1Id = threadStore.getState().createThread();
      const title1 = threadStore.getState().threads[thread1Id].title;

      const thread2Id = threadStore.getState().createThread();
      const title2 = threadStore.getState().threads[thread2Id].title;

      const thread3Id = threadStore.getState().createThread();
      const title3 = threadStore.getState().threads[thread3Id].title;

      // 获取当前时间段
      const hour = new Date().getHours();
      const timePeriod = hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';

      return {
        success: true,
        timePeriod,
        titles: [title1, title2, title3],
        allDifferent: new Set([title1, title2, title3]).size === 3,
        expectedPattern: [
          `${timePeriod}的新对话`,
          `${timePeriod}的对话 1`,
          `${timePeriod}的对话 2`
        ]
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证：默认标题应该使用计数器生成不同的名称
    expect(result.success).toBe(true);
    expect(result.allDifferent).toBe(true);
    expect(result.titles).toEqual(result.expectedPattern);

    console.log('[DEBUG] ✅ 默认标题计数器正常工作');
    console.log(`[DEBUG]    ${result.timePeriod} 生成的标题:`, result.titles.join(', '));
  });
});
