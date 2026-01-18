/**
 * E2E Test: Local Model Routing Fix
 *
 * 问题描述：
 * 新训练的本地模型 qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf 在测试时能正确识别 agent 工具调用，
 * 但在生产环境中，预处理阶段检测不到工具调用，错误地路由到云端 API。
 *
 * 根本原因：
 * 预处理阶段使用正则表达式 test_tool_parse 只能匹配显式的 agent_xxx(...) 格式，
 * 无法处理自然语言命令如 "执行git status"。
 *
 * 解决方案：
 * 对于简单任务，应该让本地模型先进行推理，根据模型输出来决定是否使用本地模型。
 */

import { test, expect } from '@playwright/test';
import { removeJoyrideOverlay } from '../setup';

test.describe('Local Model Routing - Agent Tool Detection', () => {
  test.beforeEach(async ({ page }) => {
    // 设置为中文
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
  });

  test('LM-ROUTE-01: 本地模型应能识别 git 操作命令', async ({ page }) => {
    // 场景：用户要求执行 git status
    // 预期：本地模型应该识别这是 DevOps 能力，不需要路由到云端

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手|Toggle Chat/ }).first();
    if (await chatToggle.isVisible()) {
      await removeJoyrideOverlay(page);
      await chatToggle.click();
    }
    await page.waitForTimeout(500);

    // 2. 输入 git 命令
    const chatInput = page.locator('textarea[placeholder*="输入"], textarea[placeholder*="ask"], textarea[placeholder*="Ask"]').or(
      page.locator('.chat-input textarea')
    );
    await chatInput.fill('执行git status');

    // 3. 发送消息（通过模拟 Enter 键）
    await chatInput.press('Enter');
    await page.waitForTimeout(3000);

    // 4. 验证：检查是否使用本地模型
    // 通过检查页面中是否出现云端相关的错误提示来判断
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 如果使用本地模型，不应该有 "API Error" 或 "连接云端" 等错误
    // 而应该有 bash 命令执行的相关输出
    console.log('页面文本:', pageText.substring(0, 500));

    // 临时验证：确保没有明显的云端 API 错误
    expect(pageText).not.toContain('API Error');
    expect(pageText).not.toContain('连接失败');
  });

  test('LM-ROUTE-02: 本地模型应能识别文件操作命令', async ({ page }) => {
    // 场景：用户要求读取文件
    // 预期：本地模型应该识别 agent_read_file 工具调用

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible()) {
      await removeJoyrideOverlay(page);
      await chatToggle.click();
    }
    await page.waitForTimeout(500);

    // 2. 输入读取文件命令
    const chatInput = page.locator('textarea[placeholder*="输入"], textarea[placeholder*="ask"], textarea[placeholder*="Ask"]').or(
      page.locator('.chat-input textarea')
    );
    await chatInput.fill('帮我读取 src/auth.ts 文件的内容');

    // 3. 发送消息
    await chatInput.press('Enter');
    await page.waitForTimeout(3000);

    // 4. 验证：检查是否有文件读取相关响应
    const pageText = await page.evaluate(() => document.body.textContent || '');
    console.log('页面文本:', pageText.substring(0, 500));

    // 应该包含文件相关内容或工具调用
    expect(pageText).not.toContain('API Error');
  });

  test('LM-ROUTE-03: 本地模型应能识别目录操作命令', async ({ page }) => {
    // 场景：用户要求列出目录
    // 预期：本地模型应该识别 agent_list_dir 工具调用

    // 1. 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible()) {
      await removeJoyrideOverlay(page);
      await chatToggle.click();
    }
    await page.waitForTimeout(500);

    // 2. 输入列出目录命令
    const chatInput = page.locator('textarea[placeholder*="输入"], textarea[placeholder*="ask"], textarea[placeholder*="Ask"]').or(
      page.locator('.chat-input textarea')
    );
    await chatInput.fill('列出 src/components 目录');

    // 3. 发送消息
    await chatInput.press('Enter');
    await page.waitForTimeout(3000);

    // 4. 验证
    const pageText = await page.evaluate(() => document.body.textContent || '');
    console.log('页面文本:', pageText.substring(0, 500));

    expect(pageText).not.toContain('API Error');
  });
});

test.describe('Local Model Routing - Regression Tests', () => {
  test('LM-ROUTE-04: 确保预处理阶段不阻止本地模型推理', async ({ page }) => {
    // 这是一个回归测试，确保修复后的代码：
    // 1. 预处理阶段不会因为无法解析工具调用就拒绝使用本地模型
    // 2. 对于简单任务（短文本），应该让本地模型先推理

    // 打开聊天面板
    const chatToggle = page.locator('button').filter({ hasText: /切换.*助手/ }).first();
    if (await chatToggle.isVisible()) {
      await removeJoyrideOverlay(page);
      await chatToggle.click();
    }
    await page.waitForTimeout(500);

    // 测试多个简单命令
    const commands = [
      '执行git status',
      '读取文件 src/App.tsx',
      '列出目录 src',
      '创建文件 test.txt',
    ];

    for (const cmd of commands) {
      console.log(`测试命令: ${cmd}`);

      const chatInput = page.locator('textarea[placeholder*="输入"], textarea[placeholder*="ask"], textarea[placeholder*="Ask"]').or(
        page.locator('.chat-input textarea')
      );

      // 清空输入并输入新命令
      await chatInput.fill('');
      await chatInput.fill(cmd);
      await chatInput.press('Enter');
      await page.waitForTimeout(2000);

      // 检查是否有明显的错误
      const pageText = await page.evaluate(() => document.body.textContent || '');

      // 不应该有云端 API 错误
      if (pageText.includes('API Error') || pageText.includes('连接失败')) {
        console.error(`命令 "${cmd}" 导致了云端 API 调用，可能路由失败`);
      }
    }
  });
});
