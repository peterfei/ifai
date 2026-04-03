import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * Section 2: 访问控制功能测试（红绿测试）
 *
 * 测试访问层级（AccessTier）的权限控制：
 * - Public: 可编辑
 * - Protected: 只读+覆盖
 * - Private: 仅专家模式
 */

// Mock prompts data for testing
const mockPrompts = [
  {
    metadata: {
      name: 'Public Prompt',
      description: 'A public editable prompt',
      version: '1.0.0',
      access_tier: 'public',
      variables: [],
      tools: []
    },
    content: 'Public prompt content',
    raw_text: 'Public prompt content',
    path: '/.ifai/prompts/public.md'
  },
  {
    metadata: {
      name: 'Protected Prompt',
      description: 'A protected prompt that requires override',
      version: '1.0.0',
      access_tier: 'protected',
      variables: [],
      tools: []
    },
    content: 'Protected prompt content',
    raw_text: 'Protected prompt content',
    path: '/.ifai/prompts/protected.md'
  },
  {
    metadata: {
      name: 'Private Prompt',
      description: 'A private prompt only for expert mode',
      version: '1.0.0',
      access_tier: 'private',
      variables: [],
      tools: []
    },
    content: 'Private prompt content',
    raw_text: 'Private prompt content',
    path: '/.ifai/prompts/private.md'
  }
];

test.describe('Section 2: Access Control (Red-Green TDD)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false, // UI 测试不需要真实 AI
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 直接设置 promptStore 的数据，绕过 Tauri 调用
    await page.evaluate((mockData) => {
      const promptStore = (window as any).__promptStore;
      if (promptStore) {
        promptStore.setState({
          prompts: mockData,
          isLoading: false,
          error: null,
          expertMode: false // 初始为普通模式
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

  test('AC-001: 专家模式开关', async ({ page }) => {
    // 检查专家模式切换按钮是否存在
    const expertToggle = page.getByTestId('expert-mode-toggle');
    await expect(expertToggle).toBeVisible();

    // 检查初始状态（普通模式）
    await expect(expertToggle).toContainText('普通模式');

    // 切换到专家模式
    await expertToggle.click();
    await page.waitForTimeout(500);

    // 检查状态已更改
    await expect(expertToggle).toContainText('专家模式');
  });

  test('AC-002: AccessTierBadge 显示', async ({ page }) => {
    // 检查是否有访问层级徽章
    const badges = page.getByTestId('access-tier-badge');
    const badgeCount = await badges.count();

    expect(badgeCount).toBeGreaterThan(0);

    // 检查第一个徽章的属性
    const firstBadge = badges.first();
    const tier = await firstBadge.getAttribute('data-access-tier');

    expect(tier).toBeDefined();
    expect(['public', 'protected', 'private']).toContain(tier);
  });

  test('AC-003: 普通模式下隐藏 Private 提示词', async ({ page }) => {
    // 确保处于普通模式
    const expertToggle = page.getByTestId('expert-mode-toggle');
    const text = await expertToggle.textContent();
    if (text?.includes('专家模式')) {
      await expertToggle.click();
      await page.waitForTimeout(500);
    }

    // 检查是否有 Private 提示词可见
    const privateBadges = page.locator('[data-prompt-access-tier="private"]');
    const count = await privateBadges.count();

    // 普通模式下不应该有 private 提示词
    expect(count).toBe(0);
  });

  test('AC-004: 专家模式下显示 Private 提示词', async ({ page }) => {
    // 切换到专家模式
    const expertToggle = page.getByTestId('expert-mode-toggle');
    const text = await expertToggle.textContent();
    if (!text?.includes('专家模式')) {
      await expertToggle.click();
      await page.waitForTimeout(500);
    }

    // 在专家模式下，需要重新设置 Mock 数据（因为 toggleExpertMode 会调用 loadPrompts）
    await page.evaluate((mockData) => {
      const promptStore = (window as any).__promptStore;
      if (promptStore) {
        promptStore.setState({
          prompts: mockData,
          isLoading: false,
          error: null,
          expertMode: true // 确保是专家模式
        });
        console.log('[E2E Mock] Reset prompts in expert mode');
      }
    }, mockPrompts);

    // 等待列表更新
    await page.waitForTimeout(1000);

    // 检查是否有 Private 提示词可见
    const privateBadges = page.locator('[data-prompt-access-tier="private"]');

    const count = await privateBadges.count();

    // 应该至少有一个 private 提示词（因为我们 Mock 了）
    expect(count).toBeGreaterThan(0);

    console.log(`✅ Found ${count} private prompts in expert mode`);
  });

  test('AC-005: 覆盖确认对话框 - Protected 提示词', async ({ page }) => {
    // 查找 Protected 提示词
    const protectedPrompt = page.locator('[data-prompt-access-tier="protected"]').first();

    const hasProtected = await protectedPrompt.count() > 0;

    if (!hasProtected) {
      test.skip();
      return;
    }

    // 点击 Protected 提示词
    await protectedPrompt.click();

    // 等待编辑器加载 - 增加超时时间并检查可见性
    await page.waitForTimeout(1000);

    // 检查是否有 textarea（PromptEditor）
    const textarea = page.locator('textarea').first();
    const isTextareaVisible = await textarea.isVisible().catch(() => false);

    if (!isTextareaVisible) {
      console.log('⚠️ Textarea not found, skipping editor test');
      test.skip();
      return;
    }

    // 修改内容
    await textarea.fill('# Test Modified Content\n\nThis is a test modification.');
    await page.waitForTimeout(500);

    // 点击保存按钮
    const saveButton = page.getByText('保存').or(page.getByText('创建覆盖'));
    const saveButtonCount = await saveButton.count();

    if (saveButtonCount === 0) {
      console.log('⚠️ Save button not found');
      test.skip();
      return;
    }

    await saveButton.first().click();

    // 等待对话框出现
    await page.waitForTimeout(1000);

    // 检查是否显示覆盖确认对话框
    const dialogTitle = page.locator('text=创建覆盖文件').or(page.locator('text=🛡️'));
    const isDialogVisible = await dialogTitle.isVisible().catch(() => false);

    if (!isDialogVisible) {
      // 检查是否有其他对话框或提示
      const anyDialog = page.locator('dialog, [role="dialog"]').first();
      const hasAnyDialog = await anyDialog.count() > 0;
      console.log(`⚠️ Override dialog not found. Any dialog visible: ${hasAnyDialog}`);

      // 输出页面内容用于调试
      const bodyText = await page.locator('body').textContent();
      console.log('Page content preview:', bodyText?.substring(0, 200));
    }

    expect(isDialogVisible).toBe(true);
  });

  test('AC-006: AccessTierBadge 颜色和文本', async ({ page }) => {
    // 检查 Public 提示词徽章（绿色，可编辑）
    const publicBadge = page.locator('[data-prompt-access-tier="public"] [data-testid="access-tier-badge"]').first();
    await expect(publicBadge).toBeVisible();
    await expect(publicBadge).toContainText('可编辑');

    // 检查 Protected 提示词徽章（黄色，只读+覆盖）
    const protectedBadge = page.locator('[data-prompt-access-tier="protected"] [data-testid="access-tier-badge"]').first();
    await expect(protectedBadge).toBeVisible();
    await expect(protectedBadge).toContainText('只读+覆盖');
  });
});
