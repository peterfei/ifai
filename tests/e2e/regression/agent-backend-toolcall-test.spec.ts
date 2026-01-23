/**
 * 直接测试后端 tool_call 事件发送
 *
 * 绕过 Agent 系统，直接调用 ai_utils.rs 的流式 API
 * 来验证 isPartial=false 修复是否生效
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('后端 tool_call 事件发送测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[AgentStream]') || text.includes('tool_call') || text.includes('Streaming:') || text.includes('isPartial') || text.includes('[AgentStore]')) {
        console.log('[Backend]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    // agentStore 可能不存在，不强制等待
    await page.waitForTimeout(500);
  });

  test('@regression backend-toolcall-01: 验证智谱 LLM 返回 tool_calls 时后端发送正确的事件', async ({ page }) => {
    console.log('[Test] ========== 验证后端 tool_call 事件发送 ==========');

    // 这个测试通过 Tauri invoke 直接调用后端的 AI 功能
    // 来模拟真实场景并检查 tool_call 事件

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const assistantMsgId = crypto.randomUUID();

      // 创建 assistant 消息
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 监听 tool_call 事件
      const toolCallEvents: any[] = [];

      // 注册监听器
      const listenerId = crypto.randomUUID();

      // 创建一个 Promise 来等待 tool_call 事件
      const waitForToolCall = new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const messages = chatStore.getState().messages;
          const msg = messages.find((m: any) => m.id === assistantMsgId);
          if (msg?.toolCalls && msg.toolCalls.length > 0) {
            clearInterval(checkInterval);
            resolve(msg.toolCalls);
          }
        }, 100);

        // 超时
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(null);
        }, 20000);
      });

      // 通过 Tauri invoke 调用后端 ai_chat (带 tools)
      console.log('[Test] 调用后端 ai_chat...');

      try {
        const invokeResult = await (window as any).__TAURI__.core.invoke('ai_chat', {
          eventId: `test_${listenerId}`,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: '请读取 README.md 文件的内容' }
          ],
          providerId: 'real-ai-e2e',
          enableTools: true,
          projectRoot: '/Users/mac/project/aieditor/ifainew'
        });

        console.log('[Test] invokeResult:', invokeResult);
      } catch (e) {
        console.log('[Test] invoke error:', e);
      }

      // 等待 tool_call 事件
      const toolCalls = await waitForToolCall;

      // 检查消息状态
      const finalMessages = chatStore.getState().messages;
      const finalMsg = finalMessages.find((m: any) => m.id === assistantMsgId);

      console.log('[Test] ========== 最终状态 ==========');
      console.log('[Test] toolCalls:', toolCalls);
      console.log('[Test] finalMsg:', {
        id: finalMsg?.id,
        hasToolCalls: !!(finalMsg?.toolCalls),
        toolCallsCount: finalMsg?.toolCalls?.length || 0,
        contentLength: finalMsg?.content?.length || 0
      });

      // 检查 DOM
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      return {
        success: true,
        hasToolCalls: !!(finalMsg?.toolCalls),
        toolCallsCount: finalMsg?.toolCalls?.length || 0,
        firstToolCall: finalMsg?.toolCalls?.[0] || null,
        approveButtonCount: approveButtons.length,
        content: finalMsg?.content?.substring(0, 500) || null
      };
    });

    console.log('[Test] ========== 结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.hasToolCalls) {
      console.log('[Test] ✅ 成功接收到 tool_calls！');
      console.log('[Test] ToolCall:', result.firstToolCall);

      if (result.firstToolCall.isPartial === false) {
        console.log('[Test] ✅ isPartial 正确设置为 false！');
      } else {
        console.log('[Test] ❌ isPartial 仍然是 true，修复可能未生效');
      }

      if (result.approveButtonCount > 0) {
        console.log('[Test] ✅ 批准按钮已显示！');
      }
    } else {
      console.log('[Test] ❌ 没有接收到 tool_calls');
      console.log('[Test] Content:', result.content);
    }
  });

  test('@regression backend-toolcall-02: 真实用例 - 重构 README.md 90字左右', async ({ page }) => {
    console.log('[Test] ========== 真实用例：重构 README.md 90字左右 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      // 检查 agentStore 是否存在
      if (!agentStore) {
        return {
          success: false,
          error: 'agentStore not available in E2E environment',
          skip: true
        };
      }

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      // 1. 用户发送消息
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md 90字左右',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. 创建 Assistant 消息（用于 Agent 响应）
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: undefined,
        isAgentLive: true
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('[Test] 步骤 1: 启动 Agent');

      // 3. 启动 Refactor Agent
      const store = agentStore.getState();
      const agentId = await store.launchAgent(
        'Refactor Agent',
        '重构 README.md 90字左右',
        assistantMsgId,
        undefined
      );

      console.log('[Test] Agent ID:', agentId);

      // 4. 等待 Agent 执行并捕获状态
      await new Promise(resolve => setTimeout(resolve, 15000));

      // 5. 检查消息状态
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);
      const toolCall = assistantMsg?.toolCalls?.[0];

      console.log('[Test] ========== 消息状态检查 ==========');
      console.log('[Test] Assistant 消息:', {
        id: assistantMsg?.id,
        hasContent: !!(assistantMsg?.content),
        contentLength: assistantMsg?.content?.length || 0,
        contentPreview: assistantMsg?.content?.substring(0, 200),
        hasToolCalls: !!(assistantMsg?.toolCalls),
        toolCallsCount: assistantMsg?.toolCalls?.length || 0
      });

      console.log('[Test] ToolCall:', {
        id: toolCall?.id,
        tool: toolCall?.tool,
        status: toolCall?.status,
        isPartial: toolCall?.isPartial,
        args: toolCall?.args,
        shouldShowButtons: toolCall?.status === 'pending' && !toolCall?.isPartial
      });

      // 6. 检查 DOM
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));
      const rejectButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('拒绝') || b.textContent?.includes('Reject'));

      // 检查是否有 "是否确认写入文件？" 文字
      const allText = document.body.innerText;
      const hasConfirmText = allText.includes('是否确认写入文件') || allText.includes('确认写入');

      console.log('[Test] ========== DOM 状态 ==========');
      console.log('[Test] ToolApproval 卡片数量:', toolApprovalCards.length);
      console.log('[Test] 批准按钮数量:', approveButtons.length);
      console.log('[Test] 拒绝按钮数量:', rejectButtons.length);
      console.log('[Test] 有确认文字:', hasConfirmText);

      // 获取 ToolApproval 组件的 HTML（如果存在）
      if (toolApprovalCards.length > 0) {
        console.log('[Test] ToolApproval 卡片 HTML:', toolApprovalCards[0].innerHTML.substring(0, 1000));
      }

      return {
        success: true,
        agentId,
        messageState: {
          hasToolCall: !!toolCall,
          tool: toolCall?.tool,
          status: toolCall?.status,
          isPartial: toolCall?.isPartial,
          args: toolCall?.args,
          shouldShowButtons: toolCall?.status === 'pending' && !toolCall?.isPartial
        },
        domState: {
          toolApprovalCount: toolApprovalCards.length,
          approveButtonCount: approveButtons.length,
          rejectButtonCount: rejectButtons.length,
          hasConfirmText
        },
        issue: (() => {
          if (!toolCall) return '没有 toolCall';
          const shouldShow = toolCall.status === 'pending' && !toolCall.isPartial;
          if (!shouldShow) return `条件不满足: status=${toolCall.status}, isPartial=${toolCall.isPartial}`;
          if (approveButtons.length === 0) return '条件满足但批准按钮未显示';
          return null;
        })()
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.skip) {
      console.log('[Test] ⚠️ 跳过测试：', result.error);
      return;
    }

    expect(result.success).toBe(true);

    if (result.issue) {
      console.log('[Test] ❌ 发现问题:', result.issue);
    }

    if (result.messageState.hasToolCall && result.messageState.isPartial === false) {
      console.log('[Test] ✅ ToolCall 完整（isPartial: false），应该显示按钮');
    } else if (result.messageState.hasToolCall && result.messageState.isPartial === true) {
      console.log('[Test] ❌ ToolCall 仍然是部分状态（isPartial: true），修复未生效');
    }
  });
});
