/**
 * E2E Test: Tool Classification System (v0.3.3)
 *
 * 测试完整的工具分类流程，包括：
 * 1. UI 交互（用户输入 → 分类显示）
 * 2. 视觉反馈（分类来源标识）
 * 3. 用户反馈循环（正确/错误标记）
 * 4. 完整工作流（分类 → 执行 → 结果）
 */

import { test, expect } from '@playwright/test';

// ============================================================================
// Helpers
// ============================================================================

/**
 * 聊天面板页面对象
 */
class ChatPanel {
  constructor(private page: Page) {}

  /**
   * 输入消息
   */
  async typeMessage(message: string) {
    await this.page.locator('[data-testid="chat-input"]').fill(message);
  }

  /**
   * 发送消息
   */
  async sendMessage() {
    await this.page.locator('[data-testid="chat-send-button"]').click();
    // 等待消息处理
    await this.page.waitForTimeout(500);
  }

  /**
   * 输入并发送消息
   */
  async typeAndSendMessage(message: string) {
    await this.typeMessage(message);
    await this.sendMessage();
  }

  /**
   * 工具分类指示器
   */
  get toolIndicator() {
    return this.page.locator('[data-testid="tool-classification-indicator"]');
  }

  /**
   * 工具执行状态
   */
  get toolExecution() {
    return this.page.locator('[data-testid="tool-execution-status"]');
  }

  /**
   * 助手消息
   */
  get assistantMessage() {
    return this.page.locator('[data-testid="assistant-message"]');
  }

  /**
   * 反馈按钮（正确）
   */
  get feedbackCorrect() {
    return this.page.locator('[data-testid="feedback-correct"]');
  }

  /**
   * 反馈按钮（错误）
   */
  get feedbackIncorrect() {
    return this.page.locator('[data-testid="feedback-incorrect"]');
  }

  /**
   * 纠正弹窗
   */
  get correctionPopup() {
    return this.page.locator('[data-testid="correction-popup"]');
  }

  /**
   * 成功消息
   */
  get successMessage() {
    return this.page.locator('[data-testid="success-toast"]');
  }
}

// ============================================================================
// Visual Feedback Tests
// ============================================================================

test.describe('Tool Classification - Visual Feedback', () => {
  test.beforeEach(async ({ page }) => {
    // 打开应用
    await page.goto('/');
    // 确保本地模型已加载（模拟）
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });
  });

  test('should show ⚡ icon for exact matches', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('/read package.json');

    // 验证分类指示器显示
    await expect(chatPanel.toolIndicator).toBeVisible();

    // 验证显示 ⚡ 图标和文本
    await expect(chatPanel.toolIndicator).toContainText('⚡');
    await expect(chatPanel.toolIndicator).toContainText('精确匹配');
  });

  test('should show 🔧 icon for rule-based matches', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('读取 README.md');

    // 验证分类指示器显示
    await expect(chatPanel.toolIndicator).toBeVisible();

    // 验证显示 🔧 图标和文本
    await expect(chatPanel.toolIndicator).toContainText('🔧');
    await expect(chatPanel.toolIndicator).toContainText('规则匹配');
  });

  test('should show 🤖 icon for LLM classification', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('分析这段代码的性能');

    // 验证分类指示器显示
    await expect(chatPanel.toolIndicator).toBeVisible();

    // 验证显示 🤖 图标和文本
    await expect(chatPanel.toolIndicator).toContainText('🤖');
    await expect(chatPanel.toolIndicator).toContainText('本地 LLM');
  });

  test('should show ☁️ icon for cloud fallback', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    // 模拟本地模型未加载
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'false');
    });

    await chatPanel.typeAndSendMessage('解释闭包的概念');

    // 验证显示 ☁️ 图标
    await expect(chatPanel.toolIndicator).toContainText('☁️');
    await expect(chatPanel.toolIndicator).toContainText('云端 API');
  });

  test('should display confidence score', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('git status');

    // 验证显示置信度（对于精确匹配应该是 100%）
    await expect(chatPanel.toolIndicator).toContainText('100%');
  });

  test('should show latency information', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('/read file.txt');

    // 验证显示延迟信息
    await expect(chatPanel.toolIndicator).toContainText('ms');
  });
});

