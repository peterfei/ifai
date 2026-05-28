/**
 * AgentCollabStore 测试
 *
 * 测试策略：
 * - 纯 store 测试，不涉及 React 渲染
 * - 使用 useAgentCollabStore.setState() 重置状态
 * - 使用 useAgentCollabStore.getState() 调用 actions 并断言
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentCollabStore } from '../agentCollabStore';
import type { AgentDot } from '../../types/agent-collaboration';

describe('AgentCollabStore', () => {
  beforeEach(() => {
    useAgentCollabStore.setState({
      agentDots: [],
      compactText: '',
      hasActiveAgents: false,
    });
  });

  /* ===== 初始状态 ===== */

  it('CS-1: 初始状态为空的默认值', () => {
    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toEqual([]);
    expect(state.compactText).toBe('');
    expect(state.hasActiveAgents).toBe(false);
  });

  /* ===== setAgentDots ===== */

  it('CS-2: setAgentDots 更新 agentDots 和 compactText', () => {
    const dots: AgentDot[] = [
      { id: 'RF', label: 'RF', gradient: 'from-emerald-400 to-emerald-600', isActive: true },
      { id: 'TS', label: 'TS', gradient: 'from-sky-400 to-sky-600', isActive: false },
    ];
    useAgentCollabStore.getState().setAgentDots(dots, '重构Agent 正在构建表单 Schema · 2/3 任务');

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toEqual(dots);
    expect(state.compactText).toBe('重构Agent 正在构建表单 Schema · 2/3 任务');
    expect(state.hasActiveAgents).toBe(true);
  });

  it('CS-3: setAgentDots 空数组时 hasActiveAgents 为 false', () => {
    useAgentCollabStore.getState().setAgentDots([], '');
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(false);
  });

  it('CS-4: setAgentDots 全部 inactive 时 hasActiveAgents 为 false', () => {
    const dots: AgentDot[] = [
      { id: 'RF', label: 'RF', gradient: 'from-emerald-400 to-emerald-600', isActive: false },
    ];
    useAgentCollabStore.getState().setAgentDots(dots, '');
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(false);
  });

  it('CS-5: setAgentDots 至少一个 active 时 hasActiveAgents 为 true', () => {
    const dots: AgentDot[] = [
      { id: 'RF', label: 'RF', gradient: 'from-emerald-400 to-emerald-600', isActive: true },
      { id: 'TS', label: 'TS', gradient: 'from-sky-400 to-sky-600', isActive: false },
    ];
    useAgentCollabStore.getState().setAgentDots(dots, '');
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(true);
  });

  /* ===== clearCollab ===== */

  it('CS-6: clearCollab 清空所有状态', () => {
    // 先设置数据
    const dots: AgentDot[] = [
      { id: 'RF', label: 'RF', gradient: 'from-emerald-400 to-emerald-600', isActive: true },
    ];
    useAgentCollabStore.getState().setAgentDots(dots, 'some text');

    // 清空
    useAgentCollabStore.getState().clearCollab();

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toEqual([]);
    expect(state.compactText).toBe('');
    expect(state.hasActiveAgents).toBe(false);
  });

  it('CS-7: 空状态调用 clearCollab 不崩溃', () => {
    expect(() => {
      useAgentCollabStore.getState().clearCollab();
    }).not.toThrow();
  });
});
