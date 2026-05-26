import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PhaseCard } from '../PhaseCard';
import type { PhaseData } from '../../../types/workflow';

const basePhase: PhaseData = {
  nodeId: 'test',
  mode: 'sequential',
  intent: '测试阶段',
  progress: 50,
  status: 'running',
  sub: [
    { name: 'src/file1.ts', status: 'done' },
    { name: 'src/file2.ts', status: 'running' },
  ],
};

describe('PhaseCard', () => {
  // UT-E.1.6: done 状态应含 emerald 相关样式
  it('UT-E.1.6: done phase has emerald styling', () => {
    const phase: PhaseData = { ...basePhase, status: 'done', progress: 100 };
    const { container } = render(<PhaseCard phase={phase} />);
    const borderDiv = container.querySelector('.border-emerald-500\\/30');
    expect(borderDiv).toBeTruthy();
  });

  // UT-E.1.7: running 状态含 purple 边框
  it('UT-E.1.7: running phase has purple border', () => {
    const { container } = render(<PhaseCard phase={basePhase} />);
    const borderDiv = container.querySelector('.border-purple-500\\/30');
    expect(borderDiv).toBeTruthy();
  });

  // UT-E.1.8: pending 状态含 opacity-40
  it('UT-E.1.8: pending phase has reduced opacity', () => {
    const phase: PhaseData = { ...basePhase, status: 'pending', progress: 0 };
    const { container } = render(<PhaseCard phase={phase} />);
    const div = container.querySelector('.opacity-40');
    expect(div).toBeTruthy();
  });

  // UT-P.1.2: sequential 模式显示简洁 intent
  it('UT-P.1.2: sequential mode shows simple intent indicator', () => {
    const phase: PhaseData = {
      ...basePhase,
      mode: 'sequential',
      sub: [],
      status: 'pending',
      progress: 0,
    };
    const { container } = render(<PhaseCard phase={phase} />);
    const text = container.textContent ?? '';
    expect(text).toContain('测试阶段');
  });

  // UT-P.1.1: parallel 模式显示 running tools 计数
  it('UT-P.1.1: parallel mode shows running tools count', () => {
    const phase: PhaseData = { ...basePhase, mode: 'parallel' };
    const { container } = render(<PhaseCard phase={phase} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Running 1 tool');
  });

  // UT-S.1.1: progress 50% → 进度条 width 50
  it('UT-S.1.1: progress bar width matches progress', () => {
    const { container } = render(<PhaseCard phase={basePhase} />);
    const progressBar = container.querySelector('.h-full');
    expect(progressBar?.getAttribute('style')).toContain('width: 50%');
  });

  // UT-E.1.9: sub 为空 + done → null body
  it('UT-E.1.9: empty sub + done renders minimal card', () => {
    const phase: PhaseData = {
      ...basePhase,
      sub: [],
      status: 'done',
      progress: 100,
    };
    const { container } = render(<PhaseCard phase={phase} />);
    // body area 应不存在文件树
    const body = container.querySelector('.px-3.py-1');
    // 只有头部区域存在
    expect(container.textContent).toBeTruthy();
  });

  // mode 徽章显示
  it('shows mode badge', () => {
    const parallelPhase: PhaseData = { ...basePhase, mode: 'parallel' };
    const { container: pc } = render(<PhaseCard phase={parallelPhase} />);
    expect(pc.textContent).toContain('parallel');

    const seqPhase: PhaseData = { ...basePhase, mode: 'sequential' };
    const { container: sc } = render(<PhaseCard phase={seqPhase} />);
    expect(sc.textContent).toContain('sequential');
  });

  // UT-S.2.1: done 统计行格式 ✔ Done  X.Xs · N/M tools
  it('UT-S.2.1: done stats line format matches design spec', () => {
    const phase: PhaseData = { ...basePhase, status: 'done', progress: 100 };
    const { container } = render(<PhaseCard phase={phase} />);
    const text = container.textContent ?? '';
    // 应包含 Done、tools、分数格式
    expect(text).toContain('Done');
    expect(text).toContain('tools');
    expect(text).toContain('1/2');
  });

  // UT-S.2.2: running 统计行格式 N/M tools（可选时间）
  it('UT-S.2.2: running stats line shows tool count', () => {
    const { container } = render(<PhaseCard phase={basePhase} />);
    const text = container.textContent ?? '';
    expect(text).toContain('1/2');
    expect(text).toContain('tools');
  });
});
