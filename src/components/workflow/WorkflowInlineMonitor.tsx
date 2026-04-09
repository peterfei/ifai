/**
 * 工作流内嵌监控器 - Claude Code 风格
 *
 * 实时显示工作流节点执行过程，类似 Claude Code 的可视化
 */

import React, { useState, useEffect } from 'react';
import { Card } from '../UI/card';
import { Badge } from '../UI/badge';
import { Progress } from '../UI/progress';
import { Button } from '../UI/button';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Zap, Search, FileText, Edit, Code, Play } from 'lucide-react';

// ==================== 类型定义 ====================

interface WorkflowNode {
  id: string;
  type: 'search' | 'read' | 'write' | 'agent' | 'tool' | 'command';
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  details?: string;
  timestamp?: number;
}

interface WorkflowInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  startTime: number;
  progress?: number;
  currentNode?: string;
  nodes?: WorkflowNode[];
}

interface WorkflowInlineMonitorProps {
  workflowId: string;
}

// ==================== 节点图标映射 ====================

const getNodeIcon = (type: WorkflowNode['type'], status: WorkflowNode['status']) => {
  const iconProps = "w-4 h-4";

  if (status === 'completed') {
    return <CheckCircle className={`${iconProps} text-green-500`} />;
  }
  if (status === 'failed') {
    return <XCircle className={`${iconProps} text-red-500`} />;
  }
  if (status === 'running') {
    return <Clock className={`${iconProps} text-blue-500 animate-spin`} />;
  }

  // Pending 状态显示类型图标
  switch (type) {
    case 'search':
      return <Search className={`${iconProps} text-gray-400`} />;
    case 'read':
      return <FileText className={`${iconProps} text-gray-400`} />;
    case 'write':
      return <Edit className={`${iconProps} text-gray-400`} />;
    case 'agent':
      return <Code className={`${iconProps} text-gray-400`} />;
    case 'tool':
      return <Zap className={`${iconProps} text-gray-400`} />;
    case 'command':
      return <Play className={`${iconProps} text-gray-400`} />;
    default:
      return <Clock className={`${iconProps} text-gray-400`} />;
  }
};

// ==================== 辅助函数 ====================

function getChatEventBus() {
  if (typeof window !== 'undefined') {
    return (window as any).__GLOBAL_CHAT_EVENT_BUS__;
  }
  return null;
}

// ==================== 主组件 ====================

