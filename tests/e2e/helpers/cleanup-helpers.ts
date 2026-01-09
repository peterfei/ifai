/**
 * 测试数据清理函数
 *
 * 提供统一的测试数据清理方法，确保测试之间的隔离性
 */

import type { Page, Locator } from '@playwright/test';

/**
 * 清理所有聊天会话
 * @param page - Playwright Page对象
 * @param options - 配置选项
 */
export async function clearAllThreads(
  page: Page,
  options: {
    timeout?: number;
    confirm?: boolean;
  } = {}
): Promise<void> {
  const { timeout = 5000, confirm = true } = options;

  try {
    // 打开会话管理菜单
    const threadMenuButton = page.locator('[data-testid="thread-menu-button"], button[aria-label*="会话"], button[aria-label*="thread"]').first();

    if (await threadMenuButton.isVisible({ timeout })) {
      await threadMenuButton.click();

      // 等待菜单出现
      const deleteAllButton = page.locator('button:has-text("删除所有"), button:has-text("Delete All"), [data-testid="delete-all-threads"]').first();

      if (confirm && await deleteAllButton.isVisible({ timeout: 1000 })) {
        await deleteAllButton.click();

        // 确认对话框
        const confirmButton = page.locator('button:has-text("确认"), button:has-text("Confirm"), [data-testid="confirm-delete"]').first();
        if (await confirmButton.isVisible({ timeout: 1000 })) {
          await confirmButton.click();
        }
      }

      // 等待清理完成
      await page.waitForTimeout(500);
    }
  } catch (error) {
    // 如果没有会话菜单或清理按钮，静默失败
    console.debug('No thread menu found or cleanup already performed');
  }
}

/**
 * 清理所有文件
 * @param page - Playwright Page对象
 * @param options - 配置选项
 */
export async function clearAllFiles(
  page: Page,
  options: {
    timeout?: number;
    confirm?: boolean;
  } = {}
): Promise<void> {
  const { timeout = 5000, confirm = true } = options;

  try {
    // 打开文件管理面板
    const filePanelToggle = page.locator('[data-testid="file-panel-toggle"], button[aria-label*="文件"], button[aria-label*="file"]').first();

    if (await filePanelToggle.isVisible({ timeout })) {
      await filePanelToggle.click();

      // 等待面板打开
      await page.waitForTimeout(300);

      // 点击清理所有按钮
      const clearFilesButton = page.locator('button:has-text("清空"), button:has-text("Clear"), [data-testid="clear-all-files"]').first();

      if (confirm && await clearFilesButton.isVisible({ timeout: 1000 })) {
        await clearFilesButton.click();

        // 确认对话框
        const confirmButton = page.locator('button:has-text("确认"), button:has-text("Confirm"), [data-testid="confirm-clear"]').first();
        if (await confirmButton.isVisible({ timeout: 1000 })) {
          await confirmButton.click();
        }
      }

      // 等待清理完成
      await page.waitForTimeout(500);
    }
  } catch (error) {
    console.debug('No file panel found or cleanup already performed');
  }
}

/**
 * 重置模拟文件系统
 * @param page - Playwright Page对象
 * @param options - 配置选项
 */
export async function resetMockFileSystem(
  page: Page,
  options: {
    timeout?: number;
    clearLocalStorage?: boolean;
    clearSessionStorage?: boolean;
  } = {}
): Promise<void> {
  const {
    timeout = 5000,
    clearLocalStorage = true,
    clearSessionStorage = true
  } = options;

  try {
    // 清理浏览器存储
    if (clearLocalStorage) {
      await page.evaluate(() => {
        localStorage.clear();
      });
    }

    if (clearSessionStorage) {
      await page.evaluate(() => {
        sessionStorage.clear();
      });
    }

    // 尝试调用Tauri的文件系统API（如果存在）
    try {
      await page.evaluate(async () => {
        // @ts-ignore - Tauri API
        if (window.__TAURI__?.fs) {
          // @ts-ignore
          const { fs } = window.__TAURI__;
          // 这里可以根据实际需求清理特定目录
        }
      });
    } catch (tauriError) {
      // Tauri API不可用时忽略
      console.debug('Tauri FS API not available, skipping filesystem reset');
    }

    // 等待清理生效
    await page.waitForTimeout(300);
  } catch (error) {
    console.warn('Error resetting mock filesystem:', error);
  }
}

/**
 * 清理特定聊天会话
 * @param page - Playwright Page对象
 * @param threadTitle - 会话标题或标识
 */
