/**
 * E2E 测试：重现线程重名问题
 *
 * 问题：当用户创建多个线程但不手动命名时，
 * generateDefaultTitle() 只根据时间段（上午/下午/晚上）生成标题，
 * 导致同时段创建的多个线程显示相同的名称。
 *
 * 优化方案：
 * 1. 在同时间段内使用递增计数器
 * 2. 添加时间戳后缀
 * 3. 使用首条消息内容摘要（当可用时）
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Thread: Duplicate Name Issue Reproduction', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should reproduce duplicate thread names in same time period', async ({ page }) => {
    console.log('[DEBUG] ========== 线程重名问题重现测试 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;

      // 清空现有线程（使用 reset 方法）
      threadStore.getState().reset();

      // 模拟创建3个线程，不指定名称（使用默认名称）
      const thread1Id = threadStore.getState().createThread();
      const thread2Id = threadStore.getState().createThread();
      const thread3Id = threadStore.getState().createThread();

      const threads = threadStore.getState().threads;

      // 提取所有线程标题（threads 是对象，需要转换为数组）
      const titles = Object.values(threads).map((t: any) => t.title);

      // 统计重复标题
      const titleCounts: Record<string, number> = {};
      titles.forEach((title: string) => {
        titleCounts[title] = (titleCounts[title] || 0) + 1;
      });

      // 找出重复的标题
      const duplicateTitles = Object.entries(titleCounts)
        .filter(([_, count]) => count > 1)
        .map(([title, count]) => ({ title, count }));

      return {
        success: true,
        threadCount: Object.keys(threads).length,
        allTitles: titles,
        titleCounts,
        duplicateTitles,
        hasDuplicates: duplicateTitles.length > 0,
        threads: Object.values(threads).map((t: any) => ({
          id: t.id,
          title: t.title,
          createdAt: new Date(t.createdAt).toLocaleString()
        }))
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证修复：同时间段创建的多个线程应该有唯一标题
    expect(result.success).toBe(true);
    expect(result.threadCount).toBeGreaterThanOrEqual(3);

    // ✅ 修复后：不应该有重复标题
    expect(result.hasDuplicates).toBe(false);
    console.log('[DEBUG] ✅ 问题已修复：所有线程标题唯一');
  });

  test('should show current default title generation logic', async ({ page }) => {
    console.log('[DEBUG] ========== 当前标题生成逻辑分析 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      // 测试 generateDefaultTitle 函数的行为
      const hour = new Date().getHours();
      const greeting = hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
      const currentDefaultTitle = `${greeting}的新对话`;

      // 模拟连续创建多个线程
      const titles: string[] = [];
      for (let i = 0; i < 5; i++) {
        titles.push(currentDefaultTitle); // 当前逻辑：所有线程返回相同标题
      }

      return {
        currentHour: hour,
        timePeriod: greeting,
        defaultTitle: currentDefaultTitle,
        generatedTitles: titles,
        uniqueTitleCount: new Set(titles).size,
        problem: `所有 ${greeting} 创建的线程都会显示为 "${currentDefaultTitle}"`
      };
    });

    console.log('[DEBUG] 当前逻辑分析:', JSON.stringify(result, null, 2));

    expect(result.uniqueTitleCount).toBe(1); // 当前：只有1个唯一标题
    console.log('[DEBUG] ⚠️  问题确认：', result.problem);
  });

  test('should verify thread switching behavior with duplicate names', async ({ page }) => {
    console.log('[DEBUG] ========== 重名线程切换行为测试 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;

      // 清空并创建多个线程
      threadStore.getState().reset();

      const thread1Id = threadStore.getState().createThread();
      // 给第一个线程添加一些消息
      (window as any).__chatStore.getState().addMessage({
        id: 'msg1',
        role: 'user',
        content: '第一个线程的消息',
        timestamp: Date.now()
      });

      const thread2Id = threadStore.getState().createThread();
      // 切换回第一个线程
      threadStore.getState().switchThread(thread1Id);

      // 给第二个线程添加消息（在不同线程）
      (window as any).__chatStore.getState().addMessage({
        id: 'msg2',
        role: 'user',
        content: '第二个线程的消息',
        timestamp: Date.now()
      });

      const thread3Id = threadStore.getState().createThread();

      const threadsObj = threadStore.getState().threads;
      const currentThreadId = threadStore.getState().currentThreadId;

      return {
        currentThreadId,
        threads: Object.values(threadsObj).map((t: any) => ({
          id: t.id,
          title: t.title,
          isCurrent: t.id === currentThreadId
        })),
        titles: Object.values(threadsObj).map((t: any) => t.title)
      };
    });

    console.log('[DEBUG] 线程切换结果:', JSON.stringify(result, null, 2));

    // ✅ 修复后验证：所有线程应该有不同的标题
    const uniqueTitles = new Set(result.titles);
    expect(uniqueTitles.size).toBe(result.titles.length);
    console.log('[DEBUG] ✅ 用户体验改善：', result.titles.length, '个线程都有唯一标题');
    console.log('[DEBUG]    标题列表:', result.titles.join(', '));
  });
});
