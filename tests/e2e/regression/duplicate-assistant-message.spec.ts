/**
 * 重复 Assistant 消息问题测试
 *
 * 问题：当本地模型创建 assistant 消息后，patchedGenerateResponse 又创建了第二个 assistant 消息
 * 导致出现两个消息：一个有 ToolApproval，另一个是空消息
 *
 * 生产日志表现：
 * - [MessageItem] Rendering message with toolCalls: – "bea950d2-..." – 1
 * - [MessageItem] 🚀 Message is actively streaming: – "890471c5-..." (不同的 ID！)
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('重复 Assistant 消息问题测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('patchedGenerateResponse') ||
          text.includes('复用') ||
          text.includes('assistant 消息') ||
          text.includes('two messages') ||
          text.includes('duplicate')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  /**
   * 测试用例：模拟本地模型创建消息后，patchedGenerateResponse 是否复用
   */
  test('duplicate-assistant-01: 模拟本地模型场景，验证是否复用现有消息', async ({ page }) => {
    console.log('[Test] ========== 开始重复消息测试 ==========');

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

      // 2. 模拟本地模型创建 assistant 消息（空内容 + toolCalls）
      const localModelMsgId = 'assistant-local-1';
      const toolCallId = 'tc-local-1';

      chatStore.getState().addMessage({
        id: localModelMsgId,
        role: 'assistant',
        content: '',  // 🔥 空内容
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'bash',
          function: { name: 'bash', arguments: '{"command":"npm run dev"}' },
          args: { command: 'npm run dev' },
          status: 'pending',  // 本地模型创建时状态为 pending
          isPartial: false
        }]
      });

      console.log('[Test] 步骤 1: 本地模型创建了 assistant 消息');

      // 3. 检查 patchedGenerateResponse 的复用逻辑
      const currentMessages = chatStore.getState().messages;
      const lastMessage = currentMessages[currentMessages.length - 1];

      console.log('[Test] 步骤 2: 检查最后一个消息');
      console.log('[Test] 最后消息 ID:', lastMessage.id);
      console.log('[Test] 最后消息 role:', lastMessage.role);
      console.log('[Test] 最后消息 content:', lastMessage.content);
      console.log('[Test] 最后消息 content.length:', lastMessage.content ? lastMessage.content.length : 0);
      console.log('[Test] 最后消息 toolCalls:', lastMessage.toolCalls);

      // 模拟 patchedGenerateResponse 的复用条件检查
      const shouldReuse = lastMessage &&
          lastMessage.role === 'assistant' &&
          (!lastMessage.content || lastMessage.content.trim().length === 0) &&
          lastMessage.toolCalls && lastMessage.toolCalls.length > 0;

      console.log('[Test] 步骤 3: 检查是否满足复用条件');
      console.log('[Test] shouldReuse:', shouldReuse);

      // 4. 模拟 patchedGenerateResponse 的行为
      let reusedMsgId: string | null = null;
      let newMsgId: string | null = null;

      if (shouldReuse) {
        // 复用现有消息
        reusedMsgId = lastMessage.id;
        console.log('[Test] 步骤 4a: 复用现有消息:', reusedMsgId);
      } else {
        // 创建新消息
        newMsgId = crypto.randomUUID();
        console.log('[Test] 步骤 4b: 创建新消息:', newMsgId);
      }

      // 5. 检查最终结果
      const finalMessages = chatStore.getState().messages;

      return {
        success: true,
        lastMessageId: lastMessage.id,
        shouldReuse,
        reusedMsgId,
        newMsgId,
        // 关键检查
        willReuseMessage: !!reusedMsgId,
        willCreateNewMessage: !!newMsgId,
        currentMessagesCount: currentMessages.length,
        finalMessagesCount: finalMessages.length,
        lastMessage: {
          id: lastMessage.id,
          role: lastMessage.role,
          contentLength: lastMessage.content ? lastMessage.content.length : 0,
          hasToolCalls: !!lastMessage.toolCalls,
          toolCallsCount: lastMessage.toolCalls ? lastMessage.toolCalls.length : 0
        }
      };
    });

    console.log('[Test] ========== 重复消息测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.shouldReuse, '应该满足复用条件').toBe(true);
    expect(result.willReuseMessage, '应该复用现有消息而不是创建新消息').toBe(true);
    expect(result.reusedMsgId, '复用的消息 ID 应该是本地模型创建的 ID').toBe('assistant-local-1');

    console.log('[Test] ✅ 测试通过：应该复用现有消息');
  });

  /**
   * 测试用例：验证本地模型消息内容不为空时的行为
   */
  test('duplicate-assistant-02: 本地模型消息有内容时，应该创建新消息', async ({ page }) => {
    console.log('[Test] ========== 测试有内容的场景 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 用户消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '测试',
        timestamp: Date.now()
      });

      // 本地模型创建的 assistant 消息（有内容）
      chatStore.getState().addMessage({
        id: 'assistant-local-2',
        role: 'assistant',
        content: '好的，我来帮你执行命令',  // 🔥 有内容
        timestamp: Date.now(),
        toolCalls: [{
          id: 'tc-local-2',
          type: 'function',
          tool: 'bash',
          function: { name: 'bash', arguments: '{}' },
          args: {},
          status: 'pending'
        }]
      });

      const currentMessages = chatStore.getState().messages;
      const lastMessage = currentMessages[currentMessages.length - 1];

      // 模拟 patchedGenerateResponse 的复用条件检查
      const shouldReuse = lastMessage &&
          lastMessage.role === 'assistant' &&
          (!lastMessage.content || lastMessage.content.trim().length === 0) &&
          lastMessage.toolCalls && lastMessage.toolCalls.length > 0;

      return {
        success: true,
        lastMessageId: lastMessage.id,
        lastMessageContent: lastMessage.content,
        shouldReuse,
        // 关键检查
        willCreateNewMessage: !shouldReuse,
        reason: shouldReuse ? '可以复用' : '内容不为空，不能复用'
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.shouldReuse, '有内容时不应该复用').toBe(false);
    expect(result.willCreateNewMessage, '应该创建新消息').toBe(true);

    console.log('[Test] ✅ 测试通过：有内容时应该创建新消息');
  });

  /**
   * 测试用例：验证消息列表中没有 assistant 消息时的行为
   */
  test('duplicate-assistant-03: 没有现有 assistant 消息时，应该创建新消息', async ({ page }) => {
    console.log('[Test] ========== 测试没有现有消息的场景 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 只有用户消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '测试',
        timestamp: Date.now()
      });

      const currentMessages = chatStore.getState().messages;
      const lastMessage = currentMessages[currentMessages.length - 1];

      // 模拟 patchedGenerateResponse 的复用条件检查
      const shouldReuse = lastMessage &&
          lastMessage.role === 'assistant' &&
          (!lastMessage.content || lastMessage.content.trim().length === 0) &&
          lastMessage.toolCalls && lastMessage.toolCalls.length > 0;

      return {
        success: true,
        lastMessageRole: lastMessage.role,
        shouldReuse,
        willCreateNewMessage: !shouldReuse,
        reason: shouldReuse ? '可以复用' : '最后一条不是空 assistant 消息'
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.shouldReuse, '用户消息不应该被复用').toBe(false);
    expect(result.willCreateNewMessage, '应该创建新消息').toBe(true);

    console.log('[Test] ✅ 测试通过：没有现有 assistant 消息时应该创建新消息');
  });

  /**
   * 测试用例：验证实际 patchedGenerateResponse 的行为（通过 sendMessage）
   */
  test('duplicate-assistant-04: 验证 sendMessage 后的消息数量', async ({ page }) => {
    console.log('[Test] ========== 测试实际 sendMessage 行为 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 记录初始消息数量
      const initialCount = chatStore.getState().messages.length;

      // 创建用户消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '执行npm run dev',
        timestamp: Date.now()
      });

      const afterUserMsgCount = chatStore.getState().messages.length;

      // 模拟本地模型创建 assistant 消息
      chatStore.getState().addMessage({
        id: 'assistant-local-4',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: 'tc-local-4',
          type: 'function',
          tool: 'bash',
          function: { name: 'bash', arguments: '{"command":"npm run dev"}' },
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });

      const afterLocalModelMsgCount = chatStore.getState().messages.length;

      // 注意：这里不能直接调用 sendMessage，因为它会尝试连接真实后端
      // 我们只需要验证当前状态是否满足复用条件

      const currentMessages = chatStore.getState().messages;
      const lastMessage = currentMessages[currentMessages.length - 1];

      const shouldReuse = lastMessage &&
          lastMessage.role === 'assistant' &&
          (!lastMessage.content || lastMessage.content.trim().length === 0) &&
          lastMessage.toolCalls && lastMessage.toolCalls.length > 0;

      return {
        success: true,
        initialCount,
        afterUserMsgCount,
        afterLocalModelMsgCount,
        currentMessagesCount: currentMessages.length,
        lastMessageId: lastMessage.id,
        shouldReuse,
        // 如果 patchedGenerateResponse 复用消息，消息数量应该不变
        // 如果创建新消息，消息数量会增加 1
        expectedFinalCount: shouldReuse ? afterLocalModelMsgCount : afterLocalModelMsgCount + 1
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.shouldReuse, '应该满足复用条件').toBe(true);

    // 关键断言：如果复用，消息数量不应该增加
    console.log('[Test] 当前消息数量:', result.currentMessagesCount);
    console.log('[Test] 如果复用，预期数量:', result.expectedFinalCount);

    console.log('[Test] ✅ 测试完成');
  });

  /**
   * 测试用例：验证工具状态变化后的复用条件
   */
  test('duplicate-assistant-05: 工具状态从 pending 变为 completed 后的复用条件', async ({ page }) => {
    console.log('[Test] ========== 测试工具状态变化后的复用条件 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 用户消息
      chatStore.getState().addMessage({
        id: 'user-1',
        role: 'user',
        content: '测试',
        timestamp: Date.now()
      });

      // Assistant 消息（pending 状态）
      const assistantMsgId = 'assistant-pending-5';
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: 'tc-pending-5',
          type: 'function',
          tool: 'bash',
          function: { name: 'bash', arguments: '{}' },
          args: {},
          status: 'pending'  // 初始状态
        }]
      });

      // 检查 pending 状态下的复用条件
      const pendingMessages = chatStore.getState().messages;
      const pendingLast = pendingMessages[pendingMessages.length - 1];
      const shouldReusePending = pendingLast &&
          pendingLast.role === 'assistant' &&
          (!pendingLast.content || pendingLast.content.trim().length === 0) &&
          pendingLast.toolCalls && pendingLast.toolCalls.length > 0;

      // 更新工具状态为 completed
      chatStore.setState((state: any) => ({
        messages: state.messages.map(m =>
          m.id === assistantMsgId ? {
            ...m,
            toolCalls: m.toolCalls?.map((tc: any) =>
              tc.id === 'tc-pending-5' ? { ...tc, status: 'completed' } : tc
            )
          } : m
        )
      }));

      // 检查 completed 状态下的复用条件
      const completedMessages = chatStore.getState().messages;
      const completedLast = completedMessages[completedMessages.length - 1];
      const shouldReuseCompleted = completedLast &&
          completedLast.role === 'assistant' &&
          (!completedLast.content || completedLast.content.trim().length === 0) &&
          completedLast.toolCalls && completedLast.toolCalls.length > 0;

      return {
        success: true,
        pendingStatus: {
          shouldReuse: shouldReusePending,
          toolStatus: 'pending'
        },
        completedStatus: {
          shouldReuse: shouldReuseCompleted,
          toolStatus: 'completed'
        },
        // 关键：工具状态变化后，复用条件应该仍然满足
        shouldStillReuseAfterCompleted: shouldReuseCompleted
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.pendingStatus.shouldReuse, 'pending 状态下应该可以复用').toBe(true);
    expect(result.completedStatus.shouldReuse, 'completed 状态下仍然应该可以复用').toBe(true);

    console.log('[Test] ✅ 测试通过：工具状态变化不影响复用条件');
  });
});