export function WorkflowInlineMonitor({ workflowId, onComplete }: WorkflowInlineMonitorProps) {
  const [workflow, setWorkflow] = useState<WorkflowInfo>({
    id: workflowId,
    name: '工作流执行中',
    status: 'running',
    startTime: Date.now(),
    progress: 0,
    currentNode: '初始化...',
    nodes: []
  });
  const [isExpanded, setIsExpanded] = useState(true);

  // 监听工作流事件
  useEffect(() => {
    const chatEventBus = getChatEventBus();
    if (!chatEventBus) return;

    const unsubscribeStarted = chatEventBus.on('workflow:started' as any, (payload: any) => {
      if (payload.workflowId === workflowId || payload.workflow_id === workflowId) {
        setWorkflow(prev => ({
          ...prev,
          name: payload.workflowType || payload.workflow_type || '工作流执行中',
          status: 'running',
          startTime: Date.now(),
          nodes: []
        }));
      }
    });

    const unsubscribeProgress = chatEventBus.on('workflow:progress' as any, (payload: any) => {
      if (payload.workflowId === workflowId || payload.workflow_id === workflowId) {
        const nodeId = payload.node_id || payload.currentNode;
        const messageType = payload.event_type || payload.messageType || 'info';
        const message = payload.message || payload.details || '';

        // 解析节点类型
        let nodeType: WorkflowNode['type'] = 'tool';
        if (nodeId?.toLowerCase().includes('search')) nodeType = 'search';
        else if (nodeId?.toLowerCase().includes('read')) nodeType = 'read';
        else if (nodeId?.toLowerCase().includes('write')) nodeType = 'write';
        else if (nodeId?.toLowerCase().includes('agent')) nodeType = 'agent';
        else if (nodeId?.toLowerCase().includes('command')) nodeType = 'command';

        // 创建新节点
        const newNode: WorkflowNode = {
          id: nodeId || `node-${Date.now()}`,
          type: nodeType,
          label: nodeId || message,
          status: 'running',
          details: message,
          timestamp: Date.now()
        };

        setWorkflow(prev => {
          const existingNodeIndex = prev.nodes?.findIndex(n => n.id === nodeId);
          let updatedNodes = [...(prev.nodes || [])];

          if (existingNodeIndex >= 0) {
            // 更新现有节点
            updatedNodes[existingNodeIndex] = {
              ...updatedNodes[existingNodeIndex],
              status: 'completed',
              details: message
            };
          } else {
            // 添加新节点
            updatedNodes.push(newNode);
          }

          return {
            ...prev,
            currentNode: nodeId,
            nodes: updatedNodes,
            progress: Math.min(((prev.nodes?.length || 0) + 1) * 10, 100)
          };
        });
      }
    });

    const unsubscribeCompleted = chatEventBus.on('workflow:completed' as any, (payload: any) => {
      if (payload.workflowId === workflowId || payload.workflow_id === workflowId) {
        setWorkflow(prev => ({
          ...prev,
          status: 'completed',
          progress: 100,
          nodes: (prev.nodes || []).map(n => ({ ...n, status: 'completed' as const }))
        }));
        onComplete?.();
      }
    });

    const unsubscribeError = chatEventBus.on('workflow:error' as any, (payload: any) => {
      if (payload.workflowId === workflowId || payload.workflow_id === workflowId) {
        setWorkflow(prev => ({
          ...prev,
          status: 'failed',
          nodes: (prev.nodes || []).map(n => ({
            ...n,
            status: n.status === 'running' ? 'failed' : n.status
          }))
        }));
      }
    });

    return () => {
      unsubscribeStarted();
      unsubscribeProgress();
      unsubscribeCompleted();
      unsubscribeError();
    };
  }, [workflowId, onComplete]);

  // 自动收起已完成的工作流
  useEffect(() => {
    if (workflow.status === 'completed' || workflow.status === 'failed') {
      const timer = setTimeout(() => {
        setIsExpanded(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [workflow.status]);

  // 获取状态颜色
  const getStatusColor = () => {
    switch (workflow.status) {
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-blue-500';
    }
  };

  const getStatusText = () => {
    switch (workflow.status) {
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return '执行中...';
    }
  };

  // 计算运行时间
  const duration = Math.floor((Date.now() - workflow.startTime) / 1000);

  // 🔥 根据状态更新工作流名称
  const displayName = workflow.status === 'completed'
    ? '工作流已完成'
    : workflow.status === 'failed'
    ? '工作流失败'
    : workflow.name;

  return (
    <div className="mx-auto max-w-2xl my-2">
      <Card className="border-blue-500/30 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm">{displayName}</span>
            <Badge variant="outline" className={getStatusColor()}>
              {getStatusText()}
            </Badge>
            {workflow.nodes && workflow.nodes.length > 0 && (
              <Badge variant="outline" className="text-gray-500">
                {workflow.nodes.length} 节点
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{duration}s</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* 展开内容 */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3">
            {/* 进度条 */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>进度</span>
                <span>{workflow.progress || 0}%</span>
              </div>
              <Progress value={workflow.progress || 0} className="h-1.5" />
            </div>

            {/* 节点列表 */}
            {workflow.nodes && workflow.nodes.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">执行节点</div>
                <div className="space-y-1.5">
                  {workflow.nodes.map((node, index) => (
                    <div
                      key={node.id}
                      className={`flex items-start gap-2 p-2 rounded-lg border transition-all ${
                        node.status === 'running'
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : node.status === 'completed'
                          ? 'bg-green-500/5 border-green-500/20'
                          : node.status === 'failed'
                          ? 'bg-red-500/5 border-red-500/20'
                          : 'bg-gray-500/5 border-gray-500/20'
                      }`}
                    >
                      {/* 节点图标 */}
                      <div className="mt-0.5">
                        {getNodeIcon(node.type, node.status)}
                      </div>

                      {/* 节点内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{node.label}</span>
                          {node.status === 'running' && (
                            <span className="text-xs text-blue-500 animate-pulse">运行中</span>
                          )}
                        </div>
                        {node.details && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate font-mono">
                            {node.details}
                          </div>
                        )}
                      </div>

                      {/* 连接线 */}
                      {index < workflow.nodes!.length - 1 && (
                        <div className="absolute left-4 mt-6 w-px h-4 bg-gray-600/30" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 当前节点 */}
            {workflow.status === 'running' && workflow.currentNode && !workflow.nodes?.some(n => n.id === workflow.currentNode) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span>当前节点: {workflow.currentNode}</span>
              </div>
            )}

            {/* 完成状态 */}
            {workflow.status === 'completed' && (
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircle className="w-3 h-3" />
                <span>工作流执行完成</span>
              </div>
            )}

            {/* 失败状态 */}
            {workflow.status === 'failed' && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <XCircle className="w-3 h-3" />
                <span>工作流执行失败</span>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================== 容器组件 ====================

export function WorkflowInlineMonitorContainer() {
  const [activeWorkflows, setActiveWorkflows] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // 🔥 使用状态来跟踪开发模式，这样可以动态响应 window.__E2E__ 的变化
  const [isDevMode, setIsDevMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!(
      (window as any).__E2E__ ||
      (window as any).__DEV__ ||
      import.meta.env.DEV
    );
  });

  // 🔥 用于跟踪是否有正在运行的工作流
  const [hasRunningWorkflow, setHasRunningWorkflow] = useState(false);

  // 🔥 检查 E2E 模式标志（支持动态设置）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkDevMode = () => {
        const isDev = !!(
          (window as any).__E2E__ ||
          (window as any).__DEV__ ||
          import.meta.env.DEV
        );
        setIsDevMode(isDev);
      };

      // 立即检查一次
      checkDevMode();

      // 定期检查（防止 window.__E2E__ 在组件挂载后才设置）
      const interval = setInterval(checkDevMode, 100);
      const timeout = setTimeout(() => {
        clearInterval(interval);
      }, 2000); // 2秒后停止检查

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, []);

  useEffect(() => {
    setIsInitialized(true);

    const chatEventBus = getChatEventBus();
    if (!chatEventBus) {
      console.error('[WorkflowInlineMonitorContainer] chatEventBus not available');
      return;
    }

    // 监听工作流启动
    const unsubscribeStarted = chatEventBus.on('workflow:started' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitorContainer] Workflow started:', workflowId);

      // 🔥 FIX: 清除旧的工作流监控器，只显示最新的
      setActiveWorkflows([workflowId]);
      setHasRunningWorkflow(true);
    });

    // 监听工作流完成
    const unsubscribeCompleted = chatEventBus.on('workflow:completed' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitorContainer] Workflow completed:', workflowId);

      // 🔥 先更新 hasRunningWorkflow 标志
      setHasRunningWorkflow(false);

      // 🔥 3秒后自动移除监控器
      setTimeout(() => {
        setActiveWorkflows(prev => prev.filter(id => id !== workflowId));
        console.log('[WorkflowInlineMonitorContainer] Auto-removed completed workflow monitor:', workflowId);
      }, 3000);
    });

    // 监听工作流错误
    const unsubscribeError = chatEventBus.on('workflow:error' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.error('[WorkflowInlineMonitorContainer] Workflow error:', workflowId);

      // 🔥 先更新 hasRunningWorkflow 标志
      setHasRunningWorkflow(false);

      // 🔥 3秒后自动移除监控器
      setTimeout(() => {
        setActiveWorkflows(prev => prev.filter(id => id !== workflowId));
        console.log('[WorkflowInlineMonitorContainer] Auto-removed failed workflow monitor:', workflowId);
      }, 3000);
    });

    return () => {
      unsubscribeStarted();
      unsubscribeCompleted();
      unsubscribeError();
    };
  }, []);

  // 🔥 未初始化时不显示任何内容
  if (!isInitialized) {
    return null;
  }

  return (
    <>
      {/* 🔥 真实工作流监控器 */}
      {activeWorkflows.map(workflowId => (
        <WorkflowInlineMonitor
          key={workflowId}
          workflowId={workflowId}
        />
      ))}
    </>
  );
}
