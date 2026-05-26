import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WorkflowView } from '../WorkflowView';
import type { WorkflowData } from '../../../types/workflow';

const mockNode = (overrides?: Partial<WorkflowData['nodes'][0]>): WorkflowData['nodes'][0] => ({
  nodeId: 'n1',
  agentType: 'Explore',
  intent: '测试',
  status: 'done',
  tools: [
    { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
  ],
  elapsedSecs: 0.02,
  totalTokens: 100,
  ...overrides,
});

const mockData = (overrides?: Partial<WorkflowData>): WorkflowData => ({
  workflowId: 'w1',
  intent: '测试工作流',
  nodes: [mockNode(), mockNode({ nodeId: 'n2', intent: '子任务', status: 'running', tools: [], elapsedSecs: 0, totalTokens: 0 })],
  totalElapsedSecs: 0.02,
  totalTokens: 100,
  totalTools: 1,
  status: 'running',
  ...overrides,
});

describe('WorkflowView', () => {
  it('renders nothing for empty/undefined data', () => {
    const { container: c1 } = render(<WorkflowView workflowData={null as unknown as WorkflowData} />);
    expect(c1.textContent).toBe('');

    const { container: c2 } = render(<WorkflowView workflowData={undefined as unknown as WorkflowData} />);
    expect(c2.textContent).toBe('');

    const { container: c3 } = render(<WorkflowView workflowData={{ ...mockData(), nodes: [] }} />);
    expect(c3.textContent).toBe('');
  });

  it('shows workflow intent and nodes', () => {
    const { container } = render(<WorkflowView workflowData={mockData()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('测试工作流');
    expect(text).toContain('测试');
    expect(text).toContain('子任务');
  });

  it('all done shows completion summary', () => {
    const allDone = mockData({
      nodes: [mockNode()],
      status: 'done',
      totalTools: 1,
    });
    const { container } = render(<WorkflowView workflowData={allDone} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Workflow complete');
  });

  it('renders all nodes independently', () => {
    const data = mockData({
      nodes: [
        mockNode({ nodeId: 'a', intent: 'A', status: 'done' }),
        mockNode({ nodeId: 'b', intent: 'B', status: 'running' }),
      ],
    });
    const { container } = render(<WorkflowView workflowData={data} />);
    const cards = container.querySelectorAll('[class*="ml-2"]');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('B');
  });
});
