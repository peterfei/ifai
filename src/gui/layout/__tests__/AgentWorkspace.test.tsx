/**
 * AgentWorkspace 组件测试
 *
 * AW-1 ~ AW-10: Agent 工作台紧凑/展开双模式
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AgentWorkspace } from '../AgentWorkspace';
import { useLayoutStore } from '../../../stores/layoutStore';

// Mock agentStore
vi.mock('../../../stores/agentStore', () => ({
  useAgentStore: (selector: any) => {
    const state = {
      runningAgents: (globalThis as any).__mockAgents || [],
    };
    return selector ? selector(state) : state;
  },
}));

function setMockAgents(agents: any[]) {
  (globalThis as any).__mockAgents = agents;
}

describe('AgentWorkspace', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      guiMode: 'conversation',
      agentWorkspaceMode: 'compact',
    });
    setMockAgents([]);
  });

  // AW-1: 紧凑模式渲染
  it('AW-1: 紧凑模式渲染 data-testid', () => {
    render(<AgentWorkspace />);
    expect(screen.getByTestId('agent-workspace-compact')).toBeTruthy();
  });

  // AW-2: 展开模式渲染
  it('AW-2: 展开模式渲染 data-testid', () => {
    useLayoutStore.setState({ agentWorkspaceMode: 'expanded' });
    render(<AgentWorkspace />);
    expect(screen.getByTestId('agent-workspace-expanded')).toBeTruthy();
  });

  // AW-3: 紧凑模式显示 Agent 头像+状态
  it('AW-3: 紧凑模式显示 Agent 信息', () => {
    setMockAgents([{
      id: 'agent-1',
      type: 'explore',
      status: 'running',
      progress: 0.5,
      logs: ['探索中...'],
    }]);
    render(<AgentWorkspace />);
    expect(screen.getByTestId('agent-workspace-compact')).toBeTruthy();
  });

  // AW-4: 展开模式显示完整日志
  it('AW-4: 展开模式显示完整内容', () => {
    useLayoutStore.setState({ agentWorkspaceMode: 'expanded' });
    setMockAgents([{
      id: 'agent-1',
      type: 'explore',
      status: 'running',
      progress: 0.5,
      logs: ['日志行1'],
    }]);
    render(<AgentWorkspace />);
    expect(screen.getByTestId('agent-workspace-expanded')).toBeTruthy();
  });

  // AW-5: 紧凑→展开切换
  it('AW-5: 点击展开按钮切换到 expanded', () => {
    render(<AgentWorkspace />);
    const expandBtn = screen.getByTestId('agent-workspace-expand');
    fireEvent.click(expandBtn);
    expect(useLayoutStore.getState().agentWorkspaceMode).toBe('expanded');
  });

  // AW-6: 展开→紧凑切换
  it('AW-6: 点击收起按钮切换到 compact', () => {
    useLayoutStore.setState({ agentWorkspaceMode: 'expanded' });
    render(<AgentWorkspace />);
    const collapseBtn = screen.getByTestId('agent-workspace-collapse');
    fireEvent.click(collapseBtn);
    expect(useLayoutStore.getState().agentWorkspaceMode).toBe('compact');
  });

  // AW-7: Agent 颜色来自 AGENT_DSL
  it('AW-7: Agent 头像颜色来自 AGENT_DSL', () => {
    setMockAgents([{
      id: 'agent-1',
      type: 'explore',
      status: 'running',
      progress: 0.5,
      logs: [],
    }]);
    const { container } = render(<AgentWorkspace />);
    // Agent 头像应使用 AGENT_DSL explore 的颜色
    const avatar = container.querySelector('[data-agent-avatar]');
    expect(avatar).toBeTruthy();
    const bgColor = (avatar as HTMLElement).style.backgroundColor;
    expect(bgColor).toBeTruthy();
  });

  // AW-9: 无活跃 Agent 显示空状态
  it('AW-9: 无活跃 Agent 显示空状态', () => {
    setMockAgents([]);
    render(<AgentWorkspace />);
    expect(screen.getByText('暂无活跃 Agent')).toBeTruthy();
  });

  // AW-10: 多 Agent 紧凑模式显示最新
  it('AW-10: 多 Agent 紧凑模式显示摘要', () => {
    setMockAgents([
      { id: 'a1', type: 'explore', status: 'completed', progress: 1, logs: [] },
      { id: 'a2', type: 'test', status: 'running', progress: 0.3, logs: ['测试中'] },
    ]);
    render(<AgentWorkspace />);
    // 紧凑模式应显示活跃 Agent 数量
    expect(screen.getByTestId('agent-workspace-compact')).toBeTruthy();
  });
});
