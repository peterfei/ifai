/**
 * SC handleBackendEvent 单元测试
 *
 * 直接测试 StreamingResponseController.handleBackendEvent 在各种
 * finish_reason 和 currentPhase 组合下是否调用 emitFinished。
 *
 * 这是工具卡 pending 的根因验证：emitFinished 是否被正确触发。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
const listenMock = vi.fn(() => Promise.resolve(() => {}));

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
  useSettingsStore: {
    getState: () => ({ agentAutoApprove: false }),
  },
}));

describe('SC handleBackendEvent emitFinished 验证', () => {
  let chatEventBus: any;
  let useChatStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      (window as any).__TAURI_INTERNALS__ = {};
      delete (window as any).__STORE_MAPPER_INITIALIZED__;
      delete (window as any).__EXECUTED_TOOLS__;
    }
    invokeMock.mockResolvedValue({});

    const eventBusModule = await import('../../../stores/chat/eventBus/ChatEventBus');
    chatEventBus = eventBusModule.chatEventBus;

    const storeModule = await import('../../../stores/useChatStore');
    useChatStore = storeModule.useChatStore;

    useChatStore.setState({
      messages: [{ id: 'msg-test', role: 'assistant', content: '', toolCalls: [], timestamp: Date.now() }],
      isLoading: false,
    } as any);
    (window as any).__chatStore = useChatStore;
  });

  async function setupSCAndMapper() {
    const mapperModule = await import('../../../stores/chat/StoreMapper');
    mapperModule.initStoreMapper();
    await import('../../../stores/chat/generateResponse/ToolCallManager');
    const scModule = await import('../../../stores/chat/generateResponse/StreamingResponseController');
    const sc = scModule.StreamingResponseController.getInstance();
    return sc;
  }

  it('SC-UNIT-1: finish_reason=tool_calls + phase=STREAMING → emitFinished', async () => {
    const sc = await setupSCAndMapper();
    let finished = false;
    chatEventBus.on('chat:stream:finished', () => { finished = true; });

    // startListening 注册 Tauri listeners
    await sc.startListening('msg-test', {
      correlationId: 'msg-test',
      sessionId: 'test-session',
      currentPhase: 'STREAMING',
    } as any);

    // 模拟 finish_reason=tool_calls 通过 handleBackendEvent
    // handleBackendEvent 是 private，找 listenMock 注册的 stream callback
    const streamListener = listenMock.mock.calls.find((c: any) => c[0] === 'chat_msg-test')?.[1];
    expect(streamListener).toBeDefined();

    // 发 tool_call
    streamListener({
      payload: JSON.stringify({
        type: 'tool_call',
        toolCall: { index: 0, id: 'tc1', function: { name: 'agent_read_file', arguments: '{"path":"/t"}' } },
      }),
    });

    await new Promise(r => setTimeout(r, 30));

    // 发 finish
    streamListener({
      payload: JSON.stringify({
        type: 'finish',
        finish_reason: 'tool_calls',
      }),
    });

    await new Promise(r => setTimeout(r, 200));

    console.log('finished:', finished);
    expect(finished).toBe(true);
  });

  it('SC-UNIT-2: finish_reason=tool_calls + phase=AWAITING_APPROVAL → emitFinished', async () => {
    const sc = await setupSCAndMapper();
    let finished = false;
    chatEventBus.on('chat:stream:finished', () => { finished = true; });

    await sc.startListening('msg-test', {
      correlationId: 'msg-test',
      sessionId: 'test-session',
      currentPhase: 'STREAMING',
    } as any);

    const streamListener = listenMock.mock.calls.find((c: any) => c[0] === 'chat_msg-test')?.[1];

    // 先发 phase transition → AWAITING_APPROVAL
    streamListener({
      payload: JSON.stringify({ type: 'phase', phase: 'AWAITING_APPROVAL' }),
    });

    await new Promise(r => setTimeout(r, 30));

    // 发 tool_call
    streamListener({
      payload: JSON.stringify({
        type: 'tool_call',
        toolCall: { index: 0, id: 'tc2', function: { name: 'agent_list_dir', arguments: '{}' } },
      }),
    });

    await new Promise(r => setTimeout(r, 30));

    // 发 finish_reason=tool_calls（phase=AWAITING_APPROVAL）
    streamListener({
      payload: JSON.stringify({
        type: 'finish',
        finish_reason: 'tool_calls',
      }),
    });

    await new Promise(r => setTimeout(r, 200));

    console.log('finished (AWAITING_APPROVAL):', finished);
    expect(finished).toBe(true);
  });

  it('SC-UNIT-3: _finish 事件 → emitFinished', async () => {
    const sc = await setupSCAndMapper();
    let finished = false;
    chatEventBus.on('chat:stream:finished', () => { finished = true; });

    await sc.startListening('msg-test', {
      correlationId: 'msg-test',
      sessionId: 'test-session',
      currentPhase: 'STREAMING',
    } as any);

    const finishListener = listenMock.mock.calls.find((c: any) => c[0] === 'chat_msg-test_finish')?.[1];
    expect(finishListener).toBeDefined();

    // 触发 _finish
    finishListener({ payload: 'done' });

    await new Promise(r => setTimeout(r, 200));

    console.log('finished (_finish):', finished);
    expect(finished).toBe(true);
  });
});
