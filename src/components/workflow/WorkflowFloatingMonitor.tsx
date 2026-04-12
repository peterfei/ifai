/**
 * 工作流浮动监控器
 *
 * 在聊天界面之上显示工作流执行状态
 * 可拖拽、可最小化、半透明浮层
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WorkflowDAGMonitor, DAGNode, DAGEdge, WorkflowExecutionResult } from './WorkflowDAGMonitor';
import { Button } from '../UI/button';
import { Card } from '../UI/card';
import { Badge } from '../UI/badge';
import { Progress } from '../UI/progress';
import {
  Minimize2,
  Maximize2,
  X,
  Zap,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react';

// 🔥 动态获取 chatEventBus，避免导入时机问题
function getChatEventBus() {
  if (typeof window !== 'undefined') {
    return (window as any).__GLOBAL_CHAT_EVENT_BUS__;
  }
  return null;
}

// ==================== 类型定义 ====================

interface WorkflowInfo {
  id: string;
  name: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  status: 'running' | 'completed' | 'failed';
  startTime: number;
}

interface WorkflowFloatingMonitorProps {
  // 当前活跃的工作流列表
  workflows: WorkflowInfo[];
  // 工作流完成回调
  onWorkflowComplete?: (workflowId: string, result: WorkflowExecutionResult) => void;
  // 工作流错误回调
  onWorkflowError?: (workflowId: string, error: string) => void;
  // 关闭监控器回调
  onClose?: () => void;
}

// ==================== 主组件 ====================

export function WorkflowFloatingMonitor({
  workflows,
  onWorkflowComplete,
  onWorkflowError,
  onClose,
}: WorkflowFloatingMonitorProps) {
  // ==================== 状态 ====================

  const [isMinimized, setIsMinimized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    workflows.length > 0 ? workflows[0].id : null
  );
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const dragRef = useRef<HTMLDivElement>(null);

  // ==================== 计算属性 ====================

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0];
  const runningCount = workflows.filter((w) => w.status === 'running').length;

  // 更新选中的工作流 ID（当当前工作流完成时）
  useEffect(() => {
    if (selectedWorkflowId) {
      const currentWorkflow = workflows.find((w) => w.id === selectedWorkflowId);
      if (currentWorkflow && currentWorkflow.status !== 'running') {
        // 当前工作流已完成，切换到下一个运行中的工作流
        const nextRunning = workflows.find((w) => w.status === 'running');
        if (nextRunning) {
          setSelectedWorkflowId(nextRunning.id);
        }
      }
    }
  }, [selectedWorkflowId, workflows]);

  // 如果没有选中的工作流且有活跃工作流，自动选中第一个
  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [selectedWorkflowId, workflows]);

  // ==================== 拖拽逻辑 ====================

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('[data-no-drag]')) {
      return;
    }

    setIsDragging(true);
    const rect = dragRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // 限制在窗口范围内
      const maxX = window.innerWidth - 400;
      const maxY = window.innerHeight - 200;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // ==================== 渲染 ====================

  if (workflows.length === 0) {
    return null;
  }

  return (
    <div
      ref={dragRef}
      className="fixed z-50 shadow-2xl rounded-lg overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isMinimized ? 'auto' : '500px',
        maxHeight: isMinimized ? 'auto' : '80vh',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        transition: isDragging ? 'none' : 'all 0.2s ease',
      }}
      onMouseDown={handleMouseDown}
      data-testid="workflow-floating-monitor"
    >
      {/* 顶部标题栏（可拖拽） */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white cursor-move"
        data-no-drag
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 animate-pulse" />
          <span className="font-semibold text-sm">
            工作流监控器
            {runningCount > 0 && (
              <Badge className="ml-2 bg-yellow-400 text-yellow-900">
                {runningCount} 运行中
              </Badge>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1" data-no-drag>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-white hover:bg-white/20"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? '展开' : '最小化'}
          >
            {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-white hover:bg-red-500"
              onClick={onClose}
              title="关闭"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* 最小化状态 */}
      {isMinimized ? (
        <div
          className="px-4 py-2 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
          onClick={() => setIsMinimized(false)}
          data-no-drag
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium truncate">
                {selectedWorkflow?.name || '工作流执行中'}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedWorkflow?.nodes.filter(n => n.status === 'completed').length || 0} / {selectedWorkflow?.nodes.length || 0} 节点完成
              </div>
            </div>
            <div className="w-16">
              {selectedWorkflow && (
                <MiniWorkflowProgress workflow={selectedWorkflow} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 工作流切换标签 */}
          {workflows.length > 1 && (
            <div className="flex gap-1 p-2 bg-gray-50 dark:bg-gray-800 overflow-x-auto" data-no-drag>
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedWorkflowId === workflow.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                  onClick={() => setSelectedWorkflowId(workflow.id)}
                >
                  {workflow.name}
                  <WorkflowStatusBadge status={workflow.status} />
                </button>
              ))}
            </div>
          )}

          {/* 折叠按钮 */}
          <div className="px-4 py-2 bg-white dark:bg-gray-800 border-b" data-no-drag>
            <button
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              <span>{isCollapsed ? '显示详情' : '隐藏详情'}</span>
            </button>
          </div>

          {/* 完整监控器内容 */}
          {!isCollapsed && selectedWorkflow && (
            <div className="overflow-auto max-h-[60vh]" data-no-drag>
              <WorkflowDAGMonitor
                workflowId={selectedWorkflow.id}
                nodes={selectedWorkflow.nodes}
                edges={selectedWorkflow.edges}
                onComplete={(result) => onWorkflowComplete?.(selectedWorkflow.id, result)}
                onError={(error) => onWorkflowError?.(selectedWorkflow.id, error)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== 子组件 ====================

/** 工作流状态徽章 */
interface WorkflowStatusBadgeProps {
  status: 'running' | 'completed' | 'failed';
}

function WorkflowStatusBadge({ status }: WorkflowStatusBadgeProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return 'R';
      case 'completed':
        return 'C';
      case 'failed':
        return 'F';
    }
  };

  return (
    <Badge className={`ml-2 ${getStatusColor()}`}>
      {getStatusIcon()}
    </Badge>
  );
}

/** 迷你工作流进度条（用于最小化状态） */
interface MiniWorkflowProgressProps {
  workflow: WorkflowInfo;
}

function MiniWorkflowProgress({ workflow }: MiniWorkflowProgressProps) {
  const completedCount = workflow.nodes.filter((n) => n.status === 'completed').length;
  const totalCount = workflow.nodes.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-1">
      <Progress value={progress} className="h-2" />
      <div className="text-xs text-center text-muted-foreground">
        {Math.round(progress)}%
      </div>
    </div>
  );
}

