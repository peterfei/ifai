import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ExploreWorkflowView } from '../../components/workflow/ExploreWorkflowView';
import type { WorkflowData } from '../../types/workflow';

const mockNode = (overrides?: Partial<WorkflowData['nodes'][0]>): WorkflowData['nodes'][0] => ({
  nodeId: 'n1',
  agentType: 'Explore',
  intent: '结构分析',
  status: 'done',
  tools: [
    { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
    { toolName: 'grep', status: 'done', elapsedSecs: 0.15, target: 'src/lib.rs', tokenCount: 50 },
  ],
  elapsedSecs: 0.17,
  totalTokens: 150,
  ...overrides,
});

const mockData = (overrides?: Partial<WorkflowData>): WorkflowData => ({
  workflowId: 'w1',
  intent: '分析项目架构',
  nodes: [mockNode(), mockNode({ nodeId: 'n2', intent: '依赖分析', status: 'running', tools: [{ toolName: 'grep', status: 'running', elapsedSecs: 0.1, target: 'Cargo.toml' }], elapsedSecs: 0.1, totalTokens: 50 })],
  totalElapsedSecs: 0.27,
  totalTokens: 200,
  totalTools: 3,
  status: 'running',
  ...overrides,
});

describe('ExploreWorkflowView', () => {
  // UT-E.1.1: 空数据
  it('UT-E.1.1: returns null for null/undefined/empty data', () => {
    const { container: c1 } = render(<ExploreWorkflowView workflowData={null as unknown as WorkflowData} />);
    expect(c1.textContent).toBe('');

    const { container: c2 } = render(<ExploreWorkflowView workflowData={undefined as unknown as WorkflowData} />);
    expect(c2.textContent).toBe('');

    const { container: c3 } = render(<ExploreWorkflowView workflowData={{ ...mockData(), nodes: [] }} />);
    expect(c3.textContent).toBe('');
  });

  // UT-E.1.2: 2 节点完整渲染
  it('UT-E.1.2: renders header + 2 sections + summary for 2 nodes', () => {
    const { container } = render(<ExploreWorkflowView workflowData={mockData()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('分析项目架构');
    expect(text).toContain('结构分析');
    expect(text).toContain('依赖分析');
    expect(text).toContain('Running');
    expect(text).toContain('3 tools');
  });

  // UT-E.1.3: 节点独立性
  it('UT-E.1.3: nodes render independently with different statuses', () => {
    const data = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '已完成节点', status: 'done', tools: [{ toolName: 'scan', status: 'done', elapsedSecs: 0.5, target: 'src/', tokenCount: 100 }], elapsedSecs: 0.5, totalTokens: 100 }),
        mockNode({ nodeId: 'n2', intent: '运行中节点', status: 'running', tools: [{ toolName: 'grep', status: 'running', elapsedSecs: 0.3, target: '*.ts' }], elapsedSecs: 0.3, totalTokens: 0 }),
        mockNode({ nodeId: 'n3', intent: '待处理节点', status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0 }),
      ],
    });
    const { container } = render(<ExploreWorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('已完成节点');
    expect(text).toContain('运行中节点');
    expect(text).toContain('待处理节点');
    expect(text).toContain('✔');
    expect(text).toContain('⏳');
  });

  // UT-E.1.4: 1 节点渲染
  it('UT-E.1.4: renders correctly with single node', () => {
    const data = mockData({ nodes: [mockNode()], status: 'done', totalTools: 2 });
    const { container } = render(<ExploreWorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('分析项目架构');
    expect(text).toContain('结构分析');
    expect(text).toContain('Workflow complete');
  });

  // IT-E.2.1: 事件驱动工具更新（模拟数据流）
  it('IT-E.2.1: renders updated tools when workflowData changes', () => {
    const { container, rerender } = render(<ExploreWorkflowView workflowData={mockData()} />);
    expect(container.textContent).toContain('read_file');
    expect(container.textContent).toContain('grep');

    // 模拟新增工具后的重新渲染
    const updatedData = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '结构分析', status: 'running', tools: [
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
          { toolName: 'grep', status: 'running', elapsedSecs: 0.15, target: 'src/lib.rs' },
          { toolName: 'scan_project', status: 'running', elapsedSecs: 0.5, target: 'scanning...' },
        ], elapsedSecs: 0.67, totalTokens: 100 }),
        mockNode({ nodeId: 'n2', intent: '依赖分析', status: 'running', tools: [{ toolName: 'grep', status: 'running', elapsedSecs: 0.1, target: 'Cargo.toml' }], elapsedSecs: 0.1, totalTokens: 50 }),
      ],
      totalTools: 4,
      totalElapsedSecs: 0.77,
    });
    rerender(<ExploreWorkflowView workflowData={updatedData} />);
    expect(container.textContent).toContain('scan_project');
    expect(container.textContent).toMatch(/4 tools/);
  });

  // IT-E.2.2: 逐步完成验证
  it('IT-E.2.2: progressive completion changes states correctly', () => {
    // Step 1: all running
    const step1 = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '扫描', status: 'running', tools: [
          { toolName: 'scan', status: 'running', elapsedSecs: 0.1, target: 'src/' },
        ], elapsedSecs: 0.1, totalTokens: 0 }),
      ],
      status: 'running',
      totalTools: 1,
      totalElapsedSecs: 0.1,
    });
    const { container, rerender } = render(<ExploreWorkflowView workflowData={step1} />);
    expect(container.textContent).toContain('Running');
    expect(container.textContent).toContain('scan');

    // Step 2: tool done, node still running (other tools pending)
    const step2 = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '扫描', status: 'running', tools: [
          { toolName: 'scan', status: 'done', elapsedSecs: 0.5, target: 'src/', tokenCount: 200 },
          { toolName: 'analyze', status: 'running', elapsedSecs: 0.2, target: 'src/main.rs' },
        ], elapsedSecs: 0.7, totalTokens: 200 }),
      ],
      status: 'running',
      totalTools: 2,
      totalElapsedSecs: 0.7,
    });
    rerender(<ExploreWorkflowView workflowData={step2} />);
    expect(container.textContent).toContain('analyze');
    expect(container.textContent).toContain('Running');

    // Step 3: all done
    const step3 = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '扫描', status: 'done', tools: [
          { toolName: 'scan', status: 'done', elapsedSecs: 0.5, target: 'src/', tokenCount: 200 },
          { toolName: 'analyze', status: 'done', elapsedSecs: 0.8, target: 'src/main.rs', tokenCount: 300 },
        ], elapsedSecs: 1.3, totalTokens: 500 }),
      ],
      status: 'done',
      totalTools: 2,
      totalElapsedSecs: 1.3,
      totalTokens: 500,
    });
    rerender(<ExploreWorkflowView workflowData={step3} />);
    expect(container.textContent).toContain('Workflow complete');
    expect(container.textContent).toContain('2 tools');
  });
});
