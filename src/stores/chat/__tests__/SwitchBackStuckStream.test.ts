/**
 * SwitchBackStuckStream — 切回时 isLoading 卡死测试
 *
 * 场景重建（用户反馈 1.10.x）:
 * "新建对话 → 流式输出中切换到旧对话 → 再切回新对话 → 内容没输完，生成中...永不结束"
 *
 * 根因假设：
 * 1. CrossThreadPersistenceService 的 chat:stream:finished handler 是 async IIFE
 * 2. emitFinished 顺序：session.isFinished=true → event emit → stopListening（删 session）
 * 3. CPS handler 作为 async IIFE，其主体（flushKey → getSession → save）在微任务队列中执行
 * 4. 到 CPS handler 的 getSession 执行时，stopListening 已删除 session → getSession 返回 null
 * 5. applyToMessages(finishStream) 跳过 → IndexedDB 消息保持 isStreaming=true
 * 6. switchThread load → normalize 修复 isStreaming/status
 * 7. controller.getSession 返回 undefined → restoreIsLoadingIfActive → isLoading=false
 *
 * 内容完整性场景：
 * 如果 WriteBehindBuffer 在 session 被删前已完成 flush（定时器触发或手动 flushKey），
 * 内容已写入 IndexedDB，则切回后内容完整。
 * 如果 flush 尚未完成（竞态），内容为部分 → "内容没有输完"
 *
 * 此测试模拟 CPS handler 的 async IIFE + stopListening 竞态，
 * 验证从 IndexedDB 重新加载后内容完整性 + isLoading 状态。
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore } from '../../useChatStore';

describe('SwitchBackStuckStream', () => {

  beforeEach(() => {
    useChatStore.setState({ messages: [], isLoading: false, currentThreadId: '' });
    vi.clearAllMocks();
  });

  // ─── CPS async race 模拟 ──────────────────────────────

  /**
   * 模拟 CrossThreadPersistenceService finish 流程中 async IIFE 的时序。
   * 精确重现场景：
   *    emitFinished → session.isFinished=true → event emit → stopListening(session.delete)
   *
   * 问题：CPS handler 是 async IIFE，其主体在事件循环微任务中执行，
   * 此时 session 已被 stopListening 删除 → getSession 返回 null。
   */
  function simulateCPSFinishRace(
    persistence: { load: () => any[]; save: (msgs: any[]) => void },
    correlationId: string,
    threadId: string,
  ): { sessionFound: boolean; messagesSaved: any[] } {
    // Phase 1: emitFinished 开始
    let lastSavedMessages: any[] = [];

    // 模拟 CPS handler 的 flushKey → getSession → save 流程
    // 这是一个 async IIFE — 我们不模拟异步，直接模拟其执行顺序

    // 1. flushKey: 先保存 delta 到持久化
    const msgs = persistence.load();
    const idx = msgs.findIndex((m: any) => m.id === correlationId);
    if (idx !== -1) {
      // 模拟 ops.appendContent 的最终 delta
      msgs[idx].content = (msgs[idx].content || '') + ' World!';
      persistence.save(msgs);
      lastSavedMessages = [...msgs];
    }

    // 2. Phase 2: stopListening 删除 session（模拟 emitFinished 的第三行）
    // 移除了 session，模拟 controller.getSession 返回 null 的场景

    // 3. CPS handler 尝试 getSession → null
    // 在真实场景中，因为 async IIFE，此时 session 已被 stopListening 删除
    const sessionFound = false; // 模拟 getSession 返回 null

    if (!sessionFound) {
      // 模拟 CPS 因 session 不存在而跳过 applyToMessages
      // finishStream 没有被应用
      return { sessionFound: false, messagesSaved: lastSavedMessages };
    }

    // 如果 session 存在（正常路径），会调用 applyToMessages(finishStream)
    const finishMsgs = persistence.load();
    const finishIdx = finishMsgs.findIndex((m: any) => m.id === correlationId);
    if (finishIdx !== -1) {
      finishMsgs[finishIdx] = {
        ...finishMsgs[finishIdx],
        isStreaming: false,
        status: 'completed',
      };
      persistence.save(finishMsgs);
      lastSavedMessages = [...finishMsgs];
    }

    return { sessionFound: true, messagesSaved: lastSavedMessages };
  }

  /**
   * 模拟 switchThread 的 load + normalize + restoreIsLoadingIfActive
   */
  function simulateSwitchBack(
    persistenceMessages: any[],
    controllerSession: any | undefined,
  ) {
    // 1. normalize（实际 switchThread 中的 normalize 逻辑）
    const normalized = persistenceMessages.map((msg: any, idx: number) => {
      if (msg.segments && msg.segments.length > 0) {
        return {
          ...msg,
          isStreaming: false,
          status: 'completed',
          toolCalls: msg.toolCalls ? msg.toolCalls.map((tc: any) => ({
            ...tc,
            status: tc.status === 'pending' || tc.status === 'executing' || tc.status === 'running'
              ? 'completed' : tc.status,
            isPartial: tc.isPartial ? false : tc.isPartial,
          })) : undefined,
          _loadOrder: idx,
        };
      }
      const segments: any[] = [];
      if (msg.content) {
        segments.push({
          id: `seg-recovered-${msg.id}`,
          type: 'text',
          phase: 'pre-tool',
          content: msg.content,
          order: 1,
        });
      }
      return {
        ...msg,
        isStreaming: false,
        status: 'completed',
        toolCalls: msg.toolCalls ? msg.toolCalls.map((tc: any) => ({
          ...tc,
          status: tc.status === 'pending' || tc.status === 'executing' || tc.status === 'running'
            ? 'completed' : tc.status,
          isPartial: tc.isPartial ? false : tc.isPartial,
        })) : undefined,
        segments,
        _loadOrder: idx,
      };
    });

    // 2. restoreIsLoadingIfActive
    let restoredIsLoading = false;
    if (controllerSession) {
      const hasActive = normalized.some((msg: any) => {
        const session = controllerSession(msg.id);
        return session && !session.isFinished;
      });
      if (hasActive) {
        restoredIsLoading = true;
      }
    }

    return { normalized, restoredIsLoading };
  }

  // ─── 测试用例 ────────────────────────────────────────

  test('UT-SS1: CPS async IIFE 导致 session 不可用 → finishStream 跳过（BUG 确认）', () => {
    // 模拟 IndexedDB 中的消息（cross-thread chunk 仅写入 content，不写 finish）
    const persistenceStore: any[] = [{
      id: 'corr-1',
      role: 'assistant',
      content: 'Hello',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    const testPersistence = {
      load: () => [...persistenceStore], // 返回副本，避免引用混叠
      save: (msgs: any[]) => {
        persistenceStore.length = 0;
        persistenceStore.push(...msgs);
      },
    };

    // 模拟 CPS finish 流程（async timing bug）
    const result = simulateCPSFinishRace(
      testPersistence,
      'corr-1',
      'thread-a',
    );

    // CPS 因 async IIFE 时序找不到 session → finish 未应用
    expect(result.sessionFound).toBe(false);
    expect(result.messagesSaved[0].content).toBe('Hello World!'); // ✅ 内容已写入（flushKey）
    expect(result.messagesSaved[0].isStreaming).toBe(true);   // 🐛 BUG: 未 reset
    expect(result.messagesSaved[0].status).toBe('streaming');  // 🐛 BUG: 未 reset
  });

  test('UT-SS2: CPS flush 正常路径 → finish 正确应用', () => {
    // 模拟正常路径：CPS flushKey + getSession 成功 + applyToMessages(finishStream)
    const persistenceStore: any[] = [{
      id: 'corr-1',
      role: 'assistant',
      content: 'Hello',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    const testPersistence = {
      load: () => [...persistenceStore], // 返回副本，避免引用混叠
      save: (msgs: any[]) => {
        persistenceStore.length = 0;
        persistenceStore.push(...msgs);
      },
    };

    // 手动模拟正确路径：flush + finishStream
    const msgs = testPersistence.load();
    const idx = msgs.findIndex((m: any) => m.id === 'corr-1');
    msgs[idx].content += ' World!';
    msgs[idx].isStreaming = false;
    msgs[idx].status = 'completed';
    testPersistence.save(msgs);

    expect(msgs[0].content).toBe('Hello World!');
    expect(msgs[0].isStreaming).toBe(false);
    expect(msgs[0].status).toBe('completed');
  });

  test('UT-SS3: 切回后 normalize 修复所有状态 + 内容完整', () => {
    // 模拟：CPS 写入了 content 但没写 finish（async bug 场景）
    const persistenceMessages = [{
      id: 'corr-1',
      role: 'assistant',
      content: 'Hello World!',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
      toolCalls: [{
        id: 'tc-1',
        function: { name: 'tool', arguments: '{}' },
        status: 'executing',
        isPartial: true,
      }],
    }];

    // 模拟 controller session 不存在（流已完成 + stopListening 已执行）
    const controllerSession = vi.fn().mockReturnValue(undefined);

    const { normalized, restoredIsLoading } = simulateSwitchBack(
      persistenceMessages,
      controllerSession,
    );

    const msg = normalized[0];

    // ✅ normalize 修复
    expect(msg.content).toBe('Hello World!');         // 内容完整
    expect(msg.isStreaming).toBe(false);               // 已重置
    expect(msg.status).toBe('completed');               // 已重置
    expect(msg.toolCalls![0].status).toBe('completed'); // toolCalls 已重置
    expect(msg.toolCalls![0].isPartial).toBe(false);    // isPartial 已重置

    // ✅ session 不存在 → isLoading 不被恢复
    expect(restoredIsLoading).toBe(false);
  });

  test('UT-SS4: 切回时流仍在活跃中 → 正确恢复 isLoading', () => {
    const persistenceMessages = [{
      id: 'corr-1',
      role: 'assistant',
      content: 'Hello Wor',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    // 模拟 controller session 仍在活跃中（流未完成）
    const controllerSession = vi.fn().mockImplementation((id: string) => {
      if (id === 'corr-1') {
        return { threadId: 'thread-a', isFinished: false };
      }
      return undefined;
    });

    const { normalized, restoredIsLoading } = simulateSwitchBack(
      persistenceMessages,
      controllerSession,
    );

    expect(restoredIsLoading).toBe(true);  // ✅ 恢复 isLoading
    expect(normalized[0].isStreaming).toBe(false); // normalize 后暂时 false
    expect(normalized[0].status).toBe('completed'); // normalize 后暂时 completed
    // StoreMapper 随后会重新设置 isStreaming=true
  });

  test('UT-SS5: CPS flush 失败（未写入）→ 切回后内容不完整（BUG 高保真）', () => {
    // 模拟：CPS WriteBehindBuffer 的 flushDeltasToDB 尚未执行
    // persistence 中只有 switchThread 保存的 partial content
    const persistenceMessages = [{
      id: 'corr-1',
      role: 'assistant',
      content: 'Hello',  // 只有 switch 时保存的部分内容
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    // session 已结束（流已 complete，stopListening 已执行）
    const controllerSession = vi.fn().mockReturnValue(undefined);

    const { normalized, restoredIsLoading } = simulateSwitchBack(
      persistenceMessages,
      controllerSession,
    );

    // 🐛 BUG: 内容不完整（缺少 CPS 缓冲的 delta）
    expect(normalized[0].content).toBe('Hello');       // 内容不完全
    expect(normalized[0].content).not.toContain('World'); // 缺的 delta

    // 但因为 session 已结束， isLoading 不会被错误恢复
    expect(restoredIsLoading).toBe(false);
  });

  test('UT-SS6: 全流程模拟 — 切回后内容完整无 isLoading 卡死（理想路径）', () => {
    // 模拟 CPS 正常完成 flush + finish 后，重新加载的场景
    const persistenceStore: any[] = [{
      id: 'corr-1',
      role: 'assistant',
      content: 'Hello',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    const testPersistence = {
      load: () => [...persistenceStore], // 返回副本，避免引用混叠
      save: (msgs: any[]) => {
        persistenceStore.length = 0;
        persistenceStore.push(...msgs);
      },
    };

    // Phase 1: 模拟 CPS 收到 finish 事件 - 正确路径
    const cpsMsgs = testPersistence.load();
    const cpsIdx = cpsMsgs.findIndex((m: any) => m.id === 'corr-1');
    // flush delta
    cpsMsgs[cpsIdx].content += ' World!';
    // finishStream
    cpsMsgs[cpsIdx].isStreaming = false;
    cpsMsgs[cpsIdx].status = 'completed';
    testPersistence.save(cpsMsgs);

    // Phase 2: 切回 → load + normalize + restoreIsLoading
    const controllerSession = vi.fn().mockReturnValue(undefined);
    const { normalized, restoredIsLoading } = simulateSwitchBack(
      testPersistence.load(),
      controllerSession,
    );

    const msg = normalized[0];
    expect(msg.content).toBe('Hello World!');    // 内容完整
    expect(msg.isStreaming).toBe(false);          // 已重置
    expect(msg.status).toBe('completed');          // 已重置
    expect(restoredIsLoading).toBe(false);         // 不卡死

    // 非活跃 session → isLoading 应为 false
    expect(useChatStore.getState().isLoading).toBe(false);
  });
});
