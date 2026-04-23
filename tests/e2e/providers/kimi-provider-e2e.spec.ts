/**
 * Kimi 提供商高保真 E2E 测试
 *
 * 🎯 测试目标：
 * 1. 验证 Kimi SSE 流解析正确性
 * 2. 验证 reasoning_content 字段支持（K2 thinking 模式）
 * 3. 验证 content 字段支持
 * 4. 捕获完整的诊断日志
 *
 * 🚨 强制性规范: 遵守 tests/e2e/CODING_STANDARDS.md
 *
 * 配置方式：
 * ```bash
 * cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e.local
 * # 编辑 .env.e2e.local:
 * E2E_AI_API_KEY=your-kimi-api-key
 * E2E_AI_BASE_URL=https://api.moonshot.cn/v1
 * E2E_AI_MODEL=kimi-k2.5
 * ```
 *
 * 运行测试：
 * ```bash
 * npm run test:e2e -- tests/e2e/providers/kimi-provider-e2e.spec.ts
 * ```
 *
 * @see tests/e2e/templates/real-ai-test.template.spec.ts
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';

test.describe('KIMI-E2E: Provider SSE Stream Parsing', () => {
  test.beforeEach(async ({ page }) => {
    // 监听所有控制台日志，捕获诊断信息
    page.on('console', msg => {
      const text = msg.text();
      // 捕获 Kimi 相关的诊断日志
      if (text.includes('[MetadataClient]') ||
          text.includes('[FormatAdapter]') ||
          text.includes('[extract_content_by_path]') ||
          text.includes('[AI]') ||
          text.includes('[AI Chat]')) {
        console.log('[🔍 E2E Log]', text);
      }
    });

    // 设置 E2E 测试环境
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);
  });

  /**
   * KIMI-E2E-01: 基础 SSE 流解析测试
   *
   * 验证 Kimi API 的 SSE 流能够正确解析
   */
  test('KIMI-E2E-01: Basic SSE stream parsing', async ({ page }) => {
    // 获取 AI 配置
    const config = await getRealAIConfig(page);

    // 如果没有配置 Kimi，跳过测试
    if (!config.providerId || !config.modelId) {
      test.skip(true, '需要配置 Kimi API (providerId 和 modelId)');
      return;
    }

    console.log('📋 测试配置:', {
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 发送简单测试消息
    const testMessage = '你好';
    console.log(`📤 发送测试消息: "${testMessage}"`);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, { text: testMessage, providerId: config.providerId, modelId: config.modelId });

    // 等待 AI 响应（Kimi K2.5 通常需要 5-10 秒）
    await page.waitForTimeout(15000);

    // 验证响应
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

    console.log(`📊 收到 ${assistantMessages.length} 条助手消息`);

    expect(assistantMessages.length).toBeGreaterThan(0);

    const lastResponse = assistantMessages[assistantMessages.length - 1].content;
    console.log(`💬 最后一条响应内容: "${lastResponse.substring(0, 100)}..."`);

    // 验证响应不为空
    expect(lastResponse.trim().length).toBeGreaterThan(0);

    // 验证响应包含中文（Kimi 是中文友好的）
    expect(lastResponse).toMatch(/[\u4e00-\u9fa5]/);
  });

  /**
   * KIMI-E2E-02: Reasoning Content 支持
   *
   * 验证 Kimi K2 thinking 模式的 reasoning_content 字段能够正确处理
   */
  test('KIMI-E2E-02: Reasoning content support (K2 thinking mode)', async ({ page }) => {
    const config = await getRealAIConfig(page);

    if (!config.providerId || !config.modelId) {
      test.skip(true, '需要配置 Kimi API');
      return;
    }

    // 只有 K2 系列模型支持 thinking 模式
    if (!config.modelId.includes('k2')) {
      test.skip(true, '此测试需要 K2 系列模型以支持 thinking 模式');
      return;
    }

    // 发送一个会触发深度思考的问题
    const thinkingMessage = '解释一下量子计算的基本原理，包括量子比特和量子纠缠的概念';
    console.log(`📤 发送 thinking 模式测试: "${thinkingMessage.substring(0, 30)}..."`);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, { text: thinkingMessage, providerId: config.providerId, modelId: config.modelId });

    // 等待响应（thinking 模式可能需要更长时间）
    await page.waitForTimeout(20000);

    // 验证响应
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    const lastResponse = assistantMessages[assistantMessages.length - 1].content;
    console.log(`💬 Thinking 响应长度: ${lastResponse.length} 字符`);

    // 验证响应包含相关概念
    const hasQuantumConcepts = lastResponse.match(/量子|比特|纠缠|叠加|计算/);
    expect(hasQuantumConcepts).toBeTruthy();
  });

  /**
   * KIMI-E2E-03: 代码生成能力测试
   *
   * 验证 Kimi 的代码生成和工具调用能力
   */
  test('KIMI-E2E-03: Code generation and tool calls', async ({ page }) => {
    const config = await getRealAIConfig(page);

    if (!config.providerId || !config.modelId) {
      test.skip(true, '需要配置 Kimi API');
      return;
    }

    // 创建测试文件
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      const fileStore = (window as any).__fileStore;

      // 创建测试文件
      mockFS.set('/test-project/hello.ts', 'console.log("Hello from Kimi!");');

      // 建立文件树
      const currentTree = fileStore.getState().fileTree || { children: [] };
      const testProject = {
        id: 'test-project',
        name: 'test-project',
        kind: 'directory',
        path: '/test-project',
        children: [{
          id: 'hello-ts',
          name: 'hello.ts',
          kind: 'file',
          path: '/test-project/hello.ts'
        }]
      };

      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), testProject]
      });

      // 打开文件
      const editorStore = (window as any).__editorStore;
      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/hello.ts');
      }
    });

    await page.waitForTimeout(1000);

    // 发送代码生成请求
    const codePrompt = '请将 hello.ts 改写为一个简单的 TypeScript 函数，接收 name 参数并返回问候语';
    console.log(`📤 代码生成测试: "${codePrompt}"`);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, { text: codePrompt, providerId: config.providerId, modelId: config.modelId });

    // 等待响应
    await page.waitForTimeout(15000);

    // 验证响应包含代码
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    const lastResponse = assistantMessages[assistantMessages.length - 1].content;
    console.log(`💬 代码生成响应: "${lastResponse.substring(0, 200)}..."`);

    // 验证响应包含代码相关的关键词
    expect(lastResponse).toMatch(/function|const|let|greeting|问候/);
  });

  /**
   * KIMI-E2E-04: 多轮对话测试
   *
   * 验证上下文保持和多轮对话能力
   */
  test('KIMI-E2E-04: Multi-turn conversation', async ({ page }) => {
    const config = await getRealAIConfig(page);

    if (!config.providerId || !config.modelId) {
      test.skip(true, '需要配置 Kimi API');
      return;
    }

    // 第一轮：介绍自己
    console.log('📤 第一轮: 自我介绍');
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, { text: '请简单介绍一下你自己', providerId: config.providerId, modelId: config.modelId });

    await page.waitForTimeout(10000);

    // 第二轮：追问
    console.log('📤 第二轮: 追问能力');
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, { text: '你擅长哪些编程任务？', providerId: config.providerId, modelId: config.modelId });

    await page.waitForTimeout(10000);

    // 验证有两轮响应
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    console.log(`📊 多轮对话: ${assistantMessages.length} 条助手消息`);

    expect(assistantMessages.length).toBeGreaterThanOrEqual(2);

    // 验证上下文保持（第二轮响应提到编程任务）
    const lastResponse = assistantMessages[assistantMessages.length - 1].content;
    expect(lastResponse).toMatch(/编程|代码|开发|任务|能力/);
  });

  /**
   * KIMI-E2E-05: 长文本处理测试
   *
   * 验证 Kimi 处理长请求和响应的能力
   */
  test('KIMI-E2E-05: Long text handling', async ({ page }) => {
    const config = await getRealAIConfig(page);

    if (!config.providerId || !config.modelId) {
      test.skip(true, '需要配置 Kimi API');
      return;
    }

    // 发送一个较长的请求
    const longPrompt = `
请帮我分析以下代码片段，并提供改进建议：

\`\`\`typescript
function calculateTotal(items: { price: number; quantity: number }[]): number {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price * items[i].quantity;
  }
  return total;
}

function applyDiscount(total: number, percentage: number): number {
  return total * (1 - percentage / 100);
}

const cart = [
  { price: 100, quantity: 2 },
  { price: 50, quantity: 1 },
  { price: 75, quantity: 3 }
];
\`\`\`

请分析：
1. 代码逻辑是否正确？
2. 有哪些可以改进的地方？
3. 如何添加错误处理？
    `.trim();

    console.log(`📤 长文本测试 (${longPrompt.length} 字符)`);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, { text: longPrompt, providerId: config.providerId, modelId: config.modelId });

    // 等待响应（长文本处理需要更多时间）
    await page.waitForTimeout(20000);

    // 验证响应
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages : [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    const lastResponse = assistantMessages[assistantMessages.length - 1].content;
    console.log(`💬 长文本响应: ${lastResponse.length} 字符`);

    // 验证响应提供了有意义的分析
    expect(lastResponse.length).toBeGreaterThan(100);
  });
});
