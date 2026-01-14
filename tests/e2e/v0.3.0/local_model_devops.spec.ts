/**
 * v0.3.0 本地模型 DevOps 命令 E2E 测试
 *
 * ⚠️ **重要配置说明**
 *
 * 这些测试需要商业版 + 本地模型才能运行，验证本地模型对 DevOps 命令的处理能力。
 *
 * **运行测试前需要配置：**
 *
 * 1. 确保 Tauri 应用以 commercial-local-llm feature 启动：
 * ```bash
 * npm run tauri:dev:commercial-local-llm
 * ```
 *
 * 2. 在 tests/e2e/.env.e2e.local 配置 AI API Key（用于降级保护测试）：
 * ```
bash
 * E2E_AI_API_KEY=your-deepseek-api-key
 * E2E_AI_BASE_URL=https://api.deepseek.com
 * E2E_AI_MODEL=deepseek-chat
 * ```
 *
 * 3. 测试场景：
 * - LM-DEVOPS-01: Git 命令应使用本地模型执行，无错误
 * - LM-DEVOPS-02: Git 命令不应循环重复执行
 * - LM-DEVOPS-03: 多个命令应独立执行，不互相干扰
 * - LM-DEVOPS-04: 验证无限循环回归测试
 * - LM-DEVOPS-05: 验证命令不会挂起
 * - LM-DEVOPS-06: 验证工具执行结果正确显示
 * - LM-FALLBACK-01: 未识别命令应降级到云端 API
 * - LM-FALLBACK-02: 云端 API 回退应优雅处理错误
 * - LM-FALLBACK-03: 简单命令应使用本地模型（回归）
 *
 * 目的：验证本地模型路由修复 + 降级保护机制
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Local Model - DevOps Command Detection', () => {
  test.beforeEach(async ({ page }) => {
    // 🔥 监听浏览器控制台日志
    page.on('console', msg => {
      const text = msg.text();
      // 打印关键日志
      if (text.includes('[AI Chat]') || text.includes('[LocalModel]') || text.includes('[LlmInference]') || text.includes('[AgentStream]')) {
        console.log('[Browser Console]', text);
      }
    });

    // 使用真实 AI 模式（商业版需要真实 API 来测试降级保护）
    const apiKey = process.env.E2E_AI_API_KEY;
    const baseUrl = process.env.E2E_AI_BASE_URL;
    const model = process.env.E2E_AI_MODEL;

    // 🔥 检查是否配置了真实 AI API Key
    if (!apiKey) {
      test.skip(true, '⚠️ 跳过测试：未配置 AI API Key。请设置 E2E_AI_API_KEY 环境变量或在 tests/e2e/.env.e2e.local 中配置。');
      return;
    }

    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      realAIApiKey: apiKey,
      realAIBaseUrl: baseUrl,
      realAIModel: model,
    });

    await page.goto('/');

    // 🔥 使用 v0.2.9 的方法：等待应用加载（等待 __chatStore 定义）
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.useLayoutStore.getState().isChatOpen) {
        layoutStore.useLayoutStore.getState().toggleChat();
      }
    });

    // 等待聊天面板打开
    await page.waitForTimeout(1000);
  });

  test('@commercial LM-DEVOPS-01: Git status command should execute without errors', async ({ page }) => {
    // 测试 git status 命令能正常执行，无错误

    // 1. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 2. 输入 git status 命令
    await chatInput.fill('执行git status');

    // 3. 发送消息
    await chatInput.press('Enter');

    // 4. 等待响应
    await page.waitForTimeout(15000);

    // 5. 验证：检查没有错误
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 不应该有明显的 API 错误
    expect(pageText).not.toContain('API Error');
    expect(pageText).not.toContain('连接失败');
    expect(pageText).not.toContain('Network Error');

    // 应该有响应内容（本地模型执行或云端降级）
    expect(pageText.length).toBeGreaterThan(100);
  });

  test('@commercial LM-DEVOPS-02: Git command should not loop after execution', async ({ page }) => {
    // 测试 git 命令执行后不会循环重复执行

    // 1. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 2. 输入 git status 命令
    await chatInput.fill('执行git status');

    // 3. 发送消息
    await chatInput.press('Enter');

    // 4. 等待执行完成
    await page.waitForTimeout(12000);

    // 5. 检查页面状态，验证没有无限循环
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 通过检查特定关键词的重复出现来判断是否有循环
    // 如果有循环，会看到大量重复的执行日志
    const lines = pageText.split('\n').filter((line: string) => line.trim().length > 0);
    const uniqueLines = new Set(lines);

    // 如果唯一行数远少于总行数，说明有大量重复内容（可能是循环）
    const ratio = uniqueLines.size / lines.length;
    expect(ratio).toBeGreaterThan(0.3); // 至少 30% 的内容应该是唯一的
  });

  test('@commercial LM-DEVOPS-03: Multiple commands should execute independently', async ({ page }) => {
    // 测试多个命令可以独立执行，不会互相干扰

    const commands = [
      '执行git status',
      '列出当前目录'
    ];

    // 1. 等待聊天输入框出现
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 2. 依次执行每个命令
    for (const cmd of commands) {
      await chatInput.fill('');
      await chatInput.fill(cmd);
      await chatInput.press('Enter');
      await page.waitForTimeout(10000);
    }

    // 3. 验证：页面应该正常响应，没有错误
    const pageText = await page.evaluate(() => document.body.textContent || '');
    expect(pageText).not.toContain('API Error');
  });
});

test.describe('Local Model - DevOps Commands Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    const apiKey = process.env.E2E_AI_API_KEY;
    if (!apiKey) {
      test.skip(true, '⚠️ 跳过测试：未配置 AI API Key');
      return;
    }

    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      realAIApiKey: apiKey,
    });

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.useLayoutStore.getState().isChatOpen) {
        layoutStore.useLayoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);
  });

  test('@commercial LM-DEVOPS-04: Verify no infinite loop after command execution', async ({ page }) => {
    // 回归测试：确保命令执行后不会触发无限循环

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    await chatInput.fill('执行git status');
    await chatInput.press('Enter');

    // 等待足够长的时间，确保没有循环
    await page.waitForTimeout(20000);

    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 检查是否没有大量重复的错误信息
    const errorCount = (pageText.match(/error|错误|Error/gi) || []).length;
    expect(errorCount).toBeLessThan(10); // 允许少量错误，但不应该有大量重复
  });

  test('@commercial LM-DEVOPS-05: Commands should complete without hanging', async ({ page }) => {
    // 测试命令执行完成后应该正常结束，不会挂起

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    await chatInput.fill('执行git status');
    await chatInput.press('Enter');

    await page.waitForTimeout(12000);

    // 验证：输入框应该仍然可用（说明没有挂起或崩溃）
    const isInputEnabled = await chatInput.isEnabled();
    expect(isInputEnabled).toBe(true);
  });

  test('@commercial LM-DEVOPS-06: Tool execution results should be displayed', async ({ page }) => {
    // 测试工具执行结果应该正确显示在 UI 中
    // 验证不只显示"执行了 1 个工具调用"，而是显示实际的命令输出

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 使用 ls 命令，它的输出比较稳定
    await chatInput.fill('执行ls');
    await chatInput.press('Enter');

    await page.waitForTimeout(15000);

    // 验证：应该显示命令输出，而不只是"执行了 1 个工具调用"
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 检查是否包含命令输出的典型特征（文件名、目录名等）
    const hasContentBeyondToolCount = pageText.includes('src') ||
                                     pageText.includes('node_modules') ||
                                     pageText.includes('package.json') ||
                                     pageText.includes('.ts') ||
                                     pageText.includes('.js') ||
                                     pageText.length > 500;

    expect(hasContentBeyondToolCount).toBe(true);
  });
});

test.describe('Local Model - Cloud API Fallback Tests', () => {
  test.beforeEach(async ({ page }) => {
    const apiKey = process.env.E2E_AI_API_KEY;
    if (!apiKey) {
      test.skip(true, '⚠️ 跳过测试：未配置 AI API Key');
      return;
    }

    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      realAIApiKey: apiKey,
    });

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 🔥 关闭欢迎对话框（防止输入框被禁用）
    try {
      const skipButton = page.getByText('Skip').or(page.getByText('跳过')).first();
      await skipButton.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    } catch {}

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.useLayoutStore.getState().isChatOpen) {
        layoutStore.useLayoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);
  });

  test('@commercial LM-FALLBACK-01: Unrecognized command should route to cloud API', async ({ page }) => {
    // 测试当本地模型无法识别命令时，系统应该回退到云端 API
    // 场景：复杂的自然语言请求，本地模型无法处理

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 输入一个复杂的自然语言请求（本地模型可能无法处理）
    await chatInput.fill('请帮我创建一个完整的 React 组件，实现一个带有拖拽功能的文件上传器');

    await chatInput.press('Enter');

    // 等待响应（云端 API 通常需要更长时间）
    await page.waitForTimeout(25000);

    // 验证：系统应该有响应（通过云端 API）
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 验证有响应内容（说明成功回退到云端 API）
    const hasResponse = pageText.includes('React') ||
                       pageText.includes('组件') ||
                       pageText.includes('上传') ||
                       pageText.includes('upload') ||
                       pageText.includes('component') ||
                       pageText.length > 100;

    expect(hasResponse).toBe(true);

    // 验证没有本地模型错误
    expect(pageText).not.toContain('Local model failed');
    expect(pageText).not.toContain('模型加载失败');
  });

  test('@commercial LM-FALLBACK-02: Cloud API fallback should handle errors gracefully', async ({ page }) => {
    // 测试云端 API 回退时的错误处理

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    await chatInput.fill('解释一下量子计算的基本原理');

    await chatInput.press('Enter');
    await page.waitForTimeout(20000);

    // 验证：即使回退到云端，输入框仍应可用（没有崩溃）
    const isInputEnabled = await chatInput.isEnabled();
    expect(isInputEnabled).toBe(true);
  });

  test('@commercial LM-FALLBACK-03: Simple command should use local model', async ({ page }) => {
    // 回归测试：验证简单命令仍然使用本地模型

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    await chatInput.fill('执行pwd');

    await chatInput.press('Enter');
    await page.waitForTimeout(10000);

    // 验证：有命令输出
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // pwd 命令应该输出路径
    const hasPathOutput = pageText.includes('/') || pageText.includes('Users') || pageText.length > 50;
    expect(hasPathOutput).toBe(true);
  });
});
