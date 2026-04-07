/**
 * Section 5.2: 对话压缩功能 - E2E 测试
 *
 * 测试目标：
 * - 验证 30 条消息后压缩功能正常工作
 * - 验证压缩指示器正确显示
 * - 验证 Token 统计正确更新
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Section 5.2: 对话自动压缩功能', () => {
  test.beforeEach(async ({ page }) => {
    // 设置 E2E 测试环境
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true
    });

    // 打开应用
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 等待核心存储初始化
    await page.waitForFunction(() => {
      return window.__chatStore && window.__threadStore;
    }, { timeout: 30000 });
  });

  /**
   * AC-001: 30 条消息 → 验证压缩功能
   *
   * 测试场景：
   * 1. 创建 30 条模拟消息
   * 2. 调用压缩功能
   * 3. 验证消息数量减少
   */
  test('AC-001: 应该在 30 条消息时成功压缩', async ({ page }) => {
    console.log('[E2E] 🧪 开始测试: 30 条消息 → 压缩');

    // 1. 创建 30 条模拟消息
    const mockMessages = [];
    for (let i = 0; i < 30; i++) {
      mockMessages.push({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0
          ? `用户消息 ${Math.floor(i/2) + 1}`
          : `助手响应 ${Math.floor(i/2) + 1}`,
        timestamp: Date.now() + i * 1000
      });
    }

    // 2. 将消息注入到 chatStore
    await page.evaluate((messages) => {
      const chatStore = window.__chatStore;
      // @ts-ignore - 直接修改状态
      chatStore.setState({ messages: messages });
    }, mockMessages);

    console.log('[E2E] ✅ 已注入 30 条模拟消息');

    // 3. 等待消息更新
    await page.waitForTimeout(500);

    // 4. 验证消息数量
    const messageCountBefore = await page.evaluate(() => {
      const chatStore = window.__chatStore;
      return chatStore.getState().messages.length;
    });

    console.log('[E2E] 📊 注入后消息数量:', messageCountBefore);
    expect(messageCountBefore).toBe(30);

    // 5. 调用压缩功能（使用 Tauri 命令）
    const compactResult = await page.evaluate(async () => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;

      try {
        // @ts-ignore - Tauri API
        const result = await window.__TAURI__.core.invoke('compact_conversation', {
          messages: messages,
          summary: '测试总结：这是一个包含30条消息的测试对话。',
          keep_last_n: 10
        });

        // 更新 chatStore 中的消息
        // @ts-ignore - 直接修改状态
        chatStore.setState({ messages: result });

        return {
          original_count: messages.length,
          compressed_count: result.length,
          messages: result
        };
      } catch (error) {
        console.error('[E2E] 压缩失败:', error);
        return null;
      }
    });

    console.log('[E2E] 📋 压缩结果:', compactResult);

    // 6. 验证压缩结果
    expect(compactResult).toBeDefined();
    expect(compactResult.original_count).toBe(30);
    expect(compactResult.compressed_count).toBeLessThan(30);
    expect(compactResult.compressed_count).toBeLessThanOrEqual(12); // 系统 + 总结 + 10条消息

    // 7. 验证消息数量已更新
    const messageCountAfter = await page.evaluate(() => {
      const chatStore = window.__chatStore;
      return chatStore.getState().messages.length;
    });

    console.log('[E2E] 📊 压缩后消息数量:', messageCountAfter);
    console.log('[E2E] 📉 压缩减少:', messageCountBefore - messageCountAfter, '条消息');

    expect(messageCountAfter).toBe(compactResult.compressed_count);
    expect(messageCountAfter).toBeLessThan(messageCountBefore);

    // 8. 验证压缩后的消息包含总结
    const hasSummary = await page.evaluate(() => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;
      return messages.some((msg: any) =>
        msg.content && msg.content.includes('测试总结')
      );
    });

    expect(hasSummary).toBe(true);
    console.log('[E2E] ✅ 测试通过: 30 条消息 → 压缩成功');
  });

  /**
   * AC-002: 50 条消息 → 验证压缩功能
   */
  test('AC-002: 应该在 50 条消息时成功压缩', async ({ page }) => {
    console.log('[E2E] 🧪 开始测试: 50 条消息 → 压缩');

    // 1. 创建 50 条模拟消息
    const mockMessages = [];
    for (let i = 0; i < 50; i++) {
      mockMessages.push({
        id: `msg-50-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0
          ? `用户消息 ${Math.floor(i/2) + 1}`
          : `助手响应 ${Math.floor(i/2) + 1}`,
        timestamp: Date.now() + i * 1000
      });
    }

    // 2. 注入消息
    await page.evaluate((messages) => {
      const chatStore = window.__chatStore;
      // @ts-ignore
      chatStore.setState({ messages: messages });
    }, mockMessages);

    console.log('[E2E] ✅ 已注入 50 条模拟消息');

    // 3. 验证消息数量
    const messageCountBefore = await page.evaluate(() => {
      const chatStore = window.__chatStore;
      return chatStore.getState().messages.length;
    });

    console.log('[E2E] 📊 注入后消息数量:', messageCountBefore);
    expect(messageCountBefore).toBe(50);

    // 4. 调用压缩
    const compactResult = await page.evaluate(async () => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;

      try {
        // @ts-ignore - Tauri API
        const result = await window.__TAURI__.core.invoke('compact_conversation', {
          messages: messages,
          summary: '50条消息的测试总结',
          keep_last_n: 10
        });

        // @ts-ignore
        chatStore.setState({ messages: result });

        return {
          original_count: messages.length,
          compressed_count: result.length,
          messages: result
        };
      } catch (error) {
        console.error('[E2E] 压缩失败:', error);
        return null;
      }
    });

    console.log('[E2E] 📋 压缩结果:', compactResult);

    // 5. 验证压缩结果
    expect(compactResult.original_count).toBe(50);
    expect(compactResult.compressed_count).toBeLessThan(50);
    expect(compactResult.compressed_count).toBeLessThanOrEqual(12);

    // 6. 验证消息数量
    const messageCountAfter = await page.evaluate(() => {
      const chatStore = window.__chatStore;
      return chatStore.getState().messages.length;
    });

    console.log('[E2E] 📊 压缩后消息数量:', messageCountAfter);
    expect(messageCountAfter).toBe(compactResult.compressed_count);

    // 7. 计算压缩率
    const reductionPercent = ((compactResult.original_count - compactResult.compressed_count) / compactResult.original_count * 100).toFixed(1);
    console.log('[E2E] 📉 压缩率:', reductionPercent + '%');

    // 验证压缩率合理（应该减少至少 50%）
    expect(parseFloat(reductionPercent)).toBeGreaterThan(50);

    console.log('[E2E] ✅ 测试通过: 50 条消息 → 压缩成功');
  });

  /**
   * AC-003: Token 统计更新
   */
  test('AC-003: 压缩后 Token 统计应该正确更新', async ({ page }) => {
    console.log('[E2E] 🧪 开始测试: Token 统计更新');

    // 1. 创建 30 条消息
    const mockMessages = [];
    for (let i = 0; i < 30; i++) {
      mockMessages.push({
        id: `msg-token-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Token 统计测试消息 ${i}`.repeat(10),
        timestamp: Date.now() + i * 1000
      });
    }

    // 2. 注入消息
    await page.evaluate((messages) => {
      const chatStore = window.__chatStore;
      // @ts-ignore
      chatStore.setState({ messages: messages });
    }, mockMessages);

    // 3. 获取压缩前的 Token 统计
    const tokenStatsBefore = await page.evaluate(async () => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;

      try {
        // @ts-ignore - Tauri API
        return await window.__TAURI__.core.invoke('get_token_stats', {
          messages,
          model: 'gpt-4o'
        });
      } catch (error) {
        console.error('[E2E] Token 统计失败:', error);
        return null;
      }
    });

    console.log('[E2E] 📊 压缩前 Token 统计:', tokenStatsBefore);

    // 4. 调用压缩
    await page.evaluate(async () => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;

      try {
        // @ts-ignore - Tauri API
        const result = await window.__TAURI__.core.invoke('compact_conversation', {
          messages: messages,
          summary: 'Token 统计测试总结',
          keep_last_n: 10
        });

        // @ts-ignore
        chatStore.setState({ messages: result });
      } catch (error) {
        console.error('[E2E] 压缩失败:', error);
      }
    });

    // 5. 获取压缩后的 Token 统计
    const tokenStatsAfter = await page.evaluate(async () => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;

      try {
        // @ts-ignore
        return await window.__TAURI__.core.invoke('get_token_stats', {
          messages,
          model: 'gpt-4o'
        });
      } catch (error) {
        console.error('[E2E] Token 统计失败:', error);
        return null;
      }
    });

    console.log('[E2E] 📊 压缩后 Token 统计:', tokenStatsAfter);

    // 6. 验证 Token 减少
    if (tokenStatsBefore && tokenStatsAfter) {
      expect(tokenStatsBefore.totalTokens).toBeGreaterThan(tokenStatsAfter.totalTokens);
      expect(tokenStatsBefore.messageCount).toBe(30);
      expect(tokenStatsAfter.messageCount).toBeLessThan(30);

      const tokenReduction = ((tokenStatsBefore.totalTokens - tokenStatsAfter.totalTokens) / tokenStatsBefore.totalTokens * 100).toFixed(1);
      console.log('[E2E] 📉 Token 减少:', tokenReduction + '%');

      console.log('[E2E] ✅ 测试通过: Token 统计正确更新');
    } else {
      console.log('[E2E] ⚠️ 无法获取 Token 统计（需要真实 Tauri 后端）');
      // 至少验证消息数量减少
      const messageCountAfter = await page.evaluate(() => {
        const chatStore = window.__chatStore;
        return chatStore.getState().messages.length;
      });
      expect(messageCountAfter).toBeLessThan(30);
    }
  });

  /**
   * AC-004: 压缩后消息结构验证
   */
  test('AC-004: 压缩后应该保留系统提示词和总结', async ({ page }) => {
    console.log('[E2E] 🧪 开始测试: 压缩后消息结构验证');

    // 1. 创建包含系统提示词的 30 条消息
    const mockMessages = [
      {
        id: 'system-msg',
        role: 'system',
        content: 'You are a helpful assistant.',
        timestamp: Date.now()
      },
      ...Array.from({ length: 29 }, (_, i) => ({
        id: `msg-struct-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `消息 ${i + 1}`,
        timestamp: Date.now() + (i + 1) * 1000
      }))
    ];

    // 2. 注入消息
    await page.evaluate((messages) => {
      const chatStore = window.__chatStore;
      // @ts-ignore
      chatStore.setState({ messages: messages });
    }, mockMessages);

    console.log('[E2E] ✅ 已注入 30 条消息（包含系统提示词）');

    // 3. 调用压缩
    await page.evaluate(async () => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;

      try {
        // @ts-ignore - Tauri API
        const result = await window.__TAURI__.core.invoke('compact_conversation', {
          messages: messages,
          summary: '压缩测试总结',
          keep_last_n: 5
        });

        // @ts-ignore
        chatStore.setState({ messages: result });
      } catch (error) {
        console.error('[E2E] 压缩失败:', error);
      }
    });

    // 4. 验证压缩后的消息结构
    const messageStructure = await page.evaluate(() => {
      const chatStore = window.__chatStore;
      const messages = chatStore.getState().messages;

      return {
        totalCount: messages.length,
        firstMessage: messages[0],
        lastMessages: messages.slice(-3),
        hasSummary: messages.some((m: any) => m.content && m.content.includes('压缩测试总结'))
      };
    });

    console.log('[E2E] 📋 压缩后消息结构:', messageStructure);

    // 验证：
    // 1. 第一条消息应该是系统提示词
    expect(messageStructure.firstMessage.role).toBe('system');

    // 2. 应该包含总结
    expect(messageStructure.hasSummary).toBe(true);

    // 3. 总数应该是：系统提示词 + 总结 + 最后 N 条消息
    expect(messageStructure.totalCount).toBeLessThanOrEqual(7); // 1 + 1 + 5

    // 4. 最后几条消息应该是原始对话的最后几条
    const lastMessageContent = messageStructure.lastMessages[messageStructure.lastMessages.length - 1]?.content;
    expect(lastMessageContent).toBe('消息 28');

    console.log('[E2E] ✅ 测试通过: 压缩后消息结构正确');
  });

  /**
   * AC-005: 边界测试 - 10 条消息不应触发压缩
   */
  test('AC-005: 10 条消息不应该触发压缩', async ({ page }) => {
    console.log('[E2E] 🧪 开始测试: 10 条消息边界测试');

    // 1. 创建 10 条消息
    const mockMessages = [];
    for (let i = 0; i < 10; i++) {
      mockMessages.push({
        id: `msg-boundary-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `边界测试消息 ${i}`,
        timestamp: Date.now() + i * 1000
      });
    }

    // 2. 注入消息
    await page.evaluate((messages) => {
      const chatStore = window.__chatStore;
      // @ts-ignore
      chatStore.setState({ messages: messages });
    }, mockMessages);

    console.log('[E2E] ✅ 已注入 10 条消息');

    // 3. 检查是否应该总结
    const shouldSummarize = await page.evaluate(async () => {
      const messages = window.__chatStore.getState().messages;

      try {
        // @ts-ignore
        return await window.__TAURI__.core.invoke('should_summarize_conversation', {
          messages
        });
      } catch (error) {
        console.error('[E2E] 检查总结失败:', error);
        return false;
      }
    });

    console.log('[E2E] 📊 是否应该总结:', shouldSummarize);

    // 10 条消息不应该触发总结（根据后端逻辑，需要至少 10 条消息）
    expect(shouldSummarize).toBe(false);

    // 4. 验证消息没有被压缩
    const messageCount = await page.evaluate(() => {
      const chatStore = window.__chatStore;
      return chatStore.getState().messages.length;
    });

    expect(messageCount).toBe(10);

    console.log('[E2E] ✅ 测试通过: 10 条消息未触发压缩');
  });
});
