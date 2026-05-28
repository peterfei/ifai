/**
 * WorkLogPanel 组件测试
 *
 * WLP-1 ~ WLP-5: 工作日志子面板
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkLogPanel } from '../../panels/WorkLogPanel';

// Mock useWorkLogData
const mockLogs: any[] = [];

vi.mock('../../panels/useWorkLogData', () => ({
  useWorkLogData: () => mockLogs,
}));

// Mock AGENT_DSL for color lookup
vi.mock('../../../conversation/AGENT_DSL', () => ({
  getAgent: (id: string) => {
    const agents: Record<string, any> = {
      explore: { id: 'explore', name: '探索代码库', abbr: 'EXP', color: { bg: '#3B82F6', text: '#3B82F6', border: '#3B82F6', dot: '#3B82F6' } },
      refactor: { id: 'refactor', name: '重构代码', abbr: 'REF', color: { bg: '#F59E0B', text: '#F59E0B', border: '#F59E0B', dot: '#F59E0B' } },
    };
    return agents[id];
  },
}));

describe('WorkLogPanel', () => {
  beforeEach(() => {
    mockLogs.length = 0;
  });

  // WLP-1: 渲染日志列表
  it('WLP-1: 渲染日志列表', () => {
    mockLogs.push(
      { agentId: 'explore', agentName: '探索代码库', time: '12:30', content: '读取文件 src/app.ts', timestamp: Date.now() },
      { agentId: 'refactor', agentName: '重构代码', time: '12:25', content: '编辑文件 src/utils.ts', timestamp: Date.now() },
    );

    render(<WorkLogPanel />);

    expect(screen.getByText('读取文件 src/app.ts')).toBeTruthy();
    expect(screen.getByText('编辑文件 src/utils.ts')).toBeTruthy();
  });

  // WLP-2: Agent 颜色使用 AGENT_DSL ColorQuad
  it('WLP-2: Agent 颜色使用 AGENT_DSL ColorQuad（inline style）', () => {
    mockLogs.push(
      { agentId: 'explore', agentName: '探索代码库', time: '12:30', content: '读取文件', timestamp: Date.now() },
    );

    const { container } = render(<WorkLogPanel />);

    // 找到 agent 彩色圆点，检查背景色来自 AGENT_DSL
    const dot = container.querySelector('[data-agent-avatar]');
    expect(dot).toBeTruthy();
    expect((dot as HTMLElement).style.backgroundColor).toBe('#3B82F6');
  });

  // WLP-3: Agent 彩色圆点 data-agent-avatar 包含 abbr 缩写作为 title
  it('WLP-3: Agent 彩色圆点包含 abbr 缩写', () => {
    mockLogs.push(
      { agentId: 'explore', agentName: '探索代码库', time: '12:30', content: '读取文件', timestamp: Date.now() },
    );

    const { container } = render(<WorkLogPanel />);

    const avatar = container.querySelector('[data-agent-avatar]');
    expect(avatar).toBeTruthy();
    expect(avatar?.getAttribute('title')).toBe('EXP');
  });

  // WLP-4: 无日志时显示空状态
  it('WLP-4: 无日志时显示空状态', () => {
    render(<WorkLogPanel />);

    expect(screen.getByText(/暂无工作日志/i)).toBeTruthy();
  });

  // WLP-5: data-testid="work-log-panel"
  it('WLP-5: data-testid="work-log-panel"', () => {
    render(<WorkLogPanel />);

    expect(screen.getByTestId('work-log-panel')).toBeTruthy();
  });
});
