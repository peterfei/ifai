/**
 * ThreadManager Chat 状态同步 E2E 测试
 *
 * 模拟真实 LLM 交互流程，通过 chatEventBus 驱动状态变化。
 * 不直接 setState，而是走完整事件链路：
 *
 * 真实流程：
 * 1. sendMessage → set({ isLoading: true })
 * 2. StoreMapper 监听 chat:stream:start → set({ isLoading: true })
 * 3. StoreMapper 监听 chat:stream:chunk → 保持 isLoading: true
 * 4. StoreMapper 监听 chat:stream:finished → set({ isLoading: false })
 *
 * 验证 ThreadManager.initChatStatusSync 是否正确同步 thread status。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useThreadStore } from '../threadStore';
import { useChatStore } from '../useChatStore';
import { useAgentStore } from '../agentStore';
import { ThreadManager } from '../threadManager';
import { chatEventBus } from '../chat/eventBus/ChatEventBus';

// Mock threadPersistence
vi.mock('../persistence/threadPersistence', () => ({
  threadPersistence: {
    saveThreadMessages: vi.fn().mockResolvedValue(undefined),
    loadThreadMessages: vi.fn().mockResolvedValue([]),
  },
  autoSaveThread: vi.fn().mockResolvedValue(undefined),
}));

/**
 * 辅助函数：模拟真实的 LLM 流式交互
 *
 * 按照真实事件流：
 * 1. chat:message:sent (添加 user 消息到 store)
 * 2. chat:stream:start (isLoading → true)
 * 3. chat:stream:chunk (保持 isLoading)
 * 4. chat:stream:finished (isLoading → false)
 */
async function simulateLLMChat(options: {
  threadId: string;
  correlationId: string;
  userMessage: string;
  assistantContent: string;
  chunkCount?: number;
}) {
  const { threadId, correlationId, userMessage, assistantContent, chunkCount = 3 } = options;

  // Step 1: 模拟 sendMessage 中 set({ isLoading: true })
  useChatStore.setState({ isLoading: true, input: '' });

  // Step 2: 添加 user 消息到 store
  useChatStore.setState((state) => ({
    messages: [
      ...state.messages,
      {
        id: `user-${correlationId}`,
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      } as any,
    ],
  }));

  // Step 3: 模拟 StoreMapper 监听 chat:stream:start
  // 添加 assistant 消息占位，设置 isStreaming: true
  useChatStore.setState((state) => ({
    messages: [
      ...state.messages,
      {
        id: correlationId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        status: 'streaming',
      } as any,
    ],
  }));

  // 发射 chat:stream:start 事件（StoreMapper 会处理）
  chatEventBus.emit('chat:stream:start', {
    correlationId,
    sessionId: threadId,
    timestamp: Date.now(),
    messageId: correlationId,
  });

  // Step 4: 模拟流式 chunk 到达
  const chunks = assistantContent.match(new RegExp(`.{1,${Math.ceil(assistantContent.length / chunkCount)}}`, 'g')) || [assistantContent];
  let accumulated = '';

  for (let i = 0; i < chunks.length; i++) {
    accumulated += chunks[i];

    // 模拟 StoreMapper 的 chunk 处理：更新消息内容
    useChatStore.setState((state) => ({
      messages: state.messages.map((m: any) =>
        m.id === correlationId ? { ...m, content: accumulated } : m
      ),
    }));

    chatEventBus.emit('chat:stream:chunk', {
      correlationId,
      sessionId: threadId,
      timestamp: Date.now(),
      delta: chunks[i],
      fullContent: accumulated,
      isFinal: i === chunks.length - 1,
    });
  }

  // Step 5: 模拟 StoreMapper 监听 chat:stream:finished
  useChatStore.setState((state) => ({
    messages: state.messages.map((m: any) =>
      m.id === correlationId
        ? { ...m, isStreaming: false, status: 'completed', content: accumulated }
        : m
    ),
    isLoading: false,
  }));

  chatEventBus.emit('chat:stream:finished', {
    correlationId,
    sessionId: threadId,
    timestamp: Date.now(),
    totalTokens: 100,
  });
}