// ============================================================================
// User Feedback Loop Tests
// ============================================================================

test.describe('Tool Classification - User Feedback Loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });
  });

  test('should show feedback buttons after classification', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('git status');

    // 等待工具执行完成
    await page.waitForTimeout(1000);

    // 验证反馈按钮显示
    await expect(chatPanel.feedbackCorrect).toBeVisible();
    await expect(chatPanel.feedbackIncorrect).toBeVisible();
  });

  test('should allow user to mark classification as correct', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('读取 package.json');

    await page.waitForTimeout(1000);

    // 点击"正确"反馈
    await chatPanel.feedbackCorrect.click();

    // 验证成功消息显示
    await expect(chatPanel.successMessage).toBeVisible();
    await expect(chatPanel.successMessage).toContainText('感谢反馈');
  });

  test('should allow user to mark classification as incorrect', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('一些查询');

    await page.waitForTimeout(1000);

    // 点击"错误"反馈
    await chatPanel.feedbackIncorrect.click();

    // 验证纠正弹窗显示
    await expect(chatPanel.correctionPopup).toBeVisible();
  });

  test('should show tool selection options in correction popup', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('test query');

    await page.waitForTimeout(1000);
    await chatPanel.feedbackIncorrect.click();

    // 验证显示工具选项
    await expect(chatPanel.correctionPopup).toContainText('file_operations');
    await expect(chatPanel.correctionPopup).toContainText('terminal_commands');
    await expect(chatPanel.correctionPopup).toContainText('code_generation');
  });

  test('should submit correction and update model', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('test query');

    await page.waitForTimeout(1000);
    await chatPanel.feedbackIncorrect.click();

    // 选择正确的分类
    await page.locator('[data-testid="correct-tool-option"]').first().click();

    // 提交纠正
    await page.locator('[data-testid="submit-correction"]').click();

    // 验证成功消息
    await expect(chatPanel.successMessage).toBeVisible();
    await expect(chatPanel.successMessage).toContainText('已记录');
  });
});

// ============================================================================
// Complete Workflow Tests
// ============================================================================

