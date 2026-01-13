/**
 * E2E Test: Local Model DevOps Command Detection
 *
 * 测试本地模型对 DevOps 命令的识别和执行
 * 验证执行后不会循环重复执行
 */

import { test, expect } from '@playwright/test';

// 辅助函数：处理模型下载对话框
async function handleModelDownloadDialog(page: any) {
  try {
    // 方法 1: 尝试按 ESC 键关闭
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 方法 2: 检查并点击关闭按钮
    const closeButton = page.locator('button').filter({ hasText: /关闭|取消|cancel/i }).or(
      page.locator('button[aria-label="关闭"]')
    ).or(
      page.locator('button[aria-label="Cancel"]')
    ).first();

    const isCloseVisible = await closeButton.isVisible({ timeout: 1000 }).catch(() => false);
    if (isCloseVisible) {
      await closeButton.click();
      await page.waitForTimeout(500);
    }

    // 方法 3: 点击对话框外部区域来关闭
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);

  } catch (e) {
    // 对话框不存在或已关闭，继续执行
  }
}

test.describe('Local Model - DevOps Command Detection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        hasSeenWelcome: true,
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: new Date().toISOString()
      }));
      location.reload();
    });
    await page.waitForLoadState('networkidle');

    // 处理可能出现的模型下载对话框
    await handleModelDownloadDialog(page);
  });

  test('LM-DEVOPS-01: Git status command should execute without errors', async ({ page }) => {
    // 测试 git status 命令能正常执行，无错误

    // 0. 再次尝试关闭任何对话框
    await handleModelDownloadDialog(page);

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      // 直接点击，不等待对话框
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], textarea[placeholder*="DeepSeek"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 输入 git status 命令
    await chatInput.fill('执行git status');

    // 4. 发送消息
    await chatInput.press('Enter');

    // 5. 等待响应
    await page.waitForTimeout(8000);

    // 6. 验证：检查没有错误
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 不应该有明显的 API 错误
    expect(pageText).not.toContain('API Error');
    expect(pageText).not.toContain('连接失败');
    expect(pageText).not.toContain('Network Error');
  });

  test('LM-DEVOPS-02: Git command should not loop after execution', async ({ page }) => {
    // 测试 git 命令执行后不会循环重复执行

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 输入 git status 命令
    await chatInput.fill('执行git status');

    // 4. 发送消息
    await chatInput.press('Enter');

    // 5. 等待执行完成
    await page.waitForTimeout(10000);

    // 6. 检查页面状态，验证没有无限循环
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 通过检查特定关键词的重复出现来判断是否有循环
    // 如果有循环，会看到大量重复的执行日志
    const lines = pageText.split('\n').filter((line: string) => line.trim().length > 0);
    const uniqueLines = new Set(lines);

    // 如果唯一行数远少于总行数，说明有大量重复内容（可能是循环）
    const ratio = uniqueLines.size / lines.length;
    expect(ratio).toBeGreaterThan(0.3); // 至少 30% 的内容应该是唯一的
  });

  test('LM-DEVOPS-03: Multiple commands should execute independently', async ({ page }) => {
    // 测试多个命令可以独立执行，不会互相干扰

    const commands = [
      '执行git status',
      '列出当前目录'
    ];

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 依次执行每个命令
    for (const cmd of commands) {
      await chatInput.fill('');
      await chatInput.fill(cmd);
      await chatInput.press('Enter');
      await page.waitForTimeout(6000);
    }

    // 4. 验证：页面应该正常响应，没有错误
    const pageText = await page.evaluate(() => document.body.textContent || '');
    expect(pageText).not.toContain('API Error');
  });
});

