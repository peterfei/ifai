/**
 * 回归测试：用户消息气泡不显示内容
 *
 * 用户报告：发送"帮我重构README.md"后，气泡看不到问题文本，但LLM回复可以显示。
 *
 * 验证：
 * 1. 用户消息在 store 中有正确的 content 和 segments
 * 2. 用户消息在 DOM 中有可见文本
 *
 * 运行：
 *   npx playwright test tests/e2e/regression/user-message-display-real-llm.spec.ts --headed
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';

test.describe('用户消息气泡显示回归测试', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // 设置 API Key，使聊天面板能渲染消息列表
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        const pid = settingsStore.getState().currentProviderId || 'zhipu';
        settingsStore.getState().updateProviderConfig(pid, {
          apiKey: 'mock-key-e2e',
        });
      }
    });
    await page.waitForTimeout(500);
  });

  test('@regression 用户消息气泡应该显示发送的文本', async ({ page }) => {
    const USER_TEXT = '帮我重构README.md';

    // 使用 mock invoke handler 拦截 ai_chat，模拟简单回复
    await page.evaluate((userText) => {
      const w = window as any;
      w.__E2E_INVOKE_HANDLER__ = async (cmd: string, args: any) => {
        if (cmd === 'ai_chat') {
          const eventId = args.eventId || `chat_${Date.now()}`;
          const correlationId = args.correlationId || eventId.replace('chat_', '');
          w.__E2E_LAST_CORRELATION_ID__ = correlationId;

          const emit = (event: string, payload: any) => {
            const listeners = w.__TAURI_EVENT_LISTENERS__?.[event] || [];
            for (const fn of listeners) {
              try { fn({ payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }); }
              catch (e) { console.error('[MockStream]', e); }
            }
          };

          emit(eventId, { type: 'start', correlationId, messageId: correlationId });
          await new Promise(r => setTimeout(r, 50));

          // 模拟简单 AI 回复
          const reply = '好的，我来帮你。';
          for (let i = 0; i < reply.length; i++) {
            emit(eventId, { type: 'content', content: reply[i], correlationId, deltaIndex: i });
            await new Promise(r => setTimeout(r, 20));
          }
          await new Promise(r => setTimeout(r, 50));
          emit(eventId, { type: 'finish', finish_reason: 'stop', correlationId });
          emit(`${eventId}_finish`, 'DONE');
          return {};
        }
        if (cmd === 'approve_tool_call') return { status: 'success', output: 'Done' };
        return {};
      };
      if (w.__tauriSetInvokeHandler__) w.__tauriSetInvokeHandler__(w.__E2E_INVOKE_HANDLER__);
    }, USER_TEXT);

    // 发送消息
    await page.evaluate(async (text) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      await chatStore.getState().sendMessage(text, settingsStore.getState().currentProviderId, settingsStore.getState().currentModel);
    }, USER_TEXT);

    // 等待消息创建和流式完成
    await page.waitForFunction(() => {
      const msgs = (window as any).__chatStore?.getState().messages || [];
      return msgs.some((m: any) => m.role === 'user') && msgs.some((m: any) => m.role === 'assistant');
    }, { timeout: 10000 });

    // 等待 AI 响应完成
    await page.waitForFunction(() => {
      const w = window as any;
      const cid = w.__E2E_LAST_CORRELATION_ID__;
      if (!cid) return false;
      const msg = w.__chatStore?.getState().messages.find((m: any) => m.id === cid);
      return msg && !msg.isStreaming && (msg.content || '').length > 0;
    }, { timeout: 30000 });

    await page.waitForTimeout(2000);

    // 分析结果
    const result = await page.evaluate((expectedText) => {
      const chatStore = (window as any).__chatStore;
      const msgs = chatStore.getState().messages;

      // 找到用户消息
      const userMsg = msgs.find((m: any) => m.role === 'user');
      const userMsgData = userMsg ? {
        id: userMsg.id,
        content: userMsg.content,
        contentLength: (userMsg.content || '').length,
        segments: userMsg.segments?.map((s: any) => ({ type: s.type, content: s.content, order: s.order })),
      } : null;

      // DOM 检查
      const allMsgEls = document.querySelectorAll('[data-testid^="message-"]');
      const domInfo = Array.from(allMsgEls).map(el => {
        const testId = el.getAttribute('data-testid') || '';
        const text = el.textContent || '';
        const hasUserIcon = el.querySelector('svg.lucide-user') !== null;
        return {
          testId,
          hasUserIcon,
          textLength: text.length,
          textPreview: text.substring(0, 200),
          containsUserText: text.includes(expectedText),
        };
      });

      return { userMsgData, domInfo, totalMessages: msgs.length };
    }, USER_TEXT);

    console.log('[Test] 结果:', JSON.stringify(result, null, 2));

    // 1. Store 数据验证
    expect(result.userMsgData, '用户消息应该在 store 中存在').not.toBeNull();
    expect(result.userMsgData!.content, '用户消息 content 不应为空').toBeTruthy();
    expect(result.userMsgData!.content, '用户消息 content 应该包含发送的文本').toContain(USER_TEXT);

    // 2. DOM 验证
    console.log('[Test] DOM 信息:', JSON.stringify(result.domInfo, null, 2));

    // 至少应该有 2 个消息元素（用户 + AI）
    expect(result.domInfo.length, `DOM 中应该至少有 2 个消息元素，实际 ${result.domInfo.length} 个`).toBeGreaterThanOrEqual(2);

    // 3. 验证用户消息在 DOM 中有文本
    const userElWithText = result.domInfo.some((d: any) => d.hasUserIcon && d.containsUserText);
    expect(userElWithText, `用户消息气泡应该显示 "${USER_TEXT}"，DOM: ${JSON.stringify(result.domInfo)}`).toBe(true);
  });
});
