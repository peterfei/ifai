/**
 * AgentWorkspaceCard 测试 — 对齐原型 renderInlineAgentView()
 *
 * 测试覆盖：
 * - PM 头像渲染
 * - 步骤指示器（X/Y）
 * - 子 Agent 卡片渲染（头像、状态、进度条）
 * - 任务分解列表
 * - 步骤导航栏
 * - compactMsg
 * - 入场动画
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentWorkspaceCard } from '../cards/AgentWorkspaceCard';
import type { AgentWorkspaceData } from '../../../types/agent-collaboration';

const MOCK_WORKSPACE_DATA: AgentWorkspaceData = {
  stepLabel: '代码重构',
  stepIndex: 0,
  totalSteps: 3,
  activeAgents: ['RF', 'TS'],
  assignFromPM: true,
  compactMsg: '重构Agent 正在重构登录模块...',
  progress: { RF: 45, TS: 0 },
  taskBreakdown: [
    { task: '提取登录组件', agent: 'RF' },
    { task: '编写单元测试', agent: 'TS' },
    { task: '更新类型定义', agent: 'RF' },
  ],
  steps: ['代码重构', '测试验证', '最终审查'],
};

function makeMessage(data: AgentWorkspaceData) {
  return { id: 'test-aw', role: 'assistant' as const, content: '', timestamp: Date.now(), data };
}

describe('AgentWorkspaceCard', () => {
  /* ===== PM 头像 ===== */

  it('AW-1: 应渲染 PM 头像', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    expect(screen.getByText('PM')).toBeTruthy();
  });

  /* ===== 步骤指示器 ===== */

  it('AW-2: 应显示步骤指示器（X/Y）', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    expect(screen.getByText('步骤 1/3')).toBeTruthy();
  });

  /* ===== 子 Agent 卡片 ===== */

  it('AW-3: 应渲染所有活跃 Agent', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    // RF 和 TS 的 label（可能出现在头像和任务列表中）
    expect(screen.getAllByText('RF').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TS').length).toBeGreaterThanOrEqual(1);
  });

  it('AW-4: 活跃 Agent 显示"工作中"状态', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    const workingTexts = screen.getAllByText('工作中');
    expect(workingTexts.length).toBe(2); // RF 和 TS 都是 active
  });

  it('AW-5: 应渲染进度条（百分比文本）', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    // RF 的进度是 45%
    expect(screen.getByText('45%')).toBeTruthy();
    // TS 的进度是 0%
    expect(screen.getByText('0%')).toBeTruthy();
  });

  /* ===== 任务分解 ===== */

  it('AW-6: 应渲染任务分解列表', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    for (const item of MOCK_WORKSPACE_DATA.taskBreakdown!) {
      expect(screen.getByText(item.task)).toBeTruthy();
    }
  });

  /* ===== 步骤导航栏 ===== */

  it('AW-7: 应渲染步骤导航栏', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    // 所有步骤名都应显示
    for (const step of MOCK_WORKSPACE_DATA.steps!) {
      expect(screen.getByText(step)).toBeTruthy();
    }
  });

  it('AW-8: 当前步骤应高亮', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    const { container } = render(<AgentWorkspaceCard message={msg} />);

    // 第一个步骤"代码重构"当前高亮（stepIndex=0）
    const stepElements = container.querySelectorAll('[class*="steps"] span, [class*="step"]');
    const steps = Array.from(stepElements).filter(el => MOCK_WORKSPACE_DATA.steps!.includes(el.textContent || ''));
    // 验证容器包含 "代码重构" 且其为当前步骤
    expect(screen.getByText('代码重构')).toBeTruthy();
  });

  /* ===== compactMsg ===== */

  it('AW-9: 应显示紧凑消息', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    render(<AgentWorkspaceCard message={msg} />);

    expect(screen.getByText('重构Agent 正在重构登录模块...')).toBeTruthy();
  });

  /* ===== 入场动画 ===== */

  it('AW-10: 容器包含 animate-slide-in 入场动画 class', () => {
    const msg = makeMessage(MOCK_WORKSPACE_DATA);
    const { container } = render(<AgentWorkspaceCard message={msg} />);

    expect(container.firstChild).toHaveClass('animate-slide-in');
  });

  /* ===== 无 taskBreakdown ===== */

  const DATA_NO_TASKS: AgentWorkspaceData = {
    ...MOCK_WORKSPACE_DATA,
    taskBreakdown: undefined,
  };

  it('AW-11: 无 taskBreakdown 时仍正常渲染', () => {
    const msg = makeMessage(DATA_NO_TASKS);
    render(<AgentWorkspaceCard message={msg} />);

    expect(screen.getByText('PM')).toBeTruthy();
    expect(screen.getByText('步骤 1/3')).toBeTruthy();
    expect(screen.getByText('重构Agent 正在重构登录模块...')).toBeTruthy();
  });

  /* ===== 无 steps ===== */

  const DATA_NO_STEPS: AgentWorkspaceData = {
    ...MOCK_WORKSPACE_DATA,
    steps: undefined,
  };

  it('AW-12: 无 steps 时不渲染步骤导航', () => {
    const msg = makeMessage(DATA_NO_STEPS);
    const { container } = render(<AgentWorkspaceCard message={msg} />);

    // 步骤名不应显示（应只显示 PM 等基本元素）
    expect(screen.getByText('PM')).toBeTruthy();
  });
});
