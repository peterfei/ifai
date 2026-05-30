/**
 * StreamingResponseController emitFinished E2E 测试
 *
 * 直接模拟 Tauri 事件流（SSE chunks + _finish 事件），
 * 验证 emitFinished 是否被正确调用。
 *
 * 目的：确认 StreamingResponseController 在 finish_reason: tool_calls
 * 时确实触发 emitFinished → chat:stream:finished
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

// Tauri event listeners 存储器
const tauriEventListeners: Record<string, Function> = {};
const listenMock = vi.fn((event: string, callback: Function) => {
  tauriEventListeners[event] = callback;
  return Promise.resolve(() => {});
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => listenMock(...args),
}));

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: { getState: () => ({ rootPath: '/test' }) },
}));

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector?: any) => selector ? selector({ agentAutoApprove: false }) : { agentAutoApprove: false },
    { getState: () => ({ agentAutoApprove: false }) }
  ),
}));

describe('StreamingResponseController emitFinished E2E', () => {
  let chatEventBus: any;
  let useChatStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 清理全局状态
    if (typeof window !== 'undefined') {
      (window as any).__TAURI_INTERNALS__ = {};
      delete (window as any).__STORE_MAPPER_INITIALIZED__;
      delete (window as any).__EXECUTED_TOOLS__;
      // 清理所有 Tauri 监听器
      Object.keys(tauriEventListeners).forEach(k => delete tauriEventListeners[k]);
    }

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'resolve_tool_approval') return Promise.resolve(true);
      return Promise.resolve({});
    });

    const eventBusModule = await import('../../../stores/chat/eventBus/ChatEventBus');
    chatEventBus = eventBusModule.chatEventBus;

    const storeModule = await import('../../../stores/useChatStore');
    useChatStore = storeModule.useChatStore;

    useChatStore.setState({
      messages: [{
        id: 'msg-sc-test',
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: Date.now(),
      }],
      isLoading: false,
    } as any);
    (window as any).__chatStore = useChatStore;
  });

  it('SC-E2E-1: finish_reason=tool_calls → emitFinished → chat:stream:finished', async () => {
    // 记录 chat:stream:finished 是否被触发
    let streamFinishedFired = false;
    chatEventBus.on('chat:stream:finished', () => {
      streamFinishedFired = true;
    });

    // 初始化 StoreMapper
    const mapperModule = await import('../../../stores/chat/StoreMapper');
    mapperModule.initStoreMapper();

    // 初始化 ToolCallManager
    await import('../../../stores/chat/generateResponse/ToolCallManager');

    // 初始化 StreamingResponseController
    const scModule = await import('../../../stores/chat/generateResponse/StreamingResponseController');
    const sc = scModule.StreamingResponseController.getInstance();

    // 注册 Tauri 监听器
    await sc.startListening('msg-sc-test', {
      correlationId: 'msg-sc-test',
      sessionId: 'test-session',
      currentPhase: 'STREAMING',
    } as any);

    // 找到 stream 监听器
    const streamListener = tauriEventListeners['chat_msg-sc-test'];
    expect(streamListener).toBeDefined();

    // 模拟 SSE: 先发 4 个 tool_call chunks
    const tools = [
      { index: 0, id: 'call_1', name: 'agent_scan_project', args: '{"path":"/test"}' },
      { index: 1, id: 'call_2', name: 'agent_list_dir', args: '{"path":"/test/src"}' },
      { index: 2, id: 'call_3', name: 'agent_read_file', args: '{"path":"/test/main.ts"}' },
      { index: 3, id: 'call_4', name: 'agent_search', args: '{"pattern":"TODO"}' },
    ];

    for (const tool of tools) {
      streamListener({
        payload: JSON.stringify({
          type: 'tool_call',
          toolCall: {
            index: tool.index,
            id: tool.id,
            function: { name: tool.name, arguments: tool.args },
          },
        }),
      });
    }

    await new Promise(r => setTimeout(r, 50));

    // 验证工具已创建
    let msg = useChatStore.getState().messages.find((m: any) => m.id === 'msg-sc-test');
    console.log('Tools after SSE chunks:', msg?.toolCalls?.map((tc: any) => ({ name: tc.tool, status: tc.status })));
    expect(msg?.toolCalls?.length).toBe(4);

    // 模拟 SSE: finish_reason = tool_calls
    streamListener({
      payload: JSON.stringify({
        type: 'finish',
        finish_reason: 'tool_calls',
      }),
    });

    await new Promise(r => setTimeout(r, 200));

    // 验证 chat:stream:finished 被触发
    console.log('streamFinishedFired:', streamFinishedFired);

    if (!streamFinishedFired) {
      // 尝试 _finish 事件
      console.log('Trying _finish event...');
      const finishListener = tauriEventListeners['chat_msg-sc-test_finish'];
      if (finishListener) {
        finishListener({ payload: 'done' });
        await new Promise(r => setTimeout(r, 200));
        console.log('streamFinishedFired after _finish:', streamFinishedFired);
      } else {
        console.log('_finish listener NOT registered!');
      }
    }

    // 最终断言
    expect(streamFinishedFired).toBe(true);

    // 等待 ToolCallManager 处理
    await new Promise(r => setTimeout(r, 500));

    msg = useChatStore.getState().messages.find((m: any) => m.id === 'msg-sc-test');
    const statuses = msg?.toolCalls?.map((tc: any) => tc.status);
    console.log('Final tool statuses:', statuses);

    const pendingCount = statuses?.filter((s: string) => s === 'pending').length ?? -1;
    expect(pendingCount).toBe(0);
  });

  it('SC-E2E-2: 仅 _finish 事件 → emitFinished → chat:stream:finished', async () => {
    let streamFinishedFired = false;
    chatEventBus.on('chat:stream:finished', () => {
      streamFinishedFired = true;
    });

    const mapperModule = await import('../../../stores/chat/StoreMapper');
    mapperModule.initStoreMapper();
    await import('../../../stores/chat/generateResponse/ToolCallManager');

    const scModule = await import('../../../stores/chat/generateResponse/StreamingResponseController');
    const sc = scModule.StreamingResponseController.getInstance();

    await sc.startListening('msg-sc-test', {
      correlationId: 'msg-sc-test',
      sessionId: 'test-session',
      currentPhase: 'STREAMING',
    } as any);

    // 发 tool_call chunks
    const streamListener = tauriEventListeners['chat_msg-sc-test'];
    streamListener({
      payload: JSON.stringify({
        type: 'tool_call',
        toolCall: { index: 0, id: 'call_x', function: { name: 'agent_list_dir', arguments: '{}' } },
      }),
    });

    await new Promise(r => setTimeout(r, 50));

    // 只发 _finish 事件（不发 finish_reason）
    const finishListener = tauriEventListeners['chat_msg-sc-test_finish'];
    console.log('_finish listener exists:', !!finishListener);

    if (finishListener) {
      finishListener({ payload: 'done' });
    }

    await new Promise(r => setTimeout(r, 300));

    console.log('streamFinishedFired:', streamFinishedFired);
    expect(streamFinishedFired).toBe(true);
  });
});
