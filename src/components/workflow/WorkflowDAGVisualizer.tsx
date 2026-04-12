/**
 * WorkflowDAGVisualizer - 工作流 DAG 可视化组件
 *
 * 工业级极简设计 - 参考 GitHub Actions, GitLab CI, Figma
 */

import React, { useMemo, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  Position,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

import type { DAGNode, DAGEdge } from './WorkflowDAGMonitor';

// ==================== 类型定义 ====================

interface WorkflowDAGVisualizerProps {
  nodes: DAGNode[];
  edges: DAGEdge[];
  workflowId: string;
  onNodeClick?: (node: DAGNode) => void;
}

// ==================== 极简配色方案 ====================

/** 状态颜色 - 参考 GitHub Actions */
const STATUS_STYLES = {
  pending: { color: '#9CA3AF', bg: '#F3F4F6', icon: 'P' },
  running: { color: '#3B82F6', bg: '#EFF6FF', icon: 'R' },
  completed: { color: '#10B981', bg: '#ECFDF5', icon: 'C' },
  failed: { color: '#EF4444', bg: '#FEF2F2', icon: 'F' },
  skipped: { color: '#9CA3AF', bg: '#F3F4F6', icon: 'S' },
};

/** 节点类型 - 参考 GitLab CI */
const NODE_STYLES: Record<string, { color: string; icon: string }> = {
  'Search': { color: '#3B82F6', icon: 'search' },
  'Read': { color: '#10B981', icon: 'file-text' },
  'Write': { color: '#F59E0B', icon: 'edit' },
  'Agent': { color: '#8B5CF6', icon: 'bot' },
  'Command': { color: '#EC4899', icon: 'terminal' },
  'Explore': { color: '#3B82F6', icon: 'compass' },
  'Review': { color: '#06B6D4', icon: 'eye' },
  'Refactor': { color: '#F59E0B', icon: 'refresh-cw' },
  'Test': { color: '#84CC16', icon: 'check-circle' },
  'Build': { color: '#F97316', icon: 'box' },
  'Deploy': { color: '#14B8A6', icon: 'rocket' },
};

// ==================== 布局配置 ====================

const LAYOUT_CONFIG = {
  rankdir: 'TB' as const,
  nodesep: 50,
  ranksep: 80,
  edgesep: 25,
};

// ==================== 辅助函数 ====================

function parseNodeType(nodeId: string, label: string): string {
  const lowerLabel = label.toLowerCase();

  if (lowerLabel.includes('search') || lowerLabel.includes('探索') || lowerLabel.includes('搜索')) return 'Search';
  if (lowerLabel.includes('read') || lowerLabel.includes('读取')) return 'Read';
  if (lowerLabel.includes('write') || lowerLabel.includes('写入') || lowerLabel.includes('生成')) return 'Write';
  if (lowerLabel.includes('agent') || lowerLabel.includes('代理') || lowerLabel.includes('分析')) return 'Agent';
  if (lowerLabel.includes('command') || lowerLabel.includes('命令')) return 'Command';
  if (lowerLabel.includes('review') || lowerLabel.includes('审查')) return 'Review';
  if (lowerLabel.includes('refactor') || lowerLabel.includes('重构')) return 'Refactor';
  if (lowerLabel.includes('test') || lowerLabel.includes('测试')) return 'Test';
  if (lowerLabel.includes('build') || lowerLabel.includes('构建')) return 'Build';
  if (lowerLabel.includes('deploy') || lowerLabel.includes('部署')) return 'Deploy';

  if (nodeId.includes('Search') || nodeId.includes('explore')) return 'Search';
  if (nodeId.includes('Read')) return 'Read';
  if (nodeId.includes('Write')) return 'Write';
  if (nodeId.includes('Agent')) return 'Agent';

  return 'Command';
}

function getNodeTypeStyle(nodeId: string, label: string) {
  const nodeType = parseNodeType(nodeId, label);
  return NODE_STYLES[nodeType] || NODE_STYLES['Command'];
}

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' | 'BT' | 'RL' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: LAYOUT_CONFIG.nodesep,
    ranksep: LAYOUT_CONFIG.ranksep,
    edgesep: LAYOUT_CONFIG.edgesep,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 64 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ==================== SVG 图标组件 ====================

const Icons = {
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  'file-text': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      <path d="m15 5 4 4" />
    </svg>
  ),
  bot: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" x2="16" y1="16" y2="16" />
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 11" />
      <line x1="12" y1="19" x2="20" y2="19" />
      <line x1="4" y1="5" x2="20" y2="5" />
    </svg>
  ),
  compass: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eye: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 3 7 10 7" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  'refresh-cw': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  'check-circle': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  box: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  rocket: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s4.5-3.74 6.5-6" />
      <path d="M12 15.75a5.25 5.25 0 0 1-7.5-7.5" />
      <path d="M15.5 10l5-5-5-5" />
      <path d="M15.5 4.5V10" />
    </svg>
  ),
};

