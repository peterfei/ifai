/**
 * E2E Test: Thread Tabs 用户体验问题验证
 *
 * 测试以下问题：
 * 1. tab 有个滚动条 - 验证 tab 容器是否正确隐藏滚动条
 * 2. tab 重新进入没有聚焦到最后一次 focus 的 tab - 验证 tab 聚焦状态持久化
 *
 * TDD 方式：先写测试，确认问题存在，然后再修复
 */

import { test, expect } from '@playwright/test';

test.describe('Thread Tabs 用户体验问题', () => {
  test.beforeEach(async ({ page }) => {
    // 清空存储，确保每个测试都从干净状态开始
    await page.goto('/');

    // 等待应用完全加载
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // 清空存储
    await page.evaluate(() => {
      localStorage.clear();
      if ('indexedDB' in window) {
        indexedDB.deleteDatabase('ifai-threads');
      }
    });

    // 刷新页面以确保清空生效
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('问题1: tab 容器不应该显示滚动条', async ({ page }) => {
    // 1. 等待应用完全加载
    await page.waitForTimeout(2000);

    // 2. 使用更可靠的选择器
    // 查找包含 thread tab 的容器
    const tabContainer = page.locator('.overflow-x-auto').first();

    // 等待容器出现
    await expect(tabContainer).toBeVisible({ timeout: 10000 });

    // 3. 创建多个对话以触发水平滚动
    for (let i = 1; i <= 8; i++) {
      // 使用 Ctrl+T 快捷键创建新对话
      await page.keyboard.press('Control+t');
      await page.waitForTimeout(200);
    }

    // 4. 验证滚动条样式
    const scrollbarStyles = await tabContainer.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        overflowX: computed.overflowX,
        scrollbarWidth: computed.scrollbarWidth,
        // 检查类名
        className: el.className
      };
    });

    console.log('滚动条样式:', scrollbarStyles);
    console.log('容器类名:', scrollbarStyles.className);

    // 5. 验证滚动条被正确隐藏
    // Firefox
    expect(scrollbarStyles.scrollbarWidth).toBe('none');
    // 验证使用了 scrollbar-hide 类
    expect(scrollbarStyles.className).toContain('scrollbar-hide');
  });

  test('问题2: 重新进入应用应该恢复到最后活跃的 tab', async ({ page }) => {
    // 1. 等待应用完全加载
    await page.waitForTimeout(2000);

    // 创建第一个对话
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);

    // 在第一个对话中输入消息
    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('第一个对话的内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // 创建第二个对话
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);

    await chatInput.fill('第二个对话的内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // 创建第三个对话并使其成为活跃对话
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);

    await chatInput.fill('第三个对话的内容 - 最后活跃');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // 获取第三个对话的 ID（当前活跃的对话）
    const activeThreadId = await page.evaluate(() => {
      const state = (window as any).useThreadStore?.getState();
      return state?.activeThreadId;
    });

    console.log('最后活跃的 thread ID:', activeThreadId);
    expect(activeThreadId).toBeTruthy();

    // 2. 刷新页面（模拟重新进入应用）
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 3. 等待持久化恢复完成
    await page.waitForTimeout(2000);

    // 4. 验证活跃对话是否被恢复
    const restoredActiveThreadId = await page.evaluate(() => {
      const state = (window as any).useThreadStore?.getState();
      return state?.activeThreadId;
    });

    console.log('恢复后的 thread ID:', restoredActiveThreadId);

    // 验证：应该恢复到最后活跃的对话
    expect(restoredActiveThreadId).toBe(activeThreadId);

    // 5. 检查是否至少恢复了线程列表
    const threadCount = await page.evaluate(() => {
      const state = (window as any).useThreadStore?.getState();
      const threads = state?.threads || {};
      return Object.keys(threads).filter((id) => threads[id].status === 'active').length;
    });

    console.log('恢复的线程数量:', threadCount);
    expect(threadCount).toBeGreaterThan(0);
  });

  test('验证问题1的修复：使用 scrollbar-hide 类', async ({ page }) => {
    // 等待应用完全加载
    await page.waitForTimeout(2000);

    // 创建多个 tab
    for (let i = 1; i <= 5; i++) {
      await page.keyboard.press('Control+t');
      await page.waitForTimeout(200);
    }

    // 检查 tab 容器的 class
    const tabContainer = page.locator('.overflow-x-auto').first();
    await expect(tabContainer).toBeVisible({ timeout: 10000 });

    const hasScrollbarHide = await tabContainer.evaluate((el) => {
      return el.classList.contains('scrollbar-hide');
    });

    const hasScrollbarNone = await tabContainer.evaluate((el) => {
      return el.classList.contains('scrollbar-none');
    });

    console.log('有 scrollbar-hide 类:', hasScrollbarHide);
    console.log('有 scrollbar-none 类:', hasScrollbarNone);

    // 修复后：应该使用 scrollbar-hide 而不是 scrollbar-none
    expect(hasScrollbarHide).toBe(true);
    expect(hasScrollbarNone).toBe(false);
  });

  test('验证问题2的修复：activeThreadId 应该被持久化', async ({ page }) => {
    // 等待应用完全加载
    await page.waitForTimeout(2000);

    // 创建多个对话
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);

    // 在第二个对话中输入消息，使其成为最后活跃
    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('最后活跃的对话');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // 获取活跃线程 ID
    const activeThreadId = await page.evaluate(() => {
      const state = (window as any).useThreadStore?.getState();
      return state?.activeThreadId;
    });

    console.log('活跃 thread ID:', activeThreadId);
    expect(activeThreadId).toBeTruthy();

    // 检查 localStorage 中是否保存了 activeThreadId
    const hasActiveThreadIdInStorage = await page.evaluate(() => {
      const stored = localStorage.getItem('ifai-thread-storage');
      if (!stored) return false;
      try {
        const parsed = JSON.parse(stored);
        return !!parsed.state?.activeThreadId;
      } catch {
        return false;
      }
    });

    console.log('localStorage 中有 activeThreadId:', hasActiveThreadIdInStorage);

    // 修复后：应该持久化 activeThreadId
    expect(hasActiveThreadIdInStorage).toBe(true);
  });
});
