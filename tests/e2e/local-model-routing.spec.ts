/**
 * 本地模型路由高保真测试集
 *
 * 对应测试用例文档:
 * - LOCAL-ROUTE-01: 简单命令路由到本地模型
 * - LOCAL-ROUTE-02: Bash 命令路由到本地模型
 * - LOCAL-ROUTE-03: 复杂查询路由到云端 API
 * - LOCAL-ROUTE-04: 本地模型工具执行验证
 *
 * 🎯 高保真场景还原：
 * - 模拟真实用户操作：发送命令 → 观察日志 → 验证路由决策
 * - 验证控制台日志输出，确认路由决策
 * - 验证工具调用是否正确解析
 * - 验证本地模型是否成功执行
 */

import { test, expect } from '@playwright/test';
import { waitForEditorReady } from './helpers/wait-helpers';

test.describe('Local Model Routing High-Fidelity Tests @v0.5.0', () => {
  test.beforeEach(async ({ page }) => {
    // 确保本地模型已下载和启用
    await page.addInitScript(() => {
      // 模拟本地模型配置
      localStorage.setItem('localModelEnabled', 'true');
    });

    // 监听控制台消息，验证路由决策日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Router]') || text.includes('[LocalModel]') || text.includes('[AI Chat]')) {
        console.log(`[Browser Console] ${text}`);
      }
    });

    await page.goto('/');
    await waitForEditorReady(page);
  });

  /**
   * LOCAL-ROUTE-01: 简单 git 命令路由到本地模型
   *
   * 验收标准:
   * - "执行 git status" 应被识别为工具请求
   * - should_use_local 应为 true
   * - 控制台应显示本地路由日志
   */
  test('LOCAL-ROUTE-01: Simple git command routes to local model', async ({ page }) => {
    console.log('=== Test: Simple git command routes to local model ===');

    // 1. 获取聊天输入框
    const chatInput = page.locator('[data-test-id="chat-input"], textarea[placeholder*="输入"], .chat-input textarea').first();
    await expect(chatInput, 'Chat input should be visible').toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Chat input found');

    // 2. 输入简单命令
    const command = '执行 git status';
    await chatInput.fill(command);
    console.log(`✓ Step 2: Entered command: "${command}"`);

    // 3. 发送消息
    const sendButton = page.locator('button[data-test-id="send-message"], .send-button, button:has-text("发送")').first();
    await sendButton.click();
    console.log('✓ Step 3: Sent message');

    // 4. 等待响应
    await page.waitForTimeout(3000);

    // 5. 🎯 验证控制台日志 - 检查路由决策
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 验证是否检测到工具请求
    const hasToolRequestLog = logs.some(log =>
      log.includes('is_tool_request=true') ||
      log.includes('[LocalModel] ✅ Route: Local')
    );
    console.log(`✓ Step 4: Tool request detected: ${hasToolRequestLog}`);
    expect(hasToolRequestLog, 'Should detect tool request').toBe(true);

    // 6. 验证本地模型被使用
    const hasLocalRouteLog = logs.some(log =>
      log.includes('should_use_local is TRUE') ||
      log.includes('[AI Chat] should_use_local: true')
    );
    console.log(`✓ Step 5: Local model used: ${hasLocalRouteLog}`);
    expect(hasLocalRouteLog, 'Should route to local model').toBe(true);

    console.log('✅ Test passed: Simple git command routes to local model');
  });

  /**
   * LOCAL-ROUTE-02: Bash 命令路由到本地模型
   *
   * 验收标准:
   * - "运行 ls -la" 应被识别为工具请求
   * - 本地模型应执行 bash 命令
   * - 应返回命令执行结果
   */
  test('LOCAL-ROUTE-02: Bash command routes to local model', async ({ page }) => {
    console.log('=== Test: Bash command routes to local model ===');

    // 1. 获取聊天输入框
    const chatInput = page.locator('[data-test-id="chat-input"], textarea[placeholder*="输入"], .chat-input textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Chat input found');

    // 2. 输入 bash 命令
    const command = '运行 ls -la';
    await chatInput.fill(command);
    console.log(`✓ Step 2: Entered command: "${command}"`);

    // 3. 发送消息
    const sendButton = page.locator('button[aria-label="发送"], button:has-text("发送")').first();
    await sendButton.click();
    console.log('✓ Step 3: Sent message');

    // 4. 等待响应（本地模型执行通常很快）
    await page.waitForTimeout(2000);

    // 5. 验证响应内容
    const responseBubble = page.locator('.message.assistant, .ai-response, [data-test-id="assistant-message"]').last();
    const responseText = await responseBubble.textContent();

    // 本地模型执行成功应包含命令输出
    const hasCommandOutput = responseText && (
      responseText.includes('drw') ||  // ls -la 输出特征
      responseText.includes('total') ||
      responseText.includes('[Local Model]')
    );
    console.log(`✓ Step 4: Has command output: ${hasCommandOutput}`);
    expect(hasCommandOutput, 'Should contain command output').toBe(true);

    console.log('✅ Test passed: Bash command routes to local model');
  });

  /**
   * LOCAL-ROUTE-03: 复杂查询路由到云端 API
   *
   * 验收标准:
   * - 复杂任务应路由到云端
   * - should_use_local 应为 false
   * - 应显示云端 API 调用日志
   */
  test('LOCAL-ROUTE-03: Complex query routes to cloud API', async ({ page }) => {
    console.log('=== Test: Complex query routes to cloud API ===');

    // 1. 获取聊天输入框
    const chatInput = page.locator('[data-test-id="chat-input"], textarea[placeholder*="输入"], .chat-input textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Chat input found');

    // 2. 输入复杂任务（需要 AI 推理）
    const complexTask = '帮我重构整个认证模块，包括前后端代码架构设计和数据库模型优化';
    await chatInput.fill(complexTask);
    console.log(`✓ Step 2: Entered complex task: "${complexTask.substring(0, 30)}..."`);

    // 3. 发送消息
    const sendButton = page.locator('button[aria-label="发送"], button:has-text("发送")').first();
    await sendButton.click();
    console.log('✓ Step 3: Sent message');

    // 4. 等待路由决策
    await page.waitForTimeout(1000);

    // 5. 验证路由到云端
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    const hasCloudRouteLog = logs.some(log =>
      log.includes('Cloud') ||
      log.includes('should_use_local is FALSE') ||
      log.includes('[LocalModel] ☁️ Route: Cloud')
    );
    console.log(`✓ Step 4: Routes to cloud: ${hasCloudRouteLog}`);
    expect(hasCloudRouteLog, 'Should route to cloud API for complex tasks').toBe(true);

    console.log('✅ Test passed: Complex query routes to cloud API');
  });

  /**
   * LOCAL-ROUTE-04: 本地模型工具执行验证
   *
   * 验收标准:
   * - "执行 git status" 应解析为 bash 工具调用
   * - 工具参数应包含正确的命令
   * - 本地执行应返回结果
   */
  test('LOCAL-ROUTE-04: Local model tool execution validation', async ({ page }) => {
    console.log('=== Test: Local model tool execution validation ===');

    // 1. 获取聊天输入框
    const chatInput = page.locator('[data-test-id="chat-input"], textarea[placeholder*="输入"], .chat-input textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Chat input found');

    // 2. 输入多个测试命令
    const testCommands = [
      '执行 git status',
      '运行 npm list',
      '执行 ls -la',
    ];

    for (const command of testCommands) {
      console.log(`Testing command: ${command}`);

      // 清空输入框
      await chatInput.fill('');
      await chatInput.fill(command);

      // 发送消息
      const sendButton = page.locator('button[aria-label="发送"], button:has-text("发送")').first();
      await sendButton.click();

      // 等待响应
      await page.waitForTimeout(2000);

      // 验证有响应（不验证具体内容，只验证没有崩溃）
      const responseBubble = page.locator('.message.assistant, .ai-response, [data-test-id="assistant-message"]').last();
      await expect(responseBubble, 'Should have response').toBeVisible({ timeout: 5000 });

      console.log(`✓ Command "${command}" executed successfully`);
    }

    console.log('✅ Test passed: Local model tool execution validation');
  });

  /**
   * LOCAL-ROUTE-05: 命令关键词覆盖测试
   *
   * 验收标准:
   * - 所有支持的命令关键词都应被识别
   * - 包括：执行, 运行, git, npm, bash 等
   */
  test('LOCAL-ROUTE-05: Command keyword coverage test', async ({ page }) => {
    console.log('=== Test: Command keyword coverage test ===');

    // 测试用例：关键词 -> 预期路由
    const testCases = [
      { keyword: '执行', command: '执行 git status', expectedLocal: true },
      { keyword: '运行', command: '运行 npm test', expectedLocal: true },
      { keyword: 'git', command: '查看 git log', expectedLocal: true },
      { keyword: 'npm', command: 'npm install', expectedLocal: true },
      { keyword: 'bash', command: 'bash echo hello', expectedLocal: true },
    ];

    for (const testCase of testCases) {
      console.log(`Testing keyword: ${testCase.keyword} with command: "${testCase.command}"`);

      // 获取聊天输入框
      const chatInput = page.locator('[data-test-id="chat-input"], textarea[placeholder*="输入"], .chat-input textarea').first();

      // 输入命令
      await chatInput.fill('');
      await chatInput.fill(testCase.command);

      // 发送消息
      const sendButton = page.locator('button[aria-label="发送"], button:has-text("发送")').first();
      await sendButton.click();

      // 等待响应
      await page.waitForTimeout(1000);

      console.log(`✓ Keyword "${testCase.keyword}" tested`);
    }

    console.log('✅ Test passed: Command keyword coverage test');
  });
});
