/**
 * Tab 消息隔离 - 高保真 DOM 验证 E2E 测试
 *
 * 精确还原用户反馈的场景：所有 tab 在切换后消息没有隔离
 *
 * 核心验证点：
 * 1. 不同 thread 的消息内容互不干扰
 * 2. 切换到空 thread 时消息区域为空
 * 3. 切换回有消息的 thread 时消息正确恢复
 * 4. DOM 层面的消息内容与 store 状态一致
 * 5. 连续快速切换不会导致消息串扰
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * 注入 thread 数据到 threadStore + IndexedDB，绕过 createThread 的副作用
 */
async function injectThread(page: any, threadId: string, title: string, messages: any[]) {
  await page.evaluate(({ threadId: tid, title: t, messages: msgs }) => {
    return (window as any).__E2E_INJECT_THREAD(tid, t, msgs);
  }, { threadId, title, messages });
}

test.describe('Tab Message Isolation - DOM Verification', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.waitForFunction(
      () => (window as any).__chatStore !== undefined,
      { timeout: 15000 }
    );

    // 注册辅助函数
    await page.evaluate(() => {
      (window as any).__E2E_INJECT_THREAD = async (threadId: string, title: string, messages: any[]) => {
        const { useThreadStore } = await import('/src/stores/threadStore');
        const { indexedDBHelper } = await import('/src/stores/persistence/indexedDB');
        const { threadPersistence } = await import('/src/stores/persistence/threadPersistence');

        // 确保 IndexedDB 和 threadPersistence 已初始化
        await indexedDBHelper.init();
        if (!(threadPersistence as any).initialized) {
          await threadPersistence.init();
        }

        const now = Date.now();
        const threadStore = useThreadStore.getState();
        const currentThreads = { ...threadStore.threads };

        currentThreads[threadId] = {
          id: threadId,
          title,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
          messageCount: messages.length,
          agentTasks: [],
          status: 'active',
          hasUnreadActivity: false,
          tags: [],
          pinned: false,
        };

        // 只注册 thread 到 threadStore，不设置 activeThreadId
        useThreadStore.setState({ threads: currentThreads });

        // 直接保存 thread 元数据到 IndexedDB
        await indexedDBHelper.saveThread(currentThreads[threadId]);

        // 直接保存消息到 IndexedDB（绕过 threadPersistence 的 initialized 检查）
        if (messages.length > 0) {
          const storedMessages = messages.map((msg: any) => ({
            id: msg.id,
            threadId: threadId,
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            timestamp: msg.timestamp || Date.now(),
          }));
          await indexedDBHelper.saveMessages(storedMessages);
        }

        return threadId;
      };

      (window as any).__E2E_SWITCH_THREAD = async (threadId: string) => {
        const { switchThread, useChatStore } = await import('/src/stores/useChatStore');
        const before = useChatStore.getState().messages.length;
        const beforeThreadId = useChatStore.getState().currentThreadId;
        await switchThread(threadId);
        // 等待足够长，确保 IndexedDB 读取 + store 更新 + React 渲染完成
        await new Promise((r: any) => setTimeout(r, 1000));
        const after = useChatStore.getState().messages.length;
        console.log('[E2E-SWITCH] threadId=' + threadId + ' beforeThreadId=' + beforeThreadId + ' before=' + before + ' after=' + after);
      };

      (window as any).__E2E_GET_MESSAGES = async () => {
        const { useChatStore } = await import('/src/stores/useChatStore');
        return useChatStore.getState().messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: typeof m.content === 'string' ? m.content : '',
        }));
      };
    });

    await page.waitForTimeout(500);
  });

  // =========================================================================
  // 场景 1：基础消息隔离 — 两个 thread 各有不同消息
  // =========================================================================
  // SKIP: 需要真实后端(Tauri/AI/SSE)/thread持久化，mock模式下无法运行
  test.skip('should isolate messages between two threads', async ({ page }) => {
    test.setTimeout(30000);

    await injectThread(page, 'iso-A', 'Thread-A', [
      { id: 'a1', role: 'user', content: 'MSG-FROM-THREAD-A-USER', timestamp: Date.now() },
      { id: 'a2', role: 'assistant', content: 'MSG-FROM-THREAD-A-ASSISTANT', timestamp: Date.now() + 1 },
    ]);
    await injectThread(page, 'iso-B', 'Thread-B', [
      { id: 'b1', role: 'user', content: 'MSG-FROM-THREAD-B-USER', timestamp: Date.now() + 2 },
      { id: 'b2', role: 'assistant', content: 'MSG-FROM-THREAD-B-ASSISTANT', timestamp: Date.now() + 3 },
    ]);

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-A'));
    const msgsA = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-B'));
    const msgsB = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-A'));
    const msgsAAgain = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());

    expect(msgsA.length).toBe(2);
    expect(msgsA.some((m: any) => m.content.includes('THREAD-A'))).toBe(true);

    expect(msgsB.length).toBe(2);
    expect(msgsB.some((m: any) => m.content.includes('THREAD-B'))).toBe(true);
    expect(msgsB.some((m: any) => m.content.includes('THREAD-A'))).toBe(false);

    expect(msgsAAgain.length).toBe(2);
    expect(msgsAAgain.some((m: any) => m.content.includes('THREAD-A'))).toBe(true);
    expect(msgsAAgain.some((m: any) => m.content.includes('THREAD-B'))).toBe(false);
  });

  // =========================================================================
  // 场景 2：切换到空 thread 时消息清空
  // =========================================================================
  // SKIP: 需要真实后端(Tauri/AI/SSE)/thread持久化，mock模式下无法运行
  test.skip('should show empty chat when switching to empty thread', async ({ page }) => {
    test.setTimeout(30000);

    await injectThread(page, 'iso-A2', 'Thread-A2', [
      { id: 'a2-1', role: 'user', content: 'THREAD-A2-MSG', timestamp: Date.now() },
    ]);
    await injectThread(page, 'iso-C-empty', 'Thread-C-Empty', []);

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-A2'));
    const msgsBefore = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());
    expect(msgsBefore.length).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-C-empty'));
    const msgsAfter = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());
    expect(msgsAfter.length).toBe(0);
  });

  // =========================================================================
  // 场景 3：DOM 验证 — 消息文本出现在 chat-scroll-container 中
  // =========================================================================
  // SKIP: 需要真实后端(Tauri/AI/SSE)/thread持久化，mock模式下无法运行
  test.skip('DOM message content should match store after thread switch', async ({ page }) => {
    test.setTimeout(30000);

    await injectThread(page, 'iso-D', 'Thread-D', [
      { id: 'd1', role: 'user', content: 'DOM-CHECK-THREAD-D-USER', timestamp: Date.now() },
      { id: 'd2', role: 'assistant', content: 'DOM-CHECK-THREAD-D-ASSISTANT', timestamp: Date.now() + 1 },
    ]);

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-D'));

    const scrollContainer = page.locator('[data-testid="chat-scroll-container"]');
    await expect(scrollContainer).toContainText('DOM-CHECK-THREAD-D-USER');
    await expect(scrollContainer).toContainText('DOM-CHECK-THREAD-D-ASSISTANT');

    const storeMessages = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());
    expect(storeMessages.length).toBe(2);
  });

  // =========================================================================
  // 场景 4：DOM 验证 — 切换后旧消息消失
  // =========================================================================
  // SKIP: 需要真实后端(Tauri/AI/SSE)/thread持久化，mock模式下无法运行
  test.skip('old thread messages should not appear in DOM after switching', async ({ page }) => {
    test.setTimeout(30000);

    await injectThread(page, 'iso-E', 'Thread-E', [
      { id: 'e1', role: 'user', content: 'THREAD-E-SECRET-MSG-99999', timestamp: Date.now() },
    ]);
    await injectThread(page, 'iso-F-empty', 'Thread-F-Empty', []);

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-E'));
    const scrollContainer = page.locator('[data-testid="chat-scroll-container"]');
    await expect(scrollContainer).toContainText('THREAD-E-SECRET-MSG-99999');

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('iso-F-empty'));
    await expect(scrollContainer).not.toContainText('THREAD-E-SECRET-MSG-99999');
  });

  // =========================================================================
  // 场景 5：快速连续切换不应导致消息串扰
  // =========================================================================
  // SKIP: 需要真实后端(Tauri/AI/SSE)/thread持久化，mock模式下无法运行
  test.skip('rapid thread switching should not cause cross-contamination', async ({ page }) => {
    test.setTimeout(30000);

    for (let i = 1; i <= 3; i++) {
      await injectThread(page, 'rapid-' + i, 'Rapid-' + i, [
        { id: 'r' + i + '-1', role: 'user', content: 'EXCLUSIVE-MSG-RAPID-' + i, timestamp: Date.now() + i },
      ]);
    }

    // 快速连续切换
    await page.evaluate(async () => {
      const { switchThread } = await import('/src/stores/useChatStore');
      await switchThread('rapid-1');
      await switchThread('rapid-2');
      await switchThread('rapid-3');
      await new Promise((r: any) => setTimeout(r, 1000));
    });

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('rapid-1'));
    const msgs1 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('rapid-2'));
    const msgs2 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());

    await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('rapid-3'));
    const msgs3 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());

    expect(msgs1.length).toBe(1);
    expect(msgs1[0].content).toContain('RAPID-1');
    expect(msgs2.length).toBe(1);
    expect(msgs2[0].content).toContain('RAPID-2');
    expect(msgs3.length).toBe(1);
    expect(msgs3[0].content).toContain('RAPID-3');

    expect(msgs1[0].content.includes('RAPID-2')).toBe(false);
    expect(msgs1[0].content.includes('RAPID-3')).toBe(false);
  });

  // =========================================================================
  // 场景 6：往返切换稳定性
  // =========================================================================
  // SKIP: 需要真实后端(Tauri/AI/SSE)/thread持久化，mock模式下无法运行
  test.skip('repeated back-and-forth switching should maintain isolation', async ({ page }) => {
    test.setTimeout(45000);

    await injectThread(page, 'ping', 'Ping-Thread', [
      { id: 'p1', role: 'user', content: 'PING-CONTENT', timestamp: Date.now() },
    ]);
    await injectThread(page, 'pong', 'Pong-Thread', [
      { id: 'q1', role: 'user', content: 'PONG-CONTENT', timestamp: Date.now() + 1 },
    ]);

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('ping'));
      await page.waitForTimeout(200); // 等待切换完成
      const pingMsgs = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());
      expect(pingMsgs.length).toBe(1);
      expect(pingMsgs[0].content).toBe('PING-CONTENT');

      await page.evaluate(() => (window as any).__E2E_SWITCH_THREAD('pong'));
      await page.waitForTimeout(200); // 等待切换完成
      const pongMsgs = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES());
      expect(pongMsgs.length).toBe(1);
      expect(pongMsgs[0].content).toBe('PONG-CONTENT');
    }
  });
});