// ==================== 极简节点组件 ====================

interface CustomNodeData {
  label: string;
  iconKey: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  nodeColor: string;
  statusStyle: typeof STATUS_STYLES[keyof typeof STATUS_STYLES];
  originalNode: DAGNode;
  onNodeClick?: (node: DAGNode) => void;
}

function CustomNode({ data }: { data: CustomNodeData }) {
  const IconSvg = Icons[data.iconKey as keyof typeof Icons];

  return (
    <div
      data-testid={`dag-node-${data.originalNode.id}`}
      onClick={() => data.onNodeClick?.(data.originalNode)}
      style={{
        width: '180px',
        height: '64px',
        background: '#1F2937', // gray-800
        border: '1px solid #374151', // gray-700
        borderRadius: '8px',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '10px',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#4B5563'; // gray-600
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#374151';
        e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
      }}
      className={`dag-node dag-node-${data.status}`}
    >
      {/* 左侧状态条 - IfAI 风格 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '6px',
          bottom: '6px',
          width: '2px',
          background: data.statusStyle.color,
          borderRadius: '1px',
        }}
      />

      {/* 图标 */}
      <div
        style={{
          color: data.nodeColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: 0.9,
        }}
      >
        {IconSvg}
      </div>

      {/* 标签 */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: '500',
            color: '#F9FAFB', // gray-50
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          {data.label}
        </div>
      </div>

      {/* 状态图标 - 右上角 */}
      <div
        style={{
          position: 'absolute',
          top: '6px',
          right: '8px',
          fontSize: '12px',
          color: data.statusStyle.color,
          opacity: 0.8,
        }}
      >
        {data.statusStyle.icon}
      </div>

      {/* 连接点 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '-5px',
          transform: 'translateY(-50%)',
          width: '8px',
          height: '8px',
          background: '#1F2937',
          border: '1.5px solid #4B5563',
          borderRadius: '50%',
        }}
        className="react-flow__handle react-flow__handle-left"
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: '-5px',
          transform: 'translateY(-50%)',
          width: '8px',
          height: '8px',
          background: '#1F2937',
          border: '1.5px solid #4B5563',
          borderRadius: '50%',
        }}
        className="react-flow__handle react-flow__handle-right"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// ==================== 主组件 ====================

export function WorkflowDAGVisualizer({
  nodes: dagNodes,
  edges: dagEdges,
  workflowId,
  onNodeClick,
}: WorkflowDAGVisualizerProps) {
  // 空状态处理（IfAI 风格）
  if (dagNodes.length === 0) {
    return (
      <div
        data-testid="dag-empty-state"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '500px',
          color: '#9CA3AF',
          flexDirection: 'column',
          gap: '12px',
          background: '#111827', // gray-900
          borderRadius: '8px',
          border: '1px solid #1F2937', // gray-800
        }}
      >
        <div style={{ fontSize: '32px', opacity: 0.4 }}>📊</div>
        <div style={{ fontSize: '13px', fontWeight: '500', color: '#D1D5DB' }}>
          暂无节点数据
        </div>
        <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
          执行工作流后将显示 DAG 可视化
        </div>
      </div>
    );
  }

  // 转换 DAG 节点为 React Flow 节点
  const reactFlowNodes: Node[] = useMemo(() => {
    return dagNodes.map((dagNode) => {
      const nodeStyle = getNodeTypeStyle(dagNode.id, dagNode.label);
      // 🔥 使用默认的 pending 状态作为 fallback，防止 statusStyle 为 undefined
      const statusStyle = STATUS_STYLES[dagNode.status] || STATUS_STYLES.pending;

      return {
        id: dagNode.id,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          label: dagNode.label,
          iconKey: nodeStyle.icon,
          status: dagNode.status,
          nodeColor: nodeStyle.color,
          statusStyle,
          originalNode: dagNode,
          onNodeClick,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });
  }, [dagNodes, onNodeClick]);

  // 转换 DAG 边为 React Flow 边（IfAI 深色主题风格）
  const reactFlowEdges: Edge[] = useMemo(() => {
    console.log('🔍 渲染边数量:', dagEdges.length, '节点数量:', dagNodes.length);

    return dagEdges.map((dagEdge, index) => {
      const toNode = dagNodes.find(n => n.id === dagEdge.to);

      // IfAI 深色主题连线样式 - 使用更亮的颜色
      let stroke = '#9CA3AF'; // 默认 gray-400（更亮，在深色背景上可见）
      let strokeWidth = 2;
      let animated = false;

      if (toNode?.status === 'completed') {
        stroke = '#10B981'; // 绿色
        strokeWidth = 2.5;
      } else if (toNode?.status === 'failed') {
        stroke = '#EF4444'; // 红色
        strokeWidth = 2.5;
      } else if (toNode?.status === 'running') {
        stroke = '#3B82F6'; // 蓝色
        strokeWidth = 2.5;
        animated = true;
      }

      console.log(`🔍 边 ${index}:`, {
        from: dagEdge.from,
        to: dagEdge.to,
        toStatus: toNode?.status,
        stroke,
        strokeWidth,
      });

      return {
        id: `edge-${index}`,
        source: dagEdge.from,
        target: dagEdge.to,
        type: 'smoothstep',
        animated,
        style: {
          stroke,
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 14,
          height: 14,
        },
        zIndex: -1, // 确保边在节点下方
      };
    });
  }, [dagEdges, dagNodes]);

  // 应用 Dagre 布局
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    return applyDagreLayout(reactFlowNodes, reactFlowEdges, 'TB');
  }, [reactFlowNodes, reactFlowEdges]);

  // 处理节点点击
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick && node.data.originalNode) {
        onNodeClick(node.data.originalNode);
      }
    },
    [onNodeClick]
  );

  return (
    <div data-testid="dag-visualizer-container" style={{ width: '100%', height: '100%' }}>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .dag-node-running {
            animation: pulse 2s ease-in-out infinite;
          }
        `}
      </style>
      <ReactFlow
        nodes={layoutedNodes}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        attributionPosition="bottom-left"
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        selectNodesOnDrag={false}
        panOnScroll
        selectionKeyCode="Shift"
        deleteKeyCode="Backspace"
      >
        <Background
          color="#4B5563" // gray-600
          gap={20}
          size={1}
          variant="dots"
          style={{ opacity: 0.3 }}
        />
        <Controls
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            background: '#1F2937', // gray-800
            border: '1px solid #374151', // gray-700
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        />
        <MiniMap
          nodeColor={(node) => {
            const customData = node.data as CustomNodeData;
            return customData.nodeColor;
          }}
          nodeStrokeWidth={1.5}
          nodeBorderRadius={6}
          maskColor="rgba(0, 0, 0, 0.4)"
          style={{
            background: '#1F2937', // gray-800
            border: '1px solid #374151', // gray-700
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
}
