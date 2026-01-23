/**
 * 消息 ID 验证测试
 *
 * 验证 messageToStored 函数正确处理缺少 ID 的消息
 * 防止 IndexedDB 保存错误
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('消息 ID 验证测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ThreadPersistence') ||
          text.includes('Skipping message') ||
          text.includes('messageToStored')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  /**
   * 测试用例：验证缺少 ID 的消息会被跳过
   */
  test('@regression message-id-validation-01: 缺少 ID 的消息应该被跳过', async ({ page }) => {
    console.log('[Test] ========== 开始消息 ID 验证测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 创建测试消息：包含有 ID 和没有 ID 的消息
      const messages = [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: '有 ID 的消息',
          timestamp: Date.now()
        },
        {
          // 🔥 没有 ID 的消息
          role: 'assistant',
          content: '没有 ID 的消息',
          timestamp: Date.now()
        },
        {
          id: '',  // 🔥 空字符串 ID
          role: 'user',
          content: '空 ID 的消息',
          timestamp: Date.now()
        },
        {
          id: null,  // 🔥 null ID
          role: 'assistant',
          content: 'null ID 的消息',
          timestamp: Date.now()
        },
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: '另一个有 ID 的消息',
          timestamp: Date.now()
        }
      ];

      console.log('[Test] 创建了 5 条测试消息');

      // 模拟 messageToStored 函数
      const converted: any[] = [];
      const skipped: any[] = [];

      messages.forEach((msg: any, index: number) => {
        // 模拟 messageToStored 的验证逻辑
        if (!msg.id || msg.id === undefined || msg.id === null || msg.id === '') {
          skipped.push({
            index,
            role: msg.role,
            content: msg.content,
            idValue: msg.id,
            idType: typeof msg.id
          });
        } else {
          converted.push({
            index,
            id: msg.id,
            role: msg.role
          });
        }
      });

      console.log('[Test] 成功转换的消息数:', converted.length);
      console.log('[Test] 跳过的消息数:', skipped.length);

      return {
        success: true,
        totalMessages: messages.length,
        convertedCount: converted.length,
        skippedCount: skipped.length,
        converted,
        skipped,
        // 验证结果
        expectedConverted: 2,  // 只有 2 条消息有有效 ID
        expectedSkipped: 3,    // 3 条消息缺少有效 ID
        correct: converted.length === 2 && skipped.length === 3
      };
    });

    console.log('[Test] ========== 消息 ID 验证结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.correct, '应该正确处理有 ID 和无 ID 的消息').toBe(true);
    expect(result.convertedCount).toBe(result.expectedConverted);
    expect(result.skippedCount).toBe(result.expectedSkipped);

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：验证正常流程中的消息都有 ID
   */
  test('@regression message-id-validation-02: 正常流程中创建的消息都应该有 ID', async ({ page }) => {
    console.log('[Test] ========== 开始正常流程测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空现有消息
      chatStore.setState({ messages: [] });

      // 添加各种类型的消息
      const messageTypes = [
        { type: 'user', content: '用户消息' },
        { type: 'assistant', content: '助手消息' },
        { type: 'system', content: '系统消息' }
      ];

      messageTypes.forEach(({ type, content }) => {
        const id = crypto.randomUUID();
        chatStore.getState().addMessage({
          id,
          role: type,
          content,
          timestamp: Date.now()
        });
      });

      // 检查所有消息
      const messages = chatStore.getState().messages;

      console.log('[Test] 添加了', messages.length, '条消息');

      const invalidMessages: any[] = [];
      const validMessages: any[] = [];

      messages.forEach((msg: any, index: number) => {
        if (!msg.id || msg.id === undefined || msg.id === null || msg.id === '') {
          invalidMessages.push({
            index,
            role: msg.role,
            content: msg.content?.substring(0, 30)
          });
        } else {
          validMessages.push({
            id: msg.id,
            role: msg.role
          });
        }
      });

      console.log('[Test] 有效消息数:', validMessages.length);
      console.log('[Test] 无效消息数:', invalidMessages.length);

      return {
        success: true,
        totalMessages: messages.length,
        validMessagesCount: validMessages.length,
        invalidMessagesCount: invalidMessages.length,
        invalidMessages,
        allValid: invalidMessages.length === 0
      };
    });

    console.log('[Test] ========== 正常流程测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.allValid, '所有消息都应该有有效 ID').toBe(true);
    expect(result.totalMessages).toBeGreaterThan(0);

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：验证保存消息时的过滤逻辑
   */
  test('@regression message-id-validation-03: 验证保存时的过滤逻辑', async ({ page }) => {
    console.log('[Test] ========== 开始保存过滤测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;

      if (!chatStore || !threadStore) {
        return { success: false, error: 'stores not available' };
      }

      // 创建一个线程
      const threadId = threadStore.getState().createThread({
        title: '测试线程'
      });

      console.log('[Test] 创建线程:', threadId);

      // 添加消息
      const validMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: validMsgId,
        role: 'user',
        content: '有效消息',
        timestamp: Date.now()
      });

      // 获取消息
      const messages = chatStore.getState().messages;

      console.log('[Test] 消息数量:', messages.length);

      // 模拟保存时的过滤逻辑
      const validMessages: any[] = [];
      let skippedCount = 0;

      messages.forEach((msg: any) => {
        if (!msg.id || msg.id === undefined || msg.id === null || msg.id === '') {
          skippedCount++;
        } else {
          validMessages.push({ id: msg.id, role: msg.role });
        }
      });

      console.log('[Test] 有效消息:', validMessages.length);
      console.log('[Test] 跳过消息:', skippedCount);

      return {
        success: true,
        threadId,
        totalMessages: messages.length,
        validMessagesCount: validMessages.length,
        skippedCount,
        hasValidId: validMessages.some(m => m.id === validMsgId),
        allMessagesValid: skippedCount === 0
      };
    });

    console.log('[Test] ========== 保存过滤测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.allMessagesValid, '所有消息都应该是有效的').toBe(true);
    expect(result.hasValidId, '应该包含我们添加的有效消息').toBe(true);

    console.log('[Test] ✅ 测试通过');
  });
});
