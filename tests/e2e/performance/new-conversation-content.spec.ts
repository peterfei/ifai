import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

// 真实 LLM 模式下等待流式响应完成
const REAL_AI_TIMEOUT = 8000;

test.describe('新会话内容显示 (@regression @critical)', () => {
  test.describe.configure({ timeout: 120000 });
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      skipWelcome: true,
    });
  });

  /* ─── NC-1: 首次会话发送消息后消息存在 ─── */

  test('NC-1: 首次发送消息 → 消息存在于 store 中', async ({ page }) => {
    const result = await page.evaluate(async (timeout) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore) return { error: 'stores not found' };

      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';

      await chatStore.getState().sendMessage('你好', providerId, model);
      await new Promise(r => setTimeout(r, timeout));

      const messages = chatStore.getState().messages;
      return {
        messageCount: messages.length,
        roles: messages.map((m: any) => m.role),
        userMessageExists: messages.some((m: any) => m.role === 'user' && m.content && m.content.length > 0),
        assistantMessageExists: messages.some((m: any) => m.role === 'assistant'),
        isLoading: chatStore.getState().isLoading,
      };
    }, REAL_AI_TIMEOUT);

    expect(result.error).toBeUndefined();
    expect(result.messageCount).toBeGreaterThanOrEqual(2);
    expect(result.roles).toContain('user');
    expect(result.roles).toContain('assistant');
    expect(result.userMessageExists).toBe(true);
    expect(result.isLoading).toBe(false);
  });

  /* ─── NC-2: 创建新会话后发送消息，消息存在 ─── */

  test('NC-2: 创建新会话后发送消息 → 消息存在于 store', async ({ page }) => {
    const result = await page.evaluate(async (timeout) => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore || !threadStore) return { error: 'stores not found' };

      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';

      // Step 1: first message in default thread
      await chatStore.getState().sendMessage('第一轮', providerId, model);
      await new Promise(r => setTimeout(r, timeout));
      const firstMessages = chatStore.getState().messages;
      const firstCount = firstMessages.length;

      // Step 2: create new conversation (new thread)
      const newThreadId = threadStore.getState().createThread();
      await new Promise(r => setTimeout(r, 500));

      const afterNewThreadMessages = chatStore.getState().messages;
      const afterNewThreadId = chatStore.getState().currentThreadId;

      // Step 3: send message in new conversation
      await chatStore.getState().sendMessage('这是新会话的消息', providerId, model);
      await new Promise(r => setTimeout(r, timeout));

      const newMessages = chatStore.getState().messages;
      const newCurrentThreadId = chatStore.getState().currentThreadId;

      return {
        firstMessageCount: firstCount,
        firstHasUserMessage: firstMessages.some((m: any) => m.role === 'user'),
        messagesCleared: afterNewThreadMessages.length === 0,
        newThreadIdMatches: afterNewThreadId === newThreadId,
        newMessageCount: newMessages.length,
        newUserMessageExists: newMessages.some((m: any) => m.role === 'user' && m.content && m.content.length > 0),
        newAssistantMessageExists: newMessages.some((m: any) => m.role === 'assistant'),
        newIsLoading: chatStore.getState().isLoading,
        newThreadId: newCurrentThreadId?.substring(0, 20),
      };
    }, REAL_AI_TIMEOUT);

    expect(result.error).toBeUndefined();
    expect(result.firstMessageCount).toBeGreaterThanOrEqual(2);
    expect(result.firstHasUserMessage).toBe(true);
    expect(result.messagesCleared).toBe(true);
    expect(result.newThreadIdMatches).toBe(true);
    expect(result.newMessageCount).toBeGreaterThanOrEqual(2);
    expect(result.newUserMessageExists).toBe(true);
    expect(result.newAssistantMessageExists).toBe(true);
    expect(result.newIsLoading).toBe(false);
  });

  /* ─── NC-3: 连续创建 3 个新会话 ─── */

  test('NC-3: 连续多次新会话 → 每次消息都正常存在', async ({ page }) => {
    const result = await page.evaluate(async (timeout) => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore || !threadStore) return { error: 'stores not found' };

      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';
      const results: any[] = [];

      for (let i = 0; i < 3; i++) {
        threadStore.getState().createThread();
        await new Promise(r => setTimeout(r, 300));

        await chatStore.getState().sendMessage(`第 ${i + 1} 轮新会话`, providerId, model);
        await new Promise(r => setTimeout(r, timeout));

        const msgs = chatStore.getState().messages;
        results.push({
          round: i + 1,
          messageCount: msgs.length,
          hasUserMessage: msgs.some((m: any) => m.role === 'user' && m.content?.includes(`第 ${i + 1} 轮`)),
          hasAssistantMessage: msgs.some((m: any) => m.role === 'assistant'),
          isLoading: chatStore.getState().isLoading,
        });
      }
      return results;
    }, REAL_AI_TIMEOUT);

    expect(result.error).toBeUndefined();
    for (const round of result) {
      expect(round.hasUserMessage).toBe(true);
      expect(round.hasAssistantMessage).toBe(true);
      expect(round.messageCount).toBeGreaterThanOrEqual(2);
      expect(round.isLoading).toBe(false);
    }
  });

  /* ─── NC-4: 消息 DOM 可见性 ─── */

  test('NC-4: 发送消息后，用户消息文本在 DOM 中可见', async ({ page }) => {
    await page.evaluate(async (timeout) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore) return;

      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';
      await chatStore.getState().sendMessage('DOM可见性测试消息', providerId, model);
      await new Promise(r => setTimeout(r, timeout));
    }, REAL_AI_TIMEOUT);

    // Wait for React re-render
    await page.waitForTimeout(1000);

    const count = await page.locator('text=DOM可见性测试消息').count();
    expect(count).toBeGreaterThan(0);
  });

  /* ─── NC-5: 新会话后消息 DOM 可见性 ─── */

  test('NC-5: 创建新会话并发送消息 → 消息文本在 DOM 中可见', async ({ page }) => {
    await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      if (threadStore) {
        threadStore.getState().createThread();
      }
      await new Promise(r => setTimeout(r, 500));
    });

    await page.evaluate(async (timeout) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore) return;

      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';
      await chatStore.getState().sendMessage('新会话DOM可见性测试', providerId, model);
      await new Promise(r => setTimeout(r, timeout));
    }, REAL_AI_TIMEOUT);

    await page.waitForTimeout(1000);

    const count = await page.locator('text=新会话DOM可见性测试').count();
    expect(count).toBeGreaterThan(0);
  });

  /* ─── NC-6: isLoading 正确重置 ─── */

  test('NC-6: 新会话创建后 isLoading 为 false', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      if (!chatStore || !threadStore) return { error: 'stores not found' };

      const initialLoading = chatStore.getState().isLoading;

      threadStore.getState().createThread();
      await new Promise(r => setTimeout(r, 500));

      const afterCreateLoading = chatStore.getState().isLoading;
      return { initialLoading, afterCreateLoading };
    });

    expect(result.error).toBeUndefined();
    expect(result.afterCreateLoading).toBe(false);
  });

  /* ─── NC-7: 会话A发消息 → 切到会话B发消息 → 两条消息均在 DOM 可见 ─── */

  test('NC-7: 会话A发消息 → 切到会话B发消息 → 两条消息各自在 DOM 可见', async ({ page }) => {
    // 会话A: 发送消息
    await page.evaluate(async (timeout) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore) return;
      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';
      await chatStore.getState().sendMessage('执行 ls -la', providerId, model);
      await new Promise(r => setTimeout(r, timeout));
    }, REAL_AI_TIMEOUT);

    // 验证会话A的消息在 DOM 中
    const msgACount = await page.locator('text=执行 ls -la').count();
    expect(msgACount).toBeGreaterThan(0);

    // 用于验证的标记文本（会话B的消息应不同）
    const sessionBText = '新会话B: ls -la';

    // 立即创建新会话（会话B）
    await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      if (threadStore) {
        threadStore.getState().createThread();
      }
      await new Promise(r => setTimeout(r, 300));
    });

    // 会话B: 发送消息
    await page.evaluate(async ({ text, timeout }) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore) return;
      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';
      await chatStore.getState().sendMessage(text, providerId, model);
      await new Promise(r => setTimeout(r, timeout));
    }, { text: sessionBText, timeout: REAL_AI_TIMEOUT });

    await page.waitForTimeout(1000);

    // 验证会话B的消息在 DOM 中
    const msgBCount = await page.locator(`text=${sessionBText}`).count();
    expect(msgBCount).toBeGreaterThan(0);

    // 验证 sessionA 消息已被正确清除（当前 view 应该只显示会话B的内容）
    const storeState = await page.evaluate((bText) => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'no store' };
      const msgs = chatStore.getState().messages;
      return {
        messageCount: msgs.length,
        hasSessionA: msgs.some((m: any) => m.content?.includes('执行 ls -la')),
        hasSessionB: msgs.some((m: any) => m.content?.includes(bText)),
        currentThreadId: chatStore.getState().currentThreadId?.substring(0, 20),
        isLoading: chatStore.getState().isLoading,
      };
    }, sessionBText);

    expect(storeState.error).toBeUndefined();
    expect(storeState.messageCount).toBeGreaterThanOrEqual(2);
    expect(storeState.hasSessionA).toBe(false);   // 会话A已切换走，不应在 store 中
    expect(storeState.hasSessionB).toBe(true);      // 当前显示的是会话B
    expect(storeState.isLoading).toBe(false);
  });

  /* ─── NC-8: 高频切换 — 快速连续创建+发送 5 次 ─── */

  test('NC-8: 快速连续切换5次 → 每次消息都正常', async ({ page }) => {
    const result = await page.evaluate(async (timeout) => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;
      if (!chatStore || !settingsStore || !threadStore) return { error: 'stores not found' };

      const providerId = settingsStore.getState().currentProviderId || 'openai';
      const model = settingsStore.getState().currentModel || 'gpt-4o';
      const rounds: any[] = [];

      for (let i = 0; i < 5; i++) {
        threadStore.getState().createThread();
        await new Promise(r => setTimeout(r, 100));

        await chatStore.getState().sendMessage(`Round ${i + 1}: ls -la`, providerId, model);
        await new Promise(r => setTimeout(r, timeout));

        const msgs = chatStore.getState().messages;
        rounds.push({
          round: i + 1,
          messageCount: msgs.length,
          hasUserMessage: msgs.some((m: any) => m.content?.includes(`Round ${i + 1}`)),
          isLoading: chatStore.getState().isLoading,
        });
      }
      return rounds;
    }, REAL_AI_TIMEOUT);

    expect(result.error).toBeUndefined();
    for (const round of result) {
      expect(round.messageCount).toBeGreaterThanOrEqual(2);
      expect(round.hasUserMessage).toBe(true);
      expect(round.isLoading).toBe(false);
    }
  });
});
