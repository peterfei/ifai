/**
 * 工作流 DAG 实时监控组件
 *
 * 类似 Claude Code 的 /explore 实时执行状态显示
 * 基于事件驱动，实时更新节点状态和 DAG 可视化
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../UI/card';
import { Badge } from '../UI/badge';
import { Progress } from '../UI/progress';
import { Button } from '../UI/button';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  X,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';

// 动态导入 Tauri API
// 🔥 测试适配层：允许外部注入 listen 函数用于测试
let injectedListen: typeof listen | null = null;

export function injectTestListen(fn: typeof listen) {
  injectedListen = fn;
}

export function clearTestListen() {
  injectedListen = null;
}

async function listen<T>(event: string, handler: (event: { payload: T }) => void) {
  // 如果有注入的测试 listen 函数，使用它
  if (injectedListen) {
    return injectedListen<T>(event, handler);
  }

  // 否则使用真实的 Tauri API
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen<T>(event, handler);
}

// ==================== 类型定义 ====================

/** 节点状态 */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** 进度事件类型 */
export type ProgressEventType = 'node_started' | 'node_progress' | 'node_completed' | 'tool_call';

/** 工作流进度事件 */
export interface WorkflowProgressEvent {
  event_type: ProgressEventType;
  node_id?: string;
  message?: string;
  timestamp: number;
}

