/**
 * E2E 测试：P1 打字机流式效果 — 确定性 Mock 复现
 *
 * 目标：精确定位并验证流式过程中文本重复问题
 *
 * 场景还原：
 *   1. 发送消息 → AI 回复文本 delta
 *   2. 文本后接工具调用（TodoWrite，自动审批）
 *   3. 工具后继续文本 delta
 *   4. 验证 segment content 与 message.content 一致（无重复）
 *
 * 运行：
 *   npx playwright test tests/e2e/regression/p1-typewriter-todowrite-approval.spec.ts --headed
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * 设置 mock invoke handler，拦截 ai_chat 并通过 Tauri 事件模拟 SSE 流
 */
async function setupMockStreamAndWait(page: any, params: {
  textBefore: string;
  toolName: string;
  toolId: string;
  toolArgs: string;
  textAfter: string;
  chunkDelayMs?: number;
  finishReason?: string;
}) {
  const {
    textBefore, toolName, toolId, toolArgs, textAfter,
    chunkDelayMs = 20, finishReason = 'stop',
  } = params;

  await page.evaluate(async (p) => {
    const w = window as any;
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    const emit = (event: string, payload: any) => {
      const listeners = w.__TAURI_EVENT_LISTENERS__?.[event] || [];
      for (const fn of listeners) {
        try { fn({ payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }); }
        catch (e) { console.error(`[MockStream] ${event}:`, e); }
      }
    };

    w.__E2E_INVOKE_HANDLER__ = async (cmd: string, args: any) => {
      if (cmd !== 'ai_chat') {
        if (cmd === 'approve_tool_call') return { status: 'success', output: 'Done' };
        return {};
      }

      const eventId = args.eventId || `chat_${Date.now()}`;
      const correlationId = args.correlationId || eventId.replace('chat_', '');
      w.__E2E_LAST_CORRELATION_ID__ = correlationId;

      // Stream start
      emit(eventId, { type: 'start', correlationId, messageId: correlationId });
      await delay(50);

      // Text before tool
      for (let i = 0; i < p.textBefore.length; i++) {
        emit(eventId, { type: 'content', content: p.textBefore[i], correlationId, deltaIndex: i });
        await delay(p.chunkDelayMs);
      }
      await delay(80);

      // Tool call
      if (p.toolName) {
        emit(eventId, {
          type: 'tool_call',
          tool_call: { id: p.toolId, function: { name: p.toolName, arguments: p.toolArgs } },
          correlationId
        });
        await delay(150);

        emit(eventId, {
          type: 'tool_done',
          tool_call_id: p.toolId, tool: p.toolName,
          result: JSON.stringify({ status: 'success', output: 'Done' }),
          correlationId
        });
        await delay(80);
      }

      // Text after tool
      for (let i = 0; i < p.textAfter.length; i++) {
        emit(eventId, { type: 'content', content: p.textAfter[i], correlationId, deltaIndex: p.textBefore.length + i });
        await delay(p.chunkDelayMs);
      }
      await delay(80);

      // Finish
      emit(eventId, { type: 'finish', finish_reason: p.toolName ? 'tool_calls' : p.finishReason, correlationId });
      emit(`${eventId}_finish`, 'DONE');

      return {};
    };

    if (w.__tauriSetInvokeHandler__) w.__tauriSetInvokeHandler__(w.__E2E_INVOKE_HANDLER__);
  }, params as any);
}

/** 检测相邻重复子串 */
function findAdjacentDuplicates(text: string, minLen = 4): string[] {
  const dupes: string[] = [];
  for (let len = minLen; len <= text.length / 2; len++) {
    for (let i = 0; i <= text.length - len * 2; i++) {
      const s = text.substring(i, i + len), n = text.substring(i + len, i + len * 2);
      if (s === n && s.trim().length >= minLen) dupes.push(`"${s}" at pos ${i}`);
    }
  }
  return [...new Set(dupes)];
}

