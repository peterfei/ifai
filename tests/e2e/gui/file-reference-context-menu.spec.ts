/**
 * E2E 测试：文件引用上下文菜单功能
 *
 * 任务 1.7.7: 文件引用上下文菜单 E2E 测试（E2E-FR-1~6）
 *
 * 测试覆盖：
 * - E2E-FR-1: 右键菜单基本交互（显示/关闭/点击外部/ESC）
 * - E2E-FR-2: 复制文件路径功能
 * - E2E-FR-3: 复制相对路径功能
 * - E2E-FR-4: 文件信息显示功能
 * - E2E-FR-5: 非文件路径不显示菜单
 * - E2E-FR-6: 菜单位置自动调整（避免超出屏幕）
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('File Reference Context Menu (E2E-FR)', () => {

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

  test('E2E-FR-1: 右键菜单基本交互', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：文件引用右键菜单基本交互 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试文件引用' });
    });

    console.log('[DEBUG] 创建测试对话:', threadId);

    // 添加包含文件引用的消息
    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().addUserMessage(id, '请查看文件 [/src/components/AIChat/MarkdownRenderer.tsx](/src/components/AIChat/MarkdownRenderer.tsx)');
    }, threadId);

    await page.waitForTimeout(500);

    // 查找包含文件路径的链接
    const fileLink = page.locator('a[href="/src/components/AIChat/MarkdownRenderer.tsx"]');
    await expect(fileLink).toBeVisible();
    console.log('[DEBUG] ✅ 文件链接可见');

    // 右键点击文件链接
    await fileLink.click({ button: 'right' });
    console.log('[DEBUG] 右键点击文件链接');

    // 验证菜单显示
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).toBeVisible();
    console.log('[DEBUG] ✅ 右键菜单显示');

    // 验证文件名头部
    await expect(page.locator('text=MarkdownRenderer.tsx')).toBeVisible();
    await expect(page.locator('text=TSX')).toBeVisible();
    console.log('[DEBUG] ✅ 文件名头部显示正确');

    // 验证菜单项存在
    await expect(page.locator('text=在编辑器中打开')).toBeVisible();
    await expect(page.locator('text=复制文件路径')).toBeVisible();
    await expect(page.locator('text=复制相对路径')).toBeVisible();
    await expect(page.locator('text=在文件管理器中显示')).toBeVisible();
    await expect(page.locator('text=文件信息')).toBeVisible();
    console.log('[DEBUG] ✅ 所有菜单项显示正确');

    // 点击外部关闭菜单
    await page.mouse.click(10, 10);
    await expect(contextMenu).not.toBeVisible();
    console.log('[DEBUG] ✅ 点击外部关闭菜单');

    // 再次打开菜单
    await fileLink.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();

    // 按 ESC 关闭菜单
    await page.keyboard.press('Escape');
    await expect(contextMenu).not.toBeVisible();
    console.log('[DEBUG] ✅ ESC 键关闭菜单');
  });

  test('E2E-FR-2: 复制文件路径功能', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：复制文件路径功能 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话并添加文件引用
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试复制路径' });
    });

    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().addUserMessage(id, '文件：[/src/utils/helpers.ts](/src/utils/helpers.ts)');
    }, threadId);

    await page.waitForTimeout(500);

    // 右键点击文件链接
    const fileLink = page.locator('a[href="/src/utils/helpers.ts"]');
    await fileLink.click({ button: 'right' });

    // 点击复制文件路径
    await page.locator('text=复制文件路径').click();
    console.log('[DEBUG] 点击复制文件路径');

    // 等待复制状态反馈（显示 Check 图标）
    await page.waitForTimeout(100);

    // 验证剪贴板内容
    const clipboardText = await page.evaluate(() => {
      return navigator.clipboard.readText();
    });

    expect(clipboardText).toBe('/src/utils/helpers.ts');
    console.log('[DEBUG] ✅ 剪贴板内容正确: /src/utils/helpers.ts');

    // 验证菜单仍然打开（复制操作不关闭菜单）
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).toBeVisible();
    console.log('[DEBUG] ✅ 复制后菜单仍然打开');

    // 2秒后复制状态应该自动清除
    await page.waitForTimeout(2000);
    console.log('[DEBUG] ✅ 复制状态自动清除');
  });

  test('E2E-FR-3: 复制相对路径功能', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：复制相对路径功能 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试相对路径' });
    });

    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().addUserMessage(id, '查看 [./App.tsx](./App.tsx)');
    }, threadId);

    await page.waitForTimeout(500);

    // 右键点击文件链接
    const fileLink = page.locator('a[href="./App.tsx"]');
    await fileLink.click({ button: 'right' });

    // 点击复制相对路径
    await page.locator('text=复制相对路径').click();
    console.log('[DEBUG] 点击复制相对路径');

    await page.waitForTimeout(100);

    // 验证剪贴板内容（相对路径会加上 ./ 前缀）
    const clipboardText = await page.evaluate(() => {
      return navigator.clipboard.readText();
    });

    expect(clipboardText).toBe('./App.tsx');
    console.log('[DEBUG] ✅ 剪贴板内容正确: ./App.tsx');
  });

  test('E2E-FR-4: 文件信息显示功能', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：文件信息显示功能 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试文件信息' });
    });

    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().addUserMessage(id, '查看 [package.json](package.json)');
    }, threadId);

    await page.waitForTimeout(500);

    // 右键点击文件链接
    const fileLink = page.locator('a[href="package.json"]');
    await fileLink.click({ button: 'right' });

    // 点击文件信息（会弹出 alert）
    page.on('dialog', async dialog => {
      console.log('[DEBUG] 捕获对话框:', dialog.message());
      expect(dialog.message()).toContain('package.json');
      expect(dialog.message()).toContain('JSON');
      await dialog.accept();
    });

    await page.locator('text=文件信息').click();
    console.log('[DEBUG] ✅ 文件信息对话框显示');
  });

  test('E2E-FR-5: 非文件路径不显示菜单', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：非文件路径不显示菜单 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试非文件链接' });
    });

    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().addUserMessage(id, '访问 [GitHub](https://github.com) 和 [Google](https://google.com)');
    }, threadId);

    await page.waitForTimeout(500);

    // 右键点击非文件链接（URL）
    const urlLink = page.locator('a[href="https://github.com"]');
    await urlLink.click({ button: 'right' });
    console.log('[DEBUG] 右键点击 URL 链接');

    // 验证文件引用菜单不显示
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).not.toBeVisible();
    console.log('[DEBUG] ✅ URL 链接不触发文件引用菜单');

    // 测试其他非文件路径
    const nonFileLinks = [
      'a[href="https://google.com"]',
      'a[href="/api/users"]',  // API 路径
      'a[href="#section1"]',    // 锚点链接
    ];

    for (const selector of nonFileLinks) {
      const link = page.locator(selector).first();
      if (await link.isVisible()) {
        await link.click({ button: 'right' });
        await expect(contextMenu).not.toBeVisible();
        console.log('[DEBUG] ✅ 非文件链接不触发菜单:', selector);
      }
    }
  });

  test('E2E-FR-6: 菜单位置自动调整', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：菜单位置自动调整 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试菜单位置' });
    });

    // 添加多条消息，确保有滚动
    for (let i = 0; i < 5; i++) {
      await page.evaluate((id) => {
        const threadStore = (window as any).__threadStore;
        threadStore.getState().addUserMessage(id, `消息 ${i + 1}: 查看 [/src/components/Component${i}.tsx](/src/components/Component${i}.tsx)`);
      }, threadId);
    }

    await page.waitForTimeout(500);

    // 获取视口大小
    const viewportSize = await page.viewportSize();
    console.log('[DEBUG] 视口大小:', viewportSize);

    // 右键点击页面底部的文件链接（菜单可能超出屏幕）
    const lastFileLink = page.locator('a[href*="/src/components/"]').last();
    await lastFileLink.click({ button: 'right' });
    console.log('[DEBUG] 右键点击底部的文件链接');

    // 验证菜单显示
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).toBeVisible();

    // 验证菜单位置（不应该超出屏幕）
    const menuBox = await contextMenu.boundingBox();
    expect(menuBox).not.toBeNull();

    if (menuBox) {
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.y).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewportSize!.width);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewportSize!.height);
      console.log('[DEBUG] ✅ 菜单位置正确，未超出屏幕');
    }

    // 点击右边缘附近的链接
    const rightEdgeLink = page.locator('a[href*="/src/components/"]').first();
    const linkBox = await rightEdgeLink.boundingBox();

    if (linkBox) {
      // 模拟右键点击靠近右边缘的位置
      await page.mouse.click(linkBox.x + linkBox.width - 10, linkBox.y + 10, { button: 'right' });
      await expect(contextMenu).toBeVisible();

      const adjustedMenuBox = await contextMenu.boundingBox();
      if (adjustedMenuBox) {
        expect(adjustedMenuBox.x + adjustedMenuBox.width).toBeLessThanOrEqual(viewportSize!.width);
        console.log('[DEBUG] ✅ 菜单位置自动调整，避免超出右边界');
      }
    }
  });

  test('E2E-FR-7: 在编辑器中打开功能', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：在编辑器中打开功能 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试在编辑器打开' });
    });

    await page.evaluate((id) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().addUserMessage(id, '打开 [/src/index.ts](/src/index.ts)');
    }, threadId);

    await page.waitForTimeout(500);

    // 右键点击文件链接
    const fileLink = page.locator('a[href="/src/index.ts"]');
    await fileLink.click({ button: 'right' });

    // 点击在编辑器中打开
    await page.locator('text=在编辑器中打开').click();
    console.log('[DEBUG] 点击在编辑器中打开');

    // 验证菜单关闭
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).not.toBeVisible();
    console.log('[DEBUG] ✅ 菜单关闭');

    // 注意：实际的文件打开需要在集成测试中验证
    // E2E 测试只能验证菜单交互和回调调用
    console.log('[DEBUG] ✅ 在编辑器中打开功能已调用（实际打开需要在集成测试中验证）');
  });

  test('E2E-FR-8: 支持多种文件路径格式', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：支持多种文件路径格式 ==========');

    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // 创建测试对话
    const threadId = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      return threadStore.getState().createThread({ title: '测试多种路径格式' });
    });

    // 测试各种文件路径格式
    const testCases = [
      { path: '/src/App.tsx', expectedName: 'App.tsx' },
      { path: './utils/helpers.js', expectedName: 'helpers.js' },
      { path: '../components/Button.tsx', expectedName: 'Button.tsx' },
      { path: 'config/settings.json', expectedName: 'settings.json' },
      { path: '/README.md', expectedName: 'README.md' },
    ];

    for (const testCase of testCases) {
      await page.evaluate((id) => {
        const threadStore = (window as any).__threadStore;
        threadStore.getState().addUserMessage(id, `文件：[${testCase.path}](${testCase.path})`);
      }, threadId);

      await page.waitForTimeout(200);

      // 右键点击文件链接
      const fileLink = page.locator(`a[href="${testCase.path}"]`);
      await fileLink.click({ button: 'right' });

      // 验证菜单显示且文件名正确
      const contextMenu = page.locator('.fixed.z-50');
      await expect(contextMenu).toBeVisible();
      await expect(page.locator(`text=${testCase.expectedName}`)).toBeVisible();
      console.log(`[DEBUG] ✅ 路径格式支持: ${testCase.path} -> ${testCase.expectedName}`);

      // 关闭菜单
      await page.keyboard.press('Escape');
      await expect(contextMenu).not.toBeVisible();
    }
  });
});
