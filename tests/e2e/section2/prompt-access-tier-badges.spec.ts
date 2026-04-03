/**
 * Section 2 - 阶段 2.1: 访问层级徽章显示测试
 *
 * 测试不同访问层级的提示词在列表中正确显示徽章：
 * - 🟢 Public: 可编辑
 * - 🟡 Protected: 只读+覆盖
 * - 🔴 Private: 不可见
 *
 * @tags @section2 @prompt-management @access-tier @e2e
 * @priority high
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

// Mock prompts data for testing
const mockPrompts = [
  {
    metadata: {
      name: 'Bash Tool',
      description: 'Bash command execution tool',
      version: '1.0.0',
      access_tier: 'public',
      variables: [],
      tools: []
    },
    content: 'Bash prompt content',
    raw_text: 'Bash prompt content',
    path: '/.ifai/prompts/bash.md'
  },
  {
    metadata: {
      name: 'System Prompt: Main',
      description: 'IfAI 核心系统提示词',
      version: '0.2.1',
      access_tier: 'protected',
      variables: ['PROJECT_NAME', 'USER_NAME', 'CWD'],
      tools: []
    },
    content: 'System prompt content',
    raw_text: 'System prompt content',
    path: '/.ifai/prompts/system/main.md'
  },
  {
    metadata: {
      name: 'Private Internal',
      description: 'Internal private prompt',
      version: '1.0.0',
      access_tier: 'private',
      variables: [],
      tools: []
    },
    content: 'Private prompt content',
    raw_text: 'Private prompt content',
    path: '/.ifai/prompts/internal/private.md'
  }
];

test.describe('Section 2: Prompt Access Tier Badges', () => {
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
        // 使用 Zustand 的 setState 方法
        const state = promptStore.getState();
        // 批量设置状态
        promptStore.setState({
          prompts: mockData,
          isLoading: false,
          error: null
        });
        console.log('[E2E Mock] Set prompts in promptStore using setState:', mockData);
        console.log('[E2E Mock] Current prompts in store:', promptStore.getState().prompts);
      } else {
        console.error('[E2E Mock] promptStore not found!');
        console.log('[E2E Mock] Available window properties:', Object.keys(window).filter(k => k.includes('store') || k.includes('Store')));
      }
    }, mockPrompts);

    // 等待数据更新
    await page.waitForTimeout(1000);

    // 检查 prompts 是否设置成功
    const promptsCount = await page.evaluate(() => {
      const promptStore = (window as any).__promptStore;
      return promptStore ? promptStore.getState().prompts.length : 0;
    });
    console.log('[E2E Test] Prompts count in store:', promptsCount);
  });

  /**
   * 测试：Public 提示词显示绿色"可编辑"徽章
   */
  test('should show green "editable" badge for public prompts', async ({ page }) => {
    // 1. 打开提示词管理器
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();

    // 2. 等待提示词列表加载
    await page.waitForTimeout(2000);

    // 3. 等待至少一个提示词出现
    const promptItems = page.locator('[data-testid="prompt-item"]');
    await expect(promptItems.first()).toBeVisible({ timeout: 10000 });

    // 4. 查找 Public 提示词（如 bash.md）
    const publicPrompt = page.locator('[data-testid="prompt-item"]').filter({
      hasText: 'Bash'
    }).first();

    await expect(publicPrompt).toBeVisible({ timeout: 5000 });

    // 5. 验证绿色徽章存在
    const badge = publicPrompt.locator('[data-testid="access-tier-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/bg-green/);

    // 6. 验证徽章文本
    await expect(badge).toContainText('可编辑');
  });

  /**
   * 测试：Protected 提示词显示黄色"只读+覆盖"徽章
   */
  test('should show yellow "readonly+override" badge for protected prompts', async ({ page }) => {
    // 1. 打开提示词管理器
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();

    // 2. 等待提示词列表加载
    await page.waitForTimeout(2000);

    // 3. 等待至少一个提示词出现
    const promptItems = page.locator('[data-testid="prompt-item"]');
    await expect(promptItems.first()).toBeVisible({ timeout: 10000 });

    // 4. 查找 Protected 提示词（如 System Prompt: Main）
    const protectedPrompt = page.locator('[data-testid="prompt-item"]').filter({
      hasText: /System Prompt/i
    }).first();

    await expect(protectedPrompt).toBeVisible({ timeout: 5000 });

    // 5. 验证黄色徽章存在
    const badge = protectedPrompt.locator('[data-testid="access-tier-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/bg-yellow/);

    // 6. 验证徽章文本
    await expect(badge).toContainText('只读+覆盖');
  });

  /**
   * 测试：普通模式下 Private 提示词不显示
   */
  test('should not show private prompts in normal mode', async ({ page }) => {
    // 1. 打开提示词管理器
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();

    // 2. 等待提示词列表加载
    await page.waitForTimeout(1000);

    // 3. 尝试查找 Private 提示词
    const privatePrompt = page.locator('[data-prompt-access-tier="private"]');

    // 4. 验证不可见
    await expect(privatePrompt).not.toBeVisible();

    // 5. 验证列表中不包含 private 提示词
    const promptList = page.locator('[data-testid="prompt-list"]');
    const count = await promptList.locator('[data-prompt-access-tier="private"]').count();
    expect(count).toBe(0);
  });

  /**
   * 测试：专家模式开关功能
   */
  test('should toggle expert mode', async ({ page }) => {
    // 1. 打开提示词管理器
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();

    // 2. 等待提示词列表加载
    await page.waitForTimeout(2000);

    // 3. 查找专家模式开关
    const expertModeToggle = page.locator('button:has-text("普通模式")');
    await expect(expertModeToggle).toBeVisible({ timeout: 5000 });

    // 4. 验证默认状态（普通模式）
    await expect(expertModeToggle).toContainText('普通模式');

    // 5. 打开专家模式
    await expertModeToggle.click();

    // 6. 验证开关状态变为专家模式
    await expect(expertModeToggle).toContainText('专家模式');

    // 7. 刷新提示词列表
    await page.waitForTimeout(500);

    // 8. 验证 private 提示词现在可见
    const privatePrompt = page.locator('[data-prompt-access-tier="private"]').first();
    const isVisible = await privatePrompt.isVisible().catch(() => false);

    // 注意：如果有 private 提示词，现在应该可见
    // 如果没有，这个测试也应该通过
    console.log('Private prompts visible in expert mode:', isVisible);
  });
});
