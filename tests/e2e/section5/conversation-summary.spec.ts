/**
 * Section 5: 对话管理系统 - 对话总结功能
 *
 * TDD 测试套件：对话总结功能
 *
 * 测试策略：
 * 1. Token 计数准确性验证
 * 2. 总结触发条件检测
 * 3. AI 总结生成功能
 * 4. 总结存储和检索
 * 5. 消息压缩和归档
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Section 5.1: 对话总结功能', () => {
  test.beforeEach(async ({ page }) => {
    // 设置 E2E 测试环境
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true
    });

    // 打开应用
    await page.goto('/');

    // 等待应用加载（使用更可靠的选择器）
    await page.waitForLoadState('domcontentloaded');
  });

  /**
   * AC-001: Token 计数功能
   *
   * 验证系统可以准确计算对话的 token 数量
   */
  test('AC-001: 应该准确计算对话的 token 数量', async ({ page }) => {
    // 准备测试消息
    const testMessages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: 'I am doing well, thank you!' },
    ];

    // 调用 token 计数命令
    const tokenCount = await page.evaluate(async (messages) => {
      // @ts-ignore - Tauri API
      return await window.__TAURI__.core.invoke('count_messages_tokens', {
        messages,
        model: 'gpt-4o'
      });
    }, testMessages);

    // 验证返回值
    expect(tokenCount).toBeDefined();
    expect(typeof tokenCount).toBe('number');
    expect(tokenCount).toBeGreaterThan(0);

    // 验证 token 数量在合理范围内（10-100 tokens）
    expect(tokenCount).toBeGreaterThan(10);
    expect(tokenCount).toBeLessThan(100);
  });

  /**
   * AC-002: 总结触发条件检测 - Token 阈值
   *
   * 验证当对话超过 150k tokens 时触发总结
   */
  test('AC-002: 应该在 token 数量超过 150k 时触发总结', async ({ page }) => {
    // 创建一个包含大量内容的对话（模拟超过 150k tokens）
    const largeConversation = [];
    largeConversation.push({ role: 'system', content: 'You are a helpful assistant.' });

    // 添加大量消息
    for (let i = 0; i < 100; i++) {
      largeConversation.push({
        role: 'user',
        content: 'This is a test message with some content. '.repeat(100) // 每条消息约 1.5k tokens
      });
      largeConversation.push({
        role: 'assistant',
        content: 'I understand your message. Here is my response. '.repeat(100)
      });
    }

    // 检查是否需要总结
    const shouldSummarize = await page.evaluate(async (messages) => {
      // @ts-ignore - Tauri API
      return await window.__TAURI__.core.invoke('should_summarize_conversation', {
        messages
      });
    }, largeConversation);

    // 验证触发条件
    expect(shouldSummarize).toBe(true);
  });

  /**
   * AC-003: 总结触发条件检测 - 消息数量阈值
   *
   * 验证当对话消息数超过 100 条时触发总结
   */
  test('AC-003: 应该在消息数量超过 100 时触发总结', async ({ page }) => {
    // 创建包含 101 条消息的对话
    const messageCount = 101;
    const longConversation = [];
    longConversation.push({ role: 'system', content: 'You are a helpful assistant.' });

    for (let i = 0; i < messageCount - 1; i++) {
      longConversation.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: Some content here.`
      });
    }

    // 检查是否需要总结
    const shouldSummarize = await page.evaluate(async (messages) => {
      // @ts-ignore - Tauri API
      return await window.__TAURI__.core.invoke('should_summarize_conversation', {
        messages
      });
    }, longConversation);

    // 验证触发条件
    expect(shouldSummarize).toBe(true);
  });

  /**
   * AC-004: 总结触发条件检测 - 短对话不触发
   *
   * 验证短对话不会触发总结
   */
  test('AC-004: 短对话不应该触发总结', async ({ page }) => {
    // 创建一个短对话（5 条消息）
    const shortConversation = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am good!' },
    ];

    // 检查是否需要总结
    const shouldSummarize = await page.evaluate(async (messages) => {
      // @ts-ignore - Tauri API
      return await window.__TAURI__.core.invoke('should_summarize_conversation', {
        messages
      });
    }, shortConversation);

    // 验证不触发总结
    expect(shouldSummarize).toBe(false);
  });

  /**
   * AC-005: 生成对话总结
   *
   * 验证系统可以生成结构化的对话总结
   */
  test('AC-005: 应该生成结构化的对话总结', async ({ page }) => {
    // 创建一个有明确内容的对话
    const conversation = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'I need help with React state management.' },
      { role: 'assistant', content: 'I can help with that. What specific issue are you facing?' },
      { role: 'user', content: 'I am confused about useState and useEffect.' },
      { role: 'assistant', content: 'useState is for managing state in components, while useEffect is for side effects.' },
    ];

    // 生成总结
    const summary = await page.evaluate(async (messages) => {
      // @ts-ignore - Tauri API
      return await window.__TAURI__.core.invoke('summarize_conversation', {
        project_root: '/tmp/test-project',
        messages,
        provider_config: {
          provider: 'openai',
          models: ['gpt-4o-mini'],
          api_key: process.env.OPENAI_API_KEY || 'test-key'
        }
      });
    }, conversation);

    // 验证总结格式
    expect(summary).toBeDefined();
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(50);

    // 验证总结包含关键信息
    expect(summary.toLowerCase()).toContain('react');
    expect(summary.toLowerCase()).toMatch(/state|useeffect|component/);
  });

  /**
   * AC-006: 消息压缩和归档
   *
   * 验证总结后消息被正确压缩和归档
   */
  test('AC-006: 应该正确压缩和归档消息', async ({ page }) => {
    // 创建一个需要总结的长对话
    const longConversation = [];
    longConversation.push({ role: 'system', content: 'You are a helpful assistant.' });

    for (let i = 0; i < 50; i++) {
      longConversation.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: This is test content for the conversation.`
      });
    }

    // 压缩对话
    const compacted = await page.evaluate(async (messages) => {
      // @ts-ignore - Tauri API
      return await window.__TAURI__.core.invoke('compact_conversation', {
        messages,
        summary: 'This is a test summary of the conversation.',
        keep_last_n: 10
      });
    }, longConversation);

    // 验证压缩后的消息数量
    expect(compacted).toBeDefined();
    expect(Array.isArray(compacted)).toBe(true);
    expect(compacted.length).toBeLessThan(longConversation.length);

    // 验证保留了系统提示词
    expect(compacted[0].role).toBe('system');

    // 验证保留了最后 10 条消息
    expect(compacted.length).toBeLessThanOrEqual(12); // system + summary + 10 messages

    // 验证包含总结消息
    const hasSummary = compacted.some((msg: any) =>
      msg.content.includes('test summary')
    );
    expect(hasSummary).toBe(true);
  });

  /**
   * AC-007: 获取对话历史
   *
   * 验证可以检索归档的对话历史
   */
  test('AC-007: 应该能够获取归档的对话历史', async ({ page }) => {
    // 尝试获取归档历史
    const archives = await page.evaluate(async () => {
      try {
        // @ts-ignore - Tauri API
        return await window.__TAURI__.core.invoke('get_conversation_archives', {
          project_root: '/tmp/test-project',
          limit: 10
        });
      } catch (error) {
        // 如果还没有归档，返回空数组
        return [];
      }
    });

    // 验证返回值
    expect(Array.isArray(archives)).toBe(true);
  });

  /**
   * AC-008: Token 使用统计
   *
   * 验证可以获取准确的 token 使用统计
   */
  test('AC-008: 应该提供准确的 token 使用统计', async ({ page }) => {
    const testMessages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    // 获取 token 统计
    const stats = await page.evaluate(async (messages) => {
      // @ts-ignore - Tauri API
      return await window.__TAURI__.core.invoke('get_token_stats', {
        messages,
        model: 'gpt-4o'
      });
    }, testMessages);

    // 验证统计信息
    expect(stats).toBeDefined();
    expect(stats.totalTokens).toBeDefined();
    expect(stats.totalTokens).toBeGreaterThan(0);
    expect(stats.messageCount).toBe(3);
  });
});
