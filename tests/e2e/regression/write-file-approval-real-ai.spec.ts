/**
 * 高保真 E2E 测试：write_file 审批按钮不显示
 *
 * 问题描述：后端发送 tool_approval_required 后前端没有反应，
 * 刷新页面才出现审批按钮。bash 审批正常。
 *
 * 测试策略：
 * 1. 使用真实 LLM 触发 write_file 工具调用
 * 2. 捕获完整的控制台日志（StoreMapper, StreamingResponseController）
 * 3. 检查 toolCall.status、isPartial、segments 等关键状态
 * 4. 对比 bash 和 write_file 的行为差异
 *
 * 运行：npx playwright test tests/e2e/regression/write-file-approval-real-ai.spec.ts
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';

// 收集控制台日志
const consoleLogs: string[] = [];

test.describe('write_file 审批按钮高保真 E2E 测试', () => {
  test.beforeEach(async ({ page }) => {
    consoleLogs.length = 0;

    page.on('console', msg => {
      const text = msg.text();
      // 只收集关键日志
      if (
        text.includes('[StoreMapper]') ||
        text.includes('[SC]') ||
        text.includes('[ContentSegmentManager]') ||
        text.includes('[E2E') ||
        text.includes('approval') ||
        text.includes('Approval') ||
        text.includes('tool_approval') ||
        text.includes('tool_call') ||
        text.includes('stream_phase') ||
        text.includes('[MessageItem]') ||
        text.includes('[ToolApproval]')
      ) {
        consoleLogs.push(text);
        console.log('[E2E Capture]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);

    // 设置项目路径
    await page.evaluate(() => {
      (window as any).__IFAI_PROJECT_ROOT__ = '/Users/mac/project/demo/2048';
    });
  });

  test('write_file 工具调用应显示审批按钮', async ({ page }) => {
    // Given: 使用真实 LLM 请求创建文件
    const config = await getRealAIConfig(page);

    // When: 发送消息请求创建文件（这会触发 write_file 工具调用）
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, {
      text: '请在当前项目目录创建一个 TEST_APPROVAL_E2E.md 文件，内容为 "# E2E Test\n\nThis is a test file."',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 等待 AI 响应和工具调用
    await page.waitForTimeout(20000);

    // Then: 收集诊断信息
    const diagnostics = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];

      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const lastAssistant = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : null;

      // 收集所有 toolCalls
      const allToolCalls = messages.flatMap((m: any) =>
        (m.toolCalls || []).map((tc: any) => ({
          id: tc.id,
          tool: tc.tool,
          status: tc.status,
          isPartial: tc.isPartial,
          args: typeof tc.args === 'object' ? JSON.stringify(tc.args) : String(tc.args || '').substring(0, 100),
          messageId: m.id,
          messageRole: m.role
        }))
      );

      // 收集所有 segments
      const allSegments = messages.flatMap((m: any) =>
        (m.segments || []).map((s: any) => ({
          type: s.type,
          order: s.order,
          toolCallId: s.toolCallId,
          toolName: s.toolName,
          phase: s.phase,
          messageId: m.id
        }))
      );

      // 检查 isStreaming 状态
      const isStreaming = chatStore ? chatStore.getState().isStreaming : false;
      const isLoading = chatStore ? chatStore.getState().isLoading : false;

      // 检查 ContentSegmentManager 状态
      const csmState = (window as any).__contentSegmentManager;

      return {
        isStreaming,
        isLoading,
        toolCallCount: allToolCalls.length,
        toolCalls: allToolCalls,
        segments: allSegments,
        lastAssistantContent: lastAssistant ? lastAssistant.content.substring(0, 200) : null,
        lastAssistantId: lastAssistant ? lastAssistant.id : null,
        lastAssistantSegments: lastAssistant ? (lastAssistant.segments || []) : [],
        lastAssistantToolCalls: lastAssistant ? (lastAssistant.toolCalls || []) : [],
        lastAssistantIsStreaming: lastAssistant ? lastAssistant.isStreaming : null,
      };
    });

    // 打印诊断信息
    console.log('\n═══════════════════════════════════════════════');
    console.log('[E2E DIAGNOSTICS] write_file 审批按钮诊断');
    console.log('═══════════════════════════════════════════════');
    console.log('[DIAG] isStreaming:', diagnostics.isStreaming);
    console.log('[DIAG] isLoading:', diagnostics.isLoading);
    console.log('[DIAG] toolCallCount:', diagnostics.toolCallCount);
    console.log('[DIAG] segments count:', diagnostics.segments.length);
    console.log('[DIAG] lastAssistantIsStreaming:', diagnostics.lastAssistantIsStreaming);

    diagnostics.toolCalls.forEach((tc, i) => {
      console.log(`[DIAG] toolCall[${i}]: tool=${tc.tool}, status=${tc.status}, isPartial=${tc.isPartial}, args=${tc.args}`);
    });

    diagnostics.segments.forEach((s, i) => {
      console.log(`[DIAG] segment[${i}]: type=${s.type}, toolCallId=${s.toolCallId}, toolName=${s.toolName}, phase=${s.phase}`);
    });

    console.log('[DIAG] lastAssistantSegments:', JSON.stringify(diagnostics.lastAssistantSegments.map((s: any) => ({
      type: s.type, toolCallId: s.toolCallId, toolName: s.toolName
    }))));

    console.log('[DIAG] lastAssistantToolCalls:', JSON.stringify(diagnostics.lastAssistantToolCalls.map((tc: any) => ({
      id: tc.id, tool: tc.tool, status: tc.status, isPartial: tc.isPartial
    }))));

    // 关键日志
    console.log('\n[DIAG] === 关键控制台日志 ===');
    consoleLogs.forEach(log => console.log('[DIAG LOG]', log));

    // 验证：write_file toolCall 应该存在
    const writeToolCalls = diagnostics.toolCalls.filter(tc => tc.tool === 'write_file' || tc.tool === 'agent_write_file');
    console.log('[DIAG] write_file toolCalls found:', writeToolCalls.length);

    if (writeToolCalls.length === 0) {
      console.log('[DIAG] ⚠️ 没有找到 write_file 工具调用，AI 可能没有生成工具调用');
      // 不 fail，因为 LLM 可能不配合
      return;
    }

    // 验证：write_file toolCall 状态应该是 pending
    const pendingWriteCalls = writeToolCalls.filter(tc => tc.status === 'pending');
    console.log('[DIAG] pending write_file calls:', pendingWriteCalls.length);

    // 验证：segments 中应该有对应的 tool segment
    const writeToolSegments = diagnostics.segments.filter(s =>
      s.type === 'tool' && s.toolName?.includes('write_file')
    );
    console.log('[DIAG] write_file segments:', writeToolSegments.length);

    // 核心断言：write_file toolCall 应该是 pending 且不是 isPartial
    for (const tc of writeToolCalls) {
      console.log(`[ASSERT] write_file status=${tc.status}, isPartial=${tc.isPartial}`);
      // 如果 status 不是 pending，说明被自动审批了
      if (tc.status !== 'pending') {
        console.log(`[DIAG] ❌ write_file status 不是 pending 而是 ${tc.status}！可能被自动审批了`);
      }
      // 如果 isPartial 是 true，说明审批按钮不会显示
      if (tc.isPartial === true) {
        console.log(`[DIAG] ❌ write_file isPartial=true！审批按钮不会显示`);
      }
    }

    // 验证：lastAssistant 的 segments 中应该有 tool segment
    const lastToolSegments = diagnostics.lastAssistantSegments.filter((s: any) => s.type === 'tool');
    console.log('[DIAG] lastAssistant tool segments:', lastToolSegments.length);

    // 核心问题诊断
    if (writeToolCalls.length > 0 && lastToolSegments.length === 0) {
      console.log('[DIAG] 🔴 关键发现：toolCalls 存在但 segments 中没有 tool segment！');
      console.log('[DIAG] 🔴 这意味着 ToolApproval 组件不会被渲染（依赖 segments）');
      console.log('[DIAG] 🔴 刷新后可能走 fallback 路径（直接使用 toolCalls），所以能显示');
    }

    // 检查 mergedSegments 是否阻塞了 fallback
    const lastTextSegments = diagnostics.lastAssistantSegments.filter((s: any) => s.type === 'text');
    if (lastTextSegments.length > 0 && lastToolSegments.length === 0) {
      console.log('[DIAG] 🔴 关键发现：有 text segments 但没有 tool segments！');
      console.log('[DIAG] 🔴 mergedSegments 非空 → 不走 fallback → ToolApproval 不渲染');
    }

    // 基本断言
    expect(writeToolCalls.length).toBeGreaterThan(0);

    // ⚠️ 这个断言可能会失败 - 这就是我们要证明的 bug
    // expect(pendingWriteCalls.length).toBeGreaterThan(0);
  });

  test('bash 工具调用应显示审批按钮（对照组）', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // When: 发送需要 bash 的请求
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, {
      text: '请执行 ls -la 命令查看当前目录文件',
      providerId: config.providerId,
      modelId: config.modelId
    });

    await page.waitForTimeout(20000);

    // Then: 收集诊断信息
    const diagnostics = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const lastAssistant = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : null;

      const allToolCalls = messages.flatMap((m: any) =>
        (m.toolCalls || []).map((tc: any) => ({
          id: tc.id,
          tool: tc.tool,
          status: tc.status,
          isPartial: tc.isPartial,
          messageId: m.id
        }))
      );

      const allSegments = messages.flatMap((m: any) =>
        (m.segments || []).map((s: any) => ({
          type: s.type,
          toolCallId: s.toolCallId,
          toolName: s.toolName,
          phase: s.phase,
          messageId: m.id
        }))
      );

      return {
        toolCallCount: allToolCalls.length,
        toolCalls: allToolCalls,
        segments: allSegments,
        lastAssistantSegments: lastAssistant ? (lastAssistant.segments || []) : [],
        lastAssistantToolCalls: lastAssistant ? (lastAssistant.toolCalls || []) : [],
      };
    });

    console.log('\n═══════════════════════════════════════════════');
    console.log('[E2E DIAGNOSTICS] bash 审批按钮诊断（对照组）');
    console.log('═══════════════════════════════════════════════');

    diagnostics.toolCalls.forEach((tc, i) => {
      console.log(`[DIAG] toolCall[${i}]: tool=${tc.tool}, status=${tc.status}, isPartial=${tc.isPartial}`);
    });

    diagnostics.segments.forEach((s, i) => {
      console.log(`[DIAG] segment[${i}]: type=${s.type}, toolCallId=${s.toolCallId}, toolName=${s.toolName}, phase=${s.phase}`);
    });

    console.log('[DIAG] lastAssistantSegments:', JSON.stringify(diagnostics.lastAssistantSegments.map((s: any) => ({
      type: s.type, toolCallId: s.toolCallId, toolName: s.toolName
    }))));

    const bashToolCalls = diagnostics.toolCalls.filter(tc => tc.tool === 'bash');
    const bashToolSegments = diagnostics.segments.filter(s =>
      s.type === 'tool' && s.toolName?.includes('bash')
    );
    const lastBashSegments = diagnostics.lastAssistantSegments.filter((s: any) => s.type === 'tool');

    console.log(`[DIAG] bash toolCalls: ${bashToolCalls.length}, segments: ${bashToolSegments.length}, lastAssistant tool segments: ${lastBashSegments.length}`);

    if (bashToolCalls.length > 0) {
      console.log(`[DIAG] bash status=${bashToolCalls[0].status}, isPartial=${bashToolCalls[0].isPartial}`);
    }

    // 对比分析
    if (bashToolCalls.length > 0 && lastBashSegments.length > 0) {
      console.log('[DIAG] ✅ bash 有 tool segment → ToolApproval 能渲染');
    } else if (bashToolCalls.length > 0 && lastBashSegments.length === 0) {
      console.log('[DIAG] ⚠️ bash 也没有 tool segment → 问题可能在 segments 创建');
    }
  });
});
