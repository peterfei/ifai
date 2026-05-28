/**
 * AgentCompactBar 测试 — Agent 圆点 + 紧凑文本渲染
 *
 * 测试覆盖：
 * - 渲染 Agent 圆点（label）
 * - 活跃 Agent 有 animate-glow class
 * - 非活跃 Agent 有 opacity-60
 * - 显示 compactText
 * - 无活跃 Agent 时隐藏整个 bar
 * - 空 dots 数组时不渲染
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCompactBar } from '../AgentCompactBar';
import { useAgentCollabStore } from '../../../stores/agentCollabStore';
import type { AgentDot } from '../../../types/agent-collaboration';

const ACTIVE_DOTS: AgentDot[] = [
  { id: 'PM', label: 'PM', gradient: 'from-brand-400 to-brand-600', isActive: true },
  { id: 'RF', label: 'RF', gradient: 'from-emerald-400 to-emerald-600', isActive: true },
];

const MIXED_DOTS: AgentDot[] = [
  { id: 'PM', label: 'PM', gradient: 'from-brand-400 to-brand-600', isActive: false },
  { id: 'RF', label: 'RF', gradient: 'from-emerald-400 to-emerald-600', isActive: true },
  { id: 'TS', label: 'TS', gradient: 'from-sky-400 to-sky-600', isActive: false },
];

describe('AgentCompactBar', () => {
  beforeEach(() => {
    useAgentCollabStore.setState({
      agentDots: [],
      compactText: '',
      hasActiveAgents: false,
    });
  });

  /* ===== 渲染 ===== */

  it('CB-1: 有活跃 Agent 时渲染圆点', () => {
    useAgentCollabStore.getState().setAgentDots(ACTIVE_DOTS, '2/2 Agent 活跃');
    render(<AgentCompactBar />);

    expect(screen.getByText('PM')).toBeTruthy();
    expect(screen.getByText('RF')).toBeTruthy();
  });

  it('CB-2: 显示 compactText', () => {
    useAgentCollabStore.getState().setAgentDots(ACTIVE_DOTS, '2/2 Agent 活跃');
    render(<AgentCompactBar />);

    expect(screen.getByText('2/2 Agent 活跃')).toBeTruthy();
  });

  /* ===== 活跃状态 ===== */

  it('CB-3: 活跃 Agent 包含 animate-glow class', () => {
    useAgentCollabStore.getState().setAgentDots(ACTIVE_DOTS, '');
    const { container } = render(<AgentCompactBar />);

    // 所有活跃的圆点应有 animate-glow
    const glowEls = container.querySelectorAll('.animate-glow');
    expect(glowEls.length).toBe(2);
  });

  it('CB-4: 非活跃 Agent 有 opacity-60', () => {
    useAgentCollabStore.getState().setAgentDots(MIXED_DOTS, '');
    const { container } = render(<AgentCompactBar />);

    // 2 个非活跃（PM, TS）应有 opacity-60
    const opacityEls = container.querySelectorAll('.opacity-60');
    expect(opacityEls.length).toBe(2);
  });

  /* ===== 隐藏态 ===== */

  it('CB-5: 无活跃 Agent 时渲染 null', () => {
    useAgentCollabStore.getState().setAgentDots([
      { id: 'PM', label: 'PM', gradient: 'from-brand-400 to-brand-600', isActive: false },
    ], '');
    const { container } = render(<AgentCompactBar />);

    // 容器应该是空的
    expect(container.innerHTML).toBe('');
  });

  it('CB-6: 空 dots 数组时不渲染', () => {
    render(<AgentCompactBar />);

    // 无内容
    expect(screen.queryByText('PM')).toBeNull();
  });
});