test.describe('Tool Classification - Complete Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });
  });

  test('should handle full classification → execution flow for file operations', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    // 1. 用户输入
    await chatPanel.typeAndSendMessage('读取 package.json');

    // 2. 验证分类显示
    await expect(chatPanel.toolIndicator).toBeVisible();
    await expect(chatPanel.toolIndicator).toContainText('🔧');
    await expect(chatPanel.toolIndicator).toContainText('规则匹配');
    await expect(chatPanel.toolIndicator).toContainText('file_operations');

    // 3. 验证工具执行
    await expect(chatPanel.toolExecution).toBeVisible();
    await expect(chatPanel.toolExecution).toContainText('agent_read_file');

    // 4. 验证结果显示
    await page.waitForTimeout(2000);
    await expect(chatPanel.assistantMessage).toBeVisible();
    await expect(chatPanel.assistantMessage).toContainText('package.json');
  });

  test('should handle full flow for terminal commands', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('执行 git status');

    // 验证分类
    await expect(chatPanel.toolIndicator).toContainText('terminal_commands');

    // 验证执行
    await expect(chatPanel.toolExecution).toContainText('bash');
  });

  test('should handle full flow for code generation', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    await chatPanel.typeAndSendMessage('生成一个 React 组件');

    // 验证分类（可能是 LLM）
    await expect(chatPanel.toolIndicator).toBeVisible();

    // 验证结果包含代码
    await page.waitForTimeout(3000);
    await expect(chatPanel.assistantMessage).toContainText('function');
    await expect(chatPanel.assistantMessage).toContainText('return');
  });

  test('should handle complex multi-turn conversation', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    // 第一轮：读取文件
    await chatPanel.typeAndSendMessage('读取 src/App.tsx');
    await page.waitForTimeout(2000);

    // 第二轮：分析代码
    await chatPanel.typeAndSendMessage('分析这个文件的性能');
    await page.waitForTimeout(3000);

    // 第三轮：生成优化建议
    await chatPanel.typeAndSendMessage('给出优化建议');
    await page.waitForTimeout(3000);

    // 验证所有消息都正确分类和执行
    const messages = await page.locator('[data-testid="assistant-message"]').count();
    expect(messages).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Tool Classification - Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });
  });

  test('should complete Layer 1 classification in real-time', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    const start = Date.now();
    await chatPanel.typeAndSendMessage('/read file.txt');
    await chatPanel.toolIndicator.waitFor();
    const duration = Date.now() - start;

    // 验证用户感知的延迟很小（<100ms，包括 UI 渲染）
    expect(duration).toBeLessThan(100);
  });

  test('should complete Layer 2 classification quickly', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    const start = Date.now();
    await chatPanel.typeAndSendMessage('读取配置文件');
    await chatPanel.toolIndicator.waitFor();
    const duration = Date.now() - start;

    // 验证用户感知的延迟（<200ms）
    expect(duration).toBeLessThan(200);
  });

  test('should complete Layer 3 classification acceptably', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    const start = Date.now();
    await chatPanel.typeAndSendMessage('分析代码结构');
    await chatPanel.toolIndicator.waitFor();
    const duration = Date.now() - start;

    // 验证用户感知的延迟（<500ms）
    expect(duration).toBeLessThan(500);
  });

  test('should handle rapid consecutive classifications', async ({ page }) => {
    const chatPanel = new ChatPanel(page);

    const inputs = ['/read', '查看文件', '分析代码', 'git status'];

    for (const input of inputs) {
      await chatPanel.typeAndSendMessage(input);
      await chatPanel.toolIndicator.waitFor();
    }

    // 验证所有消息都正确处理
    const messages = await page.locator('[data-testid="tool-classification-indicator"]').count();
    expect(messages).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Tool Classification - Error Handling', () => {
  test('should gracefully handle empty input', async ({ page }) => {
    await page.goto('/');
    const chatPanel = new ChatPanel(page);

    // 发送空消息（应该被阻止或给出提示）
    await chatPanel.typeMessage('');
    await chatPanel.sendMessage();

    // 验证没有错误崩溃
    await page.waitForTimeout(500);
    await expect(chatPanel.assistantMessage).not.toBeVisible();
  });

  test('should handle very long input', async ({ page }) => {
    await page.goto('/');
    const chatPanel = new ChatPanel(page);

    const longInput = '分析这段代码：\n' + 'x'.repeat(10000);

    await chatPanel.typeAndSendMessage(longInput);

    // 验证系统正常处理
    await page.waitForTimeout(1000);
    await expect(chatPanel.toolIndicator).toBeVisible();
  });

  test('should show error message when both local and cloud fail', async ({ page }) => {
    await page.goto('/');

    // 模拟网络断开和本地模型失败
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'false');
      // @ts-ignore
      window.mockNetworkError = true;
    });

    const chatPanel = new ChatPanel(page);
    await chatPanel.typeAndSendMessage('test query');

    // 验证显示错误消息
    await page.waitForTimeout(1000);
    await expect(chatPanel.assistantMessage).toContainText('无法处理');
  });

  test('should recover from temporary failures', async ({ page }) => {
    await page.goto('/');

    // 第一次请求失败
    await page.evaluate(() => {
      // @ts-ignore
      window.mockTemporaryFailure = true;
    });

    const chatPanel = new ChatPanel(page);
    await chatPanel.typeAndSendMessage('test');
    await page.waitForTimeout(1000);

    // 恢复正常
    await page.evaluate(() => {
      // @ts-ignore
      window.mockTemporaryFailure = false;
    });

    await chatPanel.typeAndSendMessage('读取文件');
    await page.waitForTimeout(1000);

    // 验证第二次请求成功
    await expect(chatPanel.toolIndicator).toBeVisible();
  });
});
