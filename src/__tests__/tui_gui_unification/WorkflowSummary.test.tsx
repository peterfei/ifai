import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WorkflowSummary } from '../../components/workflow/WorkflowSummary';
import type { WorkflowData } from '../../types/workflow';

const mockData = (overrides?: Partial<WorkflowData>): WorkflowData => ({
  workflowId: 'w1',
  intent: '分析项目架构',
  nodes: [{ nodeId: 'n1', agentType: 'Explore', intent: '扫描', status: 'done', tools: [], elapsedSecs: 1.2, totalTokens: 6000 }],
  totalElapsedSecs: 1.2,
  totalTokens: 6000,
  totalTools: 5,
  status: 'done',
  ...overrides,
});

describe('WorkflowSummary', () => {
  // UT-W.1.4: 汇总行格式
  it('UT-W.1.4: shows workflow summary format', () => {
    const { container } = render(<WorkflowSummary data={mockData()} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/✔ Workflow complete  \d+\.\ds · \d+\/\d+ tools · \d+\.\dk tokens/);
  });

  // UT-W.1.5: running 态
  it('UT-W.1.5: running status shows ▸', () => {
    const { container } = render(<WorkflowSummary data={mockData({ status: 'running', totalElapsedSecs: 0.5, totalTools: 2 })} />);
    const text = container.textContent ?? '';
    expect(text).toContain('▸');
    expect(text).toContain('Running');
  });
});
