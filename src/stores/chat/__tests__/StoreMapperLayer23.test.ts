/**
 * StoreMapper Layer 2/3 断链防护单元测试
 *
 * 验证 StoreMapper.ts 的跨线程断链防护能力：
 *   Layer 2 — stream:chunk 消息不存在时 auto-create + CSM 恢复
 *   Layer 3 — stream:finished Part E CSM segments 兜底恢复
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Mock ----------

const invokeMock = vi.fn();
const listenMock = vi.fn();
const unlistenMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => listenMock(...args),
}));

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: {
    getState: () => ({ rootPath: '/test/project' }),
  },
}));

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector?: any) => selector ? selector({ agentAutoApprove: false, agentApprovalMode: 'manual' }) : { agentAutoApprove: false, agentApprovalMode: 'manual' },
    { getState: () => ({ agentAutoApprove: false, agentApprovalMode: 'manual' }) },
  ),
}));

// ---------- Helpers ----------

const THREAD_A = 'thread-a';
const THREAD_B = 'thread-b';

function tick(ms: number = 30): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Tests ----------

describe('SM-x: StoreMapper Layer 2/3 断链防护', () => {
  let chatEventBus: any;
  let useChatStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    if (typeof window !== 'undefined') {
      delete (window as any).__STORE_MAPPER_INITIALIZED__;
      delete (window as any).__EXECUTED_TOOLS__;
      delete (window as any).__toolCallManager;
      delete (window as any).__chatStore;
    }

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_tool_approval') return Promise.resolve(true);
      if (cmd === 'approve_tool_call') return Promise.resolve('{"status":"ok"}');
      return Promise.resolve({});
    });

    listenMock.mockResolvedValue(unlistenMock);

    const eventBusModule = await import('../../../stores/chat/eventBus/ChatEventBus');
    chatEventBus = eventBusModule.chatEventBus;

    const storeModule = await import('../../../stores/useChatStore');
    useChatStore = storeModule.useChatStore;

    useChatStore.setState({
      messages: [],
      isLoading: false,
      currentThreadId: THREAD_A,
      _messagesByThread: {},
    } as any);
    (window as any).__chatStore = useChatStore;

    await tick(200);

    const initState = useChatStore.getState();
    if (initState.currentThreadId !== THREAD_A) {
      useChatStore.setState({ currentThreadId: THREAD_A } as any);
    }

    const mapperModule = await import('../../../stores/chat/StoreMapper');
    mapperModule.initStoreMapper();
  });

  afterEach(() => {
    useChatStore.setState({
      messages: [],
      isLoading: false,
      currentThreadId: null,
      _messagesByThread: {},
    } as any);
  });

  // ─── SM-1: Layer 2 auto-create on cross-thread chunk ───────────

  it('SM-1: Layer 2 auto-creates assistant message when cross-thread chunk arrives for unknown message', async () => {
    // 模拟：当前线程为 B，stream chunk 携带 sessionId=A 但 A 的 _messagesByThread 中无此消息
    useChatStore.setState({ currentThreadId: THREAD_B, messages: [] });

    const CORR_ID = 'sm-1-msg';
    const DELTA = '这是 Layer 2 auto-create 的测试内容';

    // 发送 stream:chunk — 消息不在任何 bucket 中，Layer 2 应 auto-create
    chatEventBus.emit('chat:stream:chunk', {
      delta: DELTA,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      deltaIndex: 0,
    });
    await tick(50);

    const state = useChatStore.getState();

    // ✅ Layer 2: A 的 bucket 应被创建，并包含 auto-created 消息
    expect(state._messagesByThread[THREAD_A]).toBeDefined();
    const autoMsg = state._messagesByThread[THREAD_A].find((m: any) => m.id === CORR_ID);
    expect(autoMsg).toBeDefined();
    expect(autoMsg.role).toBe('assistant');
    expect(autoMsg.isStreaming).toBe(true);
    // 内容应包含 delta（或 CSM 恢复的内容）
    expect(autoMsg.content).toContain(DELTA);
  });

  // ─── SM-2: Auto-created message gets delta content ─────────────

  it('SM-2: Layer 2 auto-created message contains CSM-recovered content from delta', async () => {
    // 模拟：跨线程 chunk 触发 Layer 2 auto-create，内容从 delta 恢复
    useChatStore.setState({ currentThreadId: THREAD_B, messages: [] });

    const CORR_ID = 'sm-2-msg';
    const CHUNK_1 = '第一部分内容';
    const CHUNK_2 = '第二部分内容';

    // 第一个 chunk — Layer 2 需同时启动 CSM + auto-create message
    chatEventBus.emit('chat:stream:chunk', {
      delta: CHUNK_1,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      deltaIndex: 0,
    });
    await tick(30);

    let state = useChatStore.getState();
    let autoMsg = state._messagesByThread[THREAD_A]?.find((m: any) => m.id === CORR_ID);
    expect(autoMsg).toBeDefined();
    // 第一个 chunk 后，auto-created 消息应包含 CHUNK_1
    expect(autoMsg.content).toContain(CHUNK_1);

    // 第二个 chunk — 消息已存在，正常追加（不触发 auto-create）
    chatEventBus.emit('chat:stream:chunk', {
      delta: CHUNK_2,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      deltaIndex: 1,
    });
    await tick(30);

    state = useChatStore.getState();
    autoMsg = state._messagesByThread[THREAD_A]?.find((m: any) => m.id === CORR_ID);
    expect(autoMsg).toBeDefined();
    expect(autoMsg.content).toContain(CHUNK_1);
    expect(autoMsg.content).toContain(CHUNK_2);
  });

  // ─── SM-3: Layer 3 Part E recovery on stream:finished ─────────

  it('SM-3: Layer 3 Part E recovers content from CSM segments when segments are longer than content', async () => {
    // 模拟：消息在 _messagesByThread 中但 content 被截断（activeStreamCount > content.length 段）
    useChatStore.setState({ currentThreadId: THREAD_B, messages: [] });

    const CORR_ID = 'sm-3-msg';
    const FULL_TEXT = '这是完整的 CSM 累积内容，包含所有 LLM 生成的文本。';

    // 先追加流式 chunk 到 A 的 bucket
    useChatStore.setState((s: any) => ({
      _messagesByThread: {
        ...s._messagesByThread,
        [THREAD_A]: [{
          id: CORR_ID,
          role: 'assistant',
          content: '这是部分内容', // 短于 FULL_TEXT
          status: 'streaming',
          isStreaming: true,
          timestamp: Date.now(),
        }],
      },
    }) as any);
    await tick(30);

    // 通过 stream:chunk 让 CSM 累积内容
    chatEventBus.emit('chat:stream:chunk', {
      delta: FULL_TEXT,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      deltaIndex: 0,
    });
    await tick(30);

    // 触发 stream:finished — Part E 应使用 CSM 恢复
    chatEventBus.emit('chat:stream:finished', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      totalTokens: 10,
    });
    await tick(100); // Part E 在 setTimeout 中，需等 100ms

    const state = useChatStore.getState();
    // 注意：Part E 恢复后 content 应 >= FULL_TEXT.length
    // 由于 CSM 中 segments 的内容可能更长（累积了多次），验证至少包含 FULL_TEXT
    const recoveredMsg = state._messagesByThread[THREAD_A]?.find((m: any) => m.id === CORR_ID);
    expect(recoveredMsg).toBeDefined();
    // 恢复后的 content 应比原始 '这是部分内容' 长（CSM 恢复）
    expect((recoveredMsg.content || '').length).toBeGreaterThan('这是部分内容'.length);
    expect(recoveredMsg.isStreaming).toBe(false);
    expect(recoveredMsg.status).toBe('completed');
  });

  // ─── SM-4: Same-thread chunk does NOT trigger auto-create ──────

  it('SM-4: same-thread chunk does not trigger Layer 2 auto-create in _messagesByThread', async () => {
    useChatStore.setState({ currentThreadId: THREAD_A, messages: [] });

    const CORR_ID = 'sm-4-msg';
    const DELTA = '同线程 chunk 内容';

    // 当前线程是 A，发送 stream:chunk 带 sessionId=A
    // 消息在 state.messages 中不存在 → messageIndex === -1
    // 但 _messagesByThread[THREAD_A] 存在且为空 → Layer 2 本应触发 auto-create
    // 但 sessionId === currentThreadId（同线程），所以不应触发跨线程 auto-create
    useChatStore.setState({ currentThreadId: THREAD_A });
    chatEventBus.emit('chat:stream:chunk', {
      delta: DELTA,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      deltaIndex: 0,
    });
    await tick(50);

    const state = useChatStore.getState();
    // 同线程 → 不应自动创建消息
    expect(state._messagesByThread[THREAD_A]?.find((m: any) => m.id === CORR_ID)).toBeUndefined();

    // 但如果消息在同线程的 state.messages 中存在，应正常更新
    useChatStore.setState((s: any) => ({
      messages: [...s.messages, { id: CORR_ID, role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() }],
    }) as any);

    chatEventBus.emit('chat:stream:chunk', {
      delta: DELTA,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      deltaIndex: 1,
    });
    await tick(30);

    const state2 = useChatStore.getState();
    const msg = state2.messages.find((m: any) => m.id === CORR_ID);
    expect(msg).toBeDefined();
    expect(msg.content).toContain(DELTA);
  });

  // ─── SM-5: Part E does NOT replace when segments are shorter ───

  it('SM-5: Part E does not replace content when CSM segments are shorter than existing content', async () => {
    useChatStore.setState({ currentThreadId: THREAD_B, messages: [] });

    const CORR_ID = 'sm-5-msg';
    const LONG_CONTENT = '这部分内容非常长，远超过将要发送的 delta 内容。'.repeat(10);
    const SHORT_DELTA = '短内容';

    // 预置内容长的消息在 A 的 bucket 中
    useChatStore.setState((s: any) => ({
      _messagesByThread: {
        ...s._messagesByThread,
        [THREAD_A]: [{
          id: CORR_ID,
          role: 'assistant',
          content: LONG_CONTENT,
          status: 'streaming',
          isStreaming: true,
          timestamp: Date.now(),
        }],
      },
    }) as any);

    // 发送短的 stream:chunk — CSM 只累积到短内容
    chatEventBus.emit('chat:stream:chunk', {
      delta: SHORT_DELTA,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      deltaIndex: 0,
    });
    await tick(30);

    // 触发 stream:finished — Part E 检查 segments 是否长于 content，segments 更短不应替换
    chatEventBus.emit('chat:stream:finished', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      totalTokens: 5,
    });
    await tick(200); // 等 Part D + Part E

    const state = useChatStore.getState();
    const msg = state._messagesByThread[THREAD_A]?.find((m: any) => m.id === CORR_ID);
    expect(msg).toBeDefined();
    // Part E 不应替换 content（segments 更短时保留原内容，至少以 LONG_CONTENT 开头）
    expect(msg.content.length).toBeGreaterThanOrEqual(LONG_CONTENT.length);
    expect(msg.content.startsWith(LONG_CONTENT)).toBe(true);
    expect(msg.isStreaming).toBe(false);
    expect(msg.status).toBe('completed');
  });
});
