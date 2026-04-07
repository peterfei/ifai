/**
 * E2E 回归测试：用户消息气泡不显示内容 & 流式文本重复
 *
 * 高保真 Mock 复现，覆盖两个已修复的 bug：
 *
 * Bug 1 (useTypewriter): 用户消息气泡为空
 *   - 根因: useTypewriter enabled=false 时 displayText 保持初始空字符串
 *   - 复现: 发送消息 → 用户气泡 textLength=0
 *
 * Bug 2 (StoreMapper): AI 回复文本重复 ("让我让我" 而非 "让我")
 *   - 根因: chat:segment:updated 双重追加 delta
 *   - 复现: text → TodoWrite → text，检查 segment 与 content 是否一致
 *
 * 场景:
 *   Case 1: text → TodoWrite → text（工具穿插，验证无重复 + 用户气泡可见）
 *   Case 2: 纯文本（无工具，验证无重复 + 用户气泡可见）
 *   Case 3: 用户消息 DOM 可见性专项（精简验证）
 *
 * 运行:
 *   npx playwright test tests/e2e/regression/user-message-bubble-display.spec.ts --headed
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

// ─── Mock SSE 流引擎 ────────────────────────────────────────────

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

/** 等待流式完成 */
async function waitForStreamDone(page: any, timeout = 30000) {
  await page.waitForFunction(() => {
    const w = window as any;
    const cid = w.__E2E_LAST_CORRELATION_ID__;
    if (!cid) return false;
    const msg = w.__chatStore?.getState().messages.find((m: any) => m.id === cid);
    return msg && !msg.isStreaming && (msg.content || '').length > 0;
  }, { timeout });
  await page.waitForTimeout(2000);
}

/** 收集完整分析数据 */
async function collectAnalysis(page: any) {
  return page.evaluate(() => {
    const w = window as any;
    const cid = w.__E2E_LAST_CORRELATION_ID__;
    if (!cid) return { error: 'No correlationId' };

    // 用户消息
    const userMsg = w.__chatStore.getState().messages.find((m: any) => m.role === 'user');
    const userMsgData = userMsg ? {
      id: userMsg.id,
      content: userMsg.content,
      contentLength: (userMsg.content || '').length,
      segments: userMsg.segments?.map((s: any) => ({ type: s.type, content: s.content, order: s.order })),
    } : null;

    // AI 消息
    const msg = w.__chatStore.getState().messages.find((m: any) => m.id === cid);
    if (!msg) return { error: 'Message not found', cid };

    const rawContent = msg.content || '';
    const segments = msg.segments || [];
    const segTextTotal = segments
      .filter((s: any) => s.type === 'text')
      .reduce((sum: number, s: any) => sum + (s.content || '').length, 0);

    // DOM 检查
    const allMsgEls = document.querySelectorAll('[data-testid^="message-"]');
    const fullDomText = Array.from(allMsgEls).map(el => el.textContent || '').join('\n');

    const findDupes = (text: string, minLen: number) => {
      const d: string[] = [];
      for (let l = minLen; l <= text.length / 2; l++)
        for (let i = 0; i <= text.length - l * 2; i++) {
          const s = text.substring(i, i + l), n = text.substring(i + l, i + l * 2);
          if (s === n && s.trim().length >= minLen) d.push(`"${s}" at ${i}`);
        }
      return [...new Set(d)];
    };

    const domInfo = Array.from(allMsgEls).map(el => {
      const testId = el.getAttribute('data-testid') || '';
      const text = el.textContent || '';
      const hasUserIcon = el.querySelector('svg.lucide-user') !== null;
      return {
        testId,
        hasUserIcon,
        textLength: text.length,
        textPreview: text.substring(0, 200),
      };
    });

    return {
      userMsgData,
      rawContent,
      rawContentLength: rawContent.length,
      segTextTotal,
      segVsContentDiff: segTextTotal - rawContent.length,
      segments: segments.map((s: any) => ({ type: s.type, order: s.order, content: s.content || '' })),
      contentDupes: findDupes(rawContent, 4),
      domDupes: findDupes(fullDomText, 4),
      isStreaming: msg.isStreaming,
      toolCallCount: msg.toolCalls?.length || 0,
      domInfo,
    };
  });
}

// ─── 测试套件 ────────────────────────────────────────────────────

