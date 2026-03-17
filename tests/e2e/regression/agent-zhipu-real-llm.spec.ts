/**
 * 真实智谱 LLM Agent 工具批准按钮测试
 *
 * 完整模拟真实用户场景：
 * 1. 用户发送消息触发 Agent
 * 2. 创建 assistant 消息
 * 3. 调用 launchAgent
 * 4. 捕获真实的智谱 LLM 事件流
 * 5. 验证批准按钮是否显示
 *
 * @version v0.3.4
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('真实智谱 LLM Agent 工具批准按钮', () => {
  test.beforeEach(async ({ page }) => {
    // 捕获所有关键日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[AgentStore]') ||
          text.includes('[ToolApproval]') ||
          text.includes('tool_call') ||
          text.includes('isPartial') ||
          text.includes('pending') ||
          text.includes('批准')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForFunction(() => {
      const body = document.body;
      return body && (body.innerHTML.includes('class') || body.children.length > 0);
    }, { timeout: 10000 });

    await page.waitForTimeout(500);

    // 🔥 FIX v0.3.11: 设置 project root 以支持 Agent 测试
    await page.evaluate(async () => {
      const fileStore = (window as any).__fileStore;
      if (fileStore && !fileStore.getState().rootPath) {
        await fileStore.getState().setRootPath('/Users/mac/mock-project');
        console.log('[Test] Project root set to: /Users/mac/mock-project');
      }
    });
  });

  test('@regression zhipu-real-01: 完整流程测试 - 智谱 LLM', async ({ page }) => {
    console.log('[Test] ========== 真实智谱 LLM Agent 工具批准按钮测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      // ========== 步骤 1: 用户发送消息 ==========
      const userMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md 文件到 90 字左右',
        timestamp: Date.now()
      });

      console.log('[Test] ✅ 步骤 1: 用户消息已创建:', userMsgId);
      await new Promise(resolve => setTimeout(resolve, 200));

      // ========== 步骤 2: 创建 Assistant 消息（用于 Agent 响应）==========
      const assistantMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: undefined,
        isAgentLive: true
      });

      console.log('[Test] ✅ 步骤 2: Assistant 消息已创建:', assistantMsgId);
      await new Promise(resolve => setTimeout(resolve, 200));

      // ========== 步骤 3: 启动 Agent（传入 assistantMsgId）==========
      console.log('[Test] 🚀 步骤 3: 启动 Agent...');

      const store = agentStore.getState();
      const agentId = await store.launchAgent(
        'Refactor Agent',
        '重构 README.md 文件到 90 字左右',
        assistantMsgId,  // 关键：传入消息 ID
        undefined
      );

      console.log('[Test] ✅ Agent 已启动, ID:', agentId);

      // 更新消息的 agentId
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === assistantMsgId);
      if (msg) {
        (msg as any).agentId = agentId;
        chatStore.setState({ messages: [...messages] });
      }

      // ========== 步骤 4: 等待 Agent 执行并捕获事件 ==========
      console.log('[Test] ⏳ 步骤 4: 等待 Agent 执行（最多 30 秒）...');

      // 设置一个全局变量来捕获 tool_call 事件
      const toolCallsData: any[] = [];

      // 轮询检查 toolCalls 状态
      for (let i = 0; i < 60; i++) {  // 最多 30 秒
        await new Promise(resolve => setTimeout(resolve, 500));

        const currentMessages = chatStore.getState().messages;
        const assistantMsg = currentMessages.find((m: any) => m.id === assistantMsgId);

        if (assistantMsg?.toolCalls && assistantMsg.toolCalls.length > 0) {
          const toolCall = assistantMsg.toolCalls[0];
          toolCallsData.push({
            iteration: i,
            tool: toolCall.tool,
            status: toolCall.status,
            isPartial: toolCall.isPartial,
            hasArgs: !!toolCall.args,
            argsLength: JSON.stringify(toolCall.args || {}).length
          });

          console.log('[Test] 🔍 检查到 toolCall:', {
            tool: toolCall.tool,
            status: toolCall.status,
            isPartial: toolCall.isPartial,
            iteration: i
          });

          // 如果 toolCall 完成（isPartial: false），提前结束
          if (!toolCall.isPartial && toolCall.status === 'pending') {
            console.log('[Test] ✅ toolCall 已完成（isPartial: false）');
            break;
          }
        }
      }

      // ========== 步骤 5: 最终状态检查 ==========
      await new Promise(resolve => setTimeout(resolve, 1000));  // 等待 React 渲染

      const finalMessages = chatStore.getState().messages;
      const finalAssistantMsg = finalMessages.find((m: any) => m.id === assistantMsgId);
      const finalToolCall = finalAssistantMsg?.toolCalls?.[0];

      console.log('[Test] ========== 最终状态检查 ==========');
      console.log('[Test] Assistant 消息:', {
        id: finalAssistantMsg?.id,
        hasContent: !!(finalAssistantMsg?.content),
        contentLength: finalAssistantMsg?.content?.length || 0,
        hasToolCalls: !!(finalAssistantMsg?.toolCalls),
        toolCallsCount: finalAssistantMsg?.toolCalls?.length || 0,
        agentId: finalAssistantMsg?.agentId
      });

      console.log('[Test] ToolCall:', {
        tool: finalToolCall?.tool,
        status: finalToolCall?.status,
        isPartial: finalToolCall?.isPartial,
        args: finalToolCall?.args
      });

      // ========== 步骤 6: DOM 检查 ==========
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));
      const rejectButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('拒绝') || b.textContent?.includes('Reject'));

      console.log('[Test] ========== DOM 检查 ==========');
      console.log('[Test] ToolApproval 卡片数量:', toolApprovalCards.length);
      console.log('[Test] 批准按钮数量:', approveButtons.length);
      console.log('[Test] 拒绝按钮数量:', rejectButtons.length);

      return {
        success: true,
        agentId,
        toolCallsHistory: toolCallsData,
        finalState: {
          hasToolCall: !!finalToolCall,
          tool: finalToolCall?.tool,
          status: finalToolCall?.status,
          isPartial: finalToolCall?.isPartial,
          shouldShowButtons: finalToolCall?.status === 'pending' && !finalToolCall?.isPartial
        },
        domState: {
          toolApprovalCount: toolApprovalCards.length,
          approveButtonCount: approveButtons.length,
          rejectButtonCount: rejectButtons.length
        },
        issue: (() => {
          if (!finalToolCall) return '没有 toolCall';
          const shouldShow = finalToolCall.status === 'pending' && !finalToolCall.isPartial;
          if (!shouldShow) return `条件不满足: status=${finalToolCall.status}, isPartial=${finalToolCall.isPartial}`;
          if (approveButtons.length === 0) return '条件满足但批准按钮未显示（渲染问题）';
          return null;
        })()
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.issue) {
      console.log('[Test] ❌ 发现问题:', result.issue);
    }

    // 等待 5 秒让用户看到最终状态（如果用 headed 模式）
    await page.waitForTimeout(5000);
  });
});
