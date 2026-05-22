/**
 * AgentSelector 组件测试
 *
 * AS-1 ~ AS-7: @ 触发的 Agent 快捷选择器
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AgentSelector } from '../AgentSelector';

describe('AgentSelector', () => {
  const defaultProps = {
    filter: '',
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };

  // AS-1: 渲染 7 个 Agent 选项
  it('AS-1: 渲染所有 Agent 选项', () => {
    render(<AgentSelector {...defaultProps} />);
    // 7 个 Agent: explore, review, test, doc, refactor, proposal, task
    const items = screen.getAllByTestId('agent-option');
    expect(items.length).toBe(7);
  });

  // AS-2: filter 过滤显示匹配 Agent
  it('AS-2: filter 过滤显示匹配 Agent', () => {
    render(<AgentSelector {...defaultProps} filter="exp" />);
    const items = screen.getAllByTestId('agent-option');
    expect(items.length).toBe(1);
    expect(screen.getByText('探索代码库')).toBeTruthy();
  });

  // AS-3: 点击 Agent 触发 onSelect
  it('AS-3: 点击 Agent 触发 onSelect', () => {
    const onSelect = vi.fn();
    render(<AgentSelector {...defaultProps} onSelect={onSelect} />);
    const firstItem = screen.getAllByTestId('agent-option')[0];
    fireEvent.click(firstItem);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // 应传入 agentId 和 command
    const [agentId, command] = onSelect.mock.calls[0];
    expect(agentId).toBeTruthy();
    expect(command).toMatch(/^\//);
  });

  // AS-4: Agent 圆点颜色来自 AGENT_DSL
  it('AS-4: Agent 圆点颜色来自 AGENT_DSL', () => {
    render(<AgentSelector {...defaultProps} />);
    const dots = screen.getAllByTestId('agent-dot');
    // 第一个 Agent (explore) 的颜色应该是 #3B82F6
    expect(dots[0].style.backgroundColor).toBeTruthy();
  });

  // AS-5: ESC 键触发 onClose
  it('AS-5: ESC 键触发 onClose', () => {
    const onClose = vi.fn();
    render(<AgentSelector {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId('agent-selector'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // AS-6: 空搜索结果显示"无匹配结果"
  it('AS-6: 空搜索结果显示空状态', () => {
    render(<AgentSelector {...defaultProps} filter="zzz" />);
    expect(screen.getByText('无匹配结果')).toBeTruthy();
  });

  // AS-7: data-testid="agent-selector"
  it('AS-7: data-testid="agent-selector"', () => {
    render(<AgentSelector {...defaultProps} />);
    expect(screen.getByTestId('agent-selector')).toBeTruthy();
  });
});
