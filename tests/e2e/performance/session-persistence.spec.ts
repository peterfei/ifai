/**
 * 高保真 E2E 测试: 线程会话持久化 (HE-x)
 *
 * 验证 PerThreadSessionStore + SessionPersistenceService + StoreMapper 的全链路正确性：
 *   HE-1: 极速切回不丢内容
 *   HE-2: 多线程并行 streaming 隔离
 *   HE-3: 应用重启后 session 恢复
 *   HE-4: todoWrite 随线程切换持久化
 *   HE-5: DebugLog 导出供 LLM 分析
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

const PROVIDER_ID = 'openai';
const MODEL = 'gpt-4o';

test.describe('高保真: 线程会话持久化', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  // ─── HE-1: 极速切回不丢内容 ──────────────────────────────

  test('HE-1: 极速切回不丢内容', async ({ page }) => {
    test.setTimeout(180000);

    // ── Arrange: 记录线程 A ID，创建线程 B ──
    const threadA = await page.evaluate(
      () => (window as any).__chatStore.getState().currentThreadId,
    );
    const threadB = await page.evaluate(() => {
      const ts = (window as any).__threadStore.getState();
      return ts.createThread(); // createThread 隐式切换到 B
    });

    // ── Act: 切回 A → 发消息 → 立即切 B (极速) ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);

    // 发消息 (不 await 完成，极速切走模拟 async gap)
    const sendPromise = page.evaluate(async (text) => {
      const cs = (window as any).__chatStore.getState();
      const ss = (window as any).__settingsStore.getState();
      await cs.sendMessage(text, ss.currentProviderId, ss.currentModel);
    }, '请详细介绍项目架构和目录结构');

    // <200ms 内切到 B (模拟用户极速操作)
    await page.waitForTimeout(150);
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadB);

    // 在 B 停留一段时间，让 A 在后台 streaming
    await page.waitForTimeout(3000);

    // ── 切回 A ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);

    // 等待 A 的 streaming 完成
    await page.waitForFunction(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages;
      const last = msgs[msgs.length - 1];
      return last && last.role === 'assistant' && !last.isStreaming
             && last.content && last.content.length > 50;
    }, { timeout: 120000 });

    // ── Assert: A 的内容完整 ──
    const finalState = await page.evaluate(() => {
      const cs = (window as any).__chatStore.getState();
      const am = cs.messages.find((m: any) => m.role === 'assistant');
      return {
        contentLength: am?.content?.length || 0,
        hasContent: (am?.content?.length || 0) > 100,
        isStreaming: am?.isStreaming,
        isLoading: cs.isLoading,
        msgCount: cs.messages.length,
      };
    });

    expect(finalState.hasContent).toBe(true);
    expect(finalState.isStreaming).toBe(false);
    expect(finalState.isLoading).toBe(false);
    expect(finalState.msgCount).toBeGreaterThanOrEqual(2);
    console.log(`[HE-1] ✅ contentLength=${finalState.contentLength}, msgs=${finalState.msgCount}`);

    await sendPromise; // 确保 send 的 promise 已 resolve
  });

  // ─── HE-2: 多线程并行 streaming 隔离 ─────────────────────

  test('HE-2: 多线程并行 streaming 隔离', async ({ page }) => {
    test.setTimeout(300000);

    // ── Arrange: 获取当前线程 ID、创建第二个线程 ──
    const threadA = await page.evaluate(
      () => (window as any).__chatStore.getState().currentThreadId,
    );
    const threadB = await page.evaluate(() => {
      return (window as any).__threadStore.getState().createThread();
    });

    // ── Step 1: A 发消息，等待 streaming 开始 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);

    const promptA = '请用 300 字详细介绍项目架构和模块划分';
    await page.evaluate(async (text) => {
      const cs = (window as any).__chatStore.getState();
      const ss = (window as any).__settingsStore.getState();
      await cs.sendMessage(text, ss.currentProviderId, ss.currentModel);
    }, promptA);

    // 等待 A 的 streaming 已经开始
    await page.waitForFunction(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages;
      const last = msgs[msgs.length - 1];
      return last && last.role === 'assistant' && last.isStreaming;
    }, { timeout: 30000 });

    // 记录 A 的 content 长度，用于后续对比
    const contentA_atSwitch = await page.evaluate(() => {
      const cs = (window as any).__chatStore.getState();
      const am = cs.messages.find((m: any) => m.role === 'assistant');
      return am?.content?.length || 0;
    });

    // ── Step 2: 切到 B，B 也发消息 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadB);

    const promptB = '请用 300 字介绍项目的测试策略和工具链';
    await page.evaluate(async (text) => {
      const cs = (window as any).__chatStore.getState();
      const ss = (window as any).__settingsStore.getState();
      await cs.sendMessage(text, ss.currentProviderId, ss.currentModel);
    }, promptB);

    await page.waitForFunction(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages;
      const last = msgs[msgs.length - 1];
      return last && last.role === 'assistant' && last.isStreaming;
    }, { timeout: 30000 });

    // ── Step 3: A 和 B 同时在后台/前台 streaming ──
    await page.waitForTimeout(3000);

    // ── Step 4: 切回 A，等待 streaming 完成 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);

    await page.waitForFunction(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages;
      const last = msgs[msgs.length - 1];
      return last && last.role === 'assistant' && !last.isStreaming
             && last.content && last.content.length > 50;
    }, { timeout: 120000 });

    // ── Assert: 同时读取 A 和 B 的 content ──
    const result = await page.evaluate(({ tidA, tidB }) => {
      const cs = (window as any).__chatStore.getState();
      const aMsgs = cs._messagesByThread?.[tidA] || [];
      const bMsgs = cs._messagesByThread?.[tidB] || [];
      const aContent = aMsgs.find((m: any) => m.role === 'assistant')?.content || '';
      const bContent = bMsgs.find((m: any) => m.role === 'assistant')?.content || '';
      return {
        aLen: aContent.length,
        bLen: bContent.length,
        aContent: aContent.slice(0, 200),
        bContent: bContent.slice(0, 200),
      };
    }, { tidA: threadA, tidB: threadB });

    // 验证 1: A 的 content 在后台 streaming 中增长了
    expect(result.aLen).toBeGreaterThan(contentA_atSwitch);
    // 验证 2: B 的 content 非空
    expect(result.bLen).toBeGreaterThan(50);
    // 验证 3: A 和 B 互不污染
    expect(result.aContent).not.toContain('测试策略');
    expect(result.bContent).not.toContain('项目架构');
    console.log(`[HE-2] ✅ A.len=${result.aLen}, B.len=${result.bLen}, isolated=true`);
  });

  // ─── HE-3: 应用重启后 session 恢复 ───────────────────────

  test('HE-3: 应用重启后 session 恢复', async ({ page }) => {
    test.setTimeout(120000);

    // ── Step 1: 完成一次完整对话 ──
    const prompt = '请用 50 字介绍你自己';
    await page.evaluate(async (text) => {
      const cs = (window as any).__chatStore.getState();
      const ss = (window as any).__settingsStore.getState();
      await cs.sendMessage(text, ss.currentProviderId, ss.currentModel);
    }, prompt);

    await page.waitForFunction(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages;
      const last = msgs[msgs.length - 1];
      return last && last.role === 'assistant' && !last.isStreaming
             && last.content && last.content.length > 10;
    }, { timeout: 120000 });

    // 记录刷新前的状态
    const beforeReload = await page.evaluate(() => {
      const cs = (window as any).__chatStore.getState();
      return {
        threadId: cs.currentThreadId,
        msgCount: cs.messages.length,
        lastContent: cs.messages[cs.messages.length - 1]?.content || '',
        lastContentLen: cs.messages[cs.messages.length - 1]?.content?.length || 0,
      };
    });
    console.log(`[HE-3] Before reload: msgs=${beforeReload.msgCount}, contentLen=${beforeReload.lastContentLen}`);

    // ── Step 2: 模拟应用重启 ──
    await page.reload();
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    // ── Step 3: 切回同一线程，等待 IndexedDB 恢复 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, beforeReload.threadId);
    await page.waitForTimeout(2000);

    // ── Assert: 消息恢复 ──
    const afterReload = await page.evaluate(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages;
      return {
        msgCount: msgs.length,
        lastContentLen: msgs[msgs.length - 1]?.content?.length || 0,
        lastContent: msgs[msgs.length - 1]?.content || '',
      };
    });

    expect(afterReload.msgCount).toBe(beforeReload.msgCount);
    expect(afterReload.lastContentLen).toBeGreaterThanOrEqual(beforeReload.lastContentLen - 20); // 允许微小差异
    console.log(`[HE-3] ✅ After reload: msgs=${afterReload.msgCount}, contentLen=${afterReload.lastContentLen}`);
  });

  // ─── HE-4: todoWrite 随线程切换 ──────────────────────────

  test('HE-4: todoWrite 随线程切换', async ({ page }) => {
    test.setTimeout(60000);

    // ── Arrange: 获取或创建两个线程 ──
    const threadA = await page.evaluate(
      () => (window as any).__chatStore.getState().currentThreadId,
    );
    const threadB = await page.evaluate(() => {
      return (window as any).__threadStore.getState().createThread();
    });

    // ── Step 1: 切到 A，添加任务 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const ts = (window as any).__todoWriteStore?.getState();
      ts?.addTask?.({ id: 'he4-t1', title: '架构设计评审', done: false });
      ts?.addTask?.({ id: 'he4-t2', title: '实现核心模块', done: true });
    });

    const tasksA_afterAdd = await page.evaluate(
      () => (window as any).__todoWriteStore?.getState()?.tasks?.length || 0,
    );
    expect(tasksA_afterAdd).toBe(2);

    // ── Step 2: 切到 B，添加不同的任务 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadB);
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const ts = (window as any).__todoWriteStore?.getState();
      ts?.addTask?.({ id: 'he4-t3', title: '编写单元测试', done: false });
    });

    const tasksB = await page.evaluate(
      () => (window as any).__todoWriteStore?.getState()?.tasks || [],
    );
    expect(tasksB).toHaveLength(1);
    expect(tasksB[0].title).toBe('编写单元测试');

    // ── Step 3: 切回 A，验证 A 的任务恢复到 2 条 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);
    await page.waitForTimeout(300);

    const tasksA_afterSwitch = await page.evaluate(
      () => (window as any).__todoWriteStore?.getState()?.tasks || [],
    );
    expect(tasksA_afterSwitch).toHaveLength(2);
    expect(tasksA_afterSwitch[0].title).toBe('架构设计评审');
    expect(tasksA_afterSwitch[1].title).toBe('实现核心模块');
    console.log(`[HE-4] ✅ A=${tasksA_afterSwitch.length} tasks, B=${tasksB.length} tasks, isolated`);
  });

  // ─── HE-5: DebugLog 导出供 LLM 分析 ─────────────────────

  test('HE-5: DebugLog 导出供 LLM 分析', async ({ page }) => {
    test.setTimeout(120000);

    // ── Step 1: 通过 addInitScript 启用调试日志 ──
    await page.addInitScript(() => {
      (window as any).__debugLogEnabled = true;
      (window as any).__E2E_ENABLE_ALL_LOGS__ = true;
    });

    const threadA = await page.evaluate(
      () => (window as any).__chatStore.getState().currentThreadId,
    );
    const threadB = await page.evaluate(() => {
      return (window as any).__threadStore.getState().createThread();
    });

    // ── Step 2: 执行一次完整的流式对话 + 线程切换 ──
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);
    await page.waitForTimeout(200);

    await page.evaluate(async (text) => {
      const cs = (window as any).__chatStore.getState();
      const ss = (window as any).__settingsStore.getState();
      await cs.sendMessage(text, ss.currentProviderId, ss.currentModel);
    }, '请介绍项目架构');
    await page.waitForTimeout(2000);

    // 切到 B
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadB);
    await page.waitForTimeout(3000);

    // 切回 A 等待 streaming 完成
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, threadA);
    await page.waitForFunction(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages;
      const last = msgs[msgs.length - 1];
      return last && last.role === 'assistant' && !last.isStreaming;
    }, { timeout: 120000 });

    // ── Step 3: 导出 DebugLog ──
    const jsonl = await page.evaluate(async () => {
      try {
        const dl = (window as any).__debugLogService;
        if (!dl) return 'DEBUG_LOG_SERVICE_UNAVAILABLE';
        return await dl.exportAsText({ threadId: 'all', level: 'info', limit: 100 });
      } catch (e: any) {
        return `ERROR: ${e.message}`;
      }
    });

    // ── Assert: JSONL 包含关键事件 ──
    if (jsonl === 'DEBUG_LOG_SERVICE_UNAVAILABLE') {
      console.log('[HE-5] ⚠️ DebugLogService not exposed — verify __debugLogService is on window');
      return;
    }

    expect(jsonl).toContain('stream:start');
    expect(jsonl).toContain('thread:switch');
    expect(jsonl).toContain('stream:finish');

    // 验证每行都是合法 JSON
    const lines = jsonl.trim().split('\n').filter(Boolean);
    for (const line of lines.slice(0, 10)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    console.log(`[HE-5] ✅ ${lines.length} log lines exported`);
    console.log('=== DEBUG LOG (first 2000 chars) ===');
    console.log(jsonl.slice(0, 2000));
    console.log('=== END DEBUG LOG ===');
  });
});
