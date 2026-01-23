/**
 * 真实 LLM 场景测试
 *
 * 模拟真实 Agent 执行场景：
 * 1. Agent thinking 内容流式更新
 * 2. tool_call 创建（isPartial: true）
 * 3. tool_call args 流式更新（多次）
 * 4. tool_call 完成（isPartial: false）
 * 5. 验证批准按钮是否显示
 *
 * @version v0.3.2
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('真实 LLM Agent 场景测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('MessageItem') ||
          text.includes('ToolApproval') ||
          text.includes('isPartial') ||
          text.includes('Streaming') ||
          text.includes('批准') ||
          text.includes('approve')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });

    // 🔥 等待 React 应用完全渲染，确保 VirtualMessageList 存在
    await page.waitForFunction(() => {
      // 检查是否有消息列表容器或聊天容器
      const body = document.body;
      return body && (body.innerHTML.includes('class') || body.children.length > 0);
    }, { timeout: 10000 });

    // 等待 React 应用稳定
    await page.waitForTimeout(1000);
  });

  test('@regression real-llm-01: 完整模拟真实 Agent 执行流程', async ({ page }) => {
    console.log('[Test] ========== 真实 LLM Agent 场景测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 🔥 调试：检查 React 应用是否已渲染
      console.log('[Test] ========== React 应用状态检查 ==========');
      const bodyChildren = document.body.children.length;
      const hasReactRoot = document.querySelector('#root') || document.querySelector('[class*="App"]') || document.querySelector('[class*="app"]');
      const hasChatContainer = document.querySelector('[class*="chat"]') || document.querySelector('[class*="Chat"]');
      console.log('[Test] DOM 状态:', {
        bodyChildren,
        hasReactRoot: !!hasReactRoot,
        hasChatContainer: !!hasChatContainer
      });

      // 清空消息
      chatStore.setState({ messages: [] });

      const userMsgId = 'user-real-llm-1';
      const agentId = crypto.randomUUID();
      const agentMsgId = crypto.randomUUID();
      const toolCallId = 'tc-real-llm-1';

      // 步骤 1: 用户发送消息
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md 文件',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 步骤 2: 创建 Agent 消息（初始为空）
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: agentId
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 步骤 3: 模拟 thinking 内容流式更新
      const thinkingSteps = [
        '我来帮您重构',
        '我来帮您重构 README.md',
        '我来帮您重构 README.md 文件',
        '我来帮您重构 README.md 文件，精简到 100 行左右。'
      ];

      for (const thinking of thinkingSteps) {
        await new Promise(resolve => setTimeout(resolve, 100));
        chatStore.setState((state: any) => ({
          messages: state.messages.map((m: any) =>
            m.id === agentMsgId ? { ...m, content: thinking } : m
          )
        }));
      }

      console.log('[Test] Thinking 完成:', thinkingSteps[thinkingSteps.length - 1]);

      await new Promise(resolve => setTimeout(resolve, 200));

      // 步骤 4: 创建 tool_call（isPartial: true，初始 args 只有 path）
      console.log('[Test] 创建 tool_call (isPartial: true)');
      chatStore.setState((state: any) => ({
        messages: state.messages.map((m: any) => {
          if (m.id === agentMsgId) {
            return {
              ...m,
              toolCalls: [{
                id: toolCallId,
                type: 'function',
                tool: 'agent_write_file',
                args: { path: 'README.md' },  // 🔥 初始只有 path
                function: { name: 'agent_write_file', arguments: '{"path":"README.md"}' },
                status: 'pending',
                isPartial: true
              }]
            };
          }
          return m;
        })
      }));

      await new Promise(resolve => setTimeout(resolve, 200));

      // 检查 tool_call 创建后的状态
      let messages = chatStore.getState().messages;
      let agentMsg = messages.find((m: any) => m.id === agentMsgId);
      let toolCall = agentMsg?.toolCalls?.[0];
      console.log('[Test] tool_call 创建后:', {
        hasToolCall: !!toolCall,
        tool: toolCall?.tool,
        args: toolCall?.args,
        isPartial: toolCall?.isPartial
      });

      // 步骤 5: 模拟 args 流式更新（content 逐渐增长）
      console.log('[Test] 开始 args 流式更新');

      const contentParts = [
        'const projectName = ',
        'const projectName = "MyProject";\n\n',
        'const projectName = "MyProject";\n\n# ',
        'const projectName = "MyProject";\n\n# MyProject\n\nThis is ',
        'const projectName = "MyProject";\n\n# MyProject\n\nThis is a test project.'
      ];

      for (const content of contentParts) {
        await new Promise(resolve => setTimeout(resolve, 150));
        chatStore.setState((state: any) => ({
          messages: state.messages.map((m: any) => {
            if (m.id === agentMsgId) {
              return {
                ...m,
                toolCalls: (m.toolCalls || []).map((tc: any) =>
                  tc.id === toolCallId
                    ? {
                        ...tc,
                        args: { path: 'README.md', content: content },
                        function: { name: 'agent_write_file', arguments: JSON.stringify({ path: 'README.md', content }) }
                      }
                    : tc
                )
              };
            }
            return m;
          })
        }));
        console.log('[Test] args 更新, content 长度:', content.length);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // 检查 args 更新后的状态
      messages = chatStore.getState().messages;
      agentMsg = messages.find((m: any) => m.id === agentMsgId);
      toolCall = agentMsg?.toolCalls?.[0];
      console.log('[Test] args 更新完成:', {
        argsLength: JSON.stringify(toolCall?.args).length,
        isPartial: toolCall?.isPartial
      });

      // 步骤 6: 完成 tool_call（isPartial: false）
      console.log('[Test] 完成 tool_call (isPartial: false)');
      chatStore.setState((state: any) => ({
        messages: state.messages.map((m: any) => {
          if (m.id === agentMsgId) {
            return {
              ...m,
              toolCalls: (m.toolCalls || []).map((tc: any) =>
                tc.id === toolCallId
                  ? { ...tc, isPartial: false }
                  : tc
              )
            };
          }
          return m;
        })
      }));

      await new Promise(resolve => setTimeout(resolve, 300));

      // 步骤 7: 检查最终状态
      messages = chatStore.getState().messages;
      agentMsg = messages.find((m: any) => m.id === agentMsgId);
      toolCall = agentMsg?.toolCalls?.[0];

      console.log('[Test] ========== 最终状态检查 ==========');
      console.log('[Test] Store 状态:', {
        hasToolCall: !!toolCall,
        tool: toolCall?.tool,
        status: toolCall?.status,
        isPartial: toolCall?.isPartial,
        argsLength: JSON.stringify(toolCall?.args).length
      });

      // 检查 DOM
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      // 🔥 调试：检查消息的完整结构
      console.log('[Test] ========== 消息结构调试 ==========');

      // 🔥 检查 store 中的所有消息
      const allMessages = chatStore.getState().messages;
      console.log('[Test] Store 中所有消息:', allMessages.map((m: any) => ({
        id: m.id,
        role: m.role,
        hasContent: !!(m.content),
        contentLength: m.content?.length || 0,
        hasToolCalls: !!(m.toolCalls),
        toolCallsCount: m.toolCalls?.length || 0
      })));

      console.log('[Test] message 对象:', JSON.stringify({
        id: agentMsg?.id,
        role: agentMsg?.role,
        hasContent: !!(agentMsg?.content),
        contentLength: agentMsg?.content?.length || 0,
        hasContentSegments: !!((agentMsg as any).contentSegments),
        contentSegmentsLength: ((agentMsg as any).contentSegments)?.length || 0,
        hasToolCalls: !!(agentMsg?.toolCalls),
        toolCallsLength: agentMsg?.toolCalls?.length || 0,
        toolCall: agentMsg?.toolCalls?.[0]
      }, null, 2));

      // 检查消息气泡是否渲染
      const messageBubble = document.querySelector(`[data-testid="message-${agentMsgId}"]`);
      console.log('[Test] 消息气泡存在:', !!messageBubble);
      const messageBubbleHTML = messageBubble ? messageBubble.innerHTML.substring(0, 3000) : '';
      if (messageBubble) {
        console.log('[Test] 消息气泡 HTML (前 2000 字符):', messageBubbleHTML);
      }

      // 检查是否有任何 ToolApproval 相关元素
      const allToolApprovals = document.querySelectorAll('[class*="tool-approval"]');
      console.log('[Test] 所有 tool-approval 元素数量:', allToolApprovals.length);

      console.log('[Test] DOM 状态:', {
        toolApprovalCount: toolApprovalCards.length,
        approveButtonCount: approveButtons.length
      });

      // 检查批准按钮显示条件
      const isPending = toolCall?.status === 'pending';
      const isPartial = toolCall?.isPartial;
      const shouldShowButtons = isPending && !isPartial;

      console.log('[Test] 按钮显示条件:', {
        isPending,
        isPartial,
        shouldShowButtons,
        condition: `status=${toolCall?.status}, isPartial=${isPartial} → ${shouldShowButtons}`
      });

      return {
        success: true,
        flowSteps: {
          thinking: thinkingSteps[thinkingSteps.length - 1],
          toolCallCreated: { isPartial: true, args: { path: 'README.md' } },
          argsUpdated: {
            isPartial: toolCall?.isPartial,
            contentLength: toolCall?.args?.content?.length || 0
          },
          toolCallCompleted: {
            isPartial: toolCall?.isPartial,
            status: toolCall?.status
          }
        },
        storeMessages: allMessages.map((m: any) => ({
          id: m.id,
          role: m.role,
          hasContent: !!(m.content),
          contentLength: m.content?.length || 0,
          hasToolCalls: !!(m.toolCalls),
          toolCallsCount: m.toolCalls?.length || 0
        })),
        messageStructure: {
          id: agentMsg?.id,
          hasContent: !!(agentMsg?.content),
          contentLength: agentMsg?.content?.length || 0,
          hasContentSegments: !!((agentMsg as any).contentSegments),
          hasToolCalls: !!(agentMsg?.toolCalls),
          toolCallsLength: agentMsg?.toolCalls?.length || 0
        },
        domCheck: {
          messageBubbleExists: !!messageBubble,
          messageBubbleHTML: messageBubbleHTML,
          toolApprovalCount: toolApprovalCards.length,
          approveButtonCount: approveButtons.length,
          allToolApprovalsCount: allToolApprovals.length
        },
        conditionCheck: {
          isPending,
          isPartial,
          shouldShowButtons
        },
        issue: !shouldShowButtons ? '条件不满足' :
               approveButtons.length === 0 ? '条件满足但无批准按钮（渲染问题）' :
               null
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.flowSteps.toolCallCompleted.isPartial).toBe(false);
    expect(result.conditionCheck.shouldShowButtons, '批准按钮显示条件应该满足').toBe(true);

    if (result.issue) {
      console.log('[Test] ⚠️ 发现问题:', result.issue);
    }

    expect(result.issue, '不应该有问题').toBeNull();
  });
});
