/**
 * 跨线程切换 TDD 测试 — 首字未到就切线程
 *
 * 模拟真实 LLM 场景：
 * 1. Thread-A 发送消息 → chat:message:sent
 * 2. 在 LLM 返回第一个字符之前（chat:stream:start 之前），用户切换至 Thread-B
 * 3. 在 Thread-B 上，Thread-A 的 LLM 完整生命周期走完（stream + tool_calls + result + finish）
 * 4. 切回 Thread-A，验证数据完整
 *
 * 这是最激进的跨线程场景，测试 threadAwareMiddleware + StoreMapper + CPS 的协同。
 *
 * @version 1.0.0
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
    { getState: () => ({ agentAutoApprove: false, agentApprovalMode: 'manual' }) }
  ),
}));

// ---------- Helpers ----------

const THREAD_A = 'thread-a';
const THREAD_B = 'thread-b';
const CORR_ID = 'assistant-msg-1';
const TOOL_1 = { id: 'call_1', name: 'agent_scan_project', args: '{"path":"/test/project"}' };
const TOOL_2 = { id: 'call_2', name: 'agent_list_dir', args: '{"path":"/test/src"}' };

/**
 * 等待微任务队列和 StoreMapper 异步处理完成
 */
function tick(ms: number = 30): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Test ----------

