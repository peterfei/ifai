/**
 * AgentWorkstation 组件测试
 *
 * ASW-1 ~ ASW-8: 单个 Agent 工位渲染
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AgentWorkstation } from '../AgentWorkstation';
import type { Agent } from '../../../types/agent';
import { AGENT_STATUS_PALETTE } from '../../conversation/PALETTE';
import { getAgent } from '../../conversation/AGENT_DSL';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: '探索代码库',
    type: 'explore',
    status: 'running',
    progress: 0.5,
    logs: ['日志行1', '日志行2'],
    ...overrides,
  };
}

describe('AgentWorkstation', () => {
  // ASW-1: 渲染 data-testid
  it('ASW-1: 渲染 data-testid="agent-workstation"', () => {
    render(<AgentWorkstation agent={makeAgent()} />);
    expect(screen.getByTestId('agent-workstation')).toBeTruthy();
  });

  // ASW-2: 头像背景色来自 AGENT_DSL
  it('ASW-2: 头像背景色来自 AGENT_DSL', () => {
    const { container } = render(<AgentWorkstation agent={makeAgent({ type: 'explore' })} />);
    const avatar = container.querySelector('[data-agent-avatar]') as HTMLElement;
    expect(avatar).toBeTruthy();
    const descriptor = getAgent('explore');
    expect(avatar.style.backgroundColor).toBe(descriptor?.color?.bg);
  });

  // ASW-3: 状态颜色来自 AGENT_STATUS_PALETTE
  it('ASW-3: 状态颜色来自 AGENT_STATUS_PALETTE', () => {
    render(<AgentWorkstation agent={makeAgent({ status: 'running' })} />);
    const statusEl = screen.getByTestId('agent-status-label');
    expect(statusEl).toBeTruthy();
    expect(statusEl.style.color).toBe(AGENT_STATUS_PALETTE.running.bg);
  });

  // ASW-4: 状态中文标签查表
  it('ASW-4: 状态中文标签', () => {
    render(<AgentWorkstation agent={makeAgent({ status: 'completed', progress: 1 })} />);
    expect(screen.getByText('已完成 · 100%')).toBeTruthy();
  });

  // ASW-5: 进度条宽度百分比
  it('ASW-5: 进度条宽度百分比', () => {
    render(<AgentWorkstation agent={makeAgent({ progress: 0.65 })} />);
    const bar = screen.getByTestId('agent-progress-bar');
    expect(bar.style.width).toBe('65%');
  });

  // ASW-6: 日志列表渲染
  it('ASW-6: 展开模式渲染日志', () => {
    render(<AgentWorkstation agent={makeAgent({ logs: ['日志行1', '日志行2'] })} />);
    expect(screen.getByText('日志行1')).toBeTruthy();
    expect(screen.getByText('日志行2')).toBeTruthy();
  });

  // ASW-7: 未知 Agent 类型安全降级
  it('ASW-7: 未知 Agent 类型安全降级', () => {
    const { container } = render(<AgentWorkstation agent={makeAgent({ type: 'unknown-type' })} />);
    const avatar = container.querySelector('[data-agent-avatar]') as HTMLElement;
    expect(avatar).toBeTruthy();
    expect(avatar.textContent).toBe('UNK');
  });

  // ASW-8: compact 模式只渲染头像+状态行
  it('ASW-8: compact 模式不渲染日志和进度条', () => {
    render(<AgentWorkstation agent={makeAgent()} compact />);
    expect(screen.getByTestId('agent-workstation')).toBeTruthy();
    expect(screen.queryByTestId('agent-progress-bar')).toBeNull();
    expect(screen.queryByText('日志行1')).toBeNull();
  });
});
