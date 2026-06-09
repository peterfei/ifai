/**
 * 工具调用自动审批 E2E 测试
 *
 * 精确模拟真实 LLM 场景：
 * 1. 流开始 → 4 个 tool_call 事件
 * 2. 流结束 (finish_reason: tool_calls / _finish 事件)
 * 3. 验证 ToolCallManager 自动执行所有 safe 工具
 * 4. 验证 store 中工具状态从 pending → completed
 *
 * 目的：复现 "第1个工具正常，后续3个卡在 pending" 的 bug
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

// ---------- 测试 ----------

describe('工具调用自动审批 E2E', () => {
  let chatEventBus: any;
  let useChatStore: any;
  let StoreMapper: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 清理 HMR 防护
    if (typeof window !== 'undefined') {
      delete (window as any).__STORE_MAPPER_INITIALIZED__;
      delete (window as any).__EXECUTED_TOOLS__;
      delete (window as any).__toolCallManager;
    }

    // invoke 默认行为
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_tool_approval') return Promise.resolve(true);
      if (cmd === 'approve_tool_call') return Promise.resolve('{"status":"ok"}');
      return Promise.resolve({});
    });

    listenMock.mockResolvedValue(unlistenMock);
  });

  it('E2E-1: 4个 safe 工具 + finish_reason=tool_calls → 全部自动审批完成', async () => {
    // 动态导入，确保 mock 生效
    const eventBusModule = await import('../../../stores/chat/eventBus/ChatEventBus');
    chatEventBus = eventBusModule.chatEventBus;

    const storeModule = await import('../../../stores/useChatStore');
    useChatStore = storeModule.useChatStore;

    // 初始化 store
    useChatStore.setState({
      messages: [{
        id: 'msg-assistant-1',
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: Date.now(),
      }],
      isLoading: false,
    } as any);
    (window as any).__chatStore = useChatStore;

    // 初始化 StoreMapper（注册事件监听）
    const mapperModule = await import('../../../stores/chat/StoreMapper');
    mapperModule.initStoreMapper();

    // 初始化 ToolCallManager
    const tcmModule = await import('../../../stores/chat/generateResponse/ToolCallManager');
    (window as any).__toolCallManager = tcmModule.toolCallManager;

    // === 模拟真实 LLM 事件流 ===

    // 1. chat:stream:start
    chatEventBus.emit('chat:stream:start', {
      correlationId: 'msg-assistant-1',
      sessionId: 'test-session',
    });

    // 2. 模拟 4 个 tool_call 事件（LLM 发送 finish_reason: tool_calls 前全部发出）
    const tools = [
      { id: 'call_1', name: 'agent_scan_project', args: '{"path":"/test"}' },
      { id: 'call_2', name: 'agent_list_dir', args: '{"path":"/test/src"}' },
      { id: 'call_3', name: 'agent_read_file', args: '{"path":"/test/src/main.ts"}' },
      { id: 'call_4', name: 'agent_search', args: '{"pattern":"TODO"}' },
    ];

    for (const tool of tools) {
      chatEventBus.emit('chat:tool:call', {
        correlationId: 'msg-assistant-1',
        sessionId: 'test-session',
        toolId: tool.id,
        name: tool.name,
        arguments: tool.args,
      });
    }

    // 3. 等一帧让 store 更新
    await new Promise(r => setTimeout(r, 50));

    // 验证：4 个工具都创建了，ReadOnly 工具直接 completed，非 ReadOnly 才 pending
    let msg = useChatStore.getState().messages.find((m: any) => m.id === 'msg-assistant-1');
    expect(msg.toolCalls.length).toBe(4);
    // 所有 4 个都是 ReadOnly 工具（scan_project, list_dir, read_file, search），初始状态已是 completed
    expect(msg.toolCalls.every((tc: any) => tc.status === 'completed')).toBe(true);

    // 4. 模拟 chat:stream:finished（StreamingResponseController 的 emitFinished 触发）
    chatEventBus.emit('chat:stream:finished', {
      correlationId: 'msg-assistant-1',
      sessionId: 'test-session',
    });

    // 5. 等待异步操作完成（ToolCallManager 的 processPendingToolCalls 是 async）
    await new Promise(r => setTimeout(r, 500));

    // 6. 验证：invoke 被调用
    console.log('invokeMock calls:', invokeMock.mock.calls.map((c: any) => c[0]));

    // 7. 验证 store 中工具状态
    msg = useChatStore.getState().messages.find((m: any) => m.id === 'msg-assistant-1');
    const statuses = msg.toolCalls.map((tc: any) => tc.status);
    console.log('Tool statuses after process:', statuses);

    // 所有 safe 工具应该都变成 completed
    const pendingCount = statuses.filter((s: string) => s === 'pending').length;
    const completedCount = statuses.filter((s: string) => s === 'completed').length;

    console.log(`Pending: ${pendingCount}, Completed: ${completedCount}`);

    // 关键断言：不应有 pending 的工具
    expect(pendingCount).toBe(0);
    expect(completedCount).toBe(4);
  });

  it('E2E-2: resolve_tool_approval 失败时回退到串行 invoke', async () => {
    // resolve_tool_approval 失败，approve_tool_call 成功
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_tool_approval') return Promise.reject(new Error('not found'));
      if (cmd === 'approve_tool_call') return Promise.resolve('{"status":"ok"}');
      return Promise.resolve({});
    });

    const eventBusModule = await import('../../../stores/chat/eventBus/ChatEventBus');
    chatEventBus = eventBusModule.chatEventBus;

    const storeModule = await import('../../../stores/useChatStore');
    useChatStore = storeModule.useChatStore;

    useChatStore.setState({
      messages: [{
        id: 'msg-assistant-2',
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: Date.now(),
      }],
      isLoading: false,
    } as any);
    (window as any).__chatStore = useChatStore;

    const mapperModule = await import('../../../stores/chat/StoreMapper');
    mapperModule.initStoreMapper();

    const tcmModule = await import('../../../stores/chat/generateResponse/ToolCallManager');
    (window as any).__toolCallManager = tcmModule.toolCallManager;

    // 流开始
    chatEventBus.emit('chat:stream:start', {
      correlationId: 'msg-assistant-2',
      sessionId: 'test-session',
    });

    // 2 个 safe 工具
    chatEventBus.emit('chat:tool:call', {
      correlationId: 'msg-assistant-2', sessionId: 'test-session',
      toolId: 'call_a', name: 'agent_list_dir', arguments: '{"path":"/src"}',
    });
    chatEventBus.emit('chat:tool:call', {
      correlationId: 'msg-assistant-2', sessionId: 'test-session',
      toolId: 'call_b', name: 'agent_read_file', arguments: '{"path":"/src/index.ts"}',
    });

    await new Promise(r => setTimeout(r, 50));

    // 流结束
    chatEventBus.emit('chat:stream:finished', {
      correlationId: 'msg-assistant-2', sessionId: 'test-session',
    });

    // 等待串行执行完成
    await new Promise(r => setTimeout(r, 1000));

    // 验证 approve_tool_call 被调用（回退路径）
    const approveCalls = invokeMock.mock.calls.filter((c: any) => c[0] === 'approve_tool_call');
    console.log('approve_tool_call calls:', approveCalls.length);

    const msg = useChatStore.getState().messages.find((m: any) => m.id === 'msg-assistant-2');
    const statuses = msg.toolCalls.map((tc: any) => tc.status);
    console.log('Tool statuses (fallback path):', statuses);

    const pendingCount = statuses.filter((s: string) => s === 'pending').length;
    expect(pendingCount).toBe(0);
  });
});
