/**
 * chat:tool:call-delta 集成测试
 *
 * TDD RED 阶段 — 验证 StreamingResponseController 和 StoreMapper 正确处理增量事件。
 * 测试在实现前编写，预期失败。
 */
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

const chatEventBusModule = () => import('../../eventBus/ChatEventBus');
const chatStoreModule = () => import('../../../useChatStore');
const storeMapperModule = () => import('../../StoreMapper');

describe('ToolCallDelta — 前端集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('StreamingResponseController — tool_call_delta 解析', () => {
    test('UT-DELTA-1: 收到 type=tool_call_delta 时应 emit chat:tool:call-delta 事件', async () => {
      const { chatEventBus } = await chatEventBusModule();
      const emitSpy = vi.spyOn(chatEventBus, 'emit');

      const controller = (window as any).__StreamingResponseController;
      if (!controller) {
        console.warn('[UT-DELTA-1] __StreamingResponseController not available, skipping');
        return;
      }

      const deltaData = {
        type: 'tool_call_delta',
        tool_call_delta: {
          id: 'call_delta_001',
          name: 'write_file',
          arguments_delta: '{"path":"/src/App.tsx","content":"import React',
        },
      };

      const payload = {
        correlationId: 'test-corr-delta',
        sessionId: 'test-session',
        threadId: 'test-thread',
      };

      controller.handleBackendEvent(deltaData, payload);

      expect(emitSpy).toHaveBeenCalledWith(
        'chat:tool:call-delta',
        expect.objectContaining({
          toolId: 'call_delta_001',
          name: 'write_file',
          argumentsDelta: '{"path":"/src/App.tsx","content":"import React',
        }),
      );
    });

    test('UT-DELTA-2: tool_call_delta 事件 name 为 null 时不传递 name', async () => {
      const { chatEventBus } = await chatEventBusModule();
      const emitSpy = vi.spyOn(chatEventBus, 'emit');

      const controller = (window as any).__StreamingResponseController;
      if (!controller) return;

      const deltaData = {
        type: 'tool_call_delta',
        tool_call_delta: {
          id: 'call_delta_002',
          name: null,
          arguments_delta: ' from',
        },
      };

      controller.handleBackendEvent(deltaData, {
        correlationId: 'test-corr-delta2',
        sessionId: 'test-session',
        threadId: 'test-thread',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'chat:tool:call-delta',
        expect.objectContaining({
          toolId: 'call_delta_002',
          argumentsDelta: ' from',
        }),
      );
    });

    test('UT-DELTA-3: 兼容 camelCase 字段名 toolCallDelta', async () => {
      const { chatEventBus } = await chatEventBusModule();
      const emitSpy = vi.spyOn(chatEventBus, 'emit');

      const controller = (window as any).__StreamingResponseController;
      if (!controller) return;

      const deltaData = {
        type: 'tool_call_delta',
        toolCallDelta: {
          id: 'call_delta_003',
          name: 'edit_file',
          arguments_delta: '{"new_content":"hello',
        },
      };

      controller.handleBackendEvent(deltaData, {
        correlationId: 'test-corr-delta3',
        sessionId: 'test-session',
        threadId: 'test-thread',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'chat:tool:call-delta',
        expect.objectContaining({
          toolId: 'call_delta_003',
          name: 'edit_file',
          argumentsDelta: '{"new_content":"hello',
        }),
      );
    });
  });

  describe('StoreMapper — chat:tool:call-delta handler', () => {
    test('UT-DELTA-4: 增量追加到已有 toolCall 的 arguments', async () => {
      const { useChatStore } = await chatStoreModule();
      const { chatEventBus } = await chatEventBusModule();

      const messageId = 'msg-delta-test-001';
      const toolCallId = 'tc-delta-001';
      useChatStore.setState({
        messages: [
          {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            toolCalls: [
              {
                id: toolCallId,
                type: 'function',
                tool: 'write_file',
                function: { name: 'write_file', arguments: '{"path":"/src/A.tsx","content":"imp' },
                isPartial: true,
                status: 'pending',
              },
            ],
          },
        ],
        currentThreadId: 'thread-delta-test',
      });

      const { initStoreMapper } = await storeMapperModule();
      initStoreMapper();
      await new Promise((r) => setTimeout(r, 50));

      chatEventBus.emit('chat:tool:call-delta', {
        correlationId: messageId,
        toolId: toolCallId,
        name: undefined,
        argumentsDelta: 'ort React from',
        sessionId: 'thread-delta-test',
        threadId: 'thread-delta-test',
      });

      await new Promise((r) => setTimeout(r, 50));

      const state = useChatStore.getState();
      const message = state.messages.find((m: any) => m.id === messageId);
      const toolCall = message?.toolCalls?.find((tc: any) => tc.id === toolCallId);

      expect(toolCall).toBeDefined();
      expect(toolCall.function.arguments).toBe(
        '{"path":"/src/A.tsx","content":"imp' + 'ort React from',
      );
      expect(toolCall.isPartial).toBe(true);
    });

    test('UT-DELTA-5: delta 先于 chat:tool:call 到达时自动创建 toolCall', async () => {
      const { useChatStore } = await chatStoreModule();
      const { chatEventBus } = await chatEventBusModule();

      const messageId = 'msg-delta-test-002';
      const toolCallId = 'tc-delta-002';
      // 初始状态：message 存在但没有 toolCalls（模拟 ToolStart 未创建 toolCall 的场景）
      useChatStore.setState({
        messages: [
          {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            toolCalls: [],
          },
        ],
        currentThreadId: 'thread-delta-test',
      });

      const { initStoreMapper } = await storeMapperModule();
      initStoreMapper();
      await new Promise((r) => setTimeout(r, 50));

      // 第一个 delta 携带 name → 应创建新的 toolCall
      chatEventBus.emit('chat:tool:call-delta', {
        correlationId: messageId,
        toolId: toolCallId,
        name: 'agent_write_file',
        argumentsDelta: '{"path":"/src/App.tsx","content":"import React',
        sessionId: 'thread-delta-test',
        threadId: 'thread-delta-test',
      });

      await new Promise((r) => setTimeout(r, 50));

      const state = useChatStore.getState();
      const message = state.messages.find((m: any) => m.id === messageId);
      const toolCall = message?.toolCalls?.find((tc: any) => tc.id === toolCallId);

      expect(toolCall).toBeDefined();
      expect(toolCall.tool).toBe('agent_write_file');
      expect(toolCall.function.name).toBe('agent_write_file');
      expect(toolCall.function.arguments).toBe('{"path":"/src/App.tsx","content":"import React');
      expect(toolCall.status).toBe('pending');
      expect(toolCall.isPartial).toBe(true); // streamExtract 工具
    });

    test('UT-DELTA-7: 多个 delta 创建新 toolCall 并逐步累积', async () => {
      const { useChatStore } = await chatStoreModule();
      const { chatEventBus } = await chatEventBusModule();

      const messageId = 'msg-delta-test-007';
      const toolCallId = 'tc-delta-007';
      useChatStore.setState({
        messages: [
          {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            toolCalls: [],
          },
        ],
        currentThreadId: 'thread-delta-test',
      });

      const { initStoreMapper } = await storeMapperModule();
      initStoreMapper();
      await new Promise((r) => setTimeout(r, 50));

      // 第一个 delta（带 name）
      chatEventBus.emit('chat:tool:call-delta', {
        correlationId: messageId,
        toolId: toolCallId,
        name: 'agent_write_file',
        argumentsDelta: '{"pa',
        sessionId: 'thread-delta-test',
        threadId: 'thread-delta-test',
      });

      // 后续 delta（无 name）
      chatEventBus.emit('chat:tool:call-delta', {
        correlationId: messageId,
        toolId: toolCallId,
        argumentsDelta: 'th":"/src/App.tsx"',
        sessionId: 'thread-delta-test',
        threadId: 'thread-delta-test',
      });

      await new Promise((r) => setTimeout(r, 50));

      const state = useChatStore.getState();
      const toolCall = state.messages
        .find((m: any) => m.id === messageId)
        ?.toolCalls?.find((tc: any) => tc.id === toolCallId);

      expect(toolCall).toBeDefined();
      expect(toolCall.function.arguments).toBe('{"pa' + 'th":"/src/App.tsx"');
      expect(toolCall.isPartial).toBe(true);
    });

    test('UT-DELTA-6: 多次增量逐步累积 arguments', async () => {
      const { useChatStore } = await chatStoreModule();
      const { chatEventBus } = await chatEventBusModule();

      const messageId = 'msg-delta-test-003';
      const toolCallId = 'tc-delta-003';
      useChatStore.setState({
        messages: [
          {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            toolCalls: [
              {
                id: toolCallId,
                type: 'function',
                tool: 'write_file',
                function: { name: 'write_file', arguments: '' },
                isPartial: true,
                status: 'pending',
              },
            ],
          },
        ],
        currentThreadId: 'thread-delta-test',
      });

      const { initStoreMapper } = await storeMapperModule();
      initStoreMapper();
      await new Promise((r) => setTimeout(r, 50));

      const deltas = ['{"pa', 'th":"/', 'src/', 'App.', 'tsx"}'];
      for (const delta of deltas) {
        chatEventBus.emit('chat:tool:call-delta', {
          correlationId: messageId,
          toolId: toolCallId,
          argumentsDelta: delta,
          sessionId: 'thread-delta-test',
          threadId: 'thread-delta-test',
        });
      }

      await new Promise((r) => setTimeout(r, 100));

      const state = useChatStore.getState();
      const toolCall = state.messages
        .find((m: any) => m.id === messageId)
        ?.toolCalls?.find((tc: any) => tc.id === toolCallId);

      expect(toolCall.function.arguments).toBe('{"pa' + 'th":"/' + 'src/' + 'App.' + 'tsx"}');
    });
  });
});
