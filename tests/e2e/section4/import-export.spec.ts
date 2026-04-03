import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * Section 4: 导入导出功能 (Red-Green TDD)
 *
 * 验证提示词的导入导出功能
 */

test.describe('Section 4: Import/Export (Red-Green TDD)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Mock promptStore 数据（与 access-control.spec.ts 相同格式）
    const mockPrompts = [
      {
        metadata: {
          name: '测试提示词 1',
          description: '第一个测试提示词',
          version: '1.0.0',
          access_tier: 'public',
          variables: [],
          tools: []
        },
        content: '测试内容',
        raw_text: '测试内容',
        path: '/.ifai/prompts/test1.md'
      },
      {
        metadata: {
          name: '测试提示词 2',
          description: '第二个测试提示词',
          version: '1.0.0',
          access_tier: 'protected',
          variables: [],
          tools: []
        },
        content: '测试内容 2',
        raw_text: '测试内容 2',
        path: '/.ifai/prompts/test2.md'
      },
      {
        metadata: {
          name: '内部提示词',
          description: '私有提示词',
          version: '1.0.0',
          access_tier: 'private',
          variables: [],
          tools: []
        },
        content: '内部内容',
        raw_text: '内部内容',
        path: '/.ifai/prompts/private/internal.md'
      }
    ];

    // 直接设置 promptStore 的数据，绕过 Tauri 调用
    await page.evaluate((mockData) => {
      const promptStore = (window as any).__promptStore;
      const fileStore = (window as any).__fileStore;

      if (fileStore) {
        // 设置 mock rootPath（否则对话框不会渲染）
        fileStore.getState().setRootPath('/Users/mac/mock-project');
        console.log('[E2E Mock] Set rootPath for E2E test');
      }

      // Mock Tauri invoke 命令
      if (window.__TAURI_INTERNALS__) {
        const originalInvoke = window.__TAURI_INTERNALS__.invoke;
        window.__TAURI_INTERNALS__.invoke = (cmd: string, args: any) => {
          console.log('[E2E Mock] Tauri invoke:', cmd, args);

          // Mock 导入导出相关命令
          if (cmd === 'list_exportable_prompts') {
            return Promise.resolve(mockData);
          }

          // 保留其他命令的原始行为
          return originalInvoke(cmd, args);
        };
      }

      // 确保 __TAURI__.core 也有相同的 mock
      if (window.__TAURI__?.core) {
        window.__TAURI__.core.invoke = window.__TAURI_INTERNALS__.invoke;
      }

      if (promptStore) {
        promptStore.setState({
          prompts: mockData,
          isLoading: false,
          error: null,
          expertMode: false
        });
        console.log('[E2E Mock] Set prompts in promptStore:', mockData.length);
      } else {
        console.error('[E2E Mock] promptStore not found!');
      }
    }, mockPrompts);

    // 等待数据更新
    await page.waitForTimeout(1000);

    // 打开提示词管理器
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();

    // 等待提示词列表加载
    await page.waitForTimeout(2000);

    // 等待至少一个提示词出现
    const promptItems = page.locator('[data-testid="prompt-item"]');
    await expect(promptItems.first()).toBeVisible({ timeout: 10000 });
  });

  test('AC-001: 导出按钮可见', async ({ page }) => {
    // 验证导出按钮存在
    const exportButton = page.getByTitle('导出提示词');
    await expect(exportButton).toBeVisible();
  });

  test('AC-002: 导入按钮可见', async ({ page }) => {
    // 验证导入按钮存在
    const importButton = page.getByTitle('导入提示词');
    await expect(importButton).toBeVisible();
  });

  test('AC-003: 导出对话框打开', async ({ page }) => {
    // 点击导出按钮
    const exportButton = page.getByTitle('导出提示词');
    await exportButton.click();

    // 验证对话框标题
    await expect(page.locator('text=导出提示词')).toBeVisible();

    // 验证"选择提示词"标题
    await expect(page.locator('text=选择提示词')).toBeVisible();

    // 验证提示词列表
    await expect(page.locator('text=测试提示词 1')).toBeVisible();
    await expect(page.locator('text=测试提示词 2')).toBeVisible();

    // 普通模式下不应显示 Private 提示词
    await expect(page.locator('text=内部提示词')).not.toBeVisible();
  });

  test('AC-004: 导出对话框选择提示词', async ({ page }) => {
    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(1000); // 增加等待时间

    // 使用 data-testid 点击第一个提示词
    const firstPrompt = page.locator('[data-testid^="prompt-export-item"]').first();
    await firstPrompt.click({ force: true });
    await page.waitForTimeout(800); // 等待状态更新

    // 验证选中状态（检查蓝色边框）
    const selectedItem = page.locator('.border-blue-500').or(page.locator('[class*="border-blue"]'));
    await expect(selectedItem).toHaveCount(1);

    // 验证计数更新
    await expect(page.locator('text=/1.*/3').or(page.locator('text=/1.*/2'))).toBeVisible();
  });

  test('AC-005: 导出对话框全选功能', async ({ page }) => {
    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(1000);

    // 点击全选
    const selectAllButton = page.locator('text=全选');
    await selectAllButton.click({ force: true });
    await page.waitForTimeout(800);

    // 验证所有提示词被选中
    const selectedItems = page.locator('.border-blue-500').or(page.locator('[class*="border-blue"]'));
    await expect(selectedItems).toHaveCount(2); // 2 个 public/protected

    // 点击取消全选
    const deselectAllButton = page.locator('text=取消全选');
    await deselectAllButton.click({ force: true });

    // 验证所有提示词取消选中
    await expect(selectedItems).toHaveCount(0);
  });

  test('AC-006: 导出对话框下一步验证', async ({ page }) => {
    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(1000);

    // 不选择任何提示词，点击下一步
    const nextButton = page.locator('button').filter({ hasText: '下一步' });
    await nextButton.click({ force: true });

    // 应该显示错误消息
    await expect(page.locator('text=请至少选择一个提示词')).toBeVisible();
  });

  test('AC-007: 导出对话框包信息填写', async ({ page }) => {
    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(1000);

    // 使用 data-testid 点击第一个提示词
    const firstPrompt = page.locator('[data-testid^="prompt-export-item"]').first();
    await firstPrompt.click({ force: true });
    await page.waitForTimeout(800);

    // 点击下一步按钮（使用更具体的选择器）
    const nextButton = page.locator('button').filter({ hasText: '下一步' });
    await nextButton.click({ force: true });
    await page.waitForTimeout(800);

    // 验证包信息表单
    await expect(page.locator('text=包信息')).toBeVisible();
    await expect(page.locator('label:has-text("包名称")')).toBeVisible();
    await expect(page.locator('label:has-text("描述")')).toBeVisible();
    await expect(page.locator('label:has-text("作者")')).toBeVisible();
    await expect(page.locator('label:has-text("版本")')).toBeVisible();

    // 填写包信息
    await page.fill('input[placeholder*="my-prompts"]', 'test-package');
    await page.fill('textarea[placeholder*="描述这个提示词包"]', '测试导出功能');
    await page.fill('input[placeholder*="作者名称"]', '测试用户');

    // 版本应该有默认值
    const versionInput = page.locator('input[placeholder="1.0.0"]');
    await expect(versionInput).toHaveValue('1.0.0');
  });

  test('AC-008: 导出对话框验证必填字段', async ({ page }) => {
    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(500);

    // 选择提示词
    const firstPrompt = page.locator('[data-testid^="prompt-export-item"]').first();
    await firstPrompt.click({ force: true });
    await page.waitForTimeout(300);

    // 点击下一步
    const nextButton = page.locator('button').filter({ hasText: '下一步' });
    await nextButton.click({ force: true });
    await page.waitForTimeout(500);

    // 只填写包名称，验证导出按钮仍然被禁用
    await page.fill('input[placeholder*="my-prompts"]', 'test-package');
    await page.waitForTimeout(200);

    // 验证导出按钮被禁用（因为缺少描述和作者）
    const exportButton = page.locator('button').filter({ hasText: /^导出$/ });
    await expect(exportButton).toBeDisabled();
  });

  test('AC-009: 导入对话框打开', async ({ page }) => {
    // 点击导入按钮
    const importButton = page.getByTitle('导入提示词');
    await importButton.click();

    // 验证对话框标题
    await expect(page.locator('text=导入提示词')).toBeVisible();
    await expect(page.locator('text=选择提示词包')).toBeVisible();
    await expect(page.locator('text=点击下方按钮选择文件')).toBeVisible();
  });

  test('AC-010: 导入对话框选择文件按钮', async ({ page }) => {
    // 打开导入对话框
    await page.getByTitle('导入提示词').click();

    // 验证选择文件按钮
    const selectFileButton = page.locator('button:has-text("选择文件")');
    await expect(selectFileButton).toBeVisible();
  });

  test('AC-011: 导入对话框文件选择', async ({ page }) => {
    // Mock 文件选择和内容
    await page.evaluate(() => {
      // Mock window.showOpenFilePicker (如果需要)
      // 或者直接模拟文件读取结果
    });

    // 注意：实际测试中可能需要 Mock Tauri API
    // 这里我们只验证 UI 状态
    await page.getByTitle('导入提示词').click();
    await expect(page.locator('button:has-text("选择文件")')).toBeVisible();
  });

  test('AC-012: 导入对话框预览包内容', async ({ page }) => {
    // 这个测试需要 Mock 导入的数据和 API
    // 暂时跳过，等待真实的 API Mock 实现
    test.skip(true, '需要完整的 Tauri API Mock');
  });

  test('AC-013: 导入对话框覆盖选项', async ({ page }) => {
    // 暂时跳过，需要完整的包预览数据
    test.skip(true, '需要完整的包预览数据');
  });

  test('AC-014: 导入对话框结果展示', async ({ page }) => {
    // 暂时跳过，需要完整的导入流程
    test.skip(true, '需要完整的导入流程');
  });

  test('AC-015: 导出/导入按钮在专家模式', async ({ page }) => {
    // 开启专家模式
    await page.locator('[data-testid="expert-mode-toggle"]').click();

    // 验证导出/导入按钮仍然存在
    await expect(page.getByTitle('导出提示词')).toBeVisible();
    await expect(page.getByTitle('导入提示词')).toBeVisible();

    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(500);

    // 专家模式下应该显示 Private 提示词
    await expect(page.locator('text=内部提示词')).toBeVisible();
  });

  test('AC-016: 对话框关闭功能', async ({ page }) => {
    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('text=导出提示词')).toBeVisible();

    // 点击关闭按钮
    const closeButton = page.locator('button[aria-label="Close"], button:has-text("×")').or(
      page.locator('.text-gray-400.hover\\:text-gray-600')
    ).first();
    await closeButton.click({ force: true });

    // 验证对话框关闭
    await expect(page.locator('text=导出提示词')).not.toBeVisible();

    // 打开导入对话框
    await page.getByTitle('导入提示词').click();
    await expect(page.locator('text=导入提示词')).toBeVisible();

    // 点击取消按钮
    await page.locator('button:has-text("取消")').click();

    // 验证对话框关闭
    await expect(page.locator('text=导入提示词')).not.toBeVisible();
  });

  test('AC-017: 导出对话框返回上一步', async ({ page }) => {
    // 打开导出对话框
    await page.getByTitle('导出提示词').click({ force: true });
    await page.waitForTimeout(500);

    // 选择提示词
    const firstPrompt = page.locator('[data-testid^="prompt-export-item"]').first();
    await firstPrompt.click({ force: true });
    await page.waitForTimeout(300);

    // 点击下一步
    const nextButton = page.locator('button').filter({ hasText: '下一步' });
    await nextButton.click({ force: true });
    await page.waitForTimeout(500);

    // 验证进入包信息步骤
    await expect(page.locator('text=包信息')).toBeVisible();

    // 点击上一步
    await page.locator('button:has-text("上一步")').click({ force: true });

    // 验证返回选择步骤
    await expect(page.locator('text=选择提示词')).toBeVisible();
    await expect(page.locator('text=包信息')).not.toBeVisible();
  });
});

/**
 * 测试统计
 * - 总测试数: 17
 * - 跳过测试: 3 (需要完整 API Mock)
 * - 预期通过: 14
 */
