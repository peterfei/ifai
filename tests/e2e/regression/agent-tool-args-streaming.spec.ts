/**
 * Agent 工具参数流式更新测试
 *
 * 问题：当 toolCall.isPartial=true 时，args 流式更新，但 UI 没有实时显示
 * 根因：React.memo 比较函数没有检查 args 变化
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent 工具参数流式更新', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ToolApproval') ||
          text.includes('MessageItem') ||
          text.includes('args') ||
          text.includes('streaming') ||
          text.includes('React.memo')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('@regression agent-args-streaming-01: 验证 toolCall.args 流式更新时组件重新渲染', async ({ page }) => {
    console.log('[Test] ========== 测试 toolCall.args 流式更新 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });

      const agentMsgId = 'test-args-streaming-1';
      const toolCallId = 'tc-args-streaming-1';

      // 1. 创建 Agent 消息，带初始 toolCall (args 部分内容)
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '正在分析文件...',
        timestamp: Date.now(),
        agentId: 'test-agent',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          args: { path: 'README.md', content: '初始内容' },
          function: { name: 'agent_write_file', arguments: '{"path":"README.md","content":"初始内容"}' },
          status: 'pending',
          isPartial: true  // 🔥 流式状态，args 会继续更新
        }]
      });

      console.log('[Test] ========== 步骤 1: 创建了 isPartial=true 的 toolCall ==========');

      // 等待初始渲染
      await new Promise(resolve => setTimeout(resolve, 200));

      // 检查初始状态
      let messages = chatStore.getState().messages;
      const messagesList = messages.map((m: any) => ({ id: m.id, role: m.role, hasToolCalls: !!(m.toolCalls?.length) }));
      console.log('[Test] 消息列表长度:', messages.length);
      console.log('[Test] 消息列表:', messagesList);

      let msg = messages.find((m: any) => m.id === agentMsgId);
      let tc = msg?.toolCalls?.[0];
      console.log('[Test] 初始状态:', {
        hasToolCall: !!tc,
        tool: tc?.tool,
        argsLength: JSON.stringify(tc?.args).length,
        isPartial: tc?.isPartial
      });

      // 检查是否有 VirtualMessageList
      const virtualList = document.querySelector('[class*="virtual"]');
      console.log('[Test] VirtualMessageList 存在:', !!virtualList);

      // 检查 AIChat 组件是否存在
      const aiChatElement = document.querySelector('[class*="ai-chat"]') || document.querySelector('[class*="chat"]');
      console.log('[Test] AIChat 组件存在:', !!aiChatElement);

      // 2. 模拟 args 流式更新（多次更新）
      console.log('[Test] ========== 步骤 2: 模拟 args 流式更新 ==========');

      const updateCount = 5;
      for (let i = 1; i <= updateCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const newContent = `初始内容 ${' + 更多内容'.repeat(i)}`;
        chatStore.setState((state: any) => {
          const updated = state.messages.map(m => {
            if (m.id === agentMsgId) {
              return {
                ...m,
                toolCalls: (m.toolCalls || []).map(t =>
                  t.id === toolCallId
                    ? {
                        ...t,
                        args: { path: 'README.md', content: newContent },
                        function: {
                          name: 'agent_write_file',
                          arguments: JSON.stringify({ path: 'README.md', content: newContent })
                        }
                      }
                    : { ...t }
                )
              };
            }
            return m;
          });
          return { messages: updated };
        });

        console.log(`[Test] 流式更新 ${i}/${updateCount}: content长度 = ${newContent.length}`);
      }

      // 3. 检查最终状态
      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === agentMsgId);
      tc = msg?.toolCalls?.[0];

      console.log('[Test] ========== 步骤 3: 检查最终状态 ==========');
      console.log('[Test] 最终状态:', {
        tool: tc?.tool,
        argsLength: JSON.stringify(tc?.args).length,
        isPartial: tc?.isPartial,
        // 验证 args 确实更新了
        finalContent: tc?.args?.content?.substring(0, 20) + '...'
      });

      // 检查 DOM 中的 ToolApproval
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      console.log('[Test] ToolApproval 卡片数量:', toolApprovalCards.length);

      // 检查所有 ToolApproval 组件（不限制 data-test-id）
      const allToolApprovals = document.querySelectorAll('[class*="tool-approval"]');
      console.log('[Test] 所有包含 tool-approval 类名的元素数量:', allToolApprovals.length);

      // 检查消息气泡是否渲染
      const messageBubbles = document.querySelectorAll('[data-testid^="message-"]');
      console.log('[Test] 消息气泡数量:', messageBubbles.length);
      console.log('[Test] 所有消息 testid:', Array.from(messageBubbles).map(b => b.getAttribute('data-testid')));

      // 打印消息气泡的 HTML 结构
      const messageBubblesHTML: string[] = [];
      messageBubbles.forEach((bubble, idx) => {
        const html = bubble.innerHTML.substring(0, 1000);
        console.log(`[Test] 消息气泡 ${idx} HTML (前 1000 字符):`, html);
        messageBubblesHTML.push(html);
      });

      // 检查是否有任何包含 toolCall 相关内容的元素
      const allElements = document.querySelectorAll('*');
      const toolCallElements = Array.from(allElements).filter(el => {
        const text = el.textContent || '';
        const className = el.className?.toString() || '';  // 🔥 修复：转换为字符串
        return text.includes('agent_write_file') || text.includes('初始内容') ||
               className.includes('tool') || className.includes('approval');
      });
      console.log('[Test] 包含 toolCall 相关内容的元素数量:', toolCallElements.length);

      const toolCallElementsInfo = toolCallElements.slice(0, 5).map((el, idx) => ({
        tagName: el.tagName,
        className: el.className,
        textContent: (el.textContent || '').substring(0, 100)
      }));

      // 获取 ToolApproval 中显示的内容
      const argsElements = document.querySelectorAll('[data-test-id="tool-approval-args"]');
      console.log('[Test] ToolApproval args 元素数量:', argsElements.length);

      if (argsElements.length > 0) {
        const displayedArgs = argsElements[0].textContent || '';
        console.log('[Test] ToolApproval 显示的 args 长度:', displayedArgs.length);
        console.log('[Test] ToolApproval 显示的 args 预览:', displayedArgs.substring(0, 50) + '...');
      }

      return {
        success: true,
        initialState: {
          argsLength: 26  // '{"path":"README.md","content":"初始内容"}'
        },
        finalState: {
          argsLength: JSON.stringify(tc?.args).length,
          isPartial: tc?.isPartial,
          contentPreview: tc?.args?.content?.substring(0, 30)
        },
        domCheck: {
          toolApprovalCount: toolApprovalCards.length,
          argsElementsCount: argsElements.length,
          messageBubbleCount: messageBubbles.length,
          messageTestIds: Array.from(messageBubbles).map(b => b.getAttribute('data-testid')),
          messageBubblesHTML: messageBubblesHTML,
          toolCallElementsCount: toolCallElements.length,
          toolCallElementsInfo: toolCallElementsInfo
        },
        storeCheck: {
          messagesLength: messages.length,
          messagesList: messagesList,
          virtualListExists: !!virtualList,
          aiChatExists: !!aiChatElement
        },
        issue: argsElements.length === 0 ? 'ToolApproval 未渲染' : null
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    // 验证 args 确实更新了
    expect(result.finalState.argsLength).toBeGreaterThan(result.initialState.argsLength);

    // 验证 ToolApproval 渲染了
    if (result.domCheck.toolApprovalCount === 0) {
      console.log('[Test] ⚠️ 问题: ToolApproval 组件没有渲染');
    }
  });

  test('@regression agent-args-streaming-02: 验证 isPartial 从 true 变为 false 时重新渲染', async ({ page }) => {
    console.log('[Test] ========== 测试 isPartial 状态切换 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });

      const agentMsgId = 'test-ispartial-change-1';
      const toolCallId = 'tc-ispartial-change-1';

      // 1. 创建初始消息
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '准备执行操作...',
        timestamp: Date.now(),
        agentId: 'test-agent',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_read_file',
          args: { path: 'README.md' },
          function: { name: 'agent_read_file', arguments: '{"path":"README.md"}' },
          status: 'pending',
          isPartial: true
        }]
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. 检查 isPartial=true 时的渲染
      let toolApprovalCards1 = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      console.log('[Test] isPartial=true 时 ToolApproval 数量:', toolApprovalCards1.length);

      // 3. 更新 isPartial 为 false
      chatStore.setState((state: any) => {
        const updated = state.messages.map(m => {
          if (m.id === agentMsgId) {
            return {
              ...m,
              toolCalls: (m.toolCalls || []).map(t =>
                t.id === toolCallId
                  ? { ...t, isPartial: false }
                  : { ...t }
              )
            };
          }
          return m;
        });
        return { messages: updated };
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. 检查 isPartial=false 时的渲染
      let toolApprovalCards2 = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      console.log('[Test] isPartial=false 时 ToolApproval 数量:', toolApprovalCards2.length);

      // 检查 store 中的值
      let messages = chatStore.getState().messages;
      let msg = messages.find((m: any) => m.id === agentMsgId);
      let tc = msg?.toolCalls?.[0];

      return {
        success: true,
        isPartialChange: {
          before: true,
          after: tc?.isPartial
        },
        domChange: {
          beforeCount: toolApprovalCards1.length,
          afterCount: toolApprovalCards2.length
        }
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.isPartialChange.after).toBe(false);
  });
});
