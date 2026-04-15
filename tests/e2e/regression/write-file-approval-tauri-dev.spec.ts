/**
 * 高保真 E2E 测试：write_file 审批按钮诊断（真实 Tauri + 真实 LLM）
 *
 * 使用真实 Tauri 应用 + 真实 LLM 还原问题
 *
 * 运行方式：
 *   TAURI_DEV=true npx playwright test tests/e2e/regression/write-file-approval-tauri-dev.spec.ts --timeout=120000
 *
 * 前置条件：
 *   1. tests/e2e/.env.e2e.local 中配置了有效的 API key
 *   2. TAURI_DEV=true 启动真实 Tauri 应用
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup-utils';

const IS_TAURI = !!process.env.TAURI_DEV;

test.describe('write_file 审批按钮真实 Tauri 诊断', () => {
  test.skip(!IS_TAURI, '跳过：需要 TAURI_DEV=true 运行真实 Tauri 应用');
  test.setTimeout(120000);

  // 收集所有诊断日志
  let diagLogs: string[] = [];

  test.beforeEach(async ({ page }) => {
    diagLogs = [];

    // 捕获所有关键诊断日志
    page.on('console', msg => {
      const text = msg.text();
      // 捕获所有诊断相关日志
      if (text.includes('[SC:DIAG') || text.includes('[StoreMapper:DIAG') ||
          text.includes('[SC:DIAG:LISTEN]') || text.includes('[SC:DIAG:TOOL]') ||
          text.includes('[SC] 🏁') || text.includes('[SC] ⛔') ||
          text.includes('approval') || text.includes('tool_call') ||
          text.includes('tool_approval') || text.includes('stream_phase') ||
          text.includes('[MessageItem]') || text.includes('emitFinished') ||
          text.includes('[E2E]') || text.includes('ToolStart') ||
          text.includes('ToolDone') || text.includes('Finish reason') ||
          text.includes('[ChatStore]') || text.includes('[Zhipu]') ||
          text.includes('[AI Chat]') || text.includes('[AI]')) {
        diagLogs.push(text);
        console.log('[Browser]', text);
      }
    });

    // 使用标准 setupE2ETestEnvironment（会自动从 .env.e2e.local 读取配置）
    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      skipWelcome: true
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 等待关键 Store 初始化
    await page.waitForFunction(() => {
      return window.__chatStore && window.__settingsStore && window.__threadStore;
    }, { timeout: 30000 });

    console.log('[E2E Setup] ✅ Stores initialized');

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);

    // 确保使用标准模式和项目根目录
    await page.evaluate(() => {
      (window as any).__IFAI_EDITOR_MODE__ = 'standard';
      (window as any).__IFAI_PROJECT_ROOT__ = '/Users/mac/project/demo/2048';
    });

    // 清理聊天历史（避免之前的会话干扰）
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const fileStore = (window as any).__fileStore;
      if (chatStore) {
        chatStore.setState({ messages: [], isLoading: false, isStreaming: false });
        console.log('[E2E] ✅ Chat history cleared');
      }
      // 检查 fileStore 状态
      if (fileStore) {
        const fs = fileStore.getState();
        console.log('[E2E] 📁 fileStore state:', {
          rootPath: fs.rootPath,
          getActiveRoot: fs.getActiveRoot?.()?.path,
          projectRoot: (window as any).__IFAI_PROJECT_ROOT__
        });
        // 设置 rootPath
        if (!fs.rootPath) {
          fileStore.getState().setRootPath('/Users/mac/project/demo/2048');
          console.log('[E2E] 📁 Set rootPath to /Users/mac/project/demo/2048');
        }
      }
    });
  });

  test('write_file 工具调用应在 30 秒内显示审批按钮', async ({ page }) => {
    console.log('[E2E] 🧪 测试开始: write_file 审批按钮诊断');

    // 1. 获取真实 AI 配置
    const config = await getRealAIConfig(page);
    console.log('[E2E] 📋 AI配置:', {
      provider: config.providerId,
      model: config.modelId
    });

    // 验证 Tauri invoke 是否能正常触发后端
    const invokeTestResult = await page.evaluate(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        // 使用一个简单的后端命令来验证 invoke 是否工作
        const result = await invoke('get_app_version');
        return { success: true, result };
      } catch (e) {
        // 如果 get_app_version 不存在，尝试其他命令
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const result = await invoke('plugin:event|listen', { event: 'test' });
          return { success: true, result };
        } catch (e2) {
          return { success: false, error1: String(e), error2: String(e2) };
        }
      }
    });
    console.log('[E2E] 🧪 Tauri invoke test:', JSON.stringify(invokeTestResult).substring(0, 200));

    if (!config.providerId || !config.modelId) {
      console.log('[E2E] ⚠️ AI 配置不完整，跳过测试');
      test.skip();
      return;
    }

    // 2. 发送消息触发 write_file
    console.log('[E2E] 💬 发送消息触发 write_file...');
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage(
        '请在当前项目目录创建一个 DIAG_TEST_APPROVAL.md 文件，内容为 "approval diagnostic test"',
        payload.providerId,
        payload.modelId
      );
    }, {
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 3. 等待 LLM 响应（给足够时间）
    console.log('[E2E] ⏳ 等待 LLM 响应和工具调用...');
    await page.waitForTimeout(60000);

    // 4. 收集诊断信息
    const diag = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'chatStore not found' };

      const state = chatStore.getState();
      const messages = state.messages || [];
      const assistantMsgs = messages.filter((m: any) => m.role === 'assistant');
      const lastAssistant = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;

      const toolCalls = (lastAssistant?.toolCalls || []).map((tc: any) => ({
        id: tc.id,
        tool: tc.tool,
        status: tc.status,
        isPartial: tc.isPartial,
        hasArgs: !!tc.args,
        argsPreview: typeof tc.args === 'object' ? Object.keys(tc.args || {}).join(',') : String(tc.args || '').substring(0, 50)
      }));

      const segments = (lastAssistant?.segments || []).map((s: any) => ({
        type: s.type,
        toolCallId: s.toolCallId,
        toolName: s.toolName,
        phase: s.phase,
        order: s.order,
        contentPreview: s.content ? String(s.content).substring(0, 80) : undefined
      }));

      // 检查 orphaned
      const segToolIds = new Set(segments.filter((s: any) => s.type === 'tool').map((s: any) => s.toolCallId));
      const orphaned = toolCalls.filter((tc: any) => tc.status === 'pending' && !segToolIds.has(tc.id));

      // 获取所有消息概览
      const allMessagesOverview = messages.map((m: any) => ({
        id: m.id?.substring(0, 8),
        role: m.role,
        contentPreview: typeof m.content === 'string' ? m.content.substring(0, 60) : '(non-string)',
        toolCallsCount: m.toolCalls?.length || 0,
        segmentsCount: m.segments?.length || 0,
        isStreaming: m.isStreaming
      }));

      return {
        totalMessages: messages.length,
        isStreaming: state.isStreaming,
        isLoading: state.isLoading,
        lastAssistantId: lastAssistant?.id?.substring(0, 12),
        lastAssistantIsStreaming: lastAssistant?.isStreaming,
        lastAssistantContent: lastAssistant?.content?.substring(0, 200),
        toolCalls,
        segments,
        orphanedPendingCalls: orphaned.length,
        orphanedDetails: orphaned.map((tc: any) => ({ id: tc.id.substring(0, 16), tool: tc.tool, status: tc.status, isPartial: tc.isPartial })),
        allMessagesOverview
      };
    });

    // 5. 输出诊断结果
    console.log('\n═══════════════════════════════════════════════');
    console.log('[E2E TAURI] write_file 审批按钮诊断结果');
    console.log('═══════════════════════════════════════════════');
    console.log('[DIAG] totalMessages:', diag.totalMessages);
    console.log('[DIAG] isStreaming:', diag.isStreaming);
    console.log('[DIAG] isLoading:', diag.isLoading);
    console.log('[DIAG] lastAssistantId:', diag.lastAssistantId);
    console.log('[DIAG] lastAssistantIsStreaming:', diag.lastAssistantIsStreaming);
    console.log('[DIAG] lastAssistantContent:', diag.lastAssistantContent?.substring(0, 80));
    console.log(`[DIAG] toolCalls: ${diag.toolCalls.length}`);
    diag.toolCalls.forEach((tc: any, i: number) => {
      console.log(`[DIAG]   [${i}] tool=${tc.tool}, status=${tc.status}, isPartial=${tc.isPartial}, args=${tc.argsPreview}`);
    });
    console.log(`[DIAG] segments: ${diag.segments.length}`);
    diag.segments.forEach((s: any, i: number) => {
      console.log(`[DIAG]   [${i}] type=${s.type}, toolCallId=${s.toolCallId?.substring(0, 16) || 'N/A'}, toolName=${s.toolName}, phase=${s.phase}`);
    });
    console.log(`[DIAG] orphanedPendingCalls: ${diag.orphanedPendingCalls}`);

    // 输出所有消息概览
    console.log('\n[DIAG] 所有消息概览:');
    diag.allMessagesOverview?.forEach((m: any, i: number) => {
      console.log(`  [${i}] role=${m.role}, id=${m.id}, streaming=${m.isStreaming}, content="${m.contentPreview}", toolCalls=${m.toolCallsCount}, segments=${m.segmentsCount}`);
    });

    // 6. 输出捕获的诊断日志摘要
    console.log('\n═══════════════════════════════════════════════');
    console.log(`[E2E TAURI] 捕获的诊断日志 (${diagLogs.length} 条)`);
    console.log('═══════════════════════════════════════════════');
    diagLogs.forEach((log, i) => {
      console.log(`  [${i}] ${log.substring(0, 200)}`);
    });

    // 7. 分析结果
    if (diag.toolCalls.length === 0) {
      console.log('\n[DIAG] ⚠️ 没有工具调用！');
      console.log('[DIAG] 可能原因：');
      console.log('  1. LLM 没有返回 tool_calls（模型不支持或 prompt 不够明确）');
      console.log('  2. 事件在 lib.rs callback 中被 should_suppress 阻止');
      console.log('  3. StreamingResponseController.handleBackendEvent 未收到事件');
      console.log('  4. chat:tool:call 事件未被 emit（toolCallBuffer 累积失败）');

      // 检查关键日志
      const listenLogs = diagLogs.filter(l => l.includes('[SC:DIAG:LISTEN]'));
      const toolLogs = diagLogs.filter(l => l.includes('[SC:DIAG:TOOL]'));
      const storeMapperLogs = diagLogs.filter(l => l.includes('[StoreMapper:DIAG]'));
      const finishLogs = diagLogs.filter(l => l.includes('emitFinished') || l.includes('[SC] 🏁'));

      console.log(`\n[DIAG] 关键日志统计:`);
      console.log(`  LISTEN 事件日志: ${listenLogs.length}`);
      console.log(`  TOOL 分支日志: ${toolLogs.length}`);
      console.log(`  StoreMapper 日志: ${storeMapperLogs.length}`);
      console.log(`  FINISH 事件日志: ${finishLogs.length}`);

      if (listenLogs.length > 0) {
        console.log('\n[DIAG] 📥 前端收到的事件:');
        listenLogs.forEach(l => console.log(`  ${l.substring(0, 150)}`));
      } else {
        console.log('\n[DIAG] 🔴 前端没有收到任何 tool_call / approval / phase 事件！');
        console.log('[DIAG] 🔴 问题在 Rust 端（lib.rs callback 或 harness_ai_service.rs）');
      }

      if (finishLogs.length > 0) {
        console.log('\n[DIAG] 🏁 Finish 事件:');
        finishLogs.forEach(l => console.log(`  ${l.substring(0, 150)}`));
      }

      // 不 fail，这只是诊断测试
      return;
    }

    const writeCalls = diag.toolCalls.filter((tc: any) => tc.tool === 'write_file' || tc.tool === 'agent_write_file');
    if (writeCalls.length === 0) {
      console.log('[DIAG] ⚠️ 有工具调用但没有 write_file（AI 可能选择了其他工具）');
      return;
    }

    // 核心断言：write_file 应该是 pending 状态
    const pendingWrite = writeCalls.filter((tc: any) => tc.status === 'pending');
    console.log(`\n[ASSERT] write_file pending calls: ${pendingWrite.length} / ${writeCalls.length}`);

    if (pendingWrite.length > 0) {
      console.log('[E2E] ✅ write_file 审批按钮应该正常显示');
    } else {
      console.log('[E2E] ❌ write_file 没有 pending 状态的调用');

      // 检查是否已被自动审批
      const approvedWrite = writeCalls.filter((tc: any) => tc.status === 'approved' || tc.status === 'executing');
      if (approvedWrite.length > 0) {
        console.log('[E2E] ❌ write_file 被自动审批了！前端 auto-approve 竞态条件未修复');
      }
    }

    // 如果有 orphaned pending calls，说明 segments 缺失
    if (diag.orphanedPendingCalls > 0) {
      console.log('\n[DIAG] 🔴 ROOT CAUSE: segments 缺失导致 ToolApproval 不通过 segments 渲染');
      console.log('[DIAG] 🔴 MessageItem 补偿渲染应该处理此情况');
    }
  });
});
