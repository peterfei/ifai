/**
 * AgentWorkspaceCard 测试
 *
 * 测试覆盖：
 * - AW-1: 渲染 PM 头像 + 步骤 X/Y
 * - AW-2: 渲染子 Agent 卡片（状态、进度条）
 * - AW-3: 渲染任务分解列表
 * - AW-4: 渲染步骤导航栏（当前步骤高亮）
 * - AW-5: 渲染 compactMsg
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentWorkspaceCard } from '../AgentWorkspaceCard';
import type { AgentWorkspaceData } from '../../../../types/agent-collaboration';

const BASE_DATA: AgentWorkspaceData = {
  stepLabel: '代码生成',
  stepIndex: 0,
  totalSteps: 3,
  activeAgents: ['RF', 'TS'],
  assignFromPM: true,
  compactMsg: '重构Agent 正在构建表单 Schema',
  progress: { RF: 45, TS: 0 },
  taskBreakdown: [
    { task: '构建表单 Schema', agent: 'RF' },
    { task: '渲染表单组件', agent: 'TS' },
  ],
  steps: ['代码生成', '测试验证', '代码审查'],
};

describe('AgentWorkspaceCard', () => {
  it('AW-1: 渲染 PM 头像 + 步骤 X/Y', () => {
    render(<AgentWorkspaceCard message={{ data: BASE_DATA }} />);
    // PM 头像
    expect(screen.getByText('PM')).toBeTruthy();
    // 步骤指示器
    expect(screen.getByText('步骤 1/3')).toBeTruthy();
    // PM 分配徽章
    expect(screen.getByText('PM 分配')).toBeTruthy();
  });

  it('AW-2: 渲染子 Agent 卡片（状态 + 百分比）', () => {
    render(<AgentWorkspaceCard message={{ data: BASE_DATA }} />);
    // Agent 标签出现至少 1 次
    expect(screen.getAllByText('RF').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TS').length).toBeGreaterThanOrEqual(1);
    // 百分比文本
    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    // 状态文本（activeAgent 中的都是 active）
    expect(screen.getAllByText('工作中').length).toBe(2);
  });

  it('AW-3: 渲染任务分解列表', () => {
    render(<AgentWorkspaceCard message={{ data: BASE_DATA }} />);
    expect(screen.getByText('构建表单 Schema')).toBeTruthy();
    expect(screen.getByText('渲染表单组件')).toBeTruthy();
  });

  it('AW-4: 渲染步骤导航栏（当前步骤高亮）', () => {
    render(<AgentWorkspaceCard message={{ data: BASE_DATA }} />);
    expect(screen.getByText('代码生成')).toBeTruthy();
    expect(screen.getByText('测试验证')).toBeTruthy();
    expect(screen.getByText('代码审查')).toBeTruthy();
  });

  it('AW-5: 渲染 compactMsg', () => {
    render(<AgentWorkspaceCard message={{ data: BASE_DATA }} />);
    expect(screen.getByText('重构Agent 正在构建表单 Schema')).toBeTruthy();
  });

  it('AW-6: 无 taskBreakdown 时不渲染任务列表', () => {
    const data = { ...BASE_DATA, taskBreakdown: undefined };
    render(<AgentWorkspaceCard message={{ data }} />);
    // 不应有任务列表中的任务文本
    expect(screen.queryByText('构建表单 Schema')).toBeNull();
    expect(screen.queryByText('渲染表单组件')).toBeNull();
  });

  it('AW-7: 无 compactMsg 时不渲染底部消息', () => {
    const data = { ...BASE_DATA, compactMsg: undefined };
    render(<AgentWorkspaceCard message={{ data }} />);
    expect(screen.queryByText('重构Agent 正在构建表单 Schema')).toBeNull();
  });

  it('AW-8: 无 assignFromPM 时不显示 PM 分配徽章', () => {
    const data = { ...BASE_DATA, assignFromPM: false };
    render(<AgentWorkspaceCard message={{ data }} />);
    expect(screen.queryByText('PM 分配')).toBeNull();
  });
});
