/**
 * 调试测试 - 追踪空气泡问题的根源
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('调试空气泡问题', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      console.log('[Browser Console]', msg.text());
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  /**
   * 调试测试：追踪完整的渲染流程
   */
  test('debug-empty-bubble-01: 追踪完整渲染流程', async ({ page }) => {
    console.log('[Test] ========== 开始调试测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      console.log('[Debug] 步骤 1: 创建测试消息');

      // 用户消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '执行npm run dev',
        timestamp: Date.now()
      });

      // Assistant 消息（空内容 + toolCalls）
      const assistantMsgId = 'assistant-debug-1';
      const toolCallId = 'tc-debug-1';

      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'bash',
          function: {
            name: 'bash',
            arguments: JSON.stringify({ command: 'npm run dev' })
          },
          args: { command: 'npm run dev' },
          status: 'completed',
          result: JSON.stringify({
            exit_code: -1,
            stdout: '',
            stderr: 'sh: 执行npm: command not found',
            success: true
          })
        }]
      });

      console.log('[Debug] 步骤 2: 检查消息状态');

      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);

      // 检查 shouldHideBubble 的所有条件
      const isUser = assistantMsg?.role === 'user';
      const isAgent = !!(assistantMsg as any).agentId;
      const hasContentInMessage = assistantMsg?.content && assistantMsg.content.trim().length > 0;
      const hasContentSegments = (assistantMsg as any).contentSegments && (assistantMsg as any).contentSegments.length > 0;
      const hasTextSegments = hasContentSegments && (assistantMsg as any).contentSegments.some((s: any) => s.type === 'text' && s.content && s.content.trim().length > 0);
      const hasContent = hasContentInMessage || hasTextSegments;
      const hasToolCalls = assistantMsg?.toolCalls && assistantMsg.toolCalls.length > 0;
      const shouldHideBubble = !isUser && !isAgent && !hasContent && hasToolCalls;

      console.log('[Debug] shouldHideBubble 条件:', {
        isUser,
        isAgent,
        hasContentInMessage,
        hasContentSegments,
        hasTextSegments,
        hasContent,
        hasToolCalls,
        shouldHideBubble
      });

      console.log('[Debug] 步骤 3: 检查 DOM 元素');

      // 等待 DOM 更新
      await new Promise(resolve => setTimeout(resolve, 100));

      // 检查页面上的元素
      const messageElements = document.querySelectorAll('[data-testid^="message-"]');
      console.log('[Debug] 找到消息元素数量:', messageElements.length);

      const assistantElement = document.querySelector(`[data-testid="message-${assistantMsgId}"]`);
      console.log('[Debug] Assistant 元素存在:', !!assistantElement);

      if (assistantElement) {
        const innerHTML = assistantElement.innerHTML;
        const textContent = assistantElement.textContent;

        console.log('[Debug] Assistant 元素 innerHTML 长度:', innerHTML.length);
        console.log('[Debug] Assistant 元素 textContent:', textContent);
        console.log('[Debug] Assistant 元素 textContent 长度:', textContent.length);

        // 检查是否有 ToolApproval 相关元素
        const hasToolApproval = innerHTML.includes('tool-approval') ||
                                 innerHTML.includes('ToolApproval') ||
                                 innerHTML.includes('批准') ||
                                 innerHTML.includes('拒绝');

        console.log('[Debug] 是否有 ToolApproval 元素:', hasToolApproval);

        // 检查是否有空的气泡
        const emptyBubbles = assistantElement.querySelectorAll('.bg-\\[\\#1e1e1e\\]');
        console.log('[Debug] 空气泡数量:', emptyBubbles.length);

        return {
          success: true,
          shouldHideBubble,
          hasToolApproval,
          emptyBubblesCount: emptyBubbles.length,
          innerHTMLLength: innerHTML.length,
          textContentLength: textContent.length,
          textContentPreview: textContent.substring(0, 100)
        };
      }

      return {
        success: true,
        shouldHideBubble,
        messageElementsCount: messageElements.length,
        assistantElementExists: false,
        error: 'Assistant element not found'
      };
    });

    console.log('[Test] ========== 调试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.assistantElementExists) {
      console.log('[Test] ✅ Assistant 元素存在');
      console.log('[Test] shouldHideBubble:', result.shouldHideBubble);
      console.log('[Test] 是否有 ToolApproval 元素:', result.hasToolApproval);
      console.log('[Test] 空气泡数量:', result.emptyBubblesCount);

      // 关键验证
      if (result.shouldHideBubble) {
        expect(result.hasToolApproval).toBe(true);
        expect(result.emptyBubblesCount).toBe(0);
      }
    }
  });
});