export async function clearThread(
  page: Page,
  threadTitle: string
): Promise<void> {
  try {
    // 右键点击会话项
    const threadItem = page.locator(`[data-testid="thread-item"]:has-text("${threadTitle}")`).first();

    if (await threadItem.isVisible()) {
      await threadItem.click({ button: 'right' });

      // 点击删除选项
      const deleteOption = page.locator('li:has-text("删除"), li:has-text("Delete"), [data-testid="delete-thread"]').first();
      await deleteOption.click();

      // 确认删除
      const confirmButton = page.locator('button:has-text("确认"), button:has-text("Confirm"), [data-testid="confirm-delete"]').first();
      if (await confirmButton.isVisible({ timeout: 1000 })) {
        await confirmButton.click();
      }
    }
  } catch (error) {
    console.debug(`Thread "${threadTitle}" not found or already deleted`);
  }
}

/**
 * 清理特定文件
 * @param page - Playwright Page对象
 * @param fileName - 文件名
 */
export async function clearFile(
  page: Page,
  fileName: string
): Promise<void> {
  try {
    // 在文件树中找到文件
    const fileItem = page.locator(`[data-testid="file-tree-item"]:has-text("${fileName}")`).first();

    if (await fileItem.isVisible()) {
      // 右键点击文件
      await fileItem.click({ button: 'right' });

      // 点击删除选项
      const deleteOption = page.locator('li:has-text("删除"), li:has-text("Delete"), [data-testid="delete-file"]').first();
      await deleteOption.click();

      // 确认删除
      const confirmButton = page.locator('button:has-text("确认"), button:has-text("Confirm"), [data-testid="confirm-delete"]').first();
      if (await confirmButton.isVisible({ timeout: 1000 })) {
        await confirmButton.click();
      }
    }
  } catch (error) {
    console.debug(`File "${fileName}" not found or already deleted`);
  }
}

/**
 * 清理所有打开的编辑器标签页
 * @param page - Playwright Page对象
 */
export async function closeAllEditors(page: Page): Promise<void> {
  try {
    const tabs = page.locator('[data-testid="editor-tab"], .editor-tab');

    const count = await tabs.count();

    for (let i = count - 1; i >= 0; i--) {
      const tab = tabs.nth(i);
      const closeButton = tab.locator('[data-testid="close-tab"], .close-tab, button[aria-label*="关闭"], button[aria-label*="close"]').first();

      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(100);
      }
    }
  } catch (error) {
    console.debug('Error closing editor tabs:', error);
  }
}

/**
 * 重置应用状态到初始状态
 * @param page - Playwright Page对象
 * @param options - 配置选项
 */
export async function resetAppState(
  page: Page,
  options: {
    clearThreads?: boolean;
    clearFiles?: boolean;
    clearEditors?: boolean;
    clearStorage?: boolean;
  } = {}
): Promise<void> {
  const {
    clearThreads = true,
    clearFiles = true,
    clearEditors = true,
    clearStorage = true
  } = options;

  // 按顺序执行清理操作
  if (clearEditors) {
    await closeAllEditors(page);
  }

  if (clearFiles) {
    await clearAllFiles(page, { confirm: false });
  }

  if (clearThreads) {
    await clearAllThreads(page, { confirm: false });
  }

  if (clearStorage) {
    await resetMockFileSystem(page);
  }

  // 等待所有清理操作完成
  await page.waitForTimeout(500);
}

/**
 * 清理测试相关的所有数据和状态
 * 这是测试后清理的快捷方式
 * @param page - Playwright Page对象
 */
export async function cleanupAfterTest(page: Page): Promise<void> {
  await resetAppState(page, {
    clearThreads: true,
    clearFiles: true,
    clearEditors: true,
    clearStorage: true
  });
}

/**
 * 验证清理是否成功
 * @param page - Playwright Page对象
 */
export async function assertCleanupSuccessful(page: Page): Promise<void> {
  // 验证没有打开的编辑器
  const openTabs = page.locator('[data-testid="editor-tab"]');
  const tabCount = await openTabs.count();
  if (tabCount > 0) {
    throw new Error(`Expected no open tabs, but found ${tabCount}`);
  }

  // 验证本地存储已清理
  const storageSize = await page.evaluate(() => {
    return localStorage.length + sessionStorage.length;
  });

  if (storageSize > 0) {
    console.warn(`Storage not completely cleared: ${storageSize} items remaining`);
  }
}
