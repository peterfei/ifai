/**
 * WorkLogPanel 测试
 *
 * 测试覆盖：
 * - WL-1: 无日志时显示占位符
 * - WL-2: 渲染 Agent 彩色圆点 + 名称 + 内容
 * - WL-3: 渲染时间戳
 * - WL-4: 活跃 Agent 高亮（bg-brand-500/5）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkLogPanel } from '../WorkLogPanel';
import { useAgentStore } from '../../../../stores/agentStore';

// Mock useWorkLogData
vi.mock('../useWorkLogData', () => ({
  useWorkLogData: vi.fn(),
}));

import { useWorkLogData } from '../useWorkLogData';

describe('WorkLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({ runningAgents: [] });
  });

  it('WL-1: 无日志时显示占位符', () => {
    (useWorkLogData as any).mockReturnValue([]);
    render(<WorkLogPanel />);
    expect(screen.getByText('暂无工作日志')).toBeTruthy();
  });

  it('WL-2: 渲染 Agent 彩色圆点 + 名称 + 内容', () => {
    (useWorkLogData as any).mockReturnValue([
      {
        agentId: 'explore',
        agentName: '探索Agent',
        time: '14:30',
        content: '读取文件: src/index.ts',
        timestamp: 1000,
        agentColor: '#A855F7',
      },
      {
        agentId: 'refactor',
        agentName: '重构Agent',
        time: '14:31',
        content: '编辑文件: src/utils.ts',
        timestamp: 2000,
        agentColor: '#10B981',
      },
    ]);

    render(<WorkLogPanel />);

    expect(screen.getByText('探索Agent')).toBeTruthy();
    expect(screen.getByText('重构Agent')).toBeTruthy();
    expect(screen.getByText('读取文件: src/index.ts')).toBeTruthy();
    expect(screen.getByText('编辑文件: src/utils.ts')).toBeTruthy();
  });

  it('WL-3: 渲染时间戳', () => {
    (useWorkLogData as any).mockReturnValue([
      {
        agentId: 'explore',
        agentName: '探索Agent',
        time: '14:30',
        content: '测试',
        timestamp: 1000,
        agentColor: '#A855F7',
      },
    ]);

    render(<WorkLogPanel />);
    expect(screen.getByText('14:30')).toBeTruthy();
  });

  it('WL-4: 活跃 Agent 高亮', () => {
    // 设置 runningAgents 中有一个类型为 explore 的活跃 agent
    useAgentStore.setState({
      runningAgents: [
        { id: 'a1', type: 'explore', status: 'running', name: '探索Agent', progress: 0.5, logs: [] } as any,
      ],
    });

    (useWorkLogData as any).mockReturnValue([
      {
        agentId: 'explore',
        agentName: '探索Agent',
        time: '14:30',
        content: '读取文件: src/index.ts',
        timestamp: 1000,
        agentColor: '#A855F7',
      },
      {
        agentId: 'refactor',
        agentName: '重构Agent',
        time: '14:31',
        content: '编辑文件: src/utils.ts',
        timestamp: 2000,
        agentColor: '#10B981',
      },
    ]);

    const { container } = render(<WorkLogPanel />);

    // 找到所有日志行
    const logRows = container.querySelectorAll('.rounded-lg');
    expect(logRows.length).toBe(2);

    // 第一个日志（explore，活跃）应该是 brand 高亮
    const firstBg = (logRows[0] as HTMLElement).style.backgroundColor;
    expect(firstBg).toBe('rgba(0, 122, 204, 0.05)');

    // 第二个日志（refactor，非活跃）应该是默认背景
    const secondBg = (logRows[1] as HTMLElement).style.backgroundColor;
    expect(secondBg).toBe('rgba(0, 122, 204, 0.02)');
  });
});