test.describe('P1 Typewriter - Deterministic Mock', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // 设置 mock API Key，使 isProviderConfigured 为 true，聊天面板能渲染消息列表
    const providerAfterUpdate = await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (!settingsStore) return { error: 'no settingsStore' };
      const state = settingsStore.getState();
      const pid = state.currentProviderId || 'zhipu';
      settingsStore.getState().updateProviderConfig(pid, {
        apiKey: 'mock-api-key-for-e2e-test',
      });
      const afterState = settingsStore.getState();
      return {
        pid,
        provider: afterState.providers.find((p: any) => p.id === pid),
        currentProviderId: afterState.currentProviderId,
      };
    });
    console.log('[E2E] Provider after update:', JSON.stringify(providerAfterUpdate));
    expect(providerAfterUpdate.error, 'settingsStore 应该存在').toBeUndefined();
    expect(providerAfterUpdate.provider?.apiKey, 'API Key 应该已设置').toBeTruthy();
    await page.waitForTimeout(500);
  });

  test('mock stream: text → TodoWrite → text — no duplicate content in segments', async ({ page }) => {
    const TEXT_BEFORE = '让我帮你分析一下项目结构。';
    const TEXT_AFTER = '现在让我读取文件内容。';

    await setupMockStreamAndWait(page, {
      textBefore: TEXT_BEFORE, toolName: 'TodoWrite',
      toolId: 'call_mock_todowrite_001',
      toolArgs: JSON.stringify({ todos: [{ content: '分析项目', status: 'pending' }] }),
      textAfter: TEXT_AFTER, chunkDelayMs: 20,
    });

    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '重构下README.md',
        settingsStore.getState().currentProviderId || 'deepseek',
        settingsStore.getState().currentModel || 'deepseek-chat'
      );
    });

    await page.waitForFunction(() => {
      const w = window as any;
      const cid = w.__E2E_LAST_CORRELATION_ID__;
      if (!cid) return false;
      const msg = w.__chatStore?.getState().messages.find((m: any) => m.id === cid);
      return msg && !msg.isStreaming && (msg.content || '').length > 0;
    }, { timeout: 30000 });

    await page.waitForTimeout(1500);

    const analysis = await page.evaluate(() => {
      const w = window as any;
      const cid = w.__E2E_LAST_CORRELATION_ID__;
      if (!cid) return { error: 'No correlationId' };
      const msg = w.__chatStore.getState().messages.find((m: any) => m.id === cid);
      if (!msg) return { error: 'Message not found', cid };

      // 🔥 检查用户消息
      const userMsg = w.__chatStore.getState().messages.find((m: any) => m.role === 'user');
      const userMsgData = userMsg ? {
        id: userMsg.id,
        content: userMsg.content,
        contentLength: (userMsg.content || '').length,
        segments: userMsg.segments?.map((s: any) => ({ type: s.type, content: s.content, order: s.order })),
        isStreaming: userMsg.isStreaming,
      } : null;

      const rawContent = msg.content || '';
      const segments = msg.segments || [];

      const segTextTotal = segments
        .filter((s: any) => s.type === 'text')
        .reduce((sum: number, s: any) => sum + (s.content || '').length, 0);

      const assistantMsgs = document.querySelectorAll('[data-testid^="message-"]');
      const fullDomText = Array.from(assistantMsgs).map(el => el.textContent || '').join('\n');

      // 检测相邻重复子串
      const findDupes = (text: string, minLen: number) => {
        const d: string[] = [];
        for (let l = minLen; l <= text.length / 2; l++)
          for (let i = 0; i <= text.length - l * 2; i++) {
            const s = text.substring(i, i + l), n = text.substring(i + l, i + l * 2);
            if (s === n && s.trim().length >= minLen) d.push(`"${s}" at ${i}`);
          }
        return [...new Set(d)];
      };

      // 🔥 UI 渲染验证：检查 DOM 中是否有可见文本
      const allMsgEls = document.querySelectorAll('[data-testid^="message-"]');
      const domRenderInfo = Array.from(allMsgEls).map(el => ({
        testId: el.getAttribute('data-testid'),
        textLength: (el.textContent || '').length,
        textPreview: (el.textContent || '').substring(0, 80),
        hasVisibleText: (el.textContent || '').trim().length > 0,
      }));

      return {
        userMsgData,
        rawContent, rawContentLength: rawContent.length,
        segTextTotal, segVsContentDiff: segTextTotal - rawContent.length,
        segments: segments.map((s: any) => ({
          type: s.type, order: s.order, content: s.content || ''
        })),
        contentDupes: findDupes(rawContent, 4),
        domDupes: findDupes(fullDomText, 4),
        isStreaming: msg.isStreaming,
        toolCallCount: msg.toolCalls?.length || 0,
        domRenderInfo,
      };
    });

    console.log('[E2E] 分析结果:', JSON.stringify(analysis, null, 2));

    // 🔥 验证用户消息数据正确
    expect(analysis.userMsgData, '用户消息应该存在').not.toBeNull();
    expect(analysis.userMsgData!.content, '用户消息应该有内容').toBeTruthy();
    expect(analysis.userMsgData!.segments?.length, '用户消息应该有 segments').toBeGreaterThan(0);

    expect(analysis.error, '消息应该存在').toBeUndefined();
    expect(analysis.isStreaming, '流式应该已结束').toBe(false);

    // 核心：segment 文本总量必须与 content 一致
    expect(analysis.segVsContentDiff,
      `segment 文本总量(${analysis.segTextTotal}) 与 content(${analysis.rawContentLength}) 不一致，差值=${analysis.segVsContentDiff}`
    ).toBe(0);

    // 无重复子串
    expect(analysis.contentDupes.length,
      `content 不应有重复: ${analysis.contentDupes.join(', ')}`
    ).toBe(0);
    expect(analysis.domDupes.length,
      `DOM 不应有重复: ${analysis.domDupes.join(', ')}`
    ).toBe(0);

    // 包含预期文本
    expect(analysis.rawContent).toContain(TEXT_BEFORE);
    expect(analysis.rawContent).toContain(TEXT_AFTER);
  });

  test('mock stream: text only (no tools) — no duplicate content', async ({ page }) => {
    const FULL_TEXT = '这是一段测试文本，用于验证纯文本模式下不会出现重复。';

    await setupMockStreamAndWait(page, {
      textBefore: FULL_TEXT, toolName: '', toolId: '', toolArgs: '', textAfter: '',
    });

    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '你好',
        settingsStore.getState().currentProviderId || 'deepseek',
        settingsStore.getState().currentModel || 'deepseek-chat'
      );
    });

    await page.waitForFunction(() => {
      const w = window as any;
      const cid = w.__E2E_LAST_CORRELATION_ID__;
      if (!cid) return false;
      const msg = w.__chatStore?.getState().messages.find((m: any) => m.id === cid);
      return msg && !msg.isStreaming && (msg.content || '').length > 0;
    }, { timeout: 30000 });

    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      const w = window as any;
      const cid = w.__E2E_LAST_CORRELATION_ID__;
      if (!cid) return { error: 'No cid' };
      const msg = w.__chatStore.getState().messages.find((m: any) => m.id === cid);
      if (!msg) return { error: 'not found' };
      const rawContent = msg.content || '';
      const findDupes = (text: string, minLen: number) => {
        const d: string[] = [];
        for (let l = minLen; l <= text.length / 2; l++)
          for (let i = 0; i <= text.length - l * 2; i++) {
            const s = text.substring(i, i + l), n = text.substring(i + l, i + l * 2);
            if (s === n && s.trim().length >= minLen) d.push(`"${s}" at ${i}`);
          }
        return [...new Set(d)];
      };
      // 🔥 UI 渲染验证
      const allMsgEls = document.querySelectorAll('[data-testid^="message-"]');
      const domRenderInfo = Array.from(allMsgEls).map(el => ({
        testId: el.getAttribute('data-testid'),
        textLength: (el.textContent || '').length,
        textPreview: (el.textContent || '').substring(0, 80),
      }));

      return { rawContent, dupes: findDupes(rawContent, 4), isStreaming: msg.isStreaming, domRenderInfo };
    });

    expect(result.error).toBeUndefined();
    expect(result.isStreaming).toBe(false);
    expect(result.dupes.length, `纯文本不应有重复: ${result.dupes.join(', ')}`).toBe(0);
    expect(result.rawContent).toBe(FULL_TEXT);
  });
});
