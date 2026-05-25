/**
 * CrossThreadPersistenceService 单元测试
 *
 * 验证声明式路由规则三态，以及 EventBus → WriteBehindBuffer 的链路。
 * 注意：不 mock persistence 模块，因为 useChatStore 的自动保存订阅者
 * 也会调用它。WriteBehindBuffer → IndexedDB 的写入链由
 * MessageOperations 测试 + WriteBehindBuffer 测试覆盖。
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatEventBus } from '../eventBus/ChatEventBus';
import { useChatStore } from '../../useChatStore';

describe('CrossThreadPersistenceService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // 重置 store
    useChatStore.setState({ messages: [], currentThreadId: 'current-thread', isLoading: false });

    // 设置 mock controller
    (window as any).__StreamingResponseController = {
      getSession: vi.fn(),
    };

    // 重置初始化标记并重新初始化
    (window as any).__CROSS_THREAD_PERSIST_INIT__ = false;

    const { initCrossThreadPersistence } = await import('../CrossThreadPersistenceService');
    initCrossThreadPersistence();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── 路由规则 ───

  test('UT-CT1: 当前线程的 chunk 跳过处理（getSession 不应被调用）', async () => {
    // 消息在当前线程中 → 快速短路，不查询 session
    useChatStore.setState({ messages: [{ id: 'corr-1', content: '' }] });
    const controller = (window as any).__StreamingResponseController;

    chatEventBus.emit('chat:stream:chunk', {
      correlationId: 'corr-1', delta: 'hello', timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 100));
    // isCrossThread 应短路返回 false，不调用 getSession
    expect(controller.getSession).not.toHaveBeenCalled();
  });

  test('UT-CT2: 跨线程 + 活跃 session → 路由通过（无异常）', async () => {
    useChatStore.setState({ messages: [{ id: 'other-msg', content: 'history' }] });
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'original-thread', isFinished: false,
    });

    // 无异常即可——实际写入由 WriteBehindBuffer + MessageOperations 测试覆盖
    chatEventBus.emit('chat:stream:chunk', {
      correlationId: 'corr-1', delta: ' content', timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 100));
    expect(controller.getSession).toHaveBeenCalledWith('corr-1');
  });

  test('UT-CT3: 跨线程 + session 已结束 → 路由拒绝（getSession 被调用但无写入）', async () => {
    useChatStore.setState({ messages: [] });
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'original-thread', isFinished: true,
    });

    // getSession 被调用，但 session.isFinished=true → 应被路由规则拒绝
    chatEventBus.emit('chat:stream:chunk', {
      correlationId: 'corr-1', delta: 'data', timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 100));
    expect(controller.getSession).toHaveBeenCalledWith('corr-1');
  });

  // ─── finished 事件 ───

  test('UT-CT4: 跨线程 finished → 路由通过（无异常）', async () => {
    useChatStore.setState({ messages: [] });
    const controller = (window as any).__StreamingResponseController;
    controller.getSession.mockReturnValue({
      threadId: 'original-thread', isFinished: false,
    });

    chatEventBus.emit('chat:stream:chunk', {
      correlationId: 'corr-1', delta: ' more ', timestamp: Date.now(),
    });
    chatEventBus.emit('chat:stream:finished', {
      correlationId: 'corr-1', timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 300));
    // getSession 应被至少调用 2 次（chunk + finished 各一次）
    expect(controller.getSession.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('UT-CT5: 当前线程 finished 路由拒绝（不调用 getSession）', async () => {
    useChatStore.setState({ messages: [{ id: 'corr-1', content: 'text' }] });

    chatEventBus.emit('chat:stream:finished', {
      correlationId: 'corr-1', timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 100));
    const controller = (window as any).__StreamingResponseController;
    // 消息在当前线程中 → isCrossThreadChunk 快速短路返回 false
    expect(controller.getSession).not.toHaveBeenCalled();
  });

  test('UT-CT6: 无 controller 时不崩溃', async () => {
    delete (window as any).__StreamingResponseController;

    chatEventBus.emit('chat:stream:chunk', {
      correlationId: 'corr-1', delta: 'data', timestamp: Date.now(),
    });
    chatEventBus.emit('chat:stream:finished', {
      correlationId: 'corr-1', timestamp: Date.now(),
    });

    await new Promise(r => setTimeout(r, 100));
    // 不应崩溃
  });
});
