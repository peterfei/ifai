import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ExploreWorkflowView } from '../ExploreWorkflowView';
import type { PhaseData } from '../../../types/workflow';

const mockPhases: PhaseData[] = [
  { nodeId: 'p1', mode: 'sequential', intent: '探索', progress: 100, status: 'done', sub: [] },
  { nodeId: 'p2', mode: 'parallel', intent: '读取', progress: 60, status: 'running', sub: [] },
  { nodeId: 'p3', mode: 'sequential', intent: '分析', progress: 0, status: 'pending', sub: [] },
  { nodeId: 'p4', mode: 'sequential', intent: '报告', progress: 0, status: 'pending', sub: [] },
];

describe('ExploreWorkflowView', () => {
  // UT-E.1.11: 4 个 phase 渲染 4 张卡片
  it('UT-E.1.11: renders 4 phase cards for 4 phases', () => {
    const { container } = render(
      <ExploreWorkflowView phaseData={mockPhases} isRunning />
    );
    const phaseCards = container.querySelectorAll('.phase-card');
    expect(phaseCards).toHaveLength(4);
  });

  // UT-E.1.12: 标题栏显示 phase 计数
  it('UT-E.1.12: shows phase count in summary', () => {
    const { container } = render(
      <ExploreWorkflowView phaseData={mockPhases} isRunning />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('1/4 phases');
  });

  // 全部完成时显示 ✔ all N phases
  it('shows completion summary when all done', () => {
    const allDone = mockPhases.map(p => ({ ...p, status: 'done' as const, progress: 100 }));
    const { container } = render(
      <ExploreWorkflowView phaseData={allDone} isRunning={false} />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('✔ all 4 phases');
  });

  // 空 phaseData 不渲染
  it('renders nothing for empty phaseData', () => {
    const { container } = render(
      <ExploreWorkflowView phaseData={[]} />
    );
    expect(container.textContent).toBe('');
  });

  // UT-P.1.4: 多并行 phase 各自独立渲染
  it('UT-P.1.4: renders all phases independently', () => {
    const mixedPhases: PhaseData[] = [
      { nodeId: 'a', mode: 'parallel', intent: 'A', progress: 100, status: 'done', sub: [] },
      { nodeId: 'b', mode: 'parallel', intent: 'B', progress: 30, status: 'running', sub: [] },
    ];
    const { container } = render(
      <ExploreWorkflowView phaseData={mixedPhases} isRunning />
    );
    const cards = container.querySelectorAll('.phase-card');
    expect(cards).toHaveLength(2);
  });
});
