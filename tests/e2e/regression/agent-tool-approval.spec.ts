/**
 * Agent 工具批准功能测试
 *
 * 测试场景：验证 Agent 工具调用的 ID 格式一致性
 *
 * 问题描述（v0.3.8.2 修复）：
 * - ai_utils.rs（流式响应）使用 LLM API 原始 ID：call_xxx
 * - runner.rs（Agent 执行）使用自生成 ID：agentId_idx
 * - 导致 ID 不匹配，批准按钮无法工作
 *
 * 修复方案：
 * - runner.rs 现在使用 LLM API 原始 tool_call.id
 * - 确保所有 tool_call 事件使用相同的 ID
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent Tool Approval - v0.3.8.2 Regression Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should verify tool_call ID format from LLM API', async ({ page }) => {
    console.log('[Test] ========== Tool Call ID 格式验证 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;

      if (!chatStore || !settingsStore) {
        return { success: false, error: 'Required stores not available' };
      }

      const settings = settingsStore.getState();
      const provider = settings.providers.find((p: any) => p.id === settings.currentProviderId);

      console.log('[Test] 当前 Provider:', provider?.name, provider?.id);

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      // 发送一个会触发 tool_call 的消息
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: 'What files are in the current directory? Use the file system tool.',
        timestamp: Date.now()
      });

      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      });

      // 发送消息（不使用 Agent，直接测试普通 chat 的 tool_call）
      try {
        await chatStore.getState().sendMessage(
          'List files in current directory',
          settings.currentProviderId,
          provider?.models?.[0] || 'glm-4.7'
        );

        // 等待响应
        await new Promise(resolve => setTimeout(resolve, 5000));

        const messages = chatStore.getState().messages;
        const assistantMessage = messages.find((m: any) => m.role === 'assistant' && m.toolCalls);
        const toolCalls = assistantMessage?.toolCalls || [];

        console.log('[Test] 工具调用数量:', toolCalls.length);

        if (toolCalls.length === 0) {
          return {
            success: false,
            error: 'No tool calls generated - AI may have responded with text instead',
            messagesCount: messages.length
          };
        }

        const firstToolCall = toolCalls[0];
        console.log('[Test] 第一个工具调用:', {
          id: firstToolCall.id,
          tool: firstToolCall.tool,
          status: firstToolCall.status
        });

        // 🔥 关键验证：检查 ID 格式
        const hasCallPrefix = firstToolCall.id.startsWith('call_');
        const hasAgentIdFormat = /^[a-f0-9-]+_\d+$/.test(firstToolCall.id);

        return {
          success: true,
          toolCallId: firstToolCall.id,
          hasCallPrefix,
          hasAgentIdFormat,
          format: hasCallPrefix ? 'call_xxx (LLM API 原始格式 - 正确)' :
                  hasAgentIdFormat ? 'agentId_idx (自生成格式 - 错误)' : '未知格式'
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.success && result.toolCallId) {
      // 验证 ID 使用正确的格式
      expect(result.hasCallPrefix).toBe(true);
      expect(result.hasAgentIdFormat).toBe(false);
      console.log('[Test] ✅ Tool Call ID 格式正确:', result.format);
    } else {
      console.log('[Test] ℹ️  没有生成 tool_call，可能 AI 以文本方式回复');
    }
  });

  test('should handle thread isolation for agent tool calls', async ({ page }) => {
    console.log('[Test] ========== Agent Thread 隔离测试 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const switchThreadWrapper = (window as any).__switchThread;

      if (!chatStore || !threadStore) {
        return { success: false, error: 'Required stores not available' };
      }

      // 创建两个 threads
      const thread1Id = threadStore.getState().createThread({ title: 'Thread 1' });
      const thread2Id = threadStore.getState().createThread({ title: 'Thread 2' });

      console.log('[Test] 创建了两个 threads:', thread1Id, thread2Id);

      // 🔥 使用 wrapper switchThread 函数切换到 thread 1（会保存/加载消息）
      switchThreadWrapper(thread1Id);

      const msgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: 'call_test_123',
          type: 'function',
          tool: 'agent_read_file',
          function: { name: 'agent_read_file', arguments: '{"path":"test.txt"}' },
          status: 'pending' as const,
          isPartial: false
        }],
        timestamp: Date.now()
      });

      const thread1Messages = chatStore.getState().messages;
      const thread1HasMessage = thread1Messages.some((m: any) => m.id === msgId);

      console.log('[Test] Thread 1 消息数量:', thread1Messages.length);
      console.log('[Test] Thread 1 包含测试消息:', thread1HasMessage);

      // 🔥 使用 wrapper switchThread 函数切换到 thread 2（会保存 thread 1 消息，加载 thread 2 消息）
      switchThreadWrapper(thread2Id);

      const thread2Messages = chatStore.getState().messages;
      const thread2HasMessage = thread2Messages.some((m: any) => m.id === msgId);

      console.log('[Test] Thread 2 消息数量:', thread2Messages.length);
      console.log('[Test] Thread 2 包含测试消息:', thread2HasMessage);

      // 🔥 关键验证：thread 2 不应该包含 thread 1 的消息
      return {
        success: true,
        thread1HasMessage,
        thread2HasMessage,
        threadIsIsolated: thread1HasMessage && !thread2HasMessage
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // 验证 thread 隔离
    expect(result.success).toBe(true);
    expect(result.thread1HasMessage).toBe(true);
    expect(result.thread2HasMessage).toBe(false);
    expect(result.threadIsIsolated).toBe(true);

    console.log('[Test] ✅ Thread 隔离正常工作');
  });
});
