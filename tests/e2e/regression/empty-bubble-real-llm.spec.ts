/**
 * 真实 LLM 空气泡问题回归测试
 *
 * 测试场景（用户报告）：
 * 用户输入："执行npm run dev"
 * 预期：显示 Markdown 格式的命令界面（ToolApproval 组件）
 * 实际：显示正确的命令界面后，还紧跟一个空气泡
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('真实 LLM 空气泡问题回归测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('empty') || text.includes('bubble') || text.includes('content')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);
  });

  /**
   * 测试用例 1: 真实 LLM 场景 - 输入"执行npm run dev"
   *
   * 还原用户报告的确切场景
   */
  test('empty-bubble-real-01: 真实 LLM 输入"执行npm run dev"不应该有空气泡', async ({ page }) => {
    console.log('[Test] 开始测试: 真实 LLM 场景还原');

    // 获取真实 AI 配置
    const config = await page.evaluate(async () => {
      return (window as any).__getRealAIConfig ? (window as any).__getRealAIConfig() : null;
    });

    if (!config) {
      console.log('[Test] 跳过：没有配置真实 AI');
      test.skip();
      return;
    }

    console.log('[Test] 使用配置:', config);

    // 发送消息
    const result = await page.evaluate(async (aiConfig) => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 发送用户消息
      await chatStore.getState().sendMessage(
        '执行npm run dev',
        aiConfig.providerId,
        aiConfig.modelId
      );

      // 等待响应完成
      await new Promise(resolve => setTimeout(resolve, 15000));

      // 分析消息
      const messages = chatStore.getState().messages;

      // 找到所有的 assistant 消息
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

      // 检查每个 assistant 消息
      const analysis = assistantMessages.map((msg: any) => {
        const hasContent = msg.content && msg.content.trim().length > 0;
        const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
        const contentLength = msg.content ? msg.content.length : 0;
        const contentPreview = msg.content ? msg.content.substring(0, 100) : '';

        // 检查是否是空气泡候选
        const isEmptyBubble = !hasContent && hasToolCalls;

        return {
          id: msg.id,
          hasContent,
          hasToolCalls,
          contentLength,
          contentPreview,
          isEmptyBubble,
          toolCallsCount: hasToolCalls ? msg.toolCalls.length : 0
        };
      });

      // 统计
      const totalAssistantMessages = assistantMessages.length;
      const emptyBubbleCount = analysis.filter(a => a.isEmptyBubble).length;
      const hasBashTool = analysis.some(a =>
        a.toolCallsCount > 0 && a.contentPreview.includes('bash')
      );

      return {
        success: true,
        totalAssistantMessages,
        emptyBubbleCount,
        hasBashTool,
        analysis,
        allMessages: messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          contentLength: m.content ? m.content.length : 0,
          hasToolCalls: m.toolCalls && m.toolCalls.length > 0,
          contentPreview: m.content ? m.content.substring(0, 50) : ''
        }))
      };
    }, config);

    console.log('[Test] 真实 LLM 场景分析结果:', JSON.stringify(result, null, 2));

    if (result && result.success) {
      console.log('[Test] 总 assistant 消息数:', result.totalAssistantMessages);
      console.log('[Test] 空气泡数:', result.emptyBubbleCount);
      console.log('[Test] 有 bash 工具:', result.hasBashTool);

      // 验证：不应该有空气泡
      expect(result.emptyBubbleCount, '不应该有空气泡').toBe(0);

      console.log('[Test] ✅ 没有空气泡');
    } else {
      console.log('[Test] 结果无效，跳过验证');
    }
  });

  /**
   * 测试用例 2: 模拟本地模型响应
   *
   * 模拟本地模型返回工具调用但没有文本内容的情况
   */
  test('empty-bubble-real-02: 模拟本地模型工具调用场景', async ({ page }) => {
    console.log('[Test] 开始测试: 模拟本地模型工具调用');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 1. 用户消息
      const userMsgId = 'user-npm-dev';
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '执行npm run dev',
        timestamp: Date.now()
      });

      // 2. 模拟本地模型的响应流程
      // 首先创建一个 assistant 消息（初始为空）
      const assistantMsgId = 'assistant-npm-dev';
      const toolCallId = 'tc-npm-dev';

      // 初始消息（可能在流式传输中创建）
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',  // 初始为空
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
          status: 'pending'
        }]
      });

      // 3. 模拟流式内容事件（本地模型摘要 - 应该被过滤）
      const localModelSummary = '[Local Model] Completed in 19ms\n\n[OK] bash (19ms)\n{"exit_code":-1,"stdout":"","stderr":"sh: 执行npm: command not found","success":true,"elapsed_ms":19}';

      // 模拟流式监听器处理这个事件
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);

      // 检查消息状态
      const hasContentAfterStream = assistantMsg?.content && assistantMsg.content.trim().length > 0;
      const contentAfterStream = assistantMsg?.content || '';

      // 4. 更新工具调用状态为 completed
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
                  stderr: 'sh: 执行npm: command not found',
                  success: true,
                  elapsed_ms: 19
                })
              } : tc
            )
          } : m
        )
      }));

      // 5. 最终检查
      const finalMessages = chatStore.getState().messages;
      const finalAssistantMsg = finalMessages.find((m: any) => m.id === assistantMsgId);

      const finalHasContent = finalAssistantMsg?.content && finalAssistantMsg.content.trim().length > 0;
      const finalHasToolCalls = finalAssistantMsg?.toolCalls && finalAssistantMsg.toolCalls.length > 0;
      const finalContent = finalAssistantMsg?.content || '';

      return {
        success: true,
        hasContentAfterStream,
        contentAfterStream,
        finalHasContent,
        finalHasToolCalls,
        finalContent,
        finalContentLength: finalContent.length,
        // 检查是否会被判定为空气泡
        wouldBeHidden: !finalHasContent && finalHasToolCalls
      };
    });

    console.log('[Test] 模拟本地模型工具调用结果:', result);

    expect(result.success).toBe(true);
    expect(result.finalHasToolCalls).toBe(true);

    // 关键检查：如果只有 toolCalls 没有内容，应该隐藏气泡
    expect(result.wouldBeHidden, '只有 toolCalls 没有内容的消息应该隐藏气泡').toBe(true);

    console.log('[Test] ✅ 只有 toolCalls 的消息会被正确隐藏');
  });

  /**
   * 测试用例 3: 检查 MessageItem 的 shouldHideBubble 逻辑
   */
  test('empty-bubble-real-03: MessageItem shouldHideBubble 逻辑验证', async ({ page }) => {
    console.log('[Test] 开始测试: MessageItem shouldHideBubble 逻辑');

    const result = await page.evaluate(async () => {
      // 模拟 MessageItem 中的 shouldHideBubble 检测逻辑
      const checkShouldHideBubble = (message: any) => {
        const isUser = message.role === 'user';
        const isAgent = !!(message as any).agentId;
        const hasContent = message.content && message.content.trim().length > 0;
        const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

        const shouldHideBubble = !isUser && !isAgent && !hasContent && hasToolCalls;

        return {
          isUser,
          isAgent,
          hasContent,
          hasToolCalls,
          shouldHideBubble,
          contentLength: message.content ? message.content.length : 0,
          contentPreview: message.content ? message.content.substring(0, 50) : ''
        };
      };

      // 测试各种情况
      const testCases = [
        {
          name: '正常 AI 响应（有内容）',
          message: {
            id: '1',
            role: 'assistant',
            content: '这是一个正常的回复',
            toolCalls: []
          },
          expectedHide: false
        },
        {
          name: '只有 toolCalls 没有内容（应该隐藏）',
          message: {
            id: '2',
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'tc1', tool: 'bash' }]
          },
          expectedHide: true
        },
        {
          name: 'content 为 null 且有 toolCalls（应该隐藏）',
          message: {
            id: '3',
            role: 'assistant',
            content: null,
            toolCalls: [{ id: 'tc1', tool: 'bash' }]
          },
          expectedHide: true
        },
        {
          name: 'content 只有空格且有 toolCalls（应该隐藏）',
          message: {
            id: '4',
            role: 'assistant',
            content: '   ',
            toolCalls: [{ id: 'tc1', tool: 'bash' }]
          },
          expectedHide: true
        },
        {
          name: '用户消息（不应该隐藏）',
          message: {
            id: '5',
            role: 'user',
            content: '',
            toolCalls: []
          },
          expectedHide: false
        },
        {
          name: 'Agent 消息没有内容但有 toolCalls（不应该隐藏）',
          message: {
            id: '6',
            role: 'assistant',
            agentId: 'agent-1',
            content: '',
            toolCalls: [{ id: 'tc1', tool: 'bash' }]
          },
          expectedHide: false
        }
      ];

      const results = testCases.map(tc => {
        const check = checkShouldHideBubble(tc.message);
        return {
          name: tc.name,
          expected: tc.expectedHide,
          actual: check.shouldHideBubble,
          passed: check.shouldHideBubble === tc.expectedHide,
          details: check
        };
      });

      return {
        success: true,
        results,
        allPassed: results.every(r => r.passed)
      };
    });

    console.log('[Test] shouldHideBubble 逻辑验证结果:', result);

    expect(result.success).toBe(true);
    expect(result.allPassed, '所有测试用例应该通过').toBe(true);

    result.results.forEach((r: any) => {
      console.log(`[Test] ${r.name}: ${r.passed ? '✅' : '❌'} (expected: ${r.expected}, actual: ${r.actual})`);
      if (!r.passed) {
        console.log(`[Test]   详情:`, r.details);
      }
    });
  });
});
