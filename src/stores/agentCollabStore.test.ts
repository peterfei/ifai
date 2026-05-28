/**
 * AgentCollabStore 单元测试
 *
 * 测试覆盖：
 * - SC-1: 初始状态
 * - SC-2: setAgentDots with 活跃 dots
 * - SC-3: setAgentDots with 全部非活跃 dots
 * - SC-4: setAgentDots with 混合状态
 * - SC-5: clearCollab 重置
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentCollabStore } from './agentCollabStore';
import type { AgentDot } from '../types/agent-collaboration';

describe('AgentCollabStore', () => {
  beforeEach(() => {
    useAgentCollabStore.setState({
      agentDots: [],
      compactText: '',
      hasActiveAgents: false,
    });
  });

  /* ===== 初始状态 ===== */

  it('SC-1: 初始状态 agentDots 为空，hasActiveAgents 为 false', () => {
    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toEqual([]);
    expect(state.compactText).toBe('');
    expect(state.hasActiveAgents).toBe(false);
  });

  /* ===== setAgentDots ===== */

  it('SC-2: setAgentDots 设置活跃 dots 后 hasActiveAgents 为 true', () => {
    const dots: AgentDot[] = [
      { id: 'PM', label: 'PM', gradient: 'from-brand-400 to-brand-600', isActive: true },
      { id: 'RF', label: 'RF', gradient: 'from-emerald-400 to-emerald-600', isActive: true },
    ];
    useAgentCollabStore.getState().setAgentDots(dots, '2/2 Agent 活跃');

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(2);
    expect(state.agentDots[0].id).toBe('PM');
    expect(state.agentDots[1].id).toBe('RF');
    expect(state.compactText).toBe('2/2 Agent 活跃');
    expect(state.hasActiveAgents).toBe(true);
  });

  it('SC-3: setAgentDots 全部非活跃 dots 时 hasActiveAgents 为 false', () => {
    const dots: AgentDot[] = [
      { id: 'PM', label: 'PM', gradient: 'from-brand-400 to-brand-600', isActive: false },
      { id: 'TS', label: 'TS', gradient: 'from-sky-400 to-sky-600', isActive: false },
    ];
    useAgentCollabStore.getState().setAgentDots(dots, '全部已完成');

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(2);
    expect(state.hasActiveAgents).toBe(false);
    expect(state.compactText).toBe('全部已完成');
  });

  it('SC-4: setAgentDots 混合状态正确推导 hasActiveAgents', () => {
    const dots: AgentDot[] = [
      { id: 'PM',  label: 'PM',  gradient: 'from-brand-400 to-brand-600',   isActive: false },
      { id: 'RF',  label: 'RF',  gradient: 'from-emerald-400 to-emerald-600', isActive: true },
      { id: 'TS',  label: 'TS',  gradient: 'from-sky-400 to-sky-600',       isActive: false },
    ];
    useAgentCollabStore.getState().setAgentDots(dots, '1 Agent 活跃');

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(3);
    expect(state.hasActiveAgents).toBe(true); // RF 是活跃的
    expect(state.agentDots.filter(d => d.isActive)).toHaveLength(1);
  });

  /* ===== clearCollab ===== */

  it('SC-5: clearCollab 重置所有状态到初始值', () => {
    // 先设置一些状态
    useAgentCollabStore.getState().setAgentDots(
      [{ id: 'EX', label: 'EX', gradient: 'from-purple-400 to-purple-600', isActive: true }],
      '探索中',
    );

    // 验证已设置
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(1);

    // 执行清理
    useAgentCollabStore.getState().clearCollab();

    // 验证已重置
    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toEqual([]);
    expect(state.compactText).toBe('');
    expect(state.hasActiveAgents).toBe(false);
  });
});
