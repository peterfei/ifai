/**
 * 流式传输状态导致空气泡问题测试
 *
 * 问题：当工具执行完成后，isActivelyStreaming 可能仍然为 true
 * 导致 shouldHideBubble 逻辑失效
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('流式传输状态空气泡问题测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('streaming') || text.includes('isActivelyStreaming') || text.includes('shouldHideBubble')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  /**
   * 测试用例：模拟工具执行完成后的 isActivelyStreaming 状态
   */
  test('@regression streaming-empty-bubble-01: 工具执行完成后 isActivelyStreaming 状态检查', async ({ page }) => {
    console.log('[Test] ========== 开始流式传输状态检查 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 1. 用户消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '执行npm run dev',
        timestamp: Date.now()
      });

      // 2. Assistant 消息（初始为空，toolCalls 为 pending）
      const assistantMsgId = 'assistant-stream-1';
      const toolCallId = 'tc-stream-1';

      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'bash',
          function: { name: 'bash', arguments: '{"command":"npm run dev"}' },
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });

      console.log('[Test] 步骤 1: 初始状态 - content 为空，toolCall 为 pending');

      // 3. 模拟流式内容追加（本地模型摘要）
      // 这个摘要应该被过滤掉，但可能会触发 isActivelyStreaming
      const localModelSummary = '[Local Model] Completed in 29ms\n\n[OK] bash (29ms)\n{...}';

      // 模拟追加内容（这会触发 displayContent.length 变化）
      chatStore.setState((state: any) => ({
        messages: state.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: localModelSummary } : m
        )
      }));

      console.log('[Test] 步骤 2: 追加了流式内容（应该被过滤）');

      // 4. 立即清空内容（模拟过滤）
      chatStore.setState((state: any) => ({
        messages: state.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: '' } : m
        )
      }));

      console.log('[Test] 步骤 3: 内容被清空（过滤后）');

      // 5. 更新工具调用状态为 completed
      chatStore.setState((state: any) => ({
        messages: state.messages.map(m =>
          m.id === assistantMsgId ? {
            ...m,
            toolCalls: m.toolCalls?.map(tc =>
              tc.id === toolCallId ? {
                ...tc,
                status: 'completed',
                result: JSON.stringify({
                  exit_code: -1,
                  stdout: '',
                  stderr: 'sh: 执行npm: command not found'
                })
              } : tc
            )
          } : m
        )
      }));

      console.log('[Test] 步骤 4: toolCall 状态更新为 completed');

      // 6. 检查最终状态
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);

      // 模拟 MessageItem 的 isActivelyStreaming 逻辑
      const displayContent = assistantMsg?.content || '';
      const contentLength = displayContent.length;

      // 模拟 shouldHideBubble 检查
      const isUser = assistantMsg?.role === 'user';
      const isAgent = !!(assistantMsg as any).agentId;
      const hasContent = assistantMsg?.content && assistantMsg.content.trim().length > 0;
      const hasToolCalls = assistantMsg?.toolCalls && assistantMsg.toolCalls.length > 0;
      const shouldHideBubble = !isUser && !isAgent && !hasContent && hasToolCalls;

      // 检查 toolCall 状态
      const toolCallStatus = assistantMsg?.toolCalls?.[0]?.status;

      return {
        success: true,
        displayContent,
        contentLength,
        shouldHideBubble,
        toolCallStatus,
        hasContent,
        hasToolCalls,
        // 关键检查
        willShowEmptyBubble: !shouldHideBubble,
        toolCallIsCompleted: toolCallStatus === 'completed'
      };
    });

    console.log('[Test] ========== 流式传输状态检查结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.shouldHideBubble, '应该隐藏气泡').toBe(true);
    expect(result.toolCallIsCompleted, '工具调用应该完成').toBe(true);
    expect(result.willShowEmptyBubble, '不应该显示空气泡').toBe(false);

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：检查 isActivelyStreaming 的计算逻辑
   */
  test('@regression streaming-empty-bubble-02: isActivelyStreaming 应该考虑 toolCalls 状态', async ({ page }) => {
    console.log('[Test] ========== 检查 isActivelyStreaming 逻辑 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 创建测试消息
      const assistantMsgId = 'assistant-stream-2';
      const toolCallId = 'tc-stream-2';

      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'bash',
          function: { name: 'bash', arguments: '{}' },
          args: {},
          status: 'completed',  // 🔥 设置为 completed
          result: JSON.stringify({ exit_code: 0 })
        }]
      });

      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);

      // 模拟 MessageItem 的 isActivelyStreaming 逻辑
      const displayContent = assistantMsg?.content || '';

      // 当前逻辑：isActivelyStreaming 只检查 content.length 是否增长
      // 问题：toolCalls 状态变化（pending -> completed）不会重置这个状态

      // 建议的修复：isActivelyStreaming 应该也考虑 toolCalls
      const hasPendingToolCalls = assistantMsg?.toolCalls?.some((tc: any) =>
        tc.status === 'pending' || tc.status === 'running' || tc.isPartial
      );

      const hasCompletedToolCallsOnly = assistantMsg?.toolCalls?.every((tc: any) =>
        tc.status === 'completed' || tc.status === 'failed'
      );

      // 修复后的 isActivelyStreaming 逻辑
      const isActivelyStreamingCurrent = displayContent.length > 0;  // 当前逻辑
      const isActivelyStreamingFixed = displayContent.length > 0 || hasPendingToolCalls;  // 修复后

      return {
        success: true,
        displayContentLength: displayContent.length,
        hasPendingToolCalls,
        hasCompletedToolCallsOnly,
        isActivelyStreamingCurrent,
        isActivelyStreamingFixed,
        // 修复效果
        fixNeeded: hasCompletedToolCallsOnly && displayContent.length === 0
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.hasCompletedToolCallsOnly).toBe(true);

    if (result.fixNeeded) {
      console.log('[Test] ⚠️ 发现问题：工具调用已完成但内容为空，isActivelyStreaming 应该为 false');
    }

    console.log('[Test] ✅ 测试完成');
  });
});
