/**
 * useWorkLogData hook 测试
 *
 * RL-1 ~ RL-7: 从 messages 提取工作日志数据
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkLogData } from '../../panels/useWorkLogData';
import type { Message, ToolCall } from '../../../../stores/useChatStore';

// Mock useChatStore
const mockMessages: Message[] = [];

vi.mock('../../../../stores/useChatStore', () => ({
  useChatStore: (selector: (state: { messages: Message[] }) => any) =>
    selector({ messages: mockMessages }),
}));

function makeToolCall(name: string, result?: any): ToolCall {
  return {
    id: `tc-${Math.random().toString(36).slice(2)}`,
    type: 'function',
    function: { name, arguments: '{}' },
    result,
  };
}

function makeMessage(
  role: Message['role'],
  toolCalls?: ToolCall[],
  timestamp?: number,
): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role,
    content: 'test content',
    timestamp: timestamp ?? Date.now(),
    toolCalls,
  };
}

describe('useWorkLogData', () => {
  beforeEach(() => {
    mockMessages.length = 0;
  });

  // RL-1: 无消息时返回空数组
  it('RL-1: 无消息时返回空数组', () => {
    const { result } = renderHook(() => useWorkLogData());
    expect(result.current).toEqual([]);
  });

  // RL-2: 从 assistant 消息的 toolCalls 提取日志
  it('RL-2: 从 assistant 消息的 toolCalls 提取日志', () => {
    mockMessages.push(
      makeMessage('assistant', [
        makeToolCall('Read', { ok: true }),
      ]),
    );

    const { result } = renderHook(() => useWorkLogData());
    expect(result.current.length).toBe(1);
  });

  // RL-3: 每条日志含 agentId/agentName/time/content
  it('RL-3: 每条日志含 agentId/agentName/time/content', () => {
    const ts = 1700000000000;
    mockMessages.push(
      makeMessage('assistant', [makeToolCall('Read')], ts),
    );

    const { result } = renderHook(() => useWorkLogData());
    const log = result.current[0];

    expect(log).toHaveProperty('agentId');
    expect(log).toHaveProperty('agentName');
    expect(log).toHaveProperty('time');
    expect(log).toHaveProperty('content');
  });

  // RL-4: agentName 通过 getAgent(id) 查 AGENT_DSL
  it('RL-4: agentName 通过 getAgent(id) 查 AGENT_DSL', () => {
    // Read → explore agent
    mockMessages.push(
      makeMessage('assistant', [makeToolCall('Read')]),
    );

    const { result } = renderHook(() => useWorkLogData());
    const log = result.current[0];

    // 'Read' → inferAgentFromTool → 'explore' → getAgent('explore') → '探索代码库'
    expect(log.agentName).toBe('探索代码库');
  });

  // RL-5: 未知 agent 降级为通用 Agent
  it('RL-5: 未知 agent 降级为通用 Agent', () => {
    mockMessages.push(
      makeMessage('assistant', [makeToolCall('unknown_tool_xyz')]),
    );

    const { result } = renderHook(() => useWorkLogData());
    const log = result.current[0];

    expect(log.agentId).toBe('unknown');
    expect(log.agentName).toBe('Agent');
  });

  // RL-6: 时间戳格式化为 HH:mm
  it('RL-6: 时间戳格式化为 HH:mm', () => {
    // 2023-11-14 22:13:20 UTC → 需要格式化为 HH:mm
    const ts = new Date(2023, 10, 14, 22, 13, 20).getTime();
    mockMessages.push(
      makeMessage('assistant', [makeToolCall('Read')], ts),
    );

    const { result } = renderHook(() => useWorkLogData());
    const log = result.current[0];

    // 验证 HH:mm 格式
    expect(log.time).toMatch(/^\d{2}:\d{2}$/);
    expect(log.time).toBe('22:13');
  });

  // RL-7: 按 timestamp 倒序（最新在前）
  it('RL-7: 按 timestamp 倒序', () => {
    const ts1 = new Date(2023, 10, 14, 10, 0, 0).getTime();
    const ts2 = new Date(2023, 10, 14, 12, 0, 0).getTime();
    const ts3 = new Date(2023, 10, 14, 11, 0, 0).getTime();

    mockMessages.push(
      makeMessage('assistant', [makeToolCall('Read')], ts1),
      makeMessage('assistant', [makeToolCall('Glob')], ts2),
      makeMessage('assistant', [makeToolCall('Grep')], ts3),
    );

    const { result } = renderHook(() => useWorkLogData());
    const times = result.current.map((l) => l.time);

    // 最新的排最前
    expect(times[0]).toBe('12:00');
    expect(times[1]).toBe('11:00');
    expect(times[2]).toBe('10:00');
  });
});