// ==================== 导出辅助组件 ====================

/**
 * 工作流浮动监控器容器
 *
 * 负责管理工作流状态和与后端的通信
 */

export function WorkflowFloatingMonitorContainer() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);

  console.log('[WorkflowFloatingMonitorContainer] 🎯 组件已挂载');

  // 监听 chatEventBus 事件
  useEffect(() => {
    let mounted = true;

    console.log('[WorkflowFloatingMonitorContainer] 🎯 useEffect 开始执行');

    // 动态获取 chatEventBus
    const chatEventBus = getChatEventBus();

    console.log('[WorkflowFloatingMonitorContainer] 📡 chatEventBus 实例:', chatEventBus);

    if (!chatEventBus) {
      console.error('[WorkflowFloatingMonitorContainer] ❌ chatEventBus 为 null！');
      return;
    }

    console.log('[WorkflowFloatingMonitorContainer] 🎯 设置 chatEventBus 监听器');

    // 监听工作流启动事件
    const unsubscribeStart = chatEventBus.on('workflow:started' as any, (payload: any) => {
      if (!mounted) return;

      console.log('[WorkflowFloatingMonitorContainer] 📥 Workflow started 事件已触发:', payload);

      const workflowId = payload.workflowId || payload.workflow_id;
      const workflowName = payload.workflowType || payload.workflow_type || payload.workflowName || '工作流';

      console.log('[WorkflowFloatingMonitorContainer] 🔍 解析后的 workflowId:', workflowId);
      console.log('[WorkflowFloatingMonitorContainer] 🔍 解析后的 workflowName:', workflowName);

      setWorkflows((prev) => {
        // 避免重复添加
        if (prev.some((w) => w.id === workflowId)) {
          console.log('[WorkflowFloatingMonitorContainer] ⚠️ 工作流已存在，更新状态');
          return prev.map((w) =>
            w.id === workflowId
              ? { ...w, name: workflowName, status: 'running' as const }
              : w
          );
        }
        console.log('[WorkflowFloatingMonitorContainer] ✅ 添加新工作流');
        return [
          ...prev,
          {
            id: workflowId,
            name: workflowName,
            nodes: [],  // 初始为空，后续会更新
            edges: [],
            status: 'running' as const,
            startTime: Date.now(),
          },
        ];
      });
    });

    console.log('[WorkflowFloatingMonitorContainer] ✅ workflow:started 监听器已注册');

    // 监听工作流完成事件
    const unsubscribeComplete = chatEventBus.on('workflow:completed' as any, (payload: any) => {
      if (!mounted) return;

      console.log('[WorkflowFloatingMonitorContainer] ✅ Workflow completed:', payload);

      const workflowId = payload.workflowId || payload.workflow_id;

      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === workflowId
            ? { ...w, status: 'completed' as const }
            : w
        )
      );

      // 3秒后自动移除已完成的工作流
      setTimeout(() => {
        setWorkflows((prev) =>
          prev.filter((w) => w.id !== workflowId)
        );
      }, 3000);
    });

    // 监听工作流错误事件
    const unsubscribeError = chatEventBus.on('workflow:error' as any, (payload: any) => {
      if (!mounted) return;

      console.error('[WorkflowFloatingMonitorContainer] ❌ Workflow error:', payload);

      const workflowId = payload.workflowId || payload.workflow_id;

      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === workflowId
            ? { ...w, status: 'failed' as const }
            : w
        )
      );
    });

    return () => {
      mounted = false;
      unsubscribeStart();
      unsubscribeComplete();
      unsubscribeError();
      console.log('[WorkflowFloatingMonitorContainer] 🔌 清理监听器');
    };
  }, []);

  const handleWorkflowComplete = useCallback((workflowId: string, result: WorkflowExecutionResult) => {
    console.log('[WorkflowFloatingMonitorContainer] Workflow complete:', workflowId, result);
  }, []);

  const handleWorkflowError = useCallback((workflowId: string, error: string) => {
    console.error('[WorkflowFloatingMonitorContainer] Workflow error:', workflowId, error);
  }, []);

  const handleClose = useCallback(() => {
    setWorkflows([]);
  }, []);

  console.log('[WorkflowFloatingMonitorContainer] 📊 当前工作流数量:', workflows.length);
  console.log('[WorkflowFloatingMonitorContainer] 📋 工作流列表:', workflows);

  if (workflows.length === 0) {
    console.log('[WorkflowFloatingMonitorContainer] ⚠️ 没有工作流，不渲染监控器');
    return null;
  }

  console.log('[WorkflowFloatingMonitorContainer] ✅ 渲染工作流监控器');
  return (
    <WorkflowFloatingMonitor
      workflows={workflows}
      onWorkflowComplete={handleWorkflowComplete}
      onWorkflowError={handleWorkflowError}
      onClose={handleClose}
    />
  );
}
