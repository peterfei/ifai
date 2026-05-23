/**
 * ThreadManager 单元测试
 *
 * TM-1 ~ TM-8: Thread 生命周期管理测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useThreadStore } from '../threadStore';
import { useChatStore } from '../useChatStore';
import { useAgentStore } from '../agentStore';
import { ThreadManager } from '../threadManager';

// Mock threadPersistence
vi.mock('../persistence/threadPersistence', () => ({
  threadPersistence: {
    saveThreadMessages: vi.fn().mockResolvedValue(undefined),
    loadThreadMessages: vi.fn().mockResolvedValue([]),
  },
  autoSaveThread: vi.fn().mockResolvedValue(undefined),
}));

// Helper to get mocked threadPersistence
async function getMockedThreadPersistence() {
  const { threadPersistence } = await import('../persistence/threadPersistence');
  return threadPersistence as {
    saveThreadMessages: ReturnType<typeof vi.fn>;
    loadThreadMessages: ReturnType<typeof vi.fn>;
  };
}

describe('ThreadManager', () => {
  beforeEach(() => {
    // 重置所有 store
    useThreadStore.setState({
      threads: {},
      activeThreadId: null,
      searchQuery: '',
      tagFilter: null,
      maxThreads: 10,
      titleCounters: {},
      isHydrating: false,
    });
    useChatStore.setState({
      messages: [],
      currentThreadId: null,
    });
    useAgentStore.setState({
      runningAgents: [],
    });
    vi.clearAllMocks();
  });

  describe('TM-2: ThreadManager.switch', () => {
    it('切换 thread 时保存当前消息', async () => {
      const threadPersistence = await getMockedThreadPersistence();

      // 创建第一个线程并设为 active
      const threadId1 = ThreadManager.create();
      // 手动添加消息到第一个线程
      useChatStore.setState({ messages: [{ id: 'msg1', content: 'test' }] as any });

      // 创建第二个线程
      const threadId2 = ThreadManager.create();

      // 手动将 activeThreadId 设回 threadId1（模拟用户在 threadId1）
      useThreadStore.setState({ activeThreadId: threadId1 });

      // 切换到 threadId2，应该保存 threadId1 的消息
      await ThreadManager.switch(threadId2);

      expect(threadPersistence.saveThreadMessages).toHaveBeenCalledWith(threadId1, expect.any(Array));
    });

    it('切换 thread 时加载新消息', async () => {
      const { threadPersistence } = await import('../persistence/threadPersistence');
      const mockMessages = [{ id: 'msg1', content: 'loaded' }] as any;
      vi.spyOn(threadPersistence, 'loadThreadMessages').mockResolvedValue(mockMessages);

      const threadId = ThreadManager.create();
      await ThreadManager.switch(threadId);

      expect(useChatStore.getState().messages).toEqual(mockMessages);
    });

    it('切换 thread 后更新 activeThreadId', async () => {
      const threadId1 = ThreadManager.create();
      const threadId2 = ThreadManager.create();

      await ThreadManager.switch(threadId1);

      // 等待 persist 异步更新
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(useThreadStore.getState().activeThreadId).toBe(threadId1);
    });

    it('切换 thread 后发射 thread:switched 事件', async () => {
      const { chatEventBus } = await import('../chat/eventBus/ChatEventBus');
      const emitSpy = vi.spyOn(chatEventBus, 'emit');

      const threadId1 = ThreadManager.create();
      const threadId2 = ThreadManager.create();

      await ThreadManager.switch(threadId1);

      expect(emitSpy).toHaveBeenCalledWith(
        'thread:switched',
        expect.objectContaining({
          threadId: threadId1,
          previousId: threadId2,
          timestamp: expect.any(Number),
        })
      );
    });

    it('切换 thread 时更新 lastActiveAt 和 hasUnreadActivity', async () => {
      const threadId = ThreadManager.create();
      const createdAt = useThreadStore.getState().getThread(threadId)?.lastActiveAt || 0;

      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      await ThreadManager.switch(threadId);
      await new Promise(resolve => setTimeout(resolve, 50));

      const thread = useThreadStore.getState().getThread(threadId);
      expect(thread?.lastActiveAt).toBeGreaterThan(createdAt);
      expect(thread?.hasUnreadActivity).toBe(false);
    });
  });

  describe('TM-3 ~ TM-5: Agent 状态同步', () => {
    it('TM-3: Agent 启动时 thread 状态变为 working', async () => {
      const threadId = ThreadManager.create();
      const unsubscribe = ThreadManager.initAgentStatusSync();

      useAgentStore.setState({
        runningAgents: [{ id: 'agent-1', threadId, status: 'running' } as any],
      });

      // zustand subscribe 是异步的，需要等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      const thread = useThreadStore.getState().getThread(threadId);
      expect(thread?.status).toBe('working');

      if (unsubscribe) unsubscribe();
    });

    it('TM-4: Agent 完成时 thread 状态变为 completed', async () => {
      const threadId = ThreadManager.create();
      const unsubscribe = ThreadManager.initAgentStatusSync();

      // 先启动 Agent
      useAgentStore.setState({
        runningAgents: [{ id: 'agent-1', threadId, status: 'running' } as any],
      });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('working');

      // 清空 runningAgents（模拟完成）
      useAgentStore.setState({ runningAgents: [] });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('completed');

      if (unsubscribe) unsubscribe();
    });

    it('TM-5: Thread 隔离 - Agent 状态不会影响其他 thread', async () => {
      const threadIdA = ThreadManager.create();
      const threadIdB = ThreadManager.create();

      // 将 activeThreadId 设回 threadIdA
      useThreadStore.setState({ activeThreadId: threadIdA });

      const unsubscribe = ThreadManager.initAgentStatusSync();

      // threadIdA 有运行中的 Agent（activeThreadId 是 threadIdA）
      useAgentStore.setState({
        runningAgents: [{ id: 'agent-1', threadId: threadIdA, status: 'running' } as any],
      });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(useThreadStore.getState().getThread(threadIdA)?.status).toBe('working');
      expect(useThreadStore.getState().getThread(threadIdB)?.status).toBe('active');

      if (unsubscribe) unsubscribe();
    });

    it('TM-7: initAgentStatusSync 返回 unsubscribe 函数', () => {
      const unsubscribe = ThreadManager.initAgentStatusSync();
      expect(typeof unsubscribe).toBe('function');
      if (unsubscribe) unsubscribe();
    });

    it('TM-8: unsubscribe 后停止同步 Agent 状态', async () => {
      const threadId = ThreadManager.create();
      const unsubscribe = ThreadManager.initAgentStatusSync();

      // Agent 启动
      useAgentStore.setState({
        runningAgents: [{ id: 'agent-1', threadId, status: 'running' } as any],
      });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('working');

      // 取消订阅
      if (unsubscribe) unsubscribe();

      // 清空 Agent
      useAgentStore.setState({ runningAgents: [] });
      await new Promise(resolve => setTimeout(resolve, 10));

      // unsubscribe 后，thread 状态应该保持 'working' 不会变回 'active'
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('working');
    });
  });

  describe('TM-1: ThreadManager.create', () => {
    it('创建 thread 并返回 threadId', () => {
      const threadId = ThreadManager.create();

      expect(threadId).toBeTruthy();
      expect(typeof threadId).toBe('string');
    });

    it('创建 thread 后状态为 active', () => {
      const threadId = ThreadManager.create();

      const thread = useThreadStore.getState().getThread(threadId);
      expect(thread?.status).toBe('active');
    });

    it('创建 thread 后清空 chatStore.messages', () => {
      useChatStore.setState({ messages: [{ id: 'old-msg', content: 'old' }] });

      ThreadManager.create();

      expect(useChatStore.getState().messages).toEqual([]);
    });

    it('创建 thread 后设置 activeThreadId', async () => {
      const threadId = ThreadManager.create();

      // persist 中间件是异步的，需要等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 50));

      // chatStore 也有 persist 中间件，currentThreadId 可能延迟更新
      // 但 threadStore.activeThreadId 应该正确
      const threadState = useThreadStore.getState();
      expect(threadState.activeThreadId).toBe(threadId);

      // currentThreadId 可能需要更长时间
      const chatState = useChatStore.getState();
      if (chatState.currentThreadId !== threadId) {
        // 如果 currentThreadId 还没更新，再等待一下
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(useChatStore.getState().currentThreadId).toBe(threadId);
      }
    });

    it('创建 thread 后发射 thread:created 事件', async () => {
      const { chatEventBus } = await import('../chat/eventBus/ChatEventBus');
      const emitSpy = vi.spyOn(chatEventBus, 'emit');

      ThreadManager.create();

      expect(emitSpy).toHaveBeenCalledWith(
        'thread:created',
        expect.objectContaining({
          threadId: expect.any(String),
          timestamp: expect.any(Number),
        })
      );
    });
  });
});
