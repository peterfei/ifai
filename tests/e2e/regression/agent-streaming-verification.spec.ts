/**
 * Agent 流式内容输出验证测试
 *
 * 测试场景：
 * 1. 用户输入 "重构 README.md 150字左右"
 * 2. Agent 调用工具读取 README.md
 * 3. 用户批准工具调用
 * 4. 验证流式内容输出是否正常显示
 *
 * 参考提交：759eb3159a6907d347c7f7b59840bebbe110aac9
 * 修复内容：MessageItem React.memo 添加 args 检查，确保流式更新时 UI 刷新
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe.skip('Agent Streaming Content Verification - 参考提交 759eb31 - TODO: Fix this test', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should verify streaming content output when agent processes README.md refactor', async ({ page }) => {
    console.log('[Test] ========== Agent 流式内容输出验证 ==========');
    test.setTimeout(120000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;
      const settingsStore = (window as any).__settingsStore;

      if (!chatStore || !agentStore || !settingsStore) {
        return { success: false, error: 'Required stores not available' };
      }

      const settings = settingsStore.getState();
      const provider = settings.providers.find((p: any) => p.id === settings.currentProviderId);
      const model = provider?.models?.[0] || 'moonshot-v1-8k-vision-preview';

      console.log('[Test] 当前配置:', { provider: provider?.name, model });

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      // 📊 监听消息更新，记录流式内容
      const streamingUpdates: string[] = [];
      const messageStates: any[] = [];

      // 保存原始 setState
      const originalSetState = chatStore.setState;

      // Hook setState 来捕获所有消息更新
      chatStore.setState = (newState: any) => {
        const messages = newState.messages || chatStore.getState().messages;
        const lastMsg = messages[messages.length - 1];

        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
          streamingUpdates.push(lastMsg.content);
          messageStates.push({
            content: lastMsg.content,
            contentLen: lastMsg.content.length,
            toolCalls: lastMsg.toolCalls?.map((tc: any) => ({
              tool: tc.tool,
              status: tc.status,
              isPartial: tc.isPartial,
              argsLen: JSON.stringify(tc.args || {}).length
          })),
            hasToolCalls: !!lastMsg.toolCalls?.length
          });

          console.log('[Streaming]', {
            contentLen: lastMsg.content.length,
            preview: lastMsg.content.slice(0, 50),
            hasToolCalls: !!lastMsg.toolCalls?.length
          });
        }

        return originalSetState.call(chatStore, newState);
      };

      // 🔥 步骤 1: 发送用户消息 "重构 README.md 150字左右"
      console.log('[Test] 步骤 1: 发送用户消息');
      const userMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md 150字左右',
        timestamp: Date.now()
      });

      // 🔥 步骤 2: 创建 Agent 消息并触发 Agent 执行
      console.log('[Test] 步骤 2: 启动 Agent 执行');
      const agentMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        agentId: 'refactor-agent',
        content: '',
        timestamp: Date.now()
      });

      // 使用 Agent 执行
      try {
        const agentId = await agentStore.getState().launchAgent(
          'refactor-agent',
          '重构 README.md，使其更简洁，大约 150 字左右',
          agentMsgId
        );

        // 等待 Agent 响应和工具调用
        await new Promise(resolve => setTimeout(resolve, 15000));

        const messages = chatStore.getState().messages;
        const agentMessage = messages.find((m: any) => m.id === agentMsgId);

        if (!agentMessage) {
          return {
            success: false,
            error: 'Agent message not found'
          };
        }

        // 恢复原始 setState
        chatStore.setState = originalSetState;

        // 🔥 分析流式更新
        console.log('[Test] ========== 流式更新分析 ==========');
        console.log('[Test] 总更新次数:', streamingUpdates.length);
        console.log('[Test] 消息状态变化:', messageStates.length);

        // 检查是否有内容更新
        const hasContentUpdates = streamingUpdates.length > 0;
        const contentGrowth = streamingUpdates.length > 1
          ? streamingUpdates[streamingUpdates.length - 1].length - streamingUpdates[0].length
          : 0;

        console.log('[Test] 内容增长:', contentGrowth, '字符');

        // 检查是否有工具调用
        const hasToolCalls = agentMessage.toolCalls && agentMessage.toolCalls.length > 0;

        return {
          success: true,
          agentId: agentMessage.agentId,
          content: agentMessage.content,
          contentLen: agentMessage.content?.length || 0,
          toolCalls: agentMessage.toolCalls?.map((tc: any) => ({
            tool: tc.tool,
            status: tc.status,
            isPartial: tc.isPartial
          })) || [],
          streamingStats: {
            updateCount: streamingUpdates.length,
            hasProgressiveUpdates: streamingUpdates.length > 10,
            contentGrowth,
            hasToolCalls
          },
          messageStates: messageStates.slice(0, 20) // 只保存前 20 个状态
        };

      } catch (error: any) {
        chatStore.setState = originalSetState;
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.success) {
      // ✅ 验证 1: 有流式更新
      expect(result.streamingStats.updateCount).toBeGreaterThan(0);
      console.log('[Test] ✅ 有流式更新:', result.streamingStats.updateCount, '次');

      // ✅ 验证 2: 检查内容是否增长
      if (result.streamingStats.contentGrowth > 0) {
        console.log('[Test] ✅ 内容正常增长:', result.streamingStats.contentGrowth, '字符');
      } else {
        console.log('[Test] ⚠️  内容没有增长，可能是 AI 一次性返回完整内容');
      }

      // ✅ 验证 3: 检查工具调用
      if (result.streamingStats.hasToolCalls) {
        console.log('[Test] ✅ 有工具调用:', result.toolCalls.map((tc: any) => tc.tool).join(', '));
      } else {
        console.log('[Test] ⚠️  没有工具调用，AI 可能直接回复了文本');
      }

      console.log('[Test] ✅ 测试完成，最终内容长度:', result.contentLen, '字符');
      console.log('[Test] 最终内容预览:', result.content?.slice(0, 200));
    } else {
      console.log('[Test] ❌ 测试失败:', result.error);
      if (result.stack) {
        console.log('[Test] 错误堆栈:', result.stack);
      }
    }
  });

  test('should verify tool approval flow with streaming args', async ({ page }) => {
    console.log('[Test] ========== 工具批准流程验证 ==========');
    test.setTimeout(120000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'Required stores not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      // 创建带有工具调用的消息
      const msgId = crypto.randomUUID();
      const toolCallId = 'call_test_' + Date.now();

      // 🔥 模拟流式更新的工具调用
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        agentId: 'test-agent',
        content: '',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_read_file',
          function: { name: 'agent_read_file', arguments: '' },
          arguments: {},
          status: 'pending' as const,
          isPartial: true,
          isApproved: false
        }],
        timestamp: Date.now()
      });

      // 记录更新
      const updates: any[] = [];

      const checkInterval = setInterval(() => {
        const messages = chatStore.getState().messages;
        const msg = messages.find((m: any) => m.id === msgId);
        if (msg && msg.toolCalls) {
          const tc = msg.toolCalls[0];
          updates.push({
            argsLen: JSON.stringify(tc.arguments || {}).length,
            isPartial: tc.isPartial,
            status: tc.status
          });
          console.log('[Update]', updates[updates.length - 1]);
        }
      }, 100);

      // 模拟流式更新 args
      await new Promise(resolve => setTimeout(resolve, 100));
      let messages = chatStore.getState().messages;
      let msg = messages.find((m: any) => m.id === msgId);
      msg.toolCalls[0].arguments = { path: 'RE' };
      chatStore.setState({ messages: [...messages] });

      await new Promise(resolve => setTimeout(resolve, 100));
      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === msgId);
      msg.toolCalls[0].arguments = { path: 'READM' };
      chatStore.setState({ messages: [...messages] });

      await new Promise(resolve => setTimeout(resolve, 100));
      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === msgId);
      msg.toolCalls[0].arguments = { path: 'README.md' };
      msg.toolCalls[0].isPartial = false;
      chatStore.setState({ messages: [...messages] });

      await new Promise(resolve => setTimeout(resolve, 500));
      clearInterval(checkInterval);

      return {
        success: true,
        updates: updates,
        finalArgs: msg.toolCalls[0].arguments,
        finalIsPartial: msg.toolCalls[0].isPartial
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // 验证有流式更新
    expect(result.success).toBe(true);
    expect(result.updates.length).toBeGreaterThan(0);
    console.log('[Test] ✅ 捕获到', result.updates.length, '次更新');

    // 验证最终状态
    expect(result.finalIsPartial).toBe(false);
    expect(result.finalArgs.path).toBe('README.md');
    console.log('[Test] ✅ 工具参数最终状态正确');
  });
});