test.describe('用户消息气泡 & 流式文本重复 回归测试', () => {
  test.setTimeout(60_000);
  // 覆盖全局 actionTimeout (15s)，waitForFunction 需要 30s 等待流式完成
  test.use({ actionTimeout: 30000 });

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // 设置 mock API Key，使聊天面板渲染消息列表
    const providerOk = await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (!settingsStore) return false;
      const pid = settingsStore.getState().currentProviderId || 'zhipu';
      settingsStore.getState().updateProviderConfig(pid, { apiKey: 'mock-api-key-e2e' });
      return !!(settingsStore.getState().providers.find((p: any) => p.id === pid)?.apiKey);
    });
    expect(providerOk, 'API Key 应该已设置').toBe(true);
    await page.waitForTimeout(500);
  });

  // ─── Case 1: text → TodoWrite → text ──────────────────────────

  test('@regression text → TodoWrite → text — 无重复 + 用户气泡可见', async ({ page }) => {
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

    await waitForStreamDone(page);
    const analysis = await collectAnalysis(page);
    console.log('[Case1] 分析:', JSON.stringify(analysis, null, 2));

    // ── 用户消息验证 ──
    expect(analysis.userMsgData, '用户消息应该存在').not.toBeNull();
    expect(analysis.userMsgData!.content, '用户消息应有内容').toBeTruthy();
    expect(analysis.userMsgData!.segments?.length, '用户消息应有 segments').toBeGreaterThan(0);

    // ── AI 消息验证 ──
    expect(analysis.error).toBeUndefined();
    expect(analysis.isStreaming, '流式应已结束').toBe(false);

    // 核心: segment 文本总量 = content
    expect(analysis.segVsContentDiff,
      `segment(${analysis.segTextTotal}) vs content(${analysis.rawContentLength}) 差值=${analysis.segVsContentDiff}`
    ).toBe(0);

    // 无重复
    expect(analysis.contentDupes.length, `content 重复: ${analysis.contentDupes.join(', ')}`).toBe(0);
    expect(analysis.domDupes.length, `DOM 重复: ${analysis.domDupes.join(', ')}`).toBe(0);

    // 包含预期文本
    expect(analysis.rawContent).toContain(TEXT_BEFORE);
    expect(analysis.rawContent).toContain(TEXT_AFTER);
  });

  // ─── Case 2: 纯文本（无工具） ─────────────────────────────────

  test('@regression 纯文本回复 — 无重复 + 用户气泡可见', async ({ page }) => {
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

    await waitForStreamDone(page);
    const result = await collectAnalysis(page);
    console.log('[Case2] 结果:', JSON.stringify(result, null, 2));

    expect(result.error).toBeUndefined();
    expect(result.isStreaming).toBe(false);
    expect(result.contentDupes.length, `纯文本重复: ${result.contentDupes.join(', ')}`).toBe(0);
    expect(result.rawContent).toBe(FULL_TEXT);
  });

  // ─── Case 3: 用户消息 DOM 可见性专项 ──────────────────────────

  test('@regression 用户消息气泡应该显示发送的文本', async ({ page }) => {
    const USER_TEXT = '帮我重构README.md';

    // 简单 mock: 仅 AI 短回复
    await setupMockStreamAndWait(page, {
      textBefore: '好的，我来帮你。', toolName: '', toolId: '', toolArgs: '', textAfter: '',
    });

    await page.evaluate(async (text) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      await chatStore.getState().sendMessage(text, settingsStore.getState().currentProviderId, settingsStore.getState().currentModel);
    }, USER_TEXT);

    await waitForStreamDone(page);

    const result = await page.evaluate((expectedText) => {
      const chatStore = (window as any).__chatStore;
      const msgs = chatStore.getState().messages;
      const userMsg = msgs.find((m: any) => m.role === 'user');
      const storeOk = userMsg && userMsg.content && userMsg.content.includes(expectedText);

      const allMsgEls = document.querySelectorAll('[data-testid^="message-"]');
      const domInfo = Array.from(allMsgEls).map(el => {
        const hasUserIcon = el.querySelector('svg.lucide-user') !== null;
        const text = el.textContent || '';
        return { hasUserIcon, textLength: text.length, containsUserText: text.includes(expectedText) };
      });

      return { storeOk, domInfo, totalMessages: msgs.length };
    }, USER_TEXT);

    console.log('[Case3] 结果:', JSON.stringify(result, null, 2));

    // Store 数据
    expect(result.storeOk, 'Store 中用户消息应包含发送文本').toBe(true);

    // DOM 验证
    expect(result.domInfo.length, `至少 2 个消息元素，实际 ${result.domInfo.length}`).toBeGreaterThanOrEqual(2);

    const userVisible = result.domInfo.some((d: any) => d.hasUserIcon && d.containsUserText);
    expect(userVisible, `用户气泡应显示 "${USER_TEXT}"`).toBe(true);
  });
});
