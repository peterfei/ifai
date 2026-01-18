import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * LLM 工具调用循环问题测试
 *
 * 问题描述：
 * 用户批准执行 bash 命令（如 npm run dev）后，命令执行完成但超时，
 * LLM 收到结果后又生成了相同的 tool call，导致无限循环。
 *
 * 预期行为：
 * - 命令执行后，tool 消息应该正确格式化
 * - LLM 应该理解命令已经执行过了
 * - LLM 应该根据结果做出相应的响应（如告知用户服务已启动）
 */

test.describe('LLM Tool Call Loop Prevention', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('bash 命令超时后 LLM 不应该重复生成相同的 tool call', async ({ page }) => {
    // 场景：用户请求启动 dev 服务器
    // AI 生成 bash tool call
    // 用户批准执行
    // 命令执行完成但超时（exit_code: -1）
    // 验证：LLM 不应该再次生成相同的 tool call

    // 步骤 1：添加用户消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-user-start-dev',
        role: 'user',
        content: '启动 dev 服务器'
      });
    });

    // 步骤 2：模拟 AI 生成 bash tool call
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-ai-start-dev',
        role: 'assistant',
        content: '好的，我来启动 dev 服务器',
        toolCalls: [{
          id: 'call_npm_run_dev_1',
          tool: 'bash',
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });
    });

    // 步骤 3：用户批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 步骤 4：验证状态
    const stateAfterApproval = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      // 查找第一个 assistant 消息
      const firstAssistantMsg = messages.find((m: any) => m.id === 'msg-ai-start-dev');
      const firstToolCall = firstAssistantMsg?.toolCalls?.find((tc: any) => tc.id === 'call_npm_run_dev_1');

      // 查找 tool 消息
      const toolMessages = messages.filter((m: any) => m.tool_call_id === 'call_npm_run_dev_1');

      // 查找是否有重复的 assistant 消息（包含相同的 bash 命令）
      const duplicateAssistantMessages = messages.filter((m: any) =>
        m.role === 'assistant' &&
        m.toolCalls?.some((tc: any) =>
          tc.tool === 'bash' &&
          tc.args?.command === 'npm run dev' &&
          tc.id !== 'call_npm_run_dev_1'
        )
      );

      return {
        firstToolCall: {
          id: firstToolCall?.id,
          status: firstToolCall?.status,
          hasResult: !!firstToolCall?.result,
          resultPreview: firstToolCall?.result ? firstToolCall.result.substring(0, 100) : null
        },
        toolMessageCount: toolMessages.length,
        toolMessageContent: toolMessages[0]?.content || null,
        duplicateCount: duplicateAssistantMessages.length,
        totalMessages: messages.length
      };
    });

    console.log('[E2E] State after approval:', JSON.stringify(stateAfterApproval, null, 2));

    // 验证 1：第一个 tool call 应该有 result
    expect(stateAfterApproval.firstToolCall.hasResult).toBe(true);
    expect(stateAfterApproval.firstToolCall.status).toBe('completed');

    // 验证 2：应该有且仅有 1 个 tool 消息
    expect(stateAfterApproval.toolMessageCount).toBe(1);

    // 验证 3：tool 消息内容应该包含命令执行结果
    expect(stateAfterApproval.toolMessageContent).toBeTruthy();

    // 验证 4：不应该有重复的 assistant 消息
    expect(stateAfterApproval.duplicateCount).toBe(0);

    // 步骤 5：等待 AI 响应（如果 LLM 正确理解了结果，应该会生成新的响应）
    await page.waitForTimeout(5000);

    // 步骤 6：验证 LLM 响应
    const finalState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      // 查找所有 bash tool calls
      const bashToolCalls: any[] = [];
      messages.forEach((m: any) => {
        if (m.toolCalls) {
          m.toolCalls.forEach((tc: any) => {
            if (tc.tool === 'bash' && tc.args?.command === 'npm run dev') {
              bashToolCalls.push({
                messageId: m.id,
                toolCallId: tc.id,
                status: tc.status
              });
            }
          });
        }
      });

      // 统计消息数量
      const assistantMessagesCount = messages.filter((m: any) => m.role === 'assistant').length;
      const userMessagesCount = messages.filter((m: any) => m.role === 'user').length;
      const toolMessagesCount = messages.filter((m: any) => m.role === 'tool').length;

      return {
        bashToolCalls,
        messageStats: {
          assistant: assistantMessagesCount,
          user: userMessagesCount,
          tool: toolMessagesCount,
          total: messages.length
        }
      };
    });

    console.log('[E2E] Final state:', JSON.stringify(finalState, null, 2));

    // 关键验证：应该只有 1 个 bash tool call（第一个），不应该有重复
    expect(finalState.bashToolCalls.length).toBe(1);
    expect(finalState.bashToolCalls[0].toolCallId).toBe('call_npm_run_dev_1');
  });

  test('bash 命令成功执行后 tool 消息格式应该正确', async ({ page }) => {
    // 测试 bash 命令成功执行的场景
    // 验证 tool 消息格式是否正确，以便 LLM 能够理解

    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-ai-test-bash',
        role: 'assistant',
        content: '执行测试命令',
        toolCalls: [{
          id: 'call_echo_test',
          tool: 'bash',
          args: { command: 'echo "Test Output"' },
          status: 'pending'
        }]
      });
    });

    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    const toolMessageCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      const toolCall = messages.find((m: any) => m.id === 'msg-ai-test-bash')?.toolCalls?.find((tc: any) => tc.id === 'call_echo_test');
      const toolMessage = messages.find((m: any) => m.tool_call_id === 'call_echo_test');

      return {
        toolCallStatus: toolCall?.status,
        toolCallResult: toolCall?.result,
        toolMessageContent: toolMessage?.content,
        toolMessageHasContent: !!toolMessage?.content,
        toolMessageLength: toolMessage?.content?.length || 0
      };
    });

    console.log('[E2E] Tool message check:', JSON.stringify(toolMessageCheck, null, 2));

    // 验证 tool 消息格式
    expect(toolMessageCheck.toolCallStatus).toBe('completed');
    expect(toolMessageCheck.toolMessageHasContent).toBe(true);
    expect(toolMessageCheck.toolMessageLength).toBeGreaterThan(0);

    // 验证 tool 消息内容包含命令输出
    expect(toolMessageCheck.toolMessageContent).toContain('Test Output');
  });

  test('验证 tool 消息在历史记录中的格式', async ({ page }) => {
    // 这个测试验证 tool 消息在发送给 LLM 的历史记录中的格式
    // 检查 tool_call_id 是否正确关联

    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-ai-format-test',
        role: 'assistant',
        content: '测试格式',
        toolCalls: [{
          id: 'call_format_test',
          tool: 'bash',
          args: { command: 'echo "Format Test"' },
          status: 'pending'
        }]
      });
    });

    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 检查消息历史格式
    const historyFormatCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      // 构建类似后端的历史格式
      const history: any[] = [];
      messages.forEach((m: any) => {
        if (m.role === 'assistant' && m.toolCalls) {
          history.push({
            role: m.role,
            content: m.content,
            tool_calls: m.toolCalls.map((tc: any) => ({
              id: tc.id,
              function: {
                name: tc.tool,
                arguments: JSON.stringify(tc.args)
              },
              type: 'function'
            }))
          });
        } else if (m.role === 'tool') {
          history.push({
            role: m.role,
            content: m.content,
            tool_call_id: m.tool_call_id
          });
        }
      });

      // 查找 bash tool call 和对应的 tool 消息
      const bashToolCallEntry = history.find(h =>
        h.role === 'assistant' &&
        h.tool_calls?.some((tc: any) => tc.function.name === 'bash')
      );

      const toolMessageEntry = history.find(h =>
        h.role === 'tool' && h.tool_call_id === 'call_format_test'
      );

      return {
        hasBashToolCall: !!bashToolCallEntry,
        hasToolMessage: !!toolMessageEntry,
        toolCallId: bashToolCallEntry?.tool_calls?.[0]?.id,
        toolMessageToolCallId: toolMessageEntry?.tool_call_id,
        toolMessageContentPreview: toolMessageEntry?.content?.substring(0, 50),
        idsMatch: bashToolCallEntry?.tool_calls?.[0]?.id === toolMessageEntry?.tool_call_id
      };
    });

    console.log('[E2E] History format check:', JSON.stringify(historyFormatCheck, null, 2));

    // 关键验证：tool_call_id 应该匹配
    expect(historyFormatCheck.hasBashToolCall).toBe(true);
    expect(historyFormatCheck.hasToolMessage).toBe(true);
    expect(historyFormatCheck.idsMatch).toBe(true);
  });
});
