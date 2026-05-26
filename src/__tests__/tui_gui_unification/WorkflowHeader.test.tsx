import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WorkflowHeader } from '../../components/workflow/WorkflowHeader';
import type { NodeData } from '../../types/workflow';

describe('WorkflowHeader', () => {
  // UT-W.1.1: 标题行
  it('UT-W.1.1: shows workflow intent', () => {
    const nodes: NodeData[] = [];
    const { container } = render(<WorkflowHeader intent="分析项目架构" nodes={nodes} />);
    expect(container.textContent).toContain('▸ 分析项目架构');
  });

  // UT-W.1.2: 子节点列表
  it('UT-W.1.2: shows child node list with connectors', () => {
    const nodes: NodeData[] = [
      { nodeId: 'n1', agentType: 'Explore', intent: '结构分析', status: 'running', tools: [], elapsedSecs: 0, totalTokens: 0 },
      { nodeId: 'n2', agentType: 'Explore', intent: '依赖分析', status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0 },
    ];
    const { container } = render(<WorkflowHeader intent="分析项目架构" nodes={nodes} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Explore [结构分析]');
    expect(text).toContain('Explore [依赖分析]');
    expect(text).toContain('├─');
    expect(text).toContain('└─');
  });

  // UT-W.1.3: 单子节点
  it('UT-W.1.3: single child node', () => {
    const nodes: NodeData[] = [
      { nodeId: 'n1', agentType: 'Explore', intent: '扫描', status: 'running', tools: [], elapsedSecs: 0, totalTokens: 0 },
    ];
    const { container } = render(<WorkflowHeader intent="单任务" nodes={nodes} />);
    expect(container.textContent).toContain('Explore [扫描]');
  });

  // UT-W.1.6: 空子节点列表
  it('UT-W.1.6: empty nodes hide child list', () => {
    const { container } = render(<WorkflowHeader intent="无节点" nodes={[]} />);
    expect(container.textContent).not.toContain('├─');
    expect(container.textContent).not.toContain('└─');
  });
});
