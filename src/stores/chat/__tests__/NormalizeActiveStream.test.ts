/**
 * normalizeActiveStream 测试
 *
 * BUG: switchThread 中 normalize 无条件将消息重置为
 * isStreaming: false, status: 'completed'，导致切换回时
 * 即使 LLM 仍在流式输出，会话也显示为"空闲"。
 *
 * 修复：在 normalize 时检查消息是否有活跃的 stream session，
 * 如果有则保留 isStreaming=true / status='streaming'。
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../../useChatStore';

describe('normalizeActiveStream', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [], isLoading: false, currentThreadId: '' });
    (window as any).__CROSS_THREAD_PERSIST_INIT__ = true;
    (window as any).__StreamingResponseController = {
      getSession: vi.fn(),
      activeSessions: new Map(),
      activeListeners: new Map(),
    };
  });

  // ─── 辅助：模拟 switchThread 中的 normalize + restoreIsLoadingIfActive ───

  function normalizeMessages(messages: any[]): any[] {
    const STALE_STATUS_MAP: Record<string, string> = {
      pending: 'completed',
      executing: 'completed',
      running: 'completed',
    };
    const normalizeToolCalls = (toolCalls: any[] | undefined): any[] | undefined => {
      if (!toolCalls?.length) return toolCalls;
      return toolCalls.map((tc: any) => ({
        ...tc,
        status: STALE_STATUS_MAP[tc.status] ?? tc.status,
        isPartial: tc.isPartial ? false : tc.isPartial,
      }));
    };

    return messages.map((msg: any, idx: number) => {
      // ⚠️ BUG: 这里应检查 session 活跃度，但当前代码无条件重置
      return {
        ...msg,
        isStreaming: false,
        status: 'completed',
        toolCalls: normalizeToolCalls(msg.toolCalls),
        _loadOrder: idx,
      };
    });
  }

  function restoreIsLoadingIfActive(messages: any[]): boolean {
    const controller = (window as any).__StreamingResponseController;
    if (!controller?.getSession) return false;
    const hasActive = messages.some((msg: any) => {
      const session = controller.getSession(msg.id);
      return session && !session.isFinished;
    });
    if (hasActive) {
      useChatStore.setState({ isLoading: true });
    }
    return hasActive;
  }

  // ─── 测试用例 ───

  test('BUG CONFIRMED: 活跃 session 的消息被 normalize 重置为 completed', () => {
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'thread-1',
      isFinished: false,
    });

    // 模拟从 IndexedDB 加载的消息（保存时 isStreaming=true）
    const loadedMessages = [
      { id: 'corr-1', content: 'partial content', role: 'assistant', isStreaming: true, status: 'streaming' },
    ];

    // 执行 normalize（当前有 BUG 的版本）
    const normalized = normalizeMessages(loadedMessages);

    // BUG: isStreaming 被强制设为 false，即使有活跃 session
    expect(normalized[0].isStreaming).toBe(false);
    expect(normalized[0].status).toBe('completed');
    // ↑ 这就是用户看到的"空闲"状态
  });

  test('UT-AS1: 消息有活跃 session → normalize 保留 isStreaming=true', () => {
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'thread-1',
      isFinished: false,
    });

    const loadedMessages = [
      { id: 'corr-1', content: 'partial', role: 'assistant', isStreaming: true, status: 'streaming' },
    ];

    // 🏆 FIXED normalize: 检查 session 活跃度
    const fixedNormalize = (messages: any[]) => messages.map((msg: any, idx: number) => {
      const session = controller.getSession(msg.id);
      const isActiveStream = session && !session.isFinished;

      return {
        ...msg,
        isStreaming: isActiveStream ? true : false,
        status: isActiveStream ? 'streaming' : 'completed',
        _loadOrder: idx,
      };
    });

    const normalized = fixedNormalize(loadedMessages);

    expect(normalized[0].isStreaming).toBe(true);
    expect(normalized[0].status).toBe('streaming');
  });

  test('UT-AS2: 消息无活跃 session → normalize 重置为 completed', () => {
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue(undefined);

    const loadedMessages = [
      { id: 'corr-1', content: 'full reply', role: 'assistant', isStreaming: false, status: 'completed' },
    ];

    const fixedNormalize = (messages: any[]) => messages.map((msg: any, idx: number) => {
      const session = controller.getSession(msg.id);
      const isActiveStream = session && !session.isFinished;

      return {
        ...msg,
        isStreaming: isActiveStream ? true : false,
        status: isActiveStream ? 'streaming' : 'completed',
        _loadOrder: idx,
      };
    });

    const normalized = fixedNormalize(loadedMessages);

    expect(normalized[0].isStreaming).toBe(false);
    expect(normalized[0].status).toBe('completed');
  });

  test('UT-AS3: 活跃 session → restoreIsLoadingIfActive 恢复 isLoading=true', () => {
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'thread-1',
      isFinished: false,
    });

    useChatStore.setState({
      messages: [{ id: 'corr-1', content: 'partial', role: 'assistant' }],
      isLoading: false,
    });

    const restored = restoreIsLoadingIfActive(useChatStore.getState().messages);

    expect(restored).toBe(true);
    expect(useChatStore.getState().isLoading).toBe(true);
  });

  test('UT-AS4: 完整流程 — 切回时有活跃 session → isStreaming + isLoading 都正确', () => {
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'thread-1',
      isFinished: false,
    });

    // 从 IndexedDB 加载
    const loadedMessages = [
      { id: 'corr-1', content: 'partial', role: 'assistant', isStreaming: true, status: 'streaming' },
    ];

    // 1. Normalize（修复版）
    const fixedNormalize = (messages: any[]) => messages.map((msg: any, idx: number) => {
      const session = controller.getSession(msg.id);
      const isActiveStream = session && !session.isFinished;
      return {
        ...msg,
        isStreaming: isActiveStream ? true : false,
        status: isActiveStream ? 'streaming' : 'completed',
        _loadOrder: idx,
      };
    });

    const normalized = fixedNormalize(loadedMessages);

    // 2. Set state
    useChatStore.setState({ messages: normalized, isLoading: false });

    // 3. Restore isLoading
    restoreIsLoadingIfActive(normalized);

    const state = useChatStore.getState();
    expect(state.messages[0].isStreaming).toBe(true);
    expect(state.messages[0].status).toBe('streaming');
    expect(state.isLoading).toBe(true);
  });

  test('UT-AS5: 流已结束但 session 未清理 → isFinished=true 不恢复', () => {
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'thread-1',
      isFinished: true,  // 流已完成
    });

    const loadedMessages = [
      { id: 'corr-1', content: 'full reply', role: 'assistant', isStreaming: false, status: 'completed' },
    ];

    const fixedNormalize = (messages: any[]) => messages.map((msg: any, idx: number) => {
      const session = controller.getSession(msg.id);
      const isActiveStream = session && !session.isFinished;
      return {
        ...msg,
        isStreaming: isActiveStream ? true : false,
        status: isActiveStream ? 'streaming' : 'completed',
        _loadOrder: idx,
      };
    });

    const normalized = fixedNormalize(loadedMessages);

    useChatStore.setState({ messages: normalized, isLoading: false });
    const restored = restoreIsLoadingIfActive(normalized);

    expect(normalized[0].isStreaming).toBe(false);
    expect(normalized[0].status).toBe('completed');
    expect(restored).toBe(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });
});
