/**
 * E2E 测试：对话列表右键菜单功能
 *
 * 任务 1.7.6.7: 右键菜单 E2E 测试（E2E-CM-1~4）
 *
 * 测试覆盖：
 * - E2E-CM-1: 右键菜单基本交互（显示/关闭/点击外部）
 * - E2E-CM-2: 删除对话完整流程（确认对话框/自动切换）
 * - E2E-CM-3: 重命名对话完整流程（输入框/Enter保存/ESC取消）
 * - E2E-CM-4: 置顶对话功能（toggle状态/排序更新）
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Conversation Context Menu (E2E-CM)', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    // 确保在 conversation 模式
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.getState().setGuiMode('conversation');
      }
    });

    await page.waitForTimeout(500);
  });

  test('E2E-CM-1: 右键菜单基本交互', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：右键菜单基本交互 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试对话' });
    });

    console.log('[DEBUG] 创建测试对话:', threadId);

    // 等待对话列表渲染
    await page.waitForTimeout(500);

    // 查找对话卡片按钮
    const threadCard = page.locator(`button[data-thread-id="${threadId}"]`);
    await expect(threadCard).toBeVisible();

    // 右键点击打开菜单
    await threadCard.click({ button: 'right' });
    console.log('[DEBUG] 右键点击对话卡片');

    // 验证菜单显示
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).toBeVisible();
    console.log('[DEBUG] ✅ 右键菜单显示');

    // 验证菜单项存在
    await expect(page.locator('text=重命名')).toBeVisible();
    await expect(page.locator('text=置顶对话')).toBeVisible();
    await expect(page.locator('text=删除对话')).toBeVisible();
    console.log('[DEBUG] ✅ 所有菜单项显示正确');

    // 点击外部关闭菜单
    await page.mouse.click(10, 10);
    await expect(contextMenu).not.toBeVisible();
    console.log('[DEBUG] ✅ 点击外部关闭菜单');

    // 再次打开菜单
    await threadCard.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();

    // 按 ESC 关闭菜单
    await page.keyboard.press('Escape');
    await expect(contextMenu).not.toBeVisible();
    console.log('[DEBUG] ✅ ESC 键关闭菜单');
  });

  test('E2E-CM-2: 删除对话完整流程', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：删除对话完整流程 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '待删除对话' });
    });

    console.log('[DEBUG] 创建测试对话:', threadId);

    // 验证对话存在
    const threadCard = page.locator(`button[data-thread-id="${threadId}"]`);
    await expect(threadCard).toBeVisible();

    // 右键点击打开菜单
    await threadCard.click({ button: 'right' });

    // 点击删除按钮（使用 data-testid 精确定位菜单项）
    await page.locator('[data-testid="menu-item-delete"]').click();
    console.log('[DEBUG] 点击删除对话按钮');

    // 验证确认对话框显示
    const confirmDialog = page.locator('text=删除"待删除对话"？');
    await expect(confirmDialog).toBeVisible();
    await expect(page.locator('text=此操作不可恢复。删除后对话将永久消失。')).toBeVisible();
    console.log('[DEBUG] ✅ 删除确认对话框显示');

    // 取消删除
    await page.locator('button:has-text("取消")').click();
    await expect(confirmDialog).not.toBeVisible();

    // 验证对话仍然存在
    await expect(threadCard).toBeVisible();
    console.log('[DEBUG] ✅ 取消删除后对话仍然存在');

    // 再次打开删除菜单
    await threadCard.click({ button: 'right' });
    await page.locator('[data-testid="menu-item-delete"]').click();

    // 确认删除（使用类名精确定位）
    await page.locator('button.theme-button-danger').click();
    console.log('[DEBUG] 确认删除');

    // 等待对话框关闭
    await expect(confirmDialog).not.toBeVisible();

    // 验证对话已删除（从列表中消失）
    await page.waitForTimeout(500);
    await expect(threadCard).not.toBeVisible();
    console.log('[DEBUG] ✅ 对话已从列表中删除');

    // 验证状态确实被标记为 deleted
    const threadStatus = await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().threads[id]?.status;
    }, threadId);

    expect(threadStatus).toBe('deleted');
    console.log('[DEBUG] ✅ 对话状态标记为 deleted');
  });

  test('E2E-CM-3: 重命名对话完整流程', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：重命名对话完整流程 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '原标题' });
    });

    console.log('[DEBUG] 创建测试对话:', threadId);

    // 查找对话卡片
    const threadCard = page.locator(`button[data-thread-id="${threadId}"]`);
    await expect(threadCard).toBeVisible();
    await expect(threadCard.locator('text=原标题')).toBeVisible();

    // 右键点击打开菜单
    await threadCard.click({ button: 'right' });

    // 点击重命名按钮
    await page.locator('text=重命名').click();
    console.log('[DEBUG] 点击重命名按钮');

    // 验证编辑输入框显示
    const input = page.locator('input[data-testid="rename-input"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('原标题');
    console.log('[DEBUG] ✅ 重命名输入框显示，当前值为原标题');

    // 验证原按钮被隐藏
    await expect(threadCard).toHaveCSS('visibility', 'hidden');
    console.log('[DEBUG] ✅ 原对话卡片按钮被隐藏');

    // 修改标题
    await input.clear();
    await input.fill('新标题');
    console.log('[DEBUG] 输入新标题');

    // 按 ESC 取消
    await input.press('Escape');
    await page.waitForTimeout(200);

    // 验证输入框关闭，标题未改变
    await expect(input).not.toBeVisible();
    await expect(threadCard.locator('text=原标题')).toBeVisible();
    console.log('[DEBUG] ✅ ESC 取消，标题保持为原标题');

    // 再次进入重命名模式
    await threadCard.click({ button: 'right' });
    await page.locator('text=重命名').click();
    await input.clear();
    await input.fill('新标题');

    // 按 Enter 保存
    await input.press('Enter');
    await page.waitForTimeout(200);

    // 验证标题已更新
    await expect(input).not.toBeVisible();
    await expect(threadCard.locator('text=新标题')).toBeVisible();
    console.log('[DEBUG] ✅ Enter 保存，标题更新为新标题');

    // 验证 ThreadManager 中的标题确实被更新
    const updatedTitle = await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().threads[id]?.title;
    }, threadId);

    expect(updatedTitle).toBe('新标题');
    console.log('[DEBUG] ✅ ThreadManager 中的标题已更新');
  });

  test('E2E-CM-4: 置顶对话功能', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：置顶对话功能 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建多个对话，用于测试排序
    const threadIds = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const id1 = threadStore.getState().createThread({ title: '对话A' });
      const id2 = threadStore.getState().createThread({ title: '对话B' });
      const id3 = threadStore.getState().createThread({ title: '对话C' });
      return [id1, id2, id3];
    });

    const [threadAId, threadBId, threadCId] = threadIds;
    console.log('[DEBUG] 创建测试对话:', threadIds);

    await page.waitForTimeout(500);

    // 查找对话卡片
    const threadACard = page.locator(`button[data-thread-id="${threadAId}"]`);
    const threadBCard = page.locator(`button[data-thread-id="${threadBId}"]`);

    // 验证初始状态：没有置顶图标
    await expect(threadACard.locator('[data-testid="pinned-icon"]')).not.toBeVisible();
    console.log('[DEBUG] ✅ 初始状态：对话A 无置顶图标');

    // 右键点击对话A，选择置顶
    await threadACard.click({ button: 'right' });
    await expect(page.locator('text=置顶对话')).toBeVisible();
    await page.locator('text=置顶对话').click();
    console.log('[DEBUG] 点击置顶对话');

    // 等待状态更新
    await page.waitForTimeout(300);

    // 验证置顶图标显示
    await expect(threadACard.locator('[data-testid="pinned-icon"]')).toBeVisible();
    console.log('[DEBUG] ✅ 置顶图标显示');

    // 验证菜单标签变为"取消置顶"
    await threadACard.click({ button: 'right' });
    await expect(page.locator('text=取消置顶')).toBeVisible();
    console.log('[DEBUG] ✅ 菜单标签变为"取消置顶"');

    // 点击外部关闭菜单
    await page.mouse.click(10, 10);

    // 验证 pinned 状态确实被设置
    const pinnedStatus = await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().threads[id]?.pinned;
    }, threadAId);

    expect(pinnedStatus).toBe(true);
    console.log('[DEBUG] ✅ ThreadManager 中的 pinned 状态为 true');

    // 验证排序：置顶的对话应该在前面
    const allThreads = await page.evaluate(() => {
      const listContainer = document.querySelector('[data-testid="conversation-list-panel"]');
      const buttons = listContainer?.querySelectorAll('button[data-thread-id]') || [];
      return Array.from(buttons).map(btn => btn.getAttribute('data-thread-id'));
    });

    expect(allThreads[0]).toBe(threadAId);
    console.log('[DEBUG] ✅ 置顶对话排序在最前');

    // 取消置顶
    await threadACard.click({ button: 'right' });
    await page.locator('text=取消置顶').click();
    await page.waitForTimeout(300);

    // 验证置顶图标消失
    await expect(threadACard.locator('[data-testid="pinned-icon"]')).not.toBeVisible();
    console.log('[DEBUG] ✅ 取消置顶后图标消失');

    // 验证 pinned 状态被清除
    const unpinnedStatus = await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().threads[id]?.pinned;
    }, threadAId);

    expect(unpinnedStatus).toBe(false);
    console.log('[DEBUG] ✅ ThreadManager 中的 pinned 状态为 false');
  });

  test('E2E-CM-5: 删除当前活跃对话自动切换', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：删除当前活跃对话自动切换 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15015 });

    // 创建两个对话
    const [activeThreadId, otherThreadId] = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const id1 = threadStore.getState().createThread({ title: '当前对话' });
      const id2 = threadStore.getState().createThread({ title: '其他对话' });
      return [id1, id2];
    });

    console.log('[DEBUG] 创建测试对话:', { activeThreadId, otherThreadId });

    // 设置第一个对话为活跃
    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().setActiveThread(id);
    }, activeThreadId);

    await page.waitForTimeout(500);

    // 验证 activeThreadId 是活跃的
    const isActive = await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().activeThreadId === id;
    }, activeThreadId);

    expect(isActive).toBe(true);
    console.log('[DEBUG] ✅ 当前对话是活跃的');

    // 右键删除当前活跃对话
    const activeCard = page.locator(`button[data-thread-id="${activeThreadId}"]`);
    await activeCard.click({ button: 'right' });
    await page.locator('[data-testid="menu-item-delete"]').click();

    // 确认删除（使用类名精确定位）
    await page.locator('button.theme-button-danger').click();
    await page.waitForTimeout(500);

    // 验证：活跃线程自动切换到其他对话
    const newActiveThreadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().activeThreadId;
    });

    expect(newActiveThreadId).toBe(otherThreadId);
    console.log('[DEBUG] ✅ 活跃线程自动切换到其他对话');

    // 验证删除的对话不再可见
    await expect(activeCard).not.toBeVisible();
    console.log('[DEBUG] ✅ 被删除的对话从列表中消失');
  });

  test('E2E-CM-6: 删除最后一个对话自动创建新对话', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：删除最后一个对话自动创建新对话 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 清空所有对话，只保留一个
    await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      // 重置 threads
      threadStore.getState().reset();
      // 创建唯一对话
      threadStore.getState().createThread({ title: '最后一个对话' });
    });

    await page.waitForTimeout(500);

    const lastThreadCard = page.locator('button[data-thread-id]').first();
    await expect(lastThreadCard).toBeVisible();

    // 右键删除最后一个对话
    await lastThreadCard.click({ button: 'right' });
    await page.locator('[data-testid="menu-item-delete"]').click();

    // 确认删除（使用类名精确定位）
    await page.locator('button.theme-button-danger').click();
    await page.waitForTimeout(500);

    // 验证：自动创建了新对话
    const newThreadExists = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const threads = Object.values(threadStore.getState().threads).filter(
        (t: any) => t.status !== 'deleted'
      );
      return threads.length > 0;
    });

    expect(newThreadExists).toBe(true);
    console.log('[DEBUG] ✅ 删除最后一个对话后自动创建新对话');
  });

  test('E2E-CM-7: 重命名时点击外部保存', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：重命名时点击外部保存 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '原始标题' });
    });

    await page.waitForTimeout(500);

    const threadCard = page.locator(`button[data-thread-id="${threadId}"]`);

    // 进入重命名模式
    await threadCard.click({ button: 'right' });
    await page.locator('text=重命名').click();

    const input = page.locator('input[data-testid="rename-input"]');
    await expect(input).toBeVisible();

    // 修改标题
    await input.clear();
    await input.fill('外部点击保存');

    // 点击外部（点击对话列表面板外的区域）
    await page.locator('[data-testid="conversation-list-panel"]').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(200);

    // 验证：标题已保存
    await expect(input).not.toBeVisible();
    await expect(threadCard.locator('text=外部点击保存')).toBeVisible();
    console.log('[DEBUG] ✅ 点击外部自动保存重命名');

    // 验证 ThreadManager 中的标题已更新
    const updatedTitle = await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().threads[id]?.title;
    }, threadId);

    expect(updatedTitle).toBe('外部点击保存');
  });

  test('E2E-CM-8: 重命名后立即右键不打开菜单', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：重命名后立即右键不打开菜单 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试互斥' });
    });

    await page.waitForTimeout(500);

    const threadCard = page.locator(`button[data-thread-id="${threadId}"]`);

    // 进入重命名模式
    await threadCard.click({ button: 'right' });
    await page.locator('text=重命名').click();

    const input = page.locator('input[data-testid="rename-input"]');
    await expect(input).toBeVisible();

    // 在编辑状态下，输入框覆盖了按钮
    // 验证：点击 input 区域不会触发上下文菜单（因为 input 没有右键事件处理器）
    const inputBox = page.locator('.relative').locator('input').first();
    await inputBox.click({ button: 'right' });
    await page.waitForTimeout(200);

    // 验证：右键菜单不应该打开
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).not.toBeVisible();
    console.log('[DEBUG] ✅ 编辑状态下右键不打开菜单');

    // 按 Enter 保存
    await input.press('Enter');
    await page.waitForTimeout(200);

    // 现在可以打开右键菜单
    await threadCard.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();
    console.log('[DEBUG] ✅ 保存后可以正常打开右键菜单');
  });
});
