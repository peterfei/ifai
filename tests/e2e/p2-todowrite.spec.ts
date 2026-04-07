/**
 * P2 TodoWrite E2E Tests
 *
 * 测试 TodoWrite 工具的完整端到端流程：
 * 1. AI 调用 TodoWrite 工具
 * 2. 用户批准工具调用
 * 3. 任务面板自动打开
 * 4. 任务正确显示
 * 5. 任务状态管理
 *
 * @tags @p2 @todowrite @medium
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

// ============================================================================
// Test Suite
// ============================================================================

test.describe('P2: TodoWrite Tool Integration', () => {
  test.beforeEach(async ({ page }) => {
    // 监听浏览器控制台
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Browser Error]', msg.text());
      }
    });

    // 设置 E2E 测试环境
    await setupE2ETestEnvironment(page, {
      useRealAI: true, // TodoWrite 需要真实 AI 调用工具
    });
    await page.goto('/');
    await page.waitForTimeout(3000);
  });

  /**
   * 测试：AI 创建任务后面板自动打开
   */
  test('should auto-open TodoWrite panel when AI creates tasks', async ({ page }) => {
    // 1. 输入触发 TodoWrite 的提示词
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('帮我创建一个任务列表：1. 实现登录功能 2. 编写单元测试 3. 部署到生产环境');

    // 2. 发送消息
    const sendButton = page.locator('[data-testid="chat-send-button"]');
    await sendButton.click();

    // 3. 等待 AI 响应和工具调用
    await page.waitForTimeout(5000);

    // 4. 检查工具调用是否出现
    const toolCall = page.locator('[data-testid="tool-call"]').first();
    await expect(toolCall).toBeVisible({ timeout: 10000 });

    // 5. 批准工具调用
    const approveButton = page.locator('[data-testid="tool-approve-button"]').first();
    await approveButton.click();

    // 6. 等待任务面板打开
    await page.waitForTimeout(2000);

    // 7. 验证任务面板可见
    const todoPanel = page.locator('[data-testid="todowrite-panel"]');
    await expect(todoPanel).toBeVisible();

    // 8. 验证任务数量
    const taskCount = page.locator('[data-testid="task-count"]');
    await expect(taskCount).toContainText('3');
  });

  /**
   * 测试：任务状态更新
   */
  test('should update task status correctly', async ({ page }) => {
    // 1. 先创建任务（通过快捷方式直接操作 store）
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().syncFromToolCall([
        { content: 'Task 1', activeForm: 'Task 1', status: 'pending' },
        { content: 'Task 2', activeForm: 'Task 2', status: 'pending' },
      ]);
    });

    // 2. 打开任务面板
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().setPanelState('full');
    });

    // 3. 等待面板加载
    await page.waitForTimeout(500);

    // 4. 点击第一个任务的"开始"按钮
    const startButton = page.locator('[data-testid="task-start-button"]').first();
    await startButton.click();

    // 5. 验证状态变为"进行中"
    const taskStatus = page.locator('[data-testid="task-status"]').first();
    await expect(taskStatus).toContainText('进行中');

    // 6. 点击"完成"按钮
    const completeButton = page.locator('[data-testid="task-complete-button"]').first();
    await completeButton.click();

    // 7. 验证状态变为"已完成"
    await expect(taskStatus).toContainText('已完成');
  });

  /**
   * 测试：任务删除功能
   */
  test('should delete task correctly', async ({ page }) => {
    // 1. 创建测试任务
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().syncFromToolCall([
        { content: 'Task to delete', activeForm: 'Task to delete', status: 'pending' },
      ]);
    });

    // 2. 打开面板
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().setPanelState('full');
    });

    await page.waitForTimeout(500);

    // 3. 点击删除按钮
    const deleteButton = page.locator('[data-testid="task-delete-button"]').first();
    await deleteButton.click();

    // 4. 验证任务被删除
    const tasks = page.locator('[data-testid="task-item"]');
    await expect(tasks).toHaveCount(0);
  });

  /**
   * 测试：清空所有任务
   */
  test('should clear all tasks', async ({ page }) => {
    // 1. 创建多个任务
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().syncFromToolCall([
        { content: 'Task 1', activeForm: 'Task 1', status: 'pending' },
        { content: 'Task 2', activeForm: 'Task 2', status: 'pending' },
        { content: 'Task 3', activeForm: 'Task 3', status: 'pending' },
      ]);
    });

    // 2. 打开面板
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().setPanelState('full');
    });

    await page.waitForTimeout(500);

    // 3. 点击清空按钮
    const clearButton = page.locator('[data-testid="clear-tasks-button"]');
    await clearButton.click();

    // 4. 验证所有任务被清空
    const tasks = page.locator('[data-testid="task-item"]');
    await expect(tasks).toHaveCount(0);
  });

  /**
   * 测试：任务统计信息
   */
  test('should display correct task statistics', async ({ page }) => {
    // 1. 创建不同状态的任务
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().syncFromToolCall([
        { content: 'Pending Task', activeForm: 'Pending Task', status: 'pending' },
        { content: 'In Progress Task', activeForm: 'In Progress Task', status: 'in_progress' },
        { content: 'Completed Task', activeForm: 'Completed Task', status: 'completed' },
      ]);
    });

    // 2. 打开面板
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().setPanelState('full');
    });

    await page.waitForTimeout(500);

    // 3. 验证统计信息
    const pendingCount = page.locator('[data-testid="stat-pending"]');
    const inProgressCount = page.locator('[data-testid="stat-in-progress"]');
    const completedCount = page.locator('[data-testid="stat-completed"]');

    await expect(pendingCount).toContainText('待办: 1');
    await expect(inProgressCount).toContainText('进行中: 1');
    await expect(completedCount).toContainText('已完成: 1');
  });

  /**
   * 测试：关闭任务面板
   */
  test('should close panel when close button clicked', async ({ page }) => {
    // 1. 创建任务并打开面板
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().syncFromToolCall([
        { content: 'Test Task', activeForm: 'Test Task', status: 'pending' },
      ]);
      useTodoWriteStore.getState().setPanelState('full');
    });

    await page.waitForTimeout(500);

    // 2. 验证面板可见
    const todoPanel = page.locator('[data-testid="todowrite-panel"]');
    await expect(todoPanel).toBeVisible();

    // 3. 点击关闭按钮
    const closeButton = page.locator('[data-testid="close-panel-button"]');
    await closeButton.click();

    // 4. 验证面板关闭
    await expect(todoPanel).not.toBeVisible();
  });

  /**
   * 测试：刷新任务列表
   */
  test('should refresh tasks from backend', async ({ page }) => {
    // 1. 打开面板
    await page.evaluate(() => {
      const useTodoWriteStore = (window as any).__todoWriteStore;
      useTodoWriteStore.getState().setPanelState('full');
    });

    await page.waitForTimeout(500);

    // 2. 点击刷新按钮
    const refreshButton = page.locator('[data-testid="refresh-tasks-button"]');
    await refreshButton.click();

    // 3. 等待刷新完成
    await page.waitForTimeout(1000);

    // 4. 验证刷新动画显示
    const refreshIcon = page.locator('[data-testid="refresh-icon"]');
    await expect(refreshIcon).toHaveClass(/animate-spin/);
  });
});

/**
 * ============================================================================
 * 测试执行说明
 * ============================================================================
 *
 * ### 前置条件
 * 1. 确保 Tauri 后端已运行（`npm run tauri:dev`）
 * 2. 配置真实 AI API Key（在 `tests/e2e/.env.e2e.local` 中）
 * 3. 或者使用 Mock AI（需要额外配置 Mock 响应）
 *
 * ### 运行测试
 *
 * # 运行所有 P2 TodoWrite 测试
 * npm run test:e2e -- p2-todowrite.spec.ts
 *
 * # 运行单个测试
 * npm run test:e2e -- p2-todowrite.spec.ts -g "should auto-open"
 *
 * # 调试模式（显示浏览器）
 * npm run test:e2e:headed -- p2-todowrite.spec.ts
 *
 * # UI 模式（交互式调试）
 * npm run test:e2e:ui -- p2-todowrite.spec.ts
 *
 * ### 调试技巧
 * 1. 使用 `test:e2e:debug` 可以逐步执行测试
 * 2. 使用 `page.pause()` 可以暂停执行检查状态
 * 3. 查看 Playwright 报告：`npm run test:e2e:report`
 */