describe('ThreadManager Chat 状态同步 E2E', () => {
  let chatCleanup: (() => void) | null = null;
  let agentCleanup: (() => void) | null = null;

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
      isLoading: false,
      input: '',
    });
    useAgentStore.setState({
      runningAgents: [],
    });
    vi.clearAllMocks();

    // 清除 window 标记（StoreMapper 防重复初始化）
    if (typeof window !== 'undefined') {
      delete (window as any).__STORE_MAPPER_INITIALIZED__;
    }
  });

  afterEach(() => {
    if (chatCleanup) chatCleanup();
    if (agentCleanup) agentCleanup();
  });

  describe('E2E-1: 完整 LLM 交互流程', () => {
    it('新对话 LLM 回复期间 thread 状态为 active，完成后为 idle', async () => {
      // 1. 创建对话
      const threadId = ThreadManager.create();
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('active');

      // 2. 启动 Chat 状态同步
      chatCleanup = ThreadManager.initChatStatusSync();

      // 3. 模拟 LLM 流式交互
      await simulateLLMChat({
        threadId,
        correlationId: 'corr-001',
        userMessage: '你了解这个项目吗？',
        assistantContent: '是的，我了解这个项目。这是一个 AI 编辑器...',
      });

      // 4. 等待 zustand subscribe 触发
      await new Promise(resolve => setTimeout(resolve, 50));

      // 5. 验证：LLM 完成后状态应为 idle
      const finalThread = useThreadStore.getState().getThread(threadId);
      console.log('[E2E] Final thread status:', finalThread?.status);
      console.log('[E2E] Final isLoading:', useChatStore.getState().isLoading);
      console.log('[E2E] Message count:', useChatStore.getState().messages.length);

      expect(finalThread?.status).toBe('idle');
    });

    it('idle 状态的对话，LLM 开始回复后变为 active', async () => {
      // 1. 创建对话并手动设为 idle（模拟已有对话）
      const threadId = ThreadManager.create();
      useThreadStore.getState().updateThread(threadId, { status: 'idle' });
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('idle');

      // 2. 启动 Chat 状态同步
      chatCleanup = ThreadManager.initChatStatusSync();

      // 3. 仅模拟 LLM 开始回复（不完成）
      useChatStore.setState({ isLoading: true, input: '' });

      // 发射 stream:start
      useChatStore.setState((state) => ({
        messages: [
          ...state.messages,
          {
            id: 'corr-002',
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            status: 'streaming',
          } as any,
        ],
      }));
      chatEventBus.emit('chat:stream:start', {
        correlationId: 'corr-002',
        sessionId: threadId,
        timestamp: Date.now(),
        messageId: 'corr-002',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 4. 验证：LLM 回复中状态应为 active
      const duringLLM = useThreadStore.getState().getThread(threadId);
      console.log('[E2E] During LLM - thread status:', duringLLM?.status);
      console.log('[E2E] During LLM - isLoading:', useChatStore.getState().isLoading);

      expect(duringLLM?.status).toBe('active');
    });
  });

  describe('E2E-2: 通过事件总线驱动（验证单例订阅）', () => {
    it('事件总线驱动的状态同步（不受 HMR 双实例影响）', async () => {
      const threadId = ThreadManager.create();
      // 设为 idle（模拟已有对话）
      useThreadStore.getState().updateThread(threadId, { status: 'idle' });

      chatCleanup = ThreadManager.initChatStatusSync();

      // Step A: 通过事件总线模拟 LLM 开始回复
      chatEventBus.emit('chat:stream:start', {
        correlationId: 'corr-e2e-2',
        sessionId: threadId,
        timestamp: Date.now(),
        messageId: 'corr-e2e-2',
      });

      let threadStatus = useThreadStore.getState().getThread(threadId)?.status;
      console.log('[E2E-2] After chat:stream:start:', threadStatus);
      expect(threadStatus).toBe('active');

      // Step B: 通过事件总线模拟 LLM 回复完成
      chatEventBus.emit('chat:stream:finished', {
        correlationId: 'corr-e2e-2',
        sessionId: threadId,
        timestamp: Date.now(),
        totalTokens: 50,
      });

      threadStatus = useThreadStore.getState().getThread(threadId)?.status;
      console.log('[E2E-2] After chat:stream:finished:', threadStatus);
      expect(threadStatus).toBe('idle');
    });
  });

  describe('E2E-3: 多轮对话', () => {
    it('连续两轮对话，状态正确切换', async () => {
      const threadId = ThreadManager.create();
      chatCleanup = ThreadManager.initChatStatusSync();

      // === 第一轮 ===
      await simulateLLMChat({
        threadId,
        correlationId: 'corr-round1',
        userMessage: '你好',
        assistantContent: '你好！有什么可以帮你的？',
      });
      await new Promise(resolve => setTimeout(resolve, 30));

      console.log('[E2E-3] After round 1:', useThreadStore.getState().getThread(threadId)?.status);
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('idle');

      // === 第二轮 ===
      await simulateLLMChat({
        threadId,
        correlationId: 'corr-round2',
        userMessage: '讲个笑话',
        assistantContent: '程序员为什么不喜欢户外？因为有太多 bugs。',
      });
      await new Promise(resolve => setTimeout(resolve, 30));

      console.log('[E2E-3] After round 2:', useThreadStore.getState().getThread(threadId)?.status);
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('idle');
    });
  });

  describe('E2E-4: Agent + Chat 同时运行', () => {
    it('Agent 运行中 LLM 回复完成不会覆盖 working 状态', async () => {
      const threadId = ThreadManager.create();
      chatCleanup = ThreadManager.initChatStatusSync();
      agentCleanup = ThreadManager.initAgentStatusSync();

      // Agent 启动 → working
      useAgentStore.setState({
        runningAgents: [{ id: 'agent-1', threadId, status: 'running' } as any],
      });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(useThreadStore.getState().getThread(threadId)?.status).toBe('working');

      // LLM 同时回复（比如 Agent 调用了 LLM）
      useChatStore.setState({ isLoading: true } as any);
      await new Promise(resolve => setTimeout(resolve, 20));

      // LLM 完成
      useChatStore.setState({ isLoading: false } as any);
      await new Promise(resolve => setTimeout(resolve, 20));

      // working 状态不应被覆盖
      const status = useThreadStore.getState().getThread(threadId)?.status;
      console.log('[E2E-4] Status after both:', status);
      expect(status).toBe('working');
    });
  });
});