/** DAG 节点 */
export interface DAGNode {
  id: string;
  label: string;
  agentType: string;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

/** DAG 连接 */
export interface DAGEdge {
  from: string;
  to: string;
}

/** 时间线日志 */
export interface TimelineLog {
  id: string;
  timestamp: number;
  type: ProgressEventType;
  nodeId?: string;
  message?: string;
}

/** 工作流执行结果 */
export interface WorkflowExecutionResult {
  workflow_id: string;
  status: string;
  node_results: Array<{
    node_id: string;
    status: string;
    output?: string;
    error?: string;
  }>;
  started_at?: number;
  completed_at?: number;
}

// ==================== 组件 Props ====================

interface WorkflowDAGMonitorProps {
  workflowId: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  onComplete?: (result: WorkflowExecutionResult) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

// ==================== 辅助函数 ====================

/** 获取节点状态图标 */
function getNodeStatusIcon(status: NodeStatus, size: number = 20) {
  const iconClassName = `w-${size/4} h-${size/4}`;

  switch (status) {
    case 'completed':
      return <CheckCircle className={`${iconClassName} text-green-500`} />;
    case 'failed':
      return <XCircle className={`${iconClassName} text-red-500`} />;
    case 'running':
      return <Clock className={`${iconClassName} text-blue-500 animate-spin`} />;
    case 'skipped':
      return <AlertCircle className={`${iconClassName} text-gray-400`} />;
    default:
      return <Clock className={`${iconClassName} text-gray-400`} />;
  }
}

/** 获取节点状态颜色 */
function getNodeStatusColor(status: NodeStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    case 'running':
      return 'bg-blue-500';
    case 'skipped':
      return 'bg-gray-400';
    default:
      return 'bg-gray-300 dark:bg-gray-600';
  }
}

/** 获取节点状态边框颜色 */
function getNodeStatusBorderColor(status: NodeStatus): string {
  switch (status) {
    case 'completed':
      return 'border-green-500';
    case 'failed':
      return 'border-red-500';
    case 'running':
      return 'border-blue-500';
    case 'skipped':
      return 'border-gray-400';
    default:
      return 'border-gray-300 dark:border-gray-600';
  }
}

/** 格式化时间戳 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/** 计算节点持续时间 */
function calculateNodeDuration(node: DAGNode): number {
  if (node.startedAt && node.completedAt) {
    return node.completedAt - node.startedAt;
  }
  if (node.startedAt) {
    return Date.now() - node.startedAt;
  }
  return 0;
}

// ==================== 主组件 ====================

export function WorkflowDAGMonitor({
  workflowId,
  nodes: initialNodes,
  edges,
  onComplete,
  onError,
  onClose,
}: WorkflowDAGMonitorProps) {
  // ==================== 状态 ====================

  const [nodes, setNodes] = useState<DAGNode[]>(initialNodes);
  const [timelineLogs, setTimelineLogs] = useState<TimelineLog[]>([]);
  const [status, setStatus] = useState<string>('Running');
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [showTimeline, setShowTimeline] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  // ==================== 计算属性 ====================

  const completedCount = nodes.filter((n) => n.status === 'completed').length;
  const failedCount = nodes.filter((n) => n.status === 'failed').length;
  const runningCount = nodes.filter((n) => n.status === 'running').length;
  const totalCount = nodes.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const duration = Math.floor((Date.now() - startTime) / 1000);

  // ==================== 事件处理 ====================

  useEffect(() => {
    let mounted = true;

    // 监听工作流进度事件
    const unlistenProgress = listen<WorkflowProgressEvent>(
      'workflow:progress',
      (event) => {
        if (!mounted) return;

        const progressEvent = event.payload;
        console.log('[WorkflowDAGMonitor] 📥 Progress event:', progressEvent);

        // 添加到时间线
        const log: TimelineLog = {
          id: `log-${Date.now()}-${Math.random()}`,
          timestamp: progressEvent.timestamp,
          type: progressEvent.event_type,
          nodeId: progressEvent.node_id,
          message: progressEvent.message,
        };
        setTimelineLogs((prev) => [...prev, log]);

        // 更新节点状态
        if (progressEvent.node_id) {
          setNodes((prevNodes) =>
            prevNodes.map((node) => {
              if (node.id === progressEvent.node_id) {
                const updatedNode = { ...node };

                switch (progressEvent.event_type) {
                  case 'node_started':
                    updatedNode.status = 'running';
                    updatedNode.startedAt = progressEvent.timestamp;
                    break;
                  case 'node_completed':
                    updatedNode.status = 'completed';
                    updatedNode.completedAt = progressEvent.timestamp;
                    if (progressEvent.message) {
                      updatedNode.output = progressEvent.message;
                    }
                    break;
                  case 'node_progress':
                    if (progressEvent.message) {
                      updatedNode.output = progressEvent.message;
                    }
                    break;
                }

                return updatedNode;
              }
              return node;
            })
          );
        }
      }
    );

    // 监听工作流完成事件
    const unlistenCompleted = listen<WorkflowExecutionResult>(
      'workflow:completed',
      (event) => {
        if (!mounted) return;
        if (event.payload.workflow_id !== workflowId) return;

        console.log('[WorkflowDAGMonitor] ✅ Workflow completed:', event.payload);

        setStatus('Completed');

        // 更新所有节点状态
        if (event.payload.node_results) {
          setNodes((prevNodes) =>
            prevNodes.map((node) => {
              const result = event.payload.node_results.find(
                (r) => r.node_id === node.id
              );
              if (result) {
                return {
                  ...node,
                  status: result.status as NodeStatus,
                  output: result.output,
                  error: result.error,
                };
              }
              return node;
            })
          );
        }

        if (onComplete) {
          onComplete(event.payload);
        }
      }
    );

    // 监听工作流错误事件
    const unlistenError = listen<any>('workflow:error', (event) => {
      if (!mounted) return;

      console.error('[WorkflowDAGMonitor] ❌ Workflow error:', event.payload);

      setStatus('Failed');

      if (onError) {
        onError(event.payload.error || '工作流执行失败');
      }
    });

    return () => {
      mounted = false;
      unlistenProgress.then((f) => f());
      unlistenCompleted.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [workflowId, onComplete, onError]);

  // 自动滚动到时间线底部
  useEffect(() => {
    if (timelineRef.current && showTimeline) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [timelineLogs, showTimeline]);

  // ==================== 渲染 ====================

  return (
    <div className="space-y-4" data-testid="workflow-monitor">
      {/* 顶部状态卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-500" />
                工作流执行中
              </CardTitle>
              <CardDescription>工作流 ID: {workflowId}</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right" data-testid="workflow-duration">
                <div className="text-sm text-muted-foreground">运行时间</div>
                <div className="text-lg font-semibold">{duration}s</div>
              </div>
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 整体状态 */}
          <div className="flex items-center justify-between" data-testid="workflow-status" data-status={status.toLowerCase()}>
            <div className="flex items-center gap-2">
              {status === 'Running' && (
                <Clock className="w-5 h-5 text-blue-500 animate-pulse" />
              )}
              {status === 'Completed' && (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
              {status === 'Failed' && (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-semibold">
                {status === 'Running' && '执行中...'}
                {status === 'Completed' && '执行完成'}
                {status === 'Failed' && '执行失败'}
              </span>
            </div>
            <div className="flex items-center gap-2" data-testid="workflow-node-stats">
              {runningCount > 0 && (
                <Badge className="bg-blue-500">运行中 {runningCount}</Badge>
              )}
              {completedCount > 0 && (
                <Badge className="bg-green-500">完成 {completedCount}</Badge>
              )}
              {failedCount > 0 && (
                <Badge className="bg-red-500">失败 {failedCount}</Badge>
              )}
              <Badge variant="outline">
                {completedCount} / {totalCount}
              </Badge>
            </div>
          </div>

          {/* 进度条 */}
          <div data-testid="workflow-progress">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>进度</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DAG 可视化 */}
      <Card data-testid="dag-visualization">
        <CardHeader>
          <CardTitle>工作流可视化</CardTitle>
        </CardHeader>
        <CardContent>
          <DAGVisualization nodes={nodes} edges={edges} />
        </CardContent>
      </Card>

      {/* 节点详情 */}
      <Card data-testid="workflow-nodes">
        <CardHeader>
          <CardTitle>节点状态</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isExpanded={expandedLogs.has(node.id)}
                onToggleExpand={() => {
                  setExpandedLogs((prev) => {
                    const newSet = new Set(prev);
                    if (newSet.has(node.id)) {
                      newSet.delete(node.id);
                    } else {
                      newSet.add(node.id);
                    }
                    return newSet;
                  });
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 时间线日志 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>执行时间线</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTimeline(!showTimeline)}
              data-testid="timeline-toggle"
            >
              {showTimeline ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {showTimeline && (
          <CardContent>
            <div
              ref={timelineRef}
              className="h-64 overflow-y-auto space-y-1 font-mono text-xs"
              data-testid="timeline-logs"
            >
              {timelineLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  等待事件...
                </div>
              ) : (
                timelineLogs.map((log) => <TimelineLogItem key={log.id} log={log} />)
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ==================== 子组件 ====================

/** DAG 可视化组件 */
interface DAGVisualizationProps {
  nodes: DAGNode[];
  edges: DAGEdge[];
}

function DAGVisualization({ nodes, edges }: DAGVisualizationProps) {
  // 简单的层次布局算法
  const levels = calculateNodeLevels(nodes, edges);
  const nodeWidth = 120;
  const nodeHeight = 60;
  const levelGap = 100;
  const nodeGap = 20;

  // 计算节点位置
  const nodePositions = new Map<string, { x: number; y: number }>();
  levels.forEach((levelNodes, levelIndex) => {
    const y = levelIndex * (nodeHeight + levelGap);
    levelNodes.forEach((node, nodeIndex) => {
      const x = nodeIndex * (nodeWidth + nodeGap);
      nodePositions.set(node.id, { x, y });
    });
  });

  // 计算SVG尺寸
  const maxX = Math.max(
    ...Array.from(nodePositions.values()).map((pos) => pos.x)
  );
  const maxY = Math.max(
    ...Array.from(nodePositions.values()).map((pos) => pos.y)
  );
  const svgWidth = Math.max(600, maxX + nodeWidth + 40);
  const svgHeight = maxY + nodeHeight + 40;

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="mx-auto">
        {/* 定义箭头 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#64748b" />
          </marker>
        </defs>

        {/* 绘制连接线 */}
        {edges.map((edge, index) => {
          const fromPos = nodePositions.get(edge.from);
          const toPos = nodePositions.get(edge.to);
          if (!fromPos || !toPos) return null;

          const fromX = fromPos.x + nodeWidth / 2;
          const fromY = fromPos.y + nodeHeight;
          const toX = toPos.x + nodeWidth / 2;
          const toY = toPos.y;

          // 贝塞尔曲线
          const controlY = (fromY + toY) / 2;
          const pathD = `M ${fromX} ${fromY} C ${fromX} ${controlY}, ${toX} ${controlY}, ${toX} ${toY}`;

          return (
            <path
              key={`edge-${index}`}
              d={pathD}
              stroke="#64748b"
              strokeWidth="2"
              fill="none"
              markerEnd="url(#arrowhead)"
              className="transition-all duration-300"
            />
          );
        })}

        {/* 绘制节点 */}
        {nodes.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;

          const statusColor = getNodeStatusColor(node.status);
          const borderColor = getNodeStatusBorderColor(node.status);

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x + 20}, ${pos.y})`}
              className="transition-all duration-300"
            >
              {/* 节点背景 */}
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx={8}
                fill={statusColor}
                fillOpacity="0.1"
                stroke="currentColor"
                strokeWidth="2"
                className={borderColor}
              />

              {/* 节点图标 */}
              <foreignObject x={8} y={8} width={20} height={20}>
                <div className="flex items-center justify-center w-full h-full">
                  {getNodeStatusIcon(node.status, 16)}
                </div>
              </foreignObject>

              {/* 节点标签 */}
              <foreignObject x={32} y={8} width={nodeWidth - 40} height={20}>
                <div className="text-xs font-semibold truncate">{node.label}</div>
              </foreignObject>

              {/* 节点状态 */}
              <foreignObject x={8} y={32} width={nodeWidth - 16} height={20}>
                <div className="text-xs text-muted-foreground">
                  {node.status === 'running' && '运行中...'}
                  {node.status === 'completed' &&
                    `${calculateNodeDuration(node)}ms`}
                  {node.status === 'pending' && '等待'}
                  {node.status === 'failed' && '失败'}
                  {node.status === 'skipped' && '跳过'}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 节点卡片组件 */
interface NodeCardProps {
  node: DAGNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function NodeCard({ node, isExpanded, onToggleExpand }: NodeCardProps) {
  const duration = calculateNodeDuration(node);

  return (
    <div
      className={`p-3 border rounded-lg transition-all ${
        node.status === 'running' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''
      }`}
      data-testid="workflow-node"
      data-status={node.status}
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          {getNodeStatusIcon(node.status)}
          <div>
            <div className="font-medium">{node.label}</div>
            <div className="text-xs text-muted-foreground">{node.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {duration > 0 && (
            <span className="text-xs text-muted-foreground">{duration}ms</span>
          )}
          <Badge
            className={getNodeStatusColor(node.status)}
            style={{ backgroundColor: getNodeStatusColor(node.status) }}
          >
            {node.status === 'running' && '运行中'}
            {node.status === 'completed' && '完成'}
            {node.status === 'pending' && '等待'}
            {node.status === 'failed' && '失败'}
            {node.status === 'skipped' && '跳过'}
          </Badge>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </div>

      {isExpanded && (node.output || node.error) && (
        <div className="mt-3 pt-3 border-t" data-testid="node-details">
          {node.output && (
            <div className="mb-2">
              <div className="text-xs font-medium mb-1">输出:</div>
              <div className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-20 overflow-y-auto">
                {node.output}
              </div>
            </div>
          )}
          {node.error && (
            <div data-testid="workflow-error">
              <div className="text-xs font-medium mb-1 text-red-500">错误:</div>
              <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded text-xs text-red-700 dark:text-red-300">
                {node.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 时间线日志项 */
interface TimelineLogItemProps {
  log: TimelineLog;
}

function TimelineLogItem({ log }: TimelineLogItemProps) {
  const getEventColor = (type: ProgressEventType): string => {
    switch (type) {
      case 'node_started':
        return 'text-blue-500';
      case 'node_completed':
        return 'text-green-500';
      case 'node_progress':
        return 'text-yellow-500';
      case 'tool_call':
        return 'text-purple-500';
      default:
        return 'text-gray-500';
    }
  };

  const getEventLabel = (type: ProgressEventType): string => {
    switch (type) {
      case 'node_started':
        return '▶ 开始';
      case 'node_completed':
        return '✓ 完成';
      case 'node_progress':
        return '⟳ 进度';
      case 'tool_call':
        return '⚡ 工具调用';
      default:
        return type;
    }
  };

  return (
    <div className="flex gap-2 hover:bg-muted/50 px-2 py-1 rounded" data-testid="timeline-log">
      <span className="text-muted-foreground select-none">
        {formatTimestamp(log.timestamp)}
      </span>
      <span className={getEventColor(log.type)}>
        {getEventLabel(log.type)}
      </span>
      {log.nodeId && (
        <span className="text-blue-500">[{log.nodeId}]</span>
      )}
      {log.message && (
        <span className="text-muted-foreground truncate">{log.message}</span>
      )}
    </div>
  );
}

// ==================== 辅助算法 ====================

/** 计算节点层次（用于布局） */
function calculateNodeLevels(
  nodes: DAGNode[],
  edges: DAGEdge[]
): DAGNode[][] {
  // 构建邻接表和入度表
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  nodes.forEach((node) => {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  });

  edges.forEach((edge) => {
    adjList.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  });

  // 拓扑排序计算层次
  const levels: DAGNode[][] = [];
  const remaining = new Set(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    // 找到所有入度为0的节点
    const currentLevel: DAGNode[] = [];
    remaining.forEach((nodeId) => {
      if ((inDegree.get(nodeId) || 0) === 0) {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          currentLevel.push(node);
        }
      }
    });

    if (currentLevel.length === 0) {
      // 存在环，将剩余节点全部放入当前层
      levels.push(
        Array.from(remaining)
          .map((id) => nodes.find((n) => n.id === id))
          .filter((n): n is DAGNode => n !== undefined)
      );
      break;
    }

    levels.push(currentLevel);

    // 更新入度
    currentLevel.forEach((node) => {
      remaining.delete(node.id);
      adjList.get(node.id)?.forEach((to) => {
        inDegree.set(to, (inDegree.get(to) || 0) - 1);
      });
    });
  }

  return levels;
}
