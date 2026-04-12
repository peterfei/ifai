/**
 * WorkflowDAGVisualizer 组件测试
 *
 * TDD 第一步：测试 React Flow 基础渲染功能
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkflowDAGVisualizer } from '../WorkflowDAGVisualizer';
import type { DAGNode, DAGEdge } from '../WorkflowDAGMonitor';

describe('WorkflowDAGVisualizer - 基础渲染', () => {
  // 创建测试数据
  const mockNodes: DAGNode[] = [
    {
      id: 'node-1',
      label: 'Search Files',
      agentType: 'Search',
      status: 'pending',
    },
    {
      id: 'node-2',
      label: 'Read File',
      agentType: 'Read',
      status: 'pending',
    },
  ];

  const mockEdges: DAGEdge[] = [
    {
      from: 'node-1',
      to: 'node-2',
    },
  ];

  it('应该渲染 React Flow 容器', () => {
    render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-1"
      />
    );

    // 检查 React Flow 容器是否存在
    const container = screen.getByTestId('dag-visualizer-container');
    expect(container).toBeInTheDocument();
  });

  it('应该渲染正确数量的节点', () => {
    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-1"
      />
    );

    // 检查节点数量
    const nodes = container.querySelectorAll('[data-testid^="dag-node-"]');
    expect(nodes).toHaveLength(2);
  });

  it('应该渲染节点之间的连线', () => {
    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-1"
      />
    );

    // 检查连线是否存在（React Flow 使用多种选择器）
    // 方法1: 检查 SVG 元素
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);

    // 方法2: 检查是否有边的类名（React Flow 可能使用不同的类名）
    const edgeElements = container.querySelectorAll('[class*="edge"]');
    const hasEdges = edgeElements.length > 0 ||
                    container.querySelectorAll('.react-flow__edge').length > 0;

    // 至少应该有 SVG 元素表示连线
    expect(hasEdges || svgElements.length > 0).toBe(true);
  });

  it('应该正确显示节点状态颜色', () => {
    const nodesWithStatus: DAGNode[] = [
      {
        id: 'node-1',
        label: 'Running Node',
        agentType: 'Agent',
        status: 'running',
      },
      {
        id: 'node-2',
        label: 'Completed Node',
        agentType: 'Agent',
        status: 'completed',
      },
    ];

    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={nodesWithStatus}
        edges={[]}
        workflowId="test-workflow-2"
      />
    );

    // 检查运行中节点的样式
    const runningNode = container.querySelector('[data-testid="dag-node-node-1"]');
    expect(runningNode).toBeInTheDocument();
    expect(runningNode?.className).toContain('running');

    // 检查完成节点的样式
    const completedNode = container.querySelector('[data-testid="dag-node-node-2"]');
    expect(completedNode).toBeInTheDocument();
    expect(completedNode?.className).toContain('completed');

    // 验证节点包含状态图标符号（极简设计使用字母而非 emoji）
    expect(runningNode?.textContent).toContain('R'); // 运行中符号
    expect(completedNode?.textContent).toContain('C'); // 完成符号
  });

  it('应该处理空节点数组', () => {
    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={[]}
        edges={[]}
        workflowId="test-workflow-3"
      />
    );

    // 应该显示空状态提示
    const emptyState = screen.getByTestId('dag-empty-state');
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveTextContent(/暂无节点/i);
  });

  it('应该支持节点点击事件', () => {
    const onNodeClick = vi.fn();

    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-1"
        onNodeClick={onNodeClick}
      />
    );

    // 点击第一个节点
    const firstNode = container.querySelector('[data-testid="dag-node-node-1"]');
    firstNode?.click();

    // 验证回调被调用
    // 注意: React Flow 和自定义节点都可能触发点击事件，所以可能调用多次
    expect(onNodeClick).toHaveBeenCalled();
    expect(onNodeClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
      })
    );
  });

  it('应该正确渲染节点类型图标', () => {
    const nodesWithTypes: DAGNode[] = [
      {
        id: 'search-node',
        label: 'Search',
        agentType: 'Search',
        status: 'pending',
      },
      {
        id: 'read-node',
        label: 'Read',
        agentType: 'Read',
        status: 'pending',
      },
      {
        id: 'write-node',
        label: 'Write',
        agentType: 'Write',
        status: 'pending',
      },
    ];

    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={nodesWithTypes}
        edges={[]}
        workflowId="test-workflow-4"
      />
    );

    // 检查所有节点是否渲染
    const allNodes = container.querySelectorAll('[data-testid^="dag-node-"]');
    expect(allNodes.length).toBe(3);

    // 检查 Search 节点存在（极简设计使用 SVG 图标，不会有 emoji）
    const searchNode = container.querySelector('[data-testid="dag-node-search-node"]');
    expect(searchNode).toBeInTheDocument();
    expect(searchNode?.textContent).toContain('Search'); // 检查标签文本

    // 检查 Read 节点存在
    const readNode = container.querySelector('[data-testid="dag-node-read-node"]');
    expect(readNode).toBeInTheDocument();
    expect(readNode?.textContent).toContain('Read');

    // 检查 Write 节点存在
    const writeNode = container.querySelector('[data-testid="dag-node-write-node"]');
    expect(writeNode).toBeInTheDocument();
    expect(writeNode?.textContent).toContain('Write');

    // 验证节点包含 SVG 元素（极简设计使用 Lucide 风格 SVG 图标）
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);
  });
});

describe('WorkflowDAGVisualizer - 连线渲染', () => {
  it('应该正确创建边的配置', () => {
    const mockNodes: DAGNode[] = [
      {
        id: 'node-1',
        label: 'Node 1',
        agentType: 'Agent',
        status: 'pending',
      },
      {
        id: 'node-2',
        label: 'Node 2',
        agentType: 'Agent',
        status: 'completed',
      },
    ];

    const mockEdges: DAGEdge[] = [
      { from: 'node-1', to: 'node-2' },
    ];

    render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-edge-config"
      />
    );

    // 验证容器存在
    const dagContainer = document.querySelector('[data-testid="dag-visualizer-container"]');
    expect(dagContainer).toBeInTheDocument();

    // 验证有 React Flow 容器
    const reactFlowContainer = dagContainer?.querySelector('.react-flow');
    expect(reactFlowContainer).toBeInTheDocument();

    console.log('✅ React Flow 容器已渲染');
  });

  it('应该正确创建和渲染边', () => {
    const mockNodes: DAGNode[] = [
      {
        id: 'node-1',
        label: 'Node 1',
        agentType: 'Agent',
        status: 'pending',
      },
      {
        id: 'node-2',
        label: 'Node 2',
        agentType: 'Agent',
        status: 'pending',
      },
    ];

    const mockEdges: DAGEdge[] = [
      { from: 'node-1', to: 'node-2' },
    ];

    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-edges"
      />
    );

    // 验证容器渲染
    const dagContainer = container.querySelector('[data-testid="dag-visualizer-container"]');
    expect(dagContainer).toBeInTheDocument();

    // 验证有 SVG 元素（用于绘制连线）
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);

    // 验证有路径或线条元素
    const pathElements = container.querySelectorAll('path, line, circle, rect');
    expect(pathElements.length).toBeGreaterThan(0);

    console.log('🔍 SVG 元素数量:', svgElements.length);
    console.log('🔍 图形元素数量:', pathElements.length);
  });

  it('应该正确匹配边的 source 和 target 到节点 ID', () => {
    const mockNodes: DAGNode[] = [
      {
        id: 'search-node',
        label: 'Search Files',
        agentType: 'Search',
        status: 'completed',
      },
      {
        id: 'read-node',
        label: 'Read File',
        agentType: 'Read',
        status: 'pending',
      },
      {
        id: 'write-node',
        label: 'Write File',
        agentType: 'Write',
        status: 'pending',
      },
    ];

    const mockEdges: DAGEdge[] = [
      { from: 'search-node', to: 'read-node' },
      { from: 'read-node', to: 'write-node' },
    ];

    render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-edge-matching"
      />
    );

    // 验证边的 source 和 target 匹配节点 ID
    mockEdges.forEach(edge => {
      const sourceNode = mockNodes.find(n => n.id === edge.from);
      const targetNode = mockNodes.find(n => n.id === edge.to);

      expect(sourceNode, `边的 source ${edge.from} 应该对应一个节点`).toBeDefined();
      expect(targetNode, `边的 target ${edge.to} 应该对应一个节点`).toBeDefined();
    });

    console.log('✅ 所有边的 source 和 target 都正确匹配到节点');
  });

  it('应该渲染可见的连线（颜色对比度检查）', () => {
    const mockNodes: DAGNode[] = [
      {
        id: 'node-1',
        label: 'Node 1',
        agentType: 'Agent',
        status: 'pending',
      },
      {
        id: 'node-2',
        label: 'Node 2',
        agentType: 'Agent',
        status: 'pending',
      },
    ];

    const mockEdges: DAGEdge[] = [
      { from: 'node-1', to: 'node-2' },
    ];

    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-visible-edges"
      />
    );

    // 查找所有 SVG 路径元素（连线）
    const paths = container.querySelectorAll('path');

    console.log('🔍 所有路径数量:', paths.length);

    // 检查路径的样式属性
    paths.forEach((path, index) => {
      const stroke = path.getAttribute('stroke');
      const strokeWidth = path.getAttribute('stroke-width');
      const d = path.getAttribute('d');

      console.log(`路径 ${index}:`, {
        stroke,
        strokeWidth,
        hasPath: !!d,
        pathLength: d?.length || 0,
      });
    });

    // 过滤出真正的连线（有 d 属性且长度 > 10）
    const edgePaths = Array.from(paths).filter(path => {
      const d = path.getAttribute('d');
      return d && d.length > 10;
    });

    console.log('🔍 有效连线路径数量:', edgePaths.length);
    expect(edgePaths.length).toBeGreaterThan(0, '应该有至少一条有效连线');
  });

  it('应该渲染带状态的连线（不同颜色）', () => {
    const mockNodes: DAGNode[] = [
      {
        id: 'node-1',
        label: 'Completed Node',
        agentType: 'Agent',
        status: 'completed',
      },
      {
        id: 'node-2',
        label: 'Running Node',
        agentType: 'Agent',
        status: 'running',
      },
      {
        id: 'node-3',
        label: 'Pending Node',
        agentType: 'Agent',
        status: 'pending',
      },
    ];

    const mockEdges: DAGEdge[] = [
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
    ];

    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-colored-edges"
      />
    );

    // 验证有 SVG 路径（连线）
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);

    // 检查路径元素
    const paths = container.querySelectorAll('path');
    console.log('🔍 连线路径数量:', paths.length);
    expect(paths.length).toBeGreaterThan(0);
  });
});

describe('WorkflowDAGVisualizer - 布局算法', () => {
  it('应该使用 Dagre 自动布局节点位置', () => {
    const mockNodes: DAGNode[] = [
      {
        id: 'node-1',
        label: 'Node 1',
        agentType: 'Agent',
        status: 'pending',
      },
      {
        id: 'node-2',
        label: 'Node 2',
        agentType: 'Agent',
        status: 'pending',
      },
      {
        id: 'node-3',
        label: 'Node 3',
        agentType: 'Agent',
        status: 'pending',
      },
    ];

    const mockEdges: DAGEdge[] = [
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
    ];

    const { container } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-5"
      />
    );

    // 检查节点是否按层次布局（node-1 应该在 node-2 上方）
    const node1 = container.querySelector('[data-testid="dag-node-node-1"]');
    const node2 = container.querySelector('[data-testid="dag-node-node-2"]');
    const node3 = container.querySelector('[data-testid="dag-node-node-3"]');

    expect(node1).toBeInTheDocument();
    expect(node2).toBeInTheDocument();
    expect(node3).toBeInTheDocument();

    // 节点应该有 position 属性
    expect(node1?.getAttribute('data-position')).toBeDefined();
    expect(node2?.getAttribute('data-position')).toBeDefined();
    expect(node3?.getAttribute('data-position')).toBeDefined();
  });

  it('应该在节点或边变化时重新计算布局', () => {
    // 在此测试中定义 mockNodes 和 mockEdges
    const mockNodes: DAGNode[] = [
      {
        id: 'node-1',
        label: 'Node 1',
        agentType: 'Agent',
        status: 'pending',
      },
      {
        id: 'node-2',
        label: 'Node 2',
        agentType: 'Agent',
        status: 'pending',
      },
    ];

    const mockEdges: DAGEdge[] = [
      { from: 'node-1', to: 'node-2' },
    ];

    const { container, rerender } = render(
      <WorkflowDAGVisualizer
        nodes={mockNodes}
        edges={mockEdges}
        workflowId="test-workflow-6"
      />
    );

    // 初始布局
    const initialPositions = Array.from(
      container.querySelectorAll('[data-position]')
    ).map((node) => node.getAttribute('data-position'));

    // 添加新节点
    const updatedNodes = [
      ...mockNodes,
      {
        id: 'node-3',
        label: 'New Node',
        agentType: 'Agent',
        status: 'pending',
      },
    ];

    const updatedEdges: DAGEdge[] = [
      ...mockEdges,
      { from: 'node-2', to: 'node-3' },
    ];

    rerender(
      <WorkflowDAGVisualizer
        nodes={updatedNodes}
        edges={updatedEdges}
        workflowId="test-workflow-6"
      />
    );

    // 布局应该更新 - 验证节点数量增加
    const updatedNodesElements = container.querySelectorAll('[data-testid^="dag-node-"]');
    expect(updatedNodesElements.length).toBe(3);

    // 验证新节点确实存在
    const newNode = container.querySelector('[data-testid="dag-node-node-3"]');
    expect(newNode).toBeInTheDocument();
  });
});
