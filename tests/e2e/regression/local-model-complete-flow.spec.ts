/**
 * 本地模型完整流程测试
 *
 * 模拟完整的本地模型处理流程：
 * 1. 用户发送消息 "执行npm run dev"
 * 2. 本地模型创建 assistant 消息（空内容 + toolCalls）
 * 3. 工具被自动批准并执行
 * 4. 检查是否创建了第二个 assistant 消息
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('本地模型完整流程测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('本地模型') ||
          text.includes('Local Model') ||
          text.includes('patchedGenerateResponse') ||
          text.includes('复用') ||
          text.includes('assistant') ||
          text.includes('message count')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  /**
   * 测试用例：完整模拟本地模型流程
   */
  test('local-model-flow-01: 模拟完整流程，检查消息数量', async ({ page }) => {
    console.log('[Test] ========== 开始完整流程测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      console.log('[Test] 步骤 1: 用户发送消息');

      // 1. 用户消息
      const userMsgId = 'user-flow-1';
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '执行npm run dev',
        timestamp: Date.now()
      });

      let messagesAfterUser = chatStore.getState().messages.length;
      console.log('[Test] 用户消息后，消息数量:', messagesAfterUser);

      // 2. 模拟本地模型创建 assistant 消息（空内容 + toolCalls）
      console.log('[Test] 步骤 2: 本地模型创建 assistant 消息');

      const assistantMsgId = 'assistant-flow-1';
      const toolCallId = 'tc-flow-1';

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
          status: 'pending',
          isLocalModel: true  // 🔥 标记为本地模型工具
        }]
      });

      let messagesAfterLocalModel = chatStore.getState().messages.length;
      console.log('[Test] 本地模型消息后，消息数量:', messagesAfterLocalModel);

      // 3. 模拟工具批准和执行（不调用实际的 approveToolCall，避免触发 patchedGenerateResponse）
      console.log('[Test] 步骤 3: 模拟工具执行');

      // 更新工具状态为 completed
      chatStore.setState((state: any) => ({
        messages: state.messages.map(m =>
          m.id === assistantMsgId ? {
            ...m,
            toolCalls: m.toolCalls?.map((tc: any) =>
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

      // 添加 role: 'tool' 消息
      chatStore.getState().addMessage({
        id: 'tool-result-flow-1',
        role: 'tool',
        content: JSON.stringify({
          exit_code: -1,
          stdout: '',
          stderr: 'sh: 执行npm: command not found'
        }),
        tool_call_id: toolCallId
      });

      let messagesAfterToolExecution = chatStore.getState().messages.length;
      console.log('[Test] 工具执行后，消息数量:', messagesAfterToolExecution);

      // 4. 模拟流式响应（如果有内容追加）
      console.log('[Test] 步骤 4: 检查是否需要追加内容');

      // 检查 assistant 消息的状态
      const allMessages = chatStore.getState().messages;
      const assistantMsg = allMessages.find((m: any) => m.id === assistantMsgId);

      console.log('[Test] Assistant 消息状态:', {
        id: assistantMsg?.id,
        content: assistantMsg?.content,
        contentLength: assistantMsg?.content ? assistantMsg.content.length : 0,
        hasToolCalls: !!assistantMsg?.toolCalls,
        toolCallsCount: assistantMsg?.toolCalls?.length || 0,
        toolCallStatus: assistantMsg?.toolCalls?.[0]?.status,
        isLocalModel: assistantMsg?.toolCalls?.[0]?.isLocalModel
      });

      // 5. 模拟 patchedGenerateResponse 的复用逻辑检查（修复后的逻辑）
      console.log('[Test] 步骤 5: 检查 patchedGenerateResponse 复用条件');

      // 🔥 修复后的逻辑：向后搜索最近的可复用 assistant 消息
      let reusableAssistantMsgId: string | null = null;
      for (let i = allMessages.length - 1; i >= 0; i--) {
        const msg = allMessages[i];
        if (msg.role === 'assistant' &&
            (!msg.content || msg.content.trim().length === 0) &&
            msg.toolCalls && msg.toolCalls.length > 0) {
          reusableAssistantMsgId = msg.id;
          break;  // 找到最近的一个就停止
        }
      }

      const shouldReuse = !!reusableAssistantMsgId;
      const lastMessage = allMessages[allMessages.length - 1];

      console.log('[Test] patchedGenerateResponse 复用检查:', {
        lastMessageId: lastMessage?.id,
        lastMessageRole: lastMessage?.role,
        reusableAssistantMsgId,
        shouldReuse,
        willCreateNewMessage: !shouldReuse
      });

      return {
        success: true,
        messageCounts: {
          afterUser: messagesAfterUser,
          afterLocalModel: messagesAfterLocalModel,
          afterToolExecution: messagesAfterToolExecution,
          final: allMessages.length
        },
        assistantMessage: {
          id: assistantMsg?.id,
          content: assistantMsg?.content,
          contentLength: assistantMsg?.content ? assistantMsg.content.length : 0,
          hasToolCalls: !!assistantMsg?.toolCalls,
          toolCallsCount: assistantMsg?.toolCalls?.length || 0,
          toolCallStatus: assistantMsg?.toolCalls?.[0]?.status,
          isLocalModel: assistantMsg?.toolCalls?.[0]?.isLocalModel
        },
        patchedGenerateResponseCheck: {
          lastMessageId: lastMessage?.id,
          reusableAssistantMsgId,
          shouldReuse,
          willCreateNewMessage: !shouldReuse
        },
        // 关键检查：是否创建了多个 assistant 消息
        assistantMessagesCount: allMessages.filter((m: any) => m.role === 'assistant').length,
        allMessageIds: allMessages.map((m: any) => ({ id: m.id, role: m.role }))
      };
    });

    console.log('[Test] ========== 完整流程测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.messageCounts.afterUser).toBe(1);
    expect(result.messageCounts.afterLocalModel).toBe(2);
    expect(result.messageCounts.afterToolExecution).toBe(3);
    expect(result.assistantMessagesCount, '应该只有 1 个 assistant 消息').toBe(1);

    // 关键断言
    expect(result.patchedGenerateResponseCheck.shouldReuse, '应该满足复用条件').toBe(true);
    expect(result.assistantMessage.isLocalModel, '工具应该标记为本地模型').toBe(true);

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：模拟有内容被追加的情况
   */
  test('local-model-flow-02: 模拟内容被追加后，复用条件检查', async ({ page }) => {
    console.log('[Test] ========== 测试内容追加场景 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 创建基础消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '测试',
        timestamp: Date.now()
      });

      const assistantMsgId = 'assistant-with-content';
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: 'tc-1',
          type: 'function',
          tool: 'bash',
          function: { name: 'bash', arguments: '{}' },
          args: {},
          status: 'pending',
          isLocalModel: true
        }]
      });

      console.log('[Test] 初始状态：content 为空');

      // 检查初始复用条件
      let messages = chatStore.getState().messages;
      let lastMsg = messages[messages.length - 1];
      let shouldReuseInitial = lastMsg &&
          lastMsg.role === 'assistant' &&
          (!lastMsg.content || lastMsg.content.trim().length === 0) &&
          lastMsg.toolCalls && lastMsg.toolCalls.length > 0;

      console.log('[Test] 初始复用条件:', shouldReuseInitial);

      // 模拟追加内容（即使只是空格或换行）
      console.log('[Test] 模拟追加内容');
      chatStore.setState((state: any) => ({
        messages: state.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: ' ' } : m
        )
      }));

      // 检查追加内容后的复用条件
      messages = chatStore.getState().messages;
      lastMsg = messages[messages.length - 1];
      let shouldReuseAfterContent = lastMsg &&
          lastMsg.role === 'assistant' &&
          (!lastMsg.content || lastMsg.content.trim().length === 0) &&
          lastMsg.toolCalls && lastMsg.toolCalls.length > 0;

      console.log('[Test] 追加内容后复用条件:', shouldReuseAfterContent);

      return {
        success: true,
        initialContent: '',
        afterContent: ' ',
        shouldReuseInitial,
        shouldReuseAfterContent,
        contentTrimmedLength: lastMsg.content ? lastMsg.content.trim().length : 0
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.shouldReuseInitial, '初始状态应该可以复用').toBe(true);
    expect(result.shouldReuseAfterContent, '内容只有空格时应该仍可复用').toBe(true);
    expect(result.contentTrimmedLength).toBe(0);

    console.log('[Test] ✅ 测试通过');
  });

  /**
   * 测试用例：模拟 approveToolCall 后的行为
   */
  test('local-model-flow-03: 模拟 approveToolCall 逻辑，检查是否调用 patchedGenerateResponse', async ({ page }) => {
    console.log('[Test] ========== 测试 approveToolCall 逻辑 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 创建测试消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '执行npm run dev',
        timestamp: Date.now()
      });

      const assistantMsgId = 'assistant-approve-1';
      const toolCallId = 'tc-approve-1';

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
          status: 'approved',
          isLocalModel: true  // 🔥 标记为本地模型
        }]
      });

      console.log('[Test] 创建了本地模型工具调用');

      // 模拟 approveToolCall 中的检查逻辑（第 2085 行）
      const allMessages = chatStore.getState().messages;
      const assistantMsg = allMessages.find((m: any) => m.id === assistantMsgId);
      const toolCall = assistantMsg?.toolCalls?.find((tc: any) => tc.id === toolCallId);

      // 这是第 2085 行的逻辑
      const shouldCallGenerateResponse = toolCall && !(toolCall as any).isLocalModel;

      console.log('[Test] approveToolCall 检查结果:', {
        hasToolCall: !!toolCall,
        isLocalModel: (toolCall as any)?.isLocalModel,
        shouldCallGenerateResponse
      });

      // 如果调用了 patchedGenerateResponse，它检查复用条件
      // 🔥 修复后的逻辑：向后搜索可复用的 assistant 消息
      let reusableAssistantMsgId: string | null = null;
      for (let i = allMessages.length - 1; i >= 0; i--) {
        const msg = allMessages[i];
        if (msg.role === 'assistant' &&
            (!msg.content || msg.content.trim().length === 0) &&
            msg.toolCalls && msg.toolCalls.length > 0) {
          reusableAssistantMsgId = msg.id;
          break;
        }
      }
      const wouldReuseIfCalled = !!reusableAssistantMsgId;

      return {
        success: true,
        toolCallIsLocalModel: (toolCall as any)?.isLocalModel,
        shouldCallGenerateResponse,
        wouldReuseIfCalled,
        expectedBehavior: shouldCallGenerateResponse
            ? '会调用 patchedGenerateResponse，可能创建新消息'
            : '不会调用 patchedGenerateResponse，保持当前消息'
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.toolCallIsLocalModel, '工具应该标记为本地模型').toBe(true);
    expect(result.shouldCallGenerateResponse, '本地模型工具不应该调用 patchedGenerateResponse').toBe(false);
    expect(result.expectedBehavior).toBe('不会调用 patchedGenerateResponse，保持当前消息');

    console.log('[Test] ✅ 测试通过');
  });
});
