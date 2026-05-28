/**
 * @deprecated 已由 inline-first 卡片方案替代（ExploreCard / AgentWorkspaceCard）。
 * 保留以兼容现有引用，将在后续清理中移除。
 *
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
import { Button } from '../UI/button';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  X,
  ChevronDown,
  ChevronRight,
  Bot,
  Boxes,
  Compass,
  Eye,
  FileText,
  Pencil,
  Rocket,
  Search,
  Terminal,
  TestTube2,
  Wrench,
  Zap,
  Settings2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WorkflowDAGVisualizer } from './WorkflowDAGVisualizer';

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

type WorkflowStatus = 'running' | 'completed' | 'failed';

/** 🔥 工具调用详细信息 */
export interface ToolCallDetails {
  tool_name: string;           // 工具名称
  tool_input: string;           // 工具输入（JSON字符串）
  tool_output: string;          // 工具输出
  output_length: number;        // 输出字符数
  execution_time_ms?: number;   // 执行时间（毫秒）
  is_error: boolean;            // 是否出错
}

/** 工作流进度事件 */
export interface WorkflowProgressEvent {
  event_type: ProgressEventType;
  node_id?: string;
  message?: string;
  timestamp: number;
  /** 🔥 工具调用详细信息（仅当 event_type 为 "tool_call" 时存在） */
  tool_details?: ToolCallDetails;
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
  /** 🔥 工具调用详细信息列表 */
  tool_calls?: ToolCallDetails[];
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
  /** 🔥 工具调用详细信息（仅当 type 为 "tool_call" 时存在） */
  tool_details?: ToolCallDetails;
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

/** 节点类型图标映射（Claude Code 风格） */
const NODE_TYPE_ICONS: Record<string, React.ReactNode> = {
  'Search': <Search className="h-4 w-4" />,
  'Read': <FileText className="h-4 w-4" />,
  'Write': <Pencil className="h-4 w-4" />,
  'Agent': <Bot className="h-4 w-4" />,
  'Command': <Terminal className="h-4 w-4" />,
  'Explore': <Compass className="h-4 w-4" />,
  'Review': <Eye className="h-4 w-4" />,
  'Refactor': <Wrench className="h-4 w-4" />,
  'Test': <TestTube2 className="h-4 w-4" />,
  'Build': <Boxes className="h-4 w-4" />,
  'Deploy': <Rocket className="h-4 w-4" />,
};

/** 节点类型颜色映射（Claude Code 风格） */
const NODE_TYPE_COLORS: Record<string, string> = {
  'Search': 'var(--accent-color)',
  'Read': 'var(--success-color)',
  'Write': 'var(--warning-color)',
  'Agent': 'var(--info-color)',
  'Command': 'var(--danger-color)',
  'Explore': 'var(--accent-color)',
  'Review': 'var(--info-color)',
  'Refactor': 'var(--warning-color)',
  'Test': 'var(--success-color)',
  'Build': 'var(--warning-color)',
  'Deploy': 'var(--success-color)',
};

/** 解析节点类型 */
function parseNodeType(nodeId: string, label: string): string {
  // 从标签中提取类型
  const lowerLabel = label.toLowerCase();

  if (lowerLabel.includes('search') || lowerLabel.includes('探索') || lowerLabel.includes('搜索')) {
    return 'Search';
  }
  if (lowerLabel.includes('read') || lowerLabel.includes('读取')) {
    return 'Read';
  }
  if (lowerLabel.includes('write') || lowerLabel.includes('写入') || lowerLabel.includes('生成')) {
    return 'Write';
  }
  if (lowerLabel.includes('agent') || lowerLabel.includes('代理') || lowerLabel.includes('分析')) {
    return 'Agent';
  }
  if (lowerLabel.includes('command') || lowerLabel.includes('命令')) {
    return 'Command';
  }
  if (lowerLabel.includes('review') || lowerLabel.includes('审查')) {
    return 'Review';
  }
  if (lowerLabel.includes('refactor') || lowerLabel.includes('重构')) {
    return 'Refactor';
  }
  if (lowerLabel.includes('test') || lowerLabel.includes('测试')) {
    return 'Test';
  }
  if (lowerLabel.includes('build') || lowerLabel.includes('构建')) {
    return 'Build';
  }
  if (lowerLabel.includes('deploy') || lowerLabel.includes('部署')) {
    return 'Deploy';
  }

  // 从节点 ID 中提取
  if (nodeId.includes('Search') || nodeId.includes('explore')) {
    return 'Search';
  }
  if (nodeId.includes('Read')) {
    return 'Read';
  }
  if (nodeId.includes('Write')) {
    return 'Write';
  }
  if (nodeId.includes('Agent')) {
    return 'Agent';
  }

  return 'Command'; // 默认类型
}

/** 获取节点类型图标 */
function getNodeTypeIcon(nodeId: string, label: string): React.ReactNode {
  const nodeType = parseNodeType(nodeId, label);
  return NODE_TYPE_ICONS[nodeType] || <Zap className="h-4 w-4" />;
}

/** 获取节点类型颜色 */
function getNodeTypeColor(nodeId: string, label: string): string {
  const nodeType = parseNodeType(nodeId, label);
  return NODE_TYPE_COLORS[nodeType] || 'var(--text-subtle)';
}

/** 获取节点状态图标 */
function getNodeStatusIcon(status: NodeStatus, size: number = 20) {
  const iconClassName = `w-${size / 4} h-${size / 4}`;

  switch (status) {
    case 'completed':
      return <CheckCircle className={`${iconClassName} theme-text-success`} />;
    case 'failed':
      return <XCircle className={`${iconClassName} theme-text-danger`} />;
    case 'running':
      return <Clock className={`${iconClassName} theme-text-accent animate-spin`} />;
    case 'skipped':
      return <AlertCircle className={`${iconClassName} theme-text-subtle`} />;
    default:
      return <Clock className={`${iconClassName} theme-text-subtle`} />;
  }
}

/** 获取节点状态色值 */
function getNodeStatusColorValue(status: NodeStatus): string {
  switch (status) {
    case 'completed':
      return 'var(--success-color)';
    case 'failed':
      return 'var(--danger-color)';
    case 'running':
      return 'var(--accent-color)';
    case 'skipped':
      return 'var(--text-subtle)';
    default:
      return 'var(--border-strong)';
  }
}

function getNodeStatusBadgeClass(status: NodeStatus): string {
  switch (status) {
    case 'completed':
      return 'theme-badge-success';
    case 'failed':
      return 'theme-badge-danger';
    case 'running':
      return 'theme-badge-accent';
    case 'skipped':
      return 'theme-panel-elevated theme-border theme-text-subtle';
    default:
      return 'theme-panel theme-border theme-text-muted';
  }
}

function getNodeStatusSurfaceClass(status: NodeStatus): string {
  switch (status) {
    case 'completed':
      return 'theme-surface-success';
    case 'failed':
      return 'theme-surface-danger';
    case 'running':
      return 'theme-surface-accent';
    case 'skipped':
      return 'theme-panel-elevated theme-border';
    default:
      return 'theme-panel theme-border';
  }
}

function getNodeStatusTextClass(status: NodeStatus): string {
  switch (status) {
    case 'completed':
      return 'theme-text-success';
    case 'failed':
      return 'theme-text-danger';
    case 'running':
      return 'theme-text-accent';
    case 'skipped':
      return 'theme-text-subtle';
    default:
      return 'theme-text-muted';
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

function translateWithDefault(
  t: (key: string, options?: Record<string, unknown>) => string,
  key: string,
  defaultValue: string,
  values: Record<string, string | number> = {}
): string {
  const translated = t(key, { defaultValue, ...values });

  return Object.entries(values).reduce((message, [name, value]) => {
    return message.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
  }, translated);
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
  const { t } = useTranslation();

  // ==================== 状态 ====================

  const [nodes, setNodes] = useState<DAGNode[]>(initialNodes);
  const [timelineLogs, setTimelineLogs] = useState<TimelineLog[]>([]);
  const [status, setStatus] = useState<WorkflowStatus>('running');
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [showTimeline, setShowTimeline] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'svg' | 'reactflow'>('svg'); // 🔥 默认使用 SVG 模式
  const timelineRef = useRef<HTMLDivElement>(null);

  // ==================== 计算属性 ====================

  const completedCount = nodes.filter((n) => n.status === 'completed').length;
  const failedCount = nodes.filter((n) => n.status === 'failed').length;
  const runningCount = nodes.filter((n) => n.status === 'running').length;
  const totalCount = nodes.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const duration = Math.floor((Date.now() - startTime) / 1000);
  const workflowTitle =
    status === 'completed'
      ? t('workflow.inlineMonitor.dagMonitor.workflow.titleCompleted', {
          defaultValue: '工作流执行完成',
        })
      : status === 'failed'
        ? t('workflow.inlineMonitor.dagMonitor.workflow.titleFailed', {
            defaultValue: '工作流执行失败',
          })
        : t('workflow.inlineMonitor.dagMonitor.workflow.titleRunning', {
            defaultValue: '工作流执行中',
          });
  const workflowStatusLabel =
    status === 'completed'
      ? t('workflow.inlineMonitor.dagMonitor.workflow.statusCompleted', {
          defaultValue: '执行完成',
        })
      : status === 'failed'
        ? t('workflow.inlineMonitor.dagMonitor.workflow.statusFailed', {
            defaultValue: '执行失败',
          })
        : t('workflow.inlineMonitor.dagMonitor.workflow.statusRunning', {
            defaultValue: '执行中...',
          });

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

        setStatus('completed');

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

      setStatus('failed');

      if (onError) {
        onError(
          event.payload.error ||
            t('workflow.inlineMonitor.dagMonitor.workflow.executionFailedGeneric', {
              defaultValue: '工作流执行失败',
            })
        );
      }
    });

    return () => {
      mounted = false;
      unlistenProgress.then((f) => f());
      unlistenCompleted.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [workflowId, onComplete, onError, t]);

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
                <Zap className="h-5 w-5 theme-text-accent" />
                {workflowTitle}
              </CardTitle>
              <CardDescription>
                {t('workflow.inlineMonitor.labels.workflowId', {
                  defaultValue: '工作流 ID',
                })}
                : {workflowId}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right" data-testid="workflow-duration">
                <div className="theme-text-subtle text-sm">
                  {t('workflow.inlineMonitor.dagMonitor.workflow.durationLabel', {
                    defaultValue: '运行时间',
                  })}
                </div>
                <div className="theme-text text-lg font-semibold">
                  {translateWithDefault(
                    t,
                    'workflow.inlineMonitor.duration.secondsShort',
                    '{{value}}s',
                    { value: duration }
                  )}
                </div>
              </div>
              {onClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  aria-label={t('common.close', { defaultValue: '关闭' })}
                  title={t('common.close', { defaultValue: '关闭' })}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 整体状态 */}
          <div className="flex items-center justify-between" data-testid="workflow-status" data-status={status}>
            <div className="flex items-center gap-2">
              {status === 'running' && (
                <Clock className="h-5 w-5 theme-text-accent animate-pulse" />
              )}
              {status === 'completed' && (
                <CheckCircle className="h-5 w-5 theme-text-success" />
              )}
              {status === 'failed' && (
                <XCircle className="h-5 w-5 theme-text-danger" />
              )}
              <span className="theme-text font-semibold">
                {workflowStatusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2" data-testid="workflow-node-stats">
              {runningCount > 0 && (
                <Badge variant="outline" className="theme-badge-accent">
                  {translateWithDefault(
                    t,
                    'workflow.inlineMonitor.dagMonitor.summary.runningCount',
                    '运行中 {{count}}',
                    { count: runningCount }
                  )}
                </Badge>
              )}
              {completedCount > 0 && (
                <Badge variant="outline" className="theme-badge-success">
                  {translateWithDefault(
                    t,
                    'workflow.inlineMonitor.dagMonitor.summary.completedCount',
                    '完成 {{count}}',
                    { count: completedCount }
                  )}
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="outline" className="theme-badge-danger">
                  {translateWithDefault(
                    t,
                    'workflow.inlineMonitor.dagMonitor.summary.failedCount',
                    '失败 {{count}}',
                    { count: failedCount }
                  )}
                </Badge>
              )}
              <Badge variant="outline">
                {completedCount} / {totalCount}
              </Badge>
            </div>
          </div>

          {/* 进度条 */}
          <div data-testid="workflow-progress">
            <div className="theme-panel h-2 w-full overflow-hidden rounded-full">
              <div
                className="h-full transition-all duration-300 ease-in-out"
                style={{
                  width: `${progress}%`,
                  background: 'var(--accent-color)',
                }}
              />
            </div>
            <div className="theme-text-subtle mt-1 flex justify-between text-xs">
              <span>
                {t('workflow.inlineMonitor.dagMonitor.workflow.progressLabel', {
                  defaultValue: '进度',
                })}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DAG 可视化 */}
      <Card data-testid="dag-visualization">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {t('workflow.inlineMonitor.dagMonitor.sections.visualization', {
                defaultValue: '工作流可视化',
              })}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'svg' ? 'reactflow' : 'svg')}
              className="flex items-center gap-2"
              data-testid="view-mode-toggle"
            >
              <Settings2 className="w-4 h-4" />
              {viewMode === 'svg'
                ? t('workflow.inlineMonitor.dagMonitor.viewMode.switchToReactFlow', {
                    defaultValue: '切换到 React Flow',
                  })
                : t('workflow.inlineMonitor.dagMonitor.viewMode.switchToSvg', {
                    defaultValue: '切换到 SVG',
                  })}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'reactflow' ? (
            <div className="h-[500px]" data-testid="dag-reactflow-view">
              <WorkflowDAGVisualizer
                nodes={nodes}
                edges={edges}
                workflowId={workflowId}
                onNodeClick={(node) => {
                  // 点击节点时展开详情
                  setExpandedLogs((prev) => {
                    const newSet = new Set(prev);
                    if (!newSet.has(node.id)) {
                      newSet.add(node.id);
                    }
                    return newSet;
                  });
                }}
              />
            </div>
          ) : (
            <DAGVisualization nodes={nodes} edges={edges} />
          )}
        </CardContent>
      </Card>

      {/* 节点详情 */}
      <Card data-testid="workflow-nodes">
        <CardHeader>
          <CardTitle>
            {t('workflow.inlineMonitor.dagMonitor.sections.nodes', {
              defaultValue: '节点状态',
            })}
          </CardTitle>
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
            <CardTitle>
              {t('workflow.inlineMonitor.dagMonitor.sections.timeline', {
                defaultValue: '执行时间线',
              })}
            </CardTitle>
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
                <div className="theme-text-subtle py-8 text-center">
                  {t('workflow.inlineMonitor.dagMonitor.timeline.empty', {
                    defaultValue: '等待事件...',
                  })}
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
  onNodeClick?: (node: DAGNode) => void;
}

