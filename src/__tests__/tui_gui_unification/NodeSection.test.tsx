import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NodeSection } from '../../components/workflow/NodeSection';
import type { NodeData } from '../../types/workflow';

const runningNode = (overrides?: Partial<NodeData>): NodeData => ({
  nodeId: 'n1',
  agentType: 'Explore',
  intent: '结构分析',
  status: 'running',
  tools: [
    { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
    { toolName: 'grep', status: 'running', elapsedSecs: 0.15, target: 'src/lib.rs' },
  ],
  elapsedSecs: 0.17,
  totalTokens: 100,
  ...overrides,
});

describe('NodeSection', () => {
  // UT-N.1.1: 节点标题
  it('UT-N.1.1: shows node title with brackets', () => {
    const { container } = render(<NodeSection node={runningNode()} />);
    expect(container.textContent).toContain('▸ [结构分析]');
  });

  // UT-N.1.2: 运行指示
  it('UT-N.1.2: shows running tools count', () => {
    const { container } = render(<NodeSection node={runningNode()} />);
    expect(container.textContent).toContain('▸ Running 1 tool');
  });

  // UT-N.1.3: 工具列表按序
  it('UT-N.1.3: renders tool list', () => {
    const { container } = render(<NodeSection node={runningNode()} />);
    expect(container.textContent).toContain('read_file');
    expect(container.textContent).toContain('grep');
  });

  // UT-N.1.8: 多工具连接符
  it('UT-N.1.8: uses correct connectors', () => {
    const { container } = render(<NodeSection node={runningNode()} />);
    expect(container.textContent).toContain('├─');
    expect(container.textContent).toContain('└─');
  });

  // UT-N.1.4: 无工具显示 waiting
  it('UT-N.1.4: shows waiting when no tools', () => {
    const node: NodeData = {
      nodeId: 'n1', agentType: 'Explore', intent: '依赖分析',
      status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0,
    };
    const { container } = render(<NodeSection node={node} />);
    expect(container.textContent).toContain('⏳');
  });

  // UT-N.1.5: done 显示统计行
  it('UT-N.1.5: done state shows stats line', () => {
    const tools = [
      { toolName: 'read_file', status: 'done' as const, elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
      { toolName: 'grep', status: 'done' as const, elapsedSecs: 0.15, target: 'src/lib.rs' },
    ];
    const node = runningNode({ status: 'done', elapsedSecs: 0.5, totalTokens: 200, tools });
    const { container } = render(<NodeSection node={node} />);
    const text = container.textContent ?? '';
    expect(text).toContain('✔');
    expect(text).toContain('Done');
    expect(text).toContain('2/2 tools');
  });

  // UT-N.1.7: pending 简洁
  it('UT-N.1.7: pending shows minimal info', () => {
    const node: NodeData = {
      nodeId: 'n1', agentType: 'Explore', intent: '依赖分析',
      status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0,
    };
    const { container } = render(<NodeSection node={node} />);
    expect(container.textContent).toContain('依赖分析');
  });
});
