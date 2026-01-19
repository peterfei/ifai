import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleStatusEvent,
  handleLogEvent,
  handleToolCallEvent,
  handleToolResultEvent,
  createAgentEventHandler,
  type EventHandlerContext,
} from '../agentEventHandler';
import type { Agent } from '@/types/agent';
import type { Message } from 'ifainew-core';

describe('AgentEventHandler', () => {
  let mockState: { runningAgents: Agent[] };
  let setStateCalls: any[];

  beforeEach(() => {
    mockState = {
      runningAgents: [
        {
          id: 'agent-1',
          name: 'Test Agent',
          type: 'explore',
          status: 'initializing',
          progress: 0,
          logs: ['log1', 'log2'],
          content: '',
          startTime: Date.now(),
        },
      ],
    };
    setStateCalls = [];
  });

  const mockSetState = (update: (state: typeof mockState) => typeof mockState | void) => {
    const result = update(mockState);
    if (result) {
      mockState = result;
    }
    setStateCalls.push(mockState);
  };

  describe('handleStatusEvent', () => {
    it('应该更新 agent 状态', () => {
      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages: [] },
      };

      handleStatusEvent({ status: 'running', progress: 0.5 }, context, mockSetState);

      expect(mockState.runningAgents[0].status).toBe('running');
      expect(mockState.runningAgents[0].progress).toBe(0.5);
    });

    it('不应该影响其他 agent', () => {
      mockState.runningAgents.push({
        id: 'agent-2',
        name: 'Another Agent',
        type: 'task-breakdown',
        status: 'initializing',
        progress: 0,
        logs: [],
        content: '',
        startTime: Date.now(),
      });

      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages: [] },
      };

      handleStatusEvent({ status: 'running', progress: 0.5 }, context, mockSetState);

      expect(mockState.runningAgents[0].status).toBe('running');
      expect(mockState.runningAgents[1].status).toBe('initializing');
    });
  });

  describe('handleLogEvent', () => {
    it('应该添加日志到 agent', () => {
      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages: [] },
      };

      const sliceLogs = (logs: string[]) => logs;
      const shouldUpdateStatus = () => false;

      handleLogEvent({ message: 'new log' }, context, mockSetState, sliceLogs, shouldUpdateStatus);

      expect(mockState.runningAgents[0].logs).toContain('new log');
    });

    it('应该限制日志数量', () => {
      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages: [] },
      };

      const sliceLogs = (logs: string[], limit: number) => logs.slice(-limit);
      const shouldUpdateStatus = () => false;

      // 添加超过限制的日志
      for (let i = 0; i < 150; i++) {
        handleLogEvent({ message: `log ${i}` }, context, mockSetState, sliceLogs, shouldUpdateStatus);
      }

      expect(mockState.runningAgents[0].logs.length).toBeLessThanOrEqual(100);
    });
  });

  describe('handleToolCallEvent', () => {
    it('应该添加新的工具调用', () => {
      const messages: Message[] = [
        {
          id: 'msg1',
          role: 'assistant',
          content: '',
          toolCalls: [],
        },
      ];

      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages },
      };

      const result = handleToolCallEvent(
        {
          toolCall: {
            id: 'tc1',
            tool: 'agent_bash',
            args: { command: 'ls' },
            isPartial: false,
          },
        },
        context,
        mockSetState,
        { messages }
      );

      expect(result.messageUpdated).toBe(true);
      expect(result.isNewToolCall).toBe(true);
      expect(result.updatedMessages[0].toolCalls).toHaveLength(1);
      expect(result.updatedMessages[0].toolCalls![0].tool).toBe('agent_bash');
    });

    it('应该更新现有的工具调用', () => {
      const messages: Message[] = [
        {
          id: 'msg1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tc1',
              type: 'function',
              tool: 'agent_bash',
              args: { command: 'ls' },
              function: { name: 'agent_bash', arguments: '{"command":"ls"}' },
              status: 'pending',
              isPartial: true,
            },
          ],
        },
      ];

      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages },
      };

      const result = handleToolCallEvent(
        {
          toolCall: {
            id: 'tc1',
            tool: 'agent_bash',
            args: { command: 'ls -la' },
            isPartial: false,
          },
        },
        context,
        mockSetState,
        { messages }
      );

      expect(result.messageUpdated).toBe(true);
      expect(result.isNewToolCall).toBe(false);
      expect(result.updatedMessages[0].toolCalls![0].args).toEqual({ command: 'ls -la' });
      expect(result.updatedMessages[0].toolCalls![0].isPartial).toBe(false);
    });

    it('应该跳过无效的工具调用', () => {
      const messages: Message[] = [
        {
          id: 'msg1',
          role: 'assistant',
          content: '',
          toolCalls: [],
        },
      ];

      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages },
      };

      const result = handleToolCallEvent(
        {
          toolCall: {
            id: 'tc1',
            tool: '',
            args: {},
            isPartial: false,
          },
        },
        context,
        mockSetState,
        { messages }
      );

      expect(result.messageUpdated).toBe(false);
      expect(result.updatedMessages[0].toolCalls).toHaveLength(0);
    });
  });

  describe('handleToolResultEvent', () => {
    it('应该更新工具调用结果', () => {
      const messages: Message[] = [
        {
          id: 'msg1',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tc1',
              type: 'function',
              tool: 'agent_bash',
              args: { command: 'ls' },
              function: { name: 'agent_bash', arguments: '{"command":"ls"}' },
              status: 'approved',
              isPartial: false,
            },
          ],
        },
      ];

      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages },
      };

      const result = handleToolResultEvent(
        {
          toolCallId: 'tc1',
          result: 'file1.txt\nfile2.txt',
          success: true,
        },
        context,
        messages
      );

      expect(result[0].toolCalls![0].result).toBe('file1.txt\nfile2.txt');
    });
  });

  describe('createAgentEventHandler', () => {
    it('应该创建包含所有事件处理器的对象', () => {
      const handler = createAgentEventHandler(mockSetState);

      expect(handler).toHaveProperty('status');
      expect(handler).toHaveProperty('log');
      expect(handler).toHaveProperty('thinking');
      expect(handler).toHaveProperty('tool_call');
      expect(handler).toHaveProperty('tool_result');
      expect(handler).toHaveProperty('result');
      expect(handler).toHaveProperty('error');
      expect(handler).toHaveProperty('explore_progress');
      expect(handler).toHaveProperty('explore_findings');
    });
  });

  describe('完整事件流', () => {
    it('应该处理完整的事件序列', () => {
      const messages: Message[] = [
        {
          id: 'msg1',
          role: 'assistant',
          content: '',
          toolCalls: [],
        },
      ];

      const context: EventHandlerContext = {
        agentId: 'agent-1',
        agentType: 'explore',
        msgId: 'msg1',
        eventId: 'event1',
        chatState: { messages },
      };

      const handler = createAgentEventHandler(mockSetState);

      // 1. Status: running
      handler.status({ status: 'running', progress: 0.2 }, context);
      expect(mockState.runningAgents[0].status).toBe('running');

      // 2. Log
      const sliceLogs = (logs: string[], limit: number) => logs.slice(-limit);
      const shouldUpdateStatus = () => false;
      handler.log({ message: 'Processing...' }, context, sliceLogs, shouldUpdateStatus);
      expect(mockState.runningAgents[0].logs).toContain('Processing...');
    });
  });
});