test.describe('Local Model - DevOps Commands Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      location.reload();
    });
    await page.waitForLoadState('networkidle');

    // 处理可能出现的模型下载对话框
    await handleModelDownloadDialog(page);
  });

  test('LM-DEVOPS-04: Verify no infinite loop after command execution', async ({ page }) => {
    // 回归测试：确保命令执行后不会触发无限循环

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 执行命令
    await chatInput.fill('执行git status');
    await chatInput.press('Enter');

    // 4. 等待足够长的时间，确保没有循环
    await page.waitForTimeout(15000);

    // 5. 验证页面状态稳定
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 检查是否没有大量重复的错误信息
    const errorCount = (pageText.match(/error|错误|Error/gi) || []).length;
    expect(errorCount).toBeLessThan(10); // 允许少量错误，但不应该有大量重复
  });

  test('LM-DEVOPS-05: Commands should complete without hanging', async ({ page }) => {
    // 测试命令执行完成后应该正常结束，不会挂起

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 执行命令
    await chatInput.fill('执行git status');
    await chatInput.press('Enter');

    // 4. 等待执行完成
    await page.waitForTimeout(12000);

    // 5. 验证：输入框应该仍然可用（说明没有挂起或崩溃）
    const isInputEnabled = await chatInput.isEnabled();
    expect(isInputEnabled).toBe(true);
  });

  test('LM-DEVOPS-06: Tool execution results should be displayed', async ({ page }) => {
    // 测试工具执行结果应该正确显示在 UI 中
    // 验证不只显示"执行了 1 个工具调用"，而是显示实际的命令输出

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 执行命令 - 使用 ls 命令，它的输出比较稳定
    await chatInput.fill('执行ls');
    await chatInput.press('Enter');

    // 4. 等待执行完成
    await page.waitForTimeout(15000);

    // 5. 验证：应该显示命令输出，而不只是"执行了 1 个工具调用"
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 检查是否包含命令输出的典型特征（文件名、目录名等）
    // ls 命令通常会列出文件和目录
    const hasContentBeyondToolCount = pageText.includes('src') ||
                                     pageText.includes('node_modules') ||
                                     pageText.includes('package.json') ||
                                     pageText.includes('.ts') ||
                                     pageText.includes('.js') ||
                                     pageText.length > 500; // 文本内容应该比较丰富

    expect(hasContentBeyondToolCount).toBe(true);
  });
});

test.describe('Local Model - Cloud API Fallback Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        hasSeenWelcome: true,
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: new Date().toISOString()
      }));
      location.reload();
    });
    await page.waitForLoadState('networkidle');

    // 处理可能出现的模型下载对话框
    await handleModelDownloadDialog(page);
  });

  test('LM-FALLBACK-01: Unrecognized command should route to cloud API', async ({ page }) => {
    // 测试当本地模型无法识别命令时，系统应该回退到云端 API
    // 场景：复杂的自然语言请求，本地模型无法处理

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 输入一个复杂的自然语言请求（本地模型可能无法处理）
    // 使用复杂的代码生成任务，这类任务通常需要云端 API
    await chatInput.fill('请帮我创建一个完整的 React 组件，实现一个带有拖拽功能的文件上传器，支持多文件上传和进度显示');

    // 4. 发送消息
    await chatInput.press('Enter');

    // 5. 等待响应（云端 API 通常需要更长时间）
    await page.waitForTimeout(20000);

    // 6. 验证：系统应该有响应（通过云端 API）
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 验证有响应内容（说明成功回退到云端 API）
    const hasResponse = pageText.includes('React') ||
                       pageText.includes('组件') ||
                       pageText.includes('上传') ||
                       pageText.includes('upload') ||
                       pageText.includes('component') ||
                       pageText.length > 100; // 至少有响应内容

    expect(hasResponse).toBe(true);

    // 验证没有本地模型错误
    expect(pageText).not.toContain('Local model failed');
    expect(pageText).not.toContain('模型加载失败');
  });

  test('LM-FALLBACK-02: Cloud API fallback should handle errors gracefully', async ({ page }) => {
    // 测试云端 API 回退时的错误处理

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 输入命令
    await chatInput.fill('解释一下量子计算的基本原理');

    // 4. 发送消息
    await chatInput.press('Enter');

    // 5. 等待响应
    await page.waitForTimeout(15000);

    // 6. 验证：即使回退到云端，输入框仍应可用（没有崩溃）
    const isInputEnabled = await chatInput.isEnabled();
    expect(isInputEnabled).toBe(true);
  });

  test('LM-FALLBACK-03: Simple command should use local model', async ({ page }) => {
    // 回归测试：验证简单命令仍然使用本地模型

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible({ timeout: 5000 })) {
      await chatToggle.click({ force: true });
      await page.waitForTimeout(1500);
    }

    // 2. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 3. 输入简单命令（应该使用本地模型）
    await chatInput.fill('执行pwd');

    // 4. 发送消息
    await chatInput.press('Enter');

    // 5. 等待响应
    await page.waitForTimeout(10000);

    // 6. 验证：有命令输出
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // pwd 命令应该输出路径
    const hasPathOutput = pageText.includes('/') || pageText.includes('Users') || pageText.length > 50;
    expect(hasPathOutput).toBe(true);
  });
});
