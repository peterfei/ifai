/**
 * ExploreCard 测试 — 对齐原型 renderExploreView()
 *
 * 测试覆盖：
 * - EX 头像渲染
 * - 标题渲染
 * - Phase 卡片渲染（mode、intent、status）
 * - 进度条渲染
 * - 文件列表树渲染
 * - 入场动画
 * - 多个 phase
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExploreCard } from '../cards/ExploreCard';
import type { ExploreData } from '../../../types/agent-collaboration';

const MOCK_EXPLORE_DATA: ExploreData = {
  phases: [
    {
      mode: 'parallel',
      intent: '扫描项目结构',
      progress: 100,
      status: 'done',
      sub: [
        { name: 'src/components', status: 'done' },
        { name: 'src/stores', status: 'done' },
        { name: 'src/types', status: 'done' },
      ],
    },
    {
      mode: 'sequential',
      intent: '分析依赖关系',
      progress: 60,
      status: 'running',
      sub: [
        { name: 'package.json', status: 'done' },
        { name: 'tsconfig.json', status: 'running' },
        { name: 'vite.config.ts', status: 'pending' },
      ],
    },
    {
      mode: 'parallel',
      intent: '生成报告',
      progress: 0,
      status: 'pending',
      sub: [
        { name: 'report.md', status: 'pending' },
      ],
    },
  ],
};

function makeMessage(data: ExploreData) {
  return { id: 'test-ex', role: 'assistant' as const, content: '', timestamp: Date.now(), data };
}

describe('ExploreCard', () => {
  /* ===== EX 头像 ===== */

  it('EX-1: 应渲染 EX 头像', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    render(<ExploreCard message={msg} />);

    expect(screen.getByText('EX')).toBeTruthy();
  });

  /* ===== 标题 ===== */

  it('EX-2: 应渲染标题行', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    render(<ExploreCard message={msg} />);

    expect(screen.getByText(/explore/)).toBeTruthy();
  });

  /* ===== Phase 渲染 ===== */

  it('EX-3: 应渲染所有 phase', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    render(<ExploreCard message={msg} />);

    for (const phase of MOCK_EXPLORE_DATA.phases) {
      expect(screen.getByText(phase.intent)).toBeTruthy();
    }
  });

  it('EX-4: 应显示每个 phase 的状态徽章', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    render(<ExploreCard message={msg} />);

    // done phase 有 "完成" 或 "done" 文本
    expect(screen.getByText(/done/)).toBeTruthy();
    // running phase 有进度文本 "60%"
    expect(screen.getByText('60%')).toBeTruthy();
  });

  /* ===== 文件列表 ===== */

  it('EX-5: 应渲染每个 phase 的文件列表', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    render(<ExploreCard message={msg} />);

    // 检查所有文件名都渲染了
    for (const phase of MOCK_EXPLORE_DATA.phases) {
      for (const sub of phase.sub) {
        expect(screen.getByText(sub.name)).toBeTruthy();
      }
    }
  });

  /* ===== 进度条 ===== */

  it('EX-6: 应渲染每个 phase 的进度条', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    const { container } = render(<ExploreCard message={msg} />);

    // 进度条 div 应存在
    const progressBars = container.querySelectorAll('[class*="rounded-full"].overflow-hidden');
    // 至少有一个进度条
    expect(progressBars.length).toBeGreaterThanOrEqual(3);
  });

  /* ===== 入场动画 ===== */

  it('EX-7: 容器包含 animate-slide-in 入场动画 class', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    const { container } = render(<ExploreCard message={msg} />);

    expect(container.firstChild).toHaveClass('animate-slide-in');
  });

  /* ===== Mode 徽章 ===== */

  it('EX-8: 应显示 mode 徽章（parallel/sequential）', () => {
    const msg = makeMessage(MOCK_EXPLORE_DATA);
    render(<ExploreCard message={msg} />);

    // parallel 和 sequential 文本应在页面中
    const allText = document.body.textContent || '';
    expect(allText).toContain('parallel');
    expect(allText).toContain('sequential');
  });

  /* ===== 单 phase（无子文件） ===== */

  const SINGLE_PHASE_DATA: ExploreData = {
    phases: [
      {
        mode: 'sequential',
        intent: '执行单一扫描',
        progress: 100,
        status: 'done',
        sub: [],
      },
    ],
  };

  it('EX-9: 单 phase 无子文件时正常渲染', () => {
    const msg = makeMessage(SINGLE_PHASE_DATA);
    render(<ExploreCard message={msg} />);

    expect(screen.getByText('EX')).toBeTruthy();
    expect(screen.getByText('执行单一扫描')).toBeTruthy();
  });
});
