/**
 * E2E 测试：P1 打字机流式效果 + TodoWrite 自动审批 + 多工具调用
 *
 * 高保真场景还原（基于真实用户控制台日志）：
 *   用户请求："重构下README.md 90行左右"
 *   预期行为：
 *     1. AI 文本回复有逐字打字机效果（非一次性出现）
 *     2. TodoWrite 工具自动审批（不弹出审批卡片）
 *     3. read_file 工具自动审批
 *     4. bash / edit_file 需要手动审批
 *     5. 工具调用之间文本有流式打字机效果
 *     6. 不出现 JSON Parse error
 *
 * 运行方式：
 *   APP_EDITION=commercial npx playwright test tests/e2e/regression/p1-typewriter-todowrite-approval.spec.ts --headed
 *
 * 前置条件：
 *   - .env.e2e.local 中配置 E2E_AI_API_KEY / E2E_AI_BASE_URL / E2E_AI_MODEL
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * 注入直接调用 OpenAI 兼容 API 的 invoke handler
 * 通过 window.__TAURI_EVENT_LISTENERS__ 模拟 Tauri app.emit()
 */
async function injectDirectAIHandler(page: any, aiConfig: { apiKey: string; baseUrl: string; modelId: string }) {
  await page.evaluate((config) => {
    const w = window as any;

    const tauriEmit = (event: string, payload: any) => {
      const listeners = w.__TAURI_EVENT_LISTENERS__?.[event] || [];
      for (const fn of listeners) {
        try { fn({ payload }); } catch (e) { console.error(`[E2E tauriEmit] ${event}:`, e); }
      }
    };

    w.__E2E_DIRECT_AI_HANDLER__ = async (cmd: string, args: any) => {
      if (cmd !== 'ai_chat') return {};

      const pc = args?.providerConfig || {};
      const apiKey = config.apiKey || pc.api_key || pc.apiKey;
      const baseUrl = (config.baseUrl || pc.base_url || pc.baseUrl).replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
      const model = config.modelId || (pc.models?.[0]);
      const messages = args?.messages || [];
      const eventId = args?.eventId || `chat_e2e_${Date.now()}`;

      console.log('[E2E Direct AI] Calling API:', { baseUrl, model, messagesCount: messages.length });

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, stream: true })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[E2E Direct AI] API ${response.status}:`, errText);
        tauriEmit(`${eventId}_error`, { error: errText });
        return {};
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            if (choice.delta?.content) {
              tauriEmit(eventId, { type: 'content', content: choice.delta.content });
            }

            if (choice.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                tauriEmit(eventId, {
                  type: 'tool_call',
                  tool_call: { id: tc.id || '', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } }
                });
              }
            }

            if (choice.finish_reason) {
              console.log(`[E2E Direct AI] finish_reason: ${choice.finish_reason}`);
              tauriEmit(eventId, { type: 'finish', finish_reason: choice.finish_reason });
              tauriEmit(`${eventId}_finish`, 'DONE');
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }

      tauriEmit(`${eventId}_finish`, 'DONE');
      return {};
    };

    if (w.__tauriSetInvokeHandler__) w.__tauriSetInvokeHandler__(w.__E2E_DIRECT_AI_HANDLER__);
    w.__E2E_INVOKE_HANDLER__ = w.__E2E_DIRECT_AI_HANDLER__;
    console.log('[E2E Direct AI] Handler injected');
  }, aiConfig);
}

test.describe('P1 Typewriter + TodoWrite Auto-Approve - Real LLM E2E', () => {
  test.setTimeout(300_000); // 5 分钟超时

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.goto('/');
    await page.waitForFunction(() => {
      return (window as any).__chatStore !== undefined;
    }, { timeout: 30000 });

    // 等待 PersistenceManager 恢复完成
    await page.waitForTimeout(2000);
  });

  test('scenario: typewriter streaming + TodoWrite auto-approve + multi-tool flow', async ({ page }) => {
    console.log('[E2E] 开始测试：P1 打字机 + TodoWrite 自动审批 + 多工具流程');

    // 1. 获取 AI 配置
    const realAIConfig = await page.evaluate(() => {
      const config = (window as any).__E2E_REAL_AI_CONFIG__ || {};
      return {
        apiKey: config.realAIApiKey || '',
        baseUrl: (config.realAIBaseUrl || 'https://api.deepseek.com').replace(/\/chat\/completions$/, '').replace(/\/+$/, ''),
        providerId: config.providerId || 'deepseek',
        modelId: config.realAIModel || 'deepseek-chat'
      };
    });

    if (!realAIConfig.apiKey) {
      test.skip(true, 'No API key configured in .env.e2e.local');
    }

    console.log('[E2E] AI 配置:', { ...realAIConfig, apiKey: '***' });

    // 2. 注入直接 HTTP AI handler
    await injectDirectAIHandler(page, realAIConfig);

    // 3. 设置 AI 配置到 settingsStore
    await page.evaluate((config) => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig(config.providerId, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl + '/chat/completions'
        });
        settingsStore.getState().setCurrentProviderAndModel(config.providerId, config.modelId);
      }
    }, realAIConfig);

    // 4. 监听控制台日志，捕获关键事件
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[ToolApproval]') ||
        text.includes('[Approval]') ||
        text.includes('Typewriter') ||
        text.includes('JSON Parse') ||
        text.includes('auto-approve') ||
        text.includes('Auto-approved')
      ) {
        consoleLogs.push(text);
      }
    });

    // 5. 捕获审批决策
    const approvalDecisions: { toolName: string; autoApproved: boolean; category: string }[] = [];
    await page.evaluate(() => {
      const origLog = console.log;
      (window as any).__E2E_APPROVAL_DECISIONS__ = [];
      console.log = function (...args: any[]) {
        const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        if (text.includes('[Approval]') && text.includes('Decision context:')) {
          const match = text.match(/\[Approval\] \[(\w+)\] Decision context:/);
          if (match) {
            const catMatch = text.match(/category:\s*"(\w+)"/);
            const autoMatch = text.includes('Auto-approved');
            (window as any).__E2E_APPROVAL_DECISIONS__.push({
              toolName: match[1],
              autoApproved: autoMatch,
              category: catMatch?.[1] || 'unknown'
            });
          }
        }
        origLog.apply(console, args);
      };
    });

    // 6. 记录发送前的消息状态
    const existingMsgCount = await page.evaluate(() => {
      return ((window as any).__chatStore?.getState().messages || []).length;
    });

    // 7. 发送消息（不等待完成，后台运行）
    await page.evaluate((payload) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const state = settingsStore.getState();
        chatStore.getState().sendMessage(
          payload.text,
          state.currentProviderId || payload.providerId,
          state.currentModel || payload.modelId
        ).then(() => {
          console.log('[E2E] sendMessage completed');
        }).catch((e: any) => {
          console.error('[E2E] sendMessage error:', e);
        });
      }
    }, {
      text: '重构下README.md 90行左右',
      providerId: realAIConfig.providerId,
      modelId: realAIConfig.modelId
    });

    console.log('[E2E] 消息已发送');

    // 8. 等待新的助手消息出现
    await page.waitForFunction(({ prevCount }) => {
      const messages = (window as any).__chatStore?.getState().messages || [];
      return messages.length > prevCount;
    }, { prevCount: existingMsgCount }, { timeout: 60000 });

    console.log('[E2E] 新消息已出现');

    // 9. 轮询等待流式完成（最多 240 秒）
    const finalState = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      for (let i = 0; i < 480; i++) {
        const state = chatStore.getState();
        const messages = state.messages;
        const lastMsg = messages[messages.length - 1];

        // 检查流式是否结束（不在 streaming 状态且内容不为空）
        if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStreaming && lastMsg.content && lastMsg.content.length > 50) {
          await new Promise(r => setTimeout(r, 2000)); // 等待 2 秒确保所有后处理完成

          const finalMsgs = chatStore.getState().messages;
          const finalLastMsg = finalMsgs[finalMsgs.length - 1];

          // 获取工具调用信息
          const toolCalls = finalLastMsg.toolCalls || [];

          return {
            success: true,
            contentLength: finalLastMsg.content?.length || 0,
            contentPreview: finalLastMsg.content?.substring(0, 300) || '',
            toolCallCount: toolCalls.length,
            toolCallNames: toolCalls.map((tc: any) => tc.name),
            toolCallStatuses: toolCalls.map((tc: any) => ({ name: tc.name, status: tc.status })),
            isLoading: chatStore.getState().isLoading,
            approvalDecisions: (window as any).__E2E_APPROVAL_DECISIONS__ || [],
            hasToolCalls: toolCalls.length > 0
          };
        }

        await new Promise(r => setTimeout(r, 500));
      }

      return { success: false, reason: 'Timeout waiting for completion' };
    });

    console.log('[E2E] 最终状态:', JSON.stringify(finalState, null, 2));

    // ========================================
    // 断言验证
    // ========================================

    // 10.1 消息应成功完成
    expect(finalState.success, '消息应该成功完成').toBe(true);
    expect(finalState.isLoading, '不应该是加载状态').toBe(false);

    // 10.2 内容长度应合理（AI 回复了实质内容）
    expect(
      finalState.contentLength,
      'AI 回复内容应 > 100 字符'
    ).toBeGreaterThan(100);

    // 10.3 工具调用验证（LLM 行为不确定，条件断言）
    if (finalState.hasToolCalls) {
      console.log('[E2E] 检测到工具调用:', JSON.stringify(finalState.toolCallNames));

      // 10.4 TodoWrite 应该被自动审批
      const todoWriteDecision = finalState.approvalDecisions.find(
        (d: any) => d.toolName.toLowerCase() === 'todowrite'
      );
      if (todoWriteDecision) {
        console.log(`[E2E] TodoWrite 审批决策:`, todoWriteDecision);
        expect(
          todoWriteDecision.autoApproved,
          'TodoWrite 应该被自动审批'
        ).toBe(true);
        expect(
          todoWriteDecision.category,
          'TodoWrite 应该被分类为 safe'
        ).toBe('safe');
      } else {
        console.log('[E2E] 本次测试未触发 TodoWrite，跳过此断言');
      }

      // 10.5 read_file 应该被自动审批
      const readFileDecision = finalState.approvalDecisions.find(
        (d: any) => d.toolName.toLowerCase() === 'read_file'
      );
      if (readFileDecision) {
        console.log(`[E2E] read_file 审批决策:`, readFileDecision);
        expect(
          readFileDecision.autoApproved,
          'read_file 应该被自动审批'
        ).toBe(true);
      }
    } else {
      console.log('[E2E] 本次 LLM 未触发工具调用（E2E mock 模式下 LLM 可能直接回复文本），跳过工具相关断言');
    }

    // 10.6 不应该有 JSON Parse error
    const hasJsonParseError = consoleLogs.some(log =>
      log.includes('JSON Parse error') || log.includes('Failed to parse')
    );
    expect(hasJsonParseError, '不应该有 JSON Parse error').toBe(false);

    // 10.7 打字机效果验证：检查是否有逐步渲染
    // 由于打字机效果是 RAF 驱动的，在 E2E 中我们验证组件确实被渲染
    // 真正的视觉打字效果需要 headed 模式下人工观察
    console.log('[E2E] 内容预览:', finalState.contentPreview?.substring(0, 200));
    console.log('[E2E] 工具调用:', JSON.stringify(finalState.toolCallNames));
    console.log('[E2E] 审批决策:', JSON.stringify(finalState.approvalDecisions));

    console.log('[E2E] 测试通过！');
  });
});