function DAGVisualization({ nodes, edges, onNodeClick }: DAGVisualizationProps) {
  const { t } = useTranslation();

  // 选中的节点
  const [selectedNode, setSelectedNode] = React.useState<DAGNode | null>(null);

  // 处理节点点击
  const handleNodeClick = (node: DAGNode) => {
    setSelectedNode(node);
    if (onNodeClick) {
      onNodeClick(node);
    }
  };

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
  const positionValues = Array.from(nodePositions.values());
  const maxX = positionValues.length > 0
    ? Math.max(...positionValues.map((pos) => pos.x))
    : 0;
  const maxY = positionValues.length > 0
    ? Math.max(...positionValues.map((pos) => pos.y))
    : 0;
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
            <polygon points="0 0, 10 3, 0 6" style={{ fill: 'var(--text-subtle)' }} />
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
              stroke="var(--text-subtle)"
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

          const statusColor = getNodeStatusColorValue(node.status);
          const nodeTypeIcon = getNodeTypeIcon(node.id, node.label);
          const nodeTypeColor = getNodeTypeColor(node.id, node.label);

          const isSelected = selectedNode?.id === node.id;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x + 20}, ${pos.y})`}
              className="transition-all duration-300"
              style={{ cursor: 'pointer' }}
              onClick={() => handleNodeClick(node)}
            >
              {/* 节点背景（使用节点类型颜色） */}
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx={8}
                fill={nodeTypeColor}
                fillOpacity={isSelected ? "0.25" : "0.15"}
                stroke={nodeTypeColor}
                strokeWidth={isSelected ? "3" : "2"}
                className={`transition-all duration-300 ${
                  node.status === 'running' ? 'animate-pulse' : ''
                }`}
              />

              {/* 节点类型图标 */}
              <foreignObject x={8} y={8} width={24} height={24}>
                <div className="flex h-full w-full items-center justify-center" style={{ color: nodeTypeColor }}>
                  {nodeTypeIcon}
                </div>
              </foreignObject>

              {/* 节点标签 */}
              <foreignObject x={36} y={8} width={nodeWidth - 44} height={20}>
                <div className="text-xs font-semibold truncate" style={{ color: nodeTypeColor }}>
                  {node.label}
                </div>
              </foreignObject>

              {/* 节点状态 */}
              <foreignObject x={8} y={34} width={nodeWidth - 16} height={20}>
                <div className="theme-text-subtle flex items-center gap-1 text-xs">
                  {node.status === 'running' && (
                    <>
                      <Clock className="h-3 w-3 theme-text-accent animate-spin" />
                      {t('workflow.inlineMonitor.dagMonitor.status.running', {
                        defaultValue: '运行中',
                      })}
                    </>
                  )}
                  {node.status === 'completed' && (
                    <>
                      <CheckCircle className="h-3 w-3 theme-text-success" />
                      {translateWithDefault(
                        t,
                        'workflow.inlineMonitor.duration.millisecondsShort',
                        '{{value}}ms',
                        { value: calculateNodeDuration(node) }
                      )}
                    </>
                  )}
                  {node.status === 'pending' &&
                    (
                      <>
                        <Clock className="h-3 w-3 theme-text-subtle" />
                        {t('workflow.inlineMonitor.dagMonitor.status.pending', {
                          defaultValue: '等待',
                        })}
                      </>
                    )}
                  {node.status === 'failed' && (
                    <>
                      <XCircle className="h-3 w-3 theme-text-danger" />
                      {t('workflow.inlineMonitor.dagMonitor.status.failed', {
                        defaultValue: '失败',
                      })}
                    </>
                  )}
                  {node.status === 'skipped' &&
                    t('workflow.inlineMonitor.dagMonitor.status.skipped', {
                      defaultValue: '跳过',
                    })}
                </div>
              </foreignObject>

              {/* 状态指示条 */}
              <rect
                x={0}
                y={nodeHeight - 4}
                width={nodeWidth}
                height={4}
                rx={0}
                fill={statusColor}
                className={`transition-all duration-300 ${
                  node.status === 'running' ? 'animate-pulse' : ''
                }`}
                style={{ borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}
              />
            </g>
          );
        })}
      </svg>

      {/* 节点详情面板 */}
      {selectedNode && (
        <div className="theme-panel-muted theme-border mt-4 rounded-lg border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="theme-text flex items-center gap-2 font-semibold">
              <span className="theme-text-subtle inline-flex items-center justify-center">
                {getNodeTypeIcon(selectedNode.id, selectedNode.label)}
              </span>
              {selectedNode.label}
            </h4>
            <button
              onClick={() => setSelectedNode(null)}
              className="theme-button-ghost"
              aria-label={t('common.close', { defaultValue: '关闭' })}
              title={t('common.close', { defaultValue: '关闭' })}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="theme-text-subtle">
                {t('workflow.inlineMonitor.dagMonitor.nodeDetails.nodeId', {
                  defaultValue: '节点 ID',
                })}
                :
              </span>
              <span className="theme-text font-mono text-xs">{selectedNode.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="theme-text-subtle">
                {t('workflow.inlineMonitor.dagMonitor.nodeDetails.status', {
                  defaultValue: '状态',
                })}
                :
              </span>
              <span className={`font-medium ${getNodeStatusTextClass(selectedNode.status)}`}>
                {selectedNode.status === 'running' &&
                  t('workflow.inlineMonitor.dagMonitor.status.running', {
                    defaultValue: '运行中',
                  })}
                {selectedNode.status === 'completed' &&
                  t('workflow.inlineMonitor.dagMonitor.status.completed', {
                    defaultValue: '完成',
                  })}
                {selectedNode.status === 'pending' &&
                  t('workflow.inlineMonitor.dagMonitor.status.pending', {
                    defaultValue: '等待',
                  })}
                {selectedNode.status === 'failed' &&
                  t('workflow.inlineMonitor.dagMonitor.status.failed', {
                    defaultValue: '失败',
                  })}
                {selectedNode.status === 'skipped' &&
                  t('workflow.inlineMonitor.dagMonitor.status.skipped', {
                    defaultValue: '跳过',
                  })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="theme-text-subtle">
                {t('workflow.inlineMonitor.dagMonitor.nodeDetails.type', {
                  defaultValue: '类型',
                })}
                :
              </span>
              <span className="theme-text">
                {(() => {
                  const type = parseNodeType(selectedNode.id, selectedNode.label);
                  const typeLabels: Record<string, string> = {
                    Search: t('workflow.inlineMonitor.dagMonitor.nodeTypes.search', {
                      defaultValue: '搜索',
                    }),
                    Read: t('workflow.inlineMonitor.dagMonitor.nodeTypes.read', {
                      defaultValue: '读取',
                    }),
                    Write: t('workflow.inlineMonitor.dagMonitor.nodeTypes.write', {
                      defaultValue: '写入',
                    }),
                    Agent: t('workflow.inlineMonitor.dagMonitor.nodeTypes.agent', {
                      defaultValue: '智能体',
                    }),
                    Command: t('workflow.inlineMonitor.dagMonitor.nodeTypes.command', {
                      defaultValue: '命令',
                    }),
                    Explore: t('workflow.inlineMonitor.dagMonitor.nodeTypes.explore', {
                      defaultValue: '探索',
                    }),
                    Review: t('workflow.inlineMonitor.dagMonitor.nodeTypes.review', {
                      defaultValue: '审查',
                    }),
                    Refactor: t('workflow.inlineMonitor.dagMonitor.nodeTypes.refactor', {
                      defaultValue: '重构',
                    }),
                    Test: t('workflow.inlineMonitor.dagMonitor.nodeTypes.test', {
                      defaultValue: '测试',
                    }),
                    Build: t('workflow.inlineMonitor.dagMonitor.nodeTypes.build', {
                      defaultValue: '构建',
                    }),
                    Deploy: t('workflow.inlineMonitor.dagMonitor.nodeTypes.deploy', {
                      defaultValue: '部署',
                    }),
                  };

                  return typeLabels[type] || type;
                })()}
              </span>
            </div>
            {selectedNode.startedAt && (
              <div className="flex justify-between">
                <span className="theme-text-subtle">
                  {t('workflow.inlineMonitor.dagMonitor.nodeDetails.startedAt', {
                    defaultValue: '开始时间',
                  })}
                  :
                </span>
                <span className="theme-text">{formatTimestamp(selectedNode.startedAt)}</span>
              </div>
            )}
            {selectedNode.completedAt && (
              <div className="flex justify-between">
                <span className="theme-text-subtle">
                  {t('workflow.inlineMonitor.dagMonitor.nodeDetails.completedAt', {
                    defaultValue: '完成时间',
                  })}
                  :
                </span>
                <span className="theme-text">{formatTimestamp(selectedNode.completedAt)}</span>
              </div>
            )}
            {calculateNodeDuration(selectedNode) > 0 && (
              <div className="flex justify-between">
                <span className="theme-text-subtle">
                  {t('workflow.inlineMonitor.dagMonitor.nodeDetails.duration', {
                    defaultValue: '执行时长',
                  })}
                  :
                </span>
                <span className="theme-text">
                  {translateWithDefault(
                    t,
                    'workflow.inlineMonitor.duration.millisecondsShort',
                    '{{value}}ms',
                    { value: calculateNodeDuration(selectedNode) }
                  )}
                </span>
              </div>
            )}

            {/* 🔥 工具调用详细信息 */}
            {selectedNode.tool_calls && selectedNode.tool_calls.length > 0 && (
              <div className="theme-border mt-3 border-t pt-3">
                <div className="theme-text-subtle mb-2 font-medium">
                  {translateWithDefault(
                    t,
                    'workflow.inlineMonitor.dagMonitor.nodeDetails.toolCalls',
                    '工具调用 ({{count}})',
                    { count: selectedNode.tool_calls.length }
                  )}
                </div>
                <div className="space-y-2">
                  {selectedNode.tool_calls.map((tool, idx) => (
                    <div
                      key={idx}
                      className={`rounded p-2 text-xs ${
                        tool.is_error
                          ? 'theme-surface-danger'
                          : 'theme-surface-success'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="theme-text font-medium">{tool.tool_name}</span>
                        <span className={tool.is_error ? 'theme-text-danger' : 'theme-text-success'}>
                          {tool.is_error
                            ? t('workflow.inlineMonitor.dagMonitor.nodeDetails.toolFailed', {
                                defaultValue: '失败',
                              })
                            : t('workflow.inlineMonitor.dagMonitor.nodeDetails.toolSuccess', {
                                defaultValue: '成功',
                              })}
                        </span>
                      </div>
                      {tool.execution_time_ms !== undefined && (
                        <div className="theme-text-subtle mb-1">
                          {translateWithDefault(
                            t,
                            'workflow.inlineMonitor.dagMonitor.nodeDetails.toolDuration',
                            '耗时: {{count}}ms',
                            { count: tool.execution_time_ms }
                          )}
                        </div>
                      )}
                      {tool.output_length > 0 && (
                        <div className="theme-text-subtle mb-1">
                          {translateWithDefault(
                            t,
                            'workflow.inlineMonitor.dagMonitor.nodeDetails.toolOutputLength',
                            '输出: {{count}} 字符',
                            { count: tool.output_length }
                          )}
                        </div>
                      )}
                      {tool.tool_input && (
                        <details className="mt-1">
                          <summary className="theme-text-subtle cursor-pointer hover:text-[var(--text-primary)]">
                            {t('workflow.inlineMonitor.dagMonitor.nodeDetails.toolInput', {
                              defaultValue: '输入参数',
                            })}
                          </summary>
                          <pre className="theme-code-surface theme-border mt-1 overflow-x-auto rounded border p-1">
                            {tool.tool_input}
                          </pre>
                        </details>
                      )}
                      {tool.tool_output && (
                        <details className="mt-1">
                          <summary className="theme-text-subtle cursor-pointer hover:text-[var(--text-primary)]">
                            {t('workflow.inlineMonitor.dagMonitor.nodeDetails.toolOutput', {
                              defaultValue: '输出结果',
                            })}
                          </summary>
                          <pre className="theme-code-surface theme-border mt-1 max-h-32 overflow-x-auto overflow-y-auto rounded border p-1">
                            {tool.tool_output}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.output && (
              <div className="mt-3">
                <div className="theme-text-subtle mb-1">
                  {t('workflow.inlineMonitor.dagMonitor.nodeDetails.output', {
                    defaultValue: '输出',
                  })}
                  :
                </div>
                <div className="theme-code-surface theme-border max-h-32 overflow-y-auto rounded border p-2 text-xs">
                  {selectedNode.output}
                </div>
              </div>
            )}
            {selectedNode.error && (
              <div className="mt-3">
                <div className="theme-text-danger mb-1">
                  {t('workflow.inlineMonitor.dagMonitor.nodeDetails.error', {
                    defaultValue: '错误',
                  })}
                  :
                </div>
                <div className="theme-surface-danger p-2 text-xs">
                  {selectedNode.error}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
  const { t } = useTranslation();
  const duration = calculateNodeDuration(node);

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${getNodeStatusSurfaceClass(node.status)}`}
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
            <div className="theme-text font-medium">{node.label}</div>
            <div className="theme-text-subtle text-xs">{node.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {duration > 0 && (
            <span className="theme-text-subtle text-xs">
              {translateWithDefault(
                t,
                'workflow.inlineMonitor.duration.millisecondsShort',
                '{{value}}ms',
                { value: duration }
              )}
            </span>
          )}
          <Badge variant="outline" className={getNodeStatusBadgeClass(node.status)}>
            {node.status === 'running' &&
              t('workflow.inlineMonitor.dagMonitor.status.running', {
                defaultValue: '运行中',
              })}
            {node.status === 'completed' &&
              t('workflow.inlineMonitor.dagMonitor.status.completed', {
                defaultValue: '完成',
              })}
            {node.status === 'pending' &&
              t('workflow.inlineMonitor.dagMonitor.status.pending', {
                defaultValue: '等待',
              })}
            {node.status === 'failed' &&
              t('workflow.inlineMonitor.dagMonitor.status.failed', {
                defaultValue: '失败',
              })}
            {node.status === 'skipped' &&
              t('workflow.inlineMonitor.dagMonitor.status.skipped', {
                defaultValue: '跳过',
              })}
          </Badge>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 theme-text-subtle" />
          ) : (
            <ChevronRight className="h-4 w-4 theme-text-subtle" />
          )}
        </div>
      </div>

      {isExpanded && (node.output || node.error) && (
        <div className="theme-border mt-3 border-t pt-3" data-testid="node-details">
          {node.output && (
            <div className="mb-2">
              <div className="theme-text text-xs font-medium mb-1">
                {t('workflow.inlineMonitor.dagMonitor.nodeDetails.output', {
                  defaultValue: '输出',
                })}
                :
              </div>
              <div className="theme-code-surface theme-border max-h-20 overflow-x-auto overflow-y-auto rounded border p-2 text-xs">
                {node.output}
              </div>
            </div>
          )}
          {node.error && (
            <div data-testid="workflow-error">
              <div className="theme-text-danger text-xs font-medium mb-1">
                {t('workflow.inlineMonitor.dagMonitor.nodeDetails.error', {
                  defaultValue: '错误',
                })}
                :
              </div>
              <div className="theme-surface-danger p-2 text-xs">
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
  const { t } = useTranslation();

  const getEventColor = (type: ProgressEventType): string => {
    switch (type) {
      case 'node_started':
        return 'theme-text-accent';
      case 'node_completed':
        return 'theme-text-success';
      case 'node_progress':
        return 'theme-text-warning';
      case 'tool_call':
        return 'theme-text-info';
      default:
        return 'theme-text-subtle';
    }
  };

  const getEventLabel = (type: ProgressEventType): string => {
    switch (type) {
      case 'node_started':
        return t('workflow.inlineMonitor.dagMonitor.timeline.started', {
          defaultValue: '▶ 开始',
        });
      case 'node_completed':
        return t('workflow.inlineMonitor.dagMonitor.timeline.completed', {
          defaultValue: '完成',
        });
      case 'node_progress':
        return t('workflow.inlineMonitor.dagMonitor.timeline.progress', {
          defaultValue: '进度',
        });
      case 'tool_call':
        return t('workflow.inlineMonitor.dagMonitor.timeline.toolCall', {
          defaultValue: '工具调用',
        });
      default:
        return type;
    }
  };

  return (
    <div className="theme-soft-hover flex gap-2 rounded px-2 py-1" data-testid="timeline-log">
      <span className="theme-text-subtle select-none">
        {formatTimestamp(log.timestamp)}
      </span>
      <span className={getEventColor(log.type)}>
        {getEventLabel(log.type)}
      </span>
      {log.nodeId && (
        <span className="theme-text-accent">[{log.nodeId}]</span>
      )}
      {log.message && (
        <span className="theme-text-subtle truncate">{log.message}</span>
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
