/**
 * ExploreCard 测试
 *
 * 测试覆盖：
 * - EX-1: 渲染 EX 头像 + 标题
 * - EX-2: 渲染 phase 卡片（mode、intent、status、progress）
 * - EX-3: 渲染文件列表
 * - EX-4: 运行中的 phase 显示扫描动画状态
 * - EX-5: 全部 done 时显示完成文本
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExploreCard } from '../ExploreCard';
import type { ExploreData } from '../../../../types/agent-collaboration';

const MIXED_PHASES: ExploreData = {
  phases: [
    {
      mode: 'parallel',
      intent: '扫描项目结构',
      progress: 100,
      status: 'done',
      sub: [
        { name: 'src/components/', status: 'done' },
        { name: 'src/utils/', status: 'done' },
      ],
    },
    {
      mode: 'sequential',
      intent: '分析依赖关系',
      progress: 45,
      status: 'running',
      sub: [
        { name: 'package.json', status: 'done' },
        { name: 'tsconfig.json', status: 'running' },
      ],
    },
    {
      mode: 'sequential',
      intent: '生成分析报告',
      progress: 0,
      status: 'pending',
      sub: [],
    },
  ],
};

const ALL_DONE: ExploreData = {
  phases: [
    {
      mode: 'parallel',
      intent: '扫描项目结构',
      progress: 100,
      status: 'done',
      sub: [],
    },
  ],
};

describe('ExploreCard', () => {
  it('EX-1: 渲染 EX 头像 + 标题', () => {
    render(<ExploreCard message={{ data: MIXED_PHASES }} />);
    // EX 标签
    expect(screen.getByText('EX')).toBeTruthy();
    // 标题
    expect(screen.getByText('▸ explore')).toBeTruthy();
    // 阶段计数
    expect(screen.getByText('· 3 phases')).toBeTruthy();
  });

  it('EX-2: 渲染 phase 卡片（mode、intent、status）', () => {
    render(<ExploreCard message={{ data: MIXED_PHASES }} />);
    // Mode 徽章（sequential 出现 2 次，parallel 1 次）
    const parallelEls = screen.getAllByText(/parallel/);
    expect(parallelEls.length).toBe(1);
    const sequentialEls = screen.getAllByText(/sequential/);
    expect(sequentialEls.length).toBe(2);
    // Intent
    expect(screen.getByText('扫描项目结构')).toBeTruthy();
    expect(screen.getByText('分析依赖关系')).toBeTruthy();
    // Status
    expect(screen.getByText(/done/)).toBeTruthy();
    expect(screen.getByText(/running/)).toBeTruthy();
    expect(screen.getByText(/pending/)).toBeTruthy();
  });

  it('EX-3: phase 显示进度百分比', () => {
    render(<ExploreCard message={{ data: MIXED_PHASES }} />);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('EX-4: 运行中的 phase 显示探索中文本', () => {
    render(<ExploreCard message={{ data: MIXED_PHASES }} />);
    expect(screen.getByText('正在探索中...')).toBeTruthy();
  });

  it('EX-5: 全部 done 时显示完成文本', () => {
    render(<ExploreCard message={{ data: ALL_DONE }} />);
    expect(screen.getByText(/探索完成/)).toBeTruthy();
    expect(screen.getByText(/1\/1 phases/)).toBeTruthy();
  });

  it('EX-6: 单 phase 显示正确的阶段文字', () => {
    render(<ExploreCard message={{ data: ALL_DONE }} />);
    expect(screen.getByText('· 1 phase')).toBeTruthy();
  });
});