describe('CT-1: 首字未到就切线程 — 完整 LLM 生命周期', () => {
  let chatEventBus: any;
  let useChatStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 清理 HMR 防护
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

    // 动态导入
    const eventBusModule = await import('../../../stores/chat/eventBus/ChatEventBus');
    chatEventBus = eventBusModule.chatEventBus;

    const storeModule = await import('../../../stores/useChatStore');
    useChatStore = storeModule.useChatStore;

    // 重置 store
    useChatStore.setState({
      messages: [],
      isLoading: false,
      currentThreadId: THREAD_A,
      _messagesByThread: {},
    } as any);
    (window as any).__chatStore = useChatStore;

    // 等待 persist hydration 完成，避免 merge 覆盖 currentThreadId
    await tick(200);

    // 验证：hydration 已经完成且有正确的 currentThreadId
    const initState = useChatStore.getState();
    if (initState.currentThreadId !== THREAD_A) {
      useChatStore.setState({ currentThreadId: THREAD_A } as any);
    }

    // 初始化 StoreMapper（注册事件监听器）
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

  it('CT-1.1: send() 未返回就切 B → 在 B 上走完 A 的 LLM 响应 → 切回 A 数据完整', async () => {
    // ============================================================
    // Phase 1: Thread-A 发送消息（模拟 sendMessageOrchestrator.send()）
    // ============================================================
    chatEventBus.emit('chat:message:sent', {
      messageId: 'user-msg-1',
      content: '了解这个项目',
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      isAssistantOnly: false,
    });
    await tick(50);

    // 验证：user + assistant 消息已创建在 Thread-A
    let state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[1].id).toBe(CORR_ID);
    // chat:message:sent 创建 assistant message 时设 status: 'streaming'（非 isStreaming 字段）
    expect(state.messages[1].status).toBe('streaming');

    // ============================================================
    // Phase 2: **首字未到，立即切到 Thread-B**
    // ============================================================
    useChatStore.setState({ currentThreadId: THREAD_B });

    state = useChatStore.getState();
    expect(state.currentThreadId).toBe(THREAD_B);
    expect(state.messages).toEqual([]); // Thread-B 为空

    // ============================================================
    // Phase 3: 在 Thread-B 上，Thread-A 的 LLM 响应完整走完
    // ============================================================

    // 3a. stream:start — 开始流式
    chatEventBus.emit('chat:stream:start', {
      messageId: CORR_ID,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
    });
    await tick(30);

    // Thread-B 不应被污染
    state = useChatStore.getState();
    expect(state.currentThreadId).toBe(THREAD_B);
    expect(state.messages).toEqual([]);
    // Thread-A 的消息应在 _messagesByThread 中
    expect(state._messagesByThread[THREAD_A]).toHaveLength(2);

    // 3b. stream:chunk x 3 — 前置文本
    const preToolChunks = ['让我先', '扫描一下', '项目结构'];
    for (const chunk of preToolChunks) {
      chatEventBus.emit('chat:stream:chunk', {
        delta: chunk,
        correlationId: CORR_ID,
        sessionId: THREAD_A,
        timestamp: Date.now(),
        fullContent: chunk,
        isFinal: false,
      });
      await tick(20);
    }

    // Thread-B 污染检查
    state = useChatStore.getState();
    expect(state.currentThreadId).toBe(THREAD_B);
    expect(state.messages).toEqual([]);

    // Thread-A 应有前置文本内容
    const threadAMsgs = state._messagesByThread[THREAD_A];
    const aMsg = threadAMsgs.find((m: any) => m.id === CORR_ID);
    expect(aMsg).toBeDefined();
    expect(aMsg.content).toContain('项目结构');

    // 3c. tool:call x 2
    chatEventBus.emit('chat:tool:call', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      toolId: TOOL_1.id,
      name: TOOL_1.name,
      arguments: TOOL_1.args,
    });
    await tick(30);

    chatEventBus.emit('chat:tool:call', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      toolId: TOOL_2.id,
      name: TOOL_2.name,
      arguments: TOOL_2.args,
    });
    await tick(30);

    // Thread-B 污染检查
    state = useChatStore.getState();
    expect(state.currentThreadId).toBe(THREAD_B);
    expect(state.messages).toEqual([]);

    // Thread-A 应有 tool calls
    const aMsgWithTools = state._messagesByThread[THREAD_A].find((m: any) => m.id === CORR_ID);
    expect(aMsgWithTools.toolCalls).toHaveLength(2);
    expect(aMsgWithTools.toolCalls[0].tool).toBe(TOOL_1.name);
    expect(aMsgWithTools.toolCalls[1].tool).toBe(TOOL_2.name);

    // 3d. tool:completed x 2
    chatEventBus.emit('chat:tool:completed', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      toolId: TOOL_1.id,
      result: '{"files":["src/main.ts","src/utils.ts"]}',
      shouldContinue: false,
    });
    await tick(50);

    chatEventBus.emit('chat:tool:completed', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      toolId: TOOL_2.id,
      result: '{"dirs":["src","tests"]}',
      shouldContinue: false,
    });
    await tick(50);

    // Thread-B 污染检查
    state = useChatStore.getState();
    expect(state.currentThreadId).toBe(THREAD_B);
    expect(state.messages).toEqual([]);

    // Thread-A 的 tool 应已完成或正在执行（跨线程场景下 tool:completed 已路由至正确线程）
    const aMsgAfterTools = state._messagesByThread[THREAD_A].find((m: any) => m.id === CORR_ID);
    if (aMsgAfterTools?.toolCalls) {
      expect(aMsgAfterTools.toolCalls[0].id).toBe(TOOL_1.id);
      expect(aMsgAfterTools.toolCalls[1].id).toBe(TOOL_2.id);
    }

    // 3e. stream:chunk x 2 — 后置文本
    const postToolChunks = ['项目包含', 'TypeScript 源码'];
    for (const chunk of postToolChunks) {
      chatEventBus.emit('chat:stream:chunk', {
        delta: chunk,
        correlationId: CORR_ID,
        sessionId: THREAD_A,
        timestamp: Date.now(),
        fullContent: chunk,
        isFinal: false,
      });
      await tick(20);
    }

    // 3f. stream:finished
    chatEventBus.emit('chat:stream:finished', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      totalTokens: 150,
    });
    await tick(50);

    // ============================================================
    // Phase 4: 切回 Thread-A，验证数据完整
    // ============================================================
    useChatStore.setState({ currentThreadId: THREAD_A });
    await tick(30);

    state = useChatStore.getState();
    expect(state.currentThreadId).toBe(THREAD_A);
    // user + assistant + 2 tool results
    expect(state.messages.length).toBeGreaterThanOrEqual(3);

    const finalUserMsg = state.messages[0];
    const finalAssistantMsg = state.messages[1];

    // 验证用户消息
    expect(finalUserMsg.role).toBe('user');
    expect(finalUserMsg.content).toBe('了解这个项目');

    // 验证助手消息
    expect(finalAssistantMsg.id).toBe(CORR_ID);
    // 内容应包含前后文本
    expect(finalAssistantMsg.content).toContain('项目结构');
    expect(finalAssistantMsg.content).toContain('TypeScript');

    // toolCalls 应存在且完成
    expect(finalAssistantMsg.toolCalls).toBeDefined();
    expect(finalAssistantMsg.toolCalls).toHaveLength(2);
    expect(finalAssistantMsg.toolCalls[0].id).toBe(TOOL_1.id);
    expect(finalAssistantMsg.toolCalls[1].id).toBe(TOOL_2.id);

    // isLoading 应为 false（stream:finished 已清理）
    // 注意：在跨线程场景中 isLoading 可能被 stream:chunk 的 cross-thread 路由全局设置，
    // 但 stream:finished 的 Part E 会清除它
    expect(state.isLoading).toBe(false);

    // Thread-B 应未被 A 的数据污染：A 的消息不在 B 的 bucket 中
    const bBucket = state._messagesByThread[THREAD_B] || [];
    const aMsgsInB = bBucket.filter((m: any) => m.id === CORR_ID || m.id === 'user-msg-1');
    expect(aMsgsInB).toHaveLength(0);
  });

  it('CT-1.2: Thread-B 在 A 的流中发送消息 → B 数据独立', async () => {
    // ============================================================
    // Phase 1: Thread-A 发送消息 → 立即切 B
    // ============================================================
    chatEventBus.emit('chat:message:sent', {
      messageId: 'user-msg-1',
      content: '了解这个项目',
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      isAssistantOnly: false,
    });
    await tick(50);

    useChatStore.setState({ currentThreadId: THREAD_B });
    await tick(30);

    // ============================================================
    // Phase 2: Thread-B 发送自己的消息（while A's LLM is running）
    // ============================================================
    const corrIdB = 'assistant-msg-b-1';
    chatEventBus.emit('chat:message:sent', {
      messageId: 'user-msg-b-1',
      content: 'Thread-B 自己的问题',
      correlationId: corrIdB,
      sessionId: THREAD_B,
      timestamp: Date.now(),
      isAssistantOnly: false,
    });
    await tick(50);

    // Thread-B 应有自己的消息
    let state = useChatStore.getState();
    expect(state.currentThreadId).toBe(THREAD_B);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].content).toBe('Thread-B 自己的问题');

    // ============================================================
    // Phase 3: Thread-A 的 LLM 继续在后台完成
    // ============================================================
    chatEventBus.emit('chat:stream:start', {
      messageId: CORR_ID,
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
    });
    await tick(20);

    chatEventBus.emit('chat:stream:chunk', {
      delta: '项目结构分析结果',
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      fullContent: '项目结构分析结果',
      isFinal: false,
    });
    await tick(20);

    chatEventBus.emit('chat:stream:finished', {
      correlationId: CORR_ID,
      sessionId: THREAD_A,
      timestamp: Date.now(),
      totalTokens: 50,
    });
    await tick(50);

    // ============================================================
    // Phase 4: Thread-B 的 LLM 也完成
    // ============================================================
    chatEventBus.emit('chat:stream:start', {
      messageId: corrIdB,
      correlationId: corrIdB,
      sessionId: THREAD_B,
      timestamp: Date.now(),
    });
    await tick(20);

    chatEventBus.emit('chat:stream:chunk', {
      delta: 'B 的回复内容',
      correlationId: corrIdB,
      sessionId: THREAD_B,
      timestamp: Date.now(),
      fullContent: 'B 的回复内容',
      isFinal: false,
    });
    await tick(20);

    chatEventBus.emit('chat:stream:finished', {
      correlationId: corrIdB,
      sessionId: THREAD_B,
      timestamp: Date.now(),
      totalTokens: 30,
    });
    await tick(50);

    // ============================================================
    // Phase 5: 分别验证 A 和 B 数据完整且未污染
    // ============================================================
    // 切回 A 验证
    useChatStore.setState({ currentThreadId: THREAD_A });
    await tick(30);

    state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].content).toBe('了解这个项目');
    expect(state.messages[1].content).toContain('项目结构分析结果');

    // 切到 B 验证
    useChatStore.setState({ currentThreadId: THREAD_B });
    await tick(30);

    state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].content).toBe('Thread-B 自己的问题');
    expect(state.messages[1].content).toContain('B 的回复内容');

    // A 和 B 互不污染
    expect(state._messagesByThread[THREAD_A]).toHaveLength(2);
    expect(state._messagesByThread[THREAD_B]).toHaveLength(2);
  });
});
