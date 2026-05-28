/**
 * useAgentCollabState hook 测试
 *
 * 测试策略：
 * - 渲染 hook 后修改 agentStore.runningAgents
 * - 验证 AgentCollabStore 中的 agentDots / compactText / hasActiveAgents 正确更新
 * - 验证卸载时清理
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentCollabState } from '../useAgentCollabState';
import { useAgentCollabStore } from '../../stores/agentCollabStore';
import { useAgentStore } from '../../stores/agentStore';

describe('useAgentCollabState', () => {
  beforeEach(() => {
    useAgentCollabStore.setState({
      agentDots: [],
      compactText: '',
      hasActiveAgents: false,
    });
    useAgentStore.setState({
      runningAgents: [],
    });
  });

  /* ===== 初始状态 ===== */

  it('CE-1: 无 runningAgents 时 agentDots 为空', () => {
    renderHook(() => useAgentCollabState());

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toEqual([]);
    expect(state.hasActiveAgents).toBe(false);
  });

  /* ===== 同步 runningAgents ===== */

  it('CE-2: runningAgents 变更后 agentDots 正确派生', () => {
    renderHook(() => useAgentCollabState());

    act(() => {
      useAgentStore.setState({
        runningAgents: [
          { id: 'agent-1', type: 'explore', name: '探索Agent', status: 'running', progress: 0.5, logs: [] },
          { id: 'agent-2', type: 'test', name: '测试Agent', status: 'completed', progress: 1.0, logs: [] },
        ] as any,
      });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots.length).toBe(2);
    // explore 是 running → isActive: true
    expect(state.agentDots[0]).toMatchObject({ id: 'agent-1', isActive: true });
    // test 是 completed → isActive: false
    expect(state.agentDots[1]).toMatchObject({ id: 'agent-2', isActive: false });
    expect(state.hasActiveAgents).toBe(true);
  });

  it('CE-3: 所有 Agent 完成后 hasActiveAgents 为 false', () => {
    renderHook(() => useAgentCollabState());

    act(() => {
      useAgentStore.setState({
        runningAgents: [
          { id: 'agent-1', type: 'explore', name: '探索Agent', status: 'completed', progress: 1.0, logs: [] },
        ] as any,
      });
    });

    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(false);
  });

  /* ===== 清理 ===== */

  it('CE-4: 卸载后取消订阅，不再同步', () => {
    const { unmount } = renderHook(() => useAgentCollabState());
    unmount();

    // 卸载后修改 runningAgents
    act(() => {
      useAgentStore.setState({
        runningAgents: [
          { id: 'agent-1', type: 'explore', name: '探索Agent', status: 'running', progress: 0.5, logs: [] },
        ] as any,
      });
    });

    // agentDots 应为空（因为 hook 已卸载，未同步）
    expect(useAgentCollabStore.getState().agentDots).toEqual([]);
  });
});
