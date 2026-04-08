/**
 * 工作流执行状态监控组件
 *
 * 实时显示工作流执行进度和状态
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// 动态导入 Tauri API 的辅助函数
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

async function listen<T>(event: string, handler: (event: { payload: T }) => void) {
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen<T>(event, handler);
}
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, AlertCircle, X } from 'lucide-react';

interface NodeResultInfo {
  node_id: string;
  status: string;
  output?: string;
  error?: string;
}

interface WorkflowExecutionResult {
  workflow_id: string;
  status: string;
  node_results: NodeResultInfo[];
  started_at?: number;
  completed_at?: number;
}

interface WorkflowMonitorProps {
  workflowId: string;
  onComplete?: (result: WorkflowExecutionResult) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

export function WorkflowMonitor({
  workflowId,
  onComplete,
  onError,
  onClose,
}: WorkflowMonitorProps) {
  const [status, setStatus] = useState<string>('Running');
  const [nodeResults, setNodeResults] = useState<NodeResultInfo[]>([]);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let pollInterval: NodeJS.Timeout;

    // 轮询状态
    const pollStatus = async () => {
      try {
        const result = await invoke<any>('get_workflow_status', {
          workflowId,
        });

        if (mounted) {
          setStatus(result.status);
          setCurrentNode(result.current_node);
          setCompletedNodes(result.completed_nodes || []);

          // 如果完成或失败，停止轮询
          if (result.status === 'Completed' || result.status === 'Failed') {
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('获取状态失败:', err);
        if (mounted) {
          clearInterval(pollInterval);
        }
      }
    };

    // 开始轮询
    pollStatus();
    pollInterval = setInterval(pollStatus, 1000);

    // 监听完成事件
    const unlistenComplete = listen<WorkflowExecutionResult>(
      'workflow-complete',
      (event) => {
        if (event.payload.workflow_id === workflowId) {
          const result = event.payload;
          if (mounted) {
            setStatus('Completed');
            setNodeResults(result.node_results || []);
            setCompletedNodes(
              result.node_results
                ?.filter((n: NodeResultInfo) => n.status === 'Completed')
                .map((n: NodeResultInfo) => n.node_id) || []
            );

            if (onComplete) {
              onComplete(result);
            }
          }
        }
      }
    );

    // 监听错误事件
    const unlistenError = listen<string>('workflow-error', (event) => {
      if (mounted) {
        setStatus('Failed');
        setError(event.payload);
        if (onError) {
          onError(event.payload);
        }
      }
    });

    // 记录开始时间
    setStartTime(Date.now());

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      unlistenComplete.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [workflowId, onComplete, onError]);

  const getNodeStatusIcon = (nodeStatus: string) => {
    switch (nodeStatus) {
      case 'Completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'Failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'Running':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getNodeStatusBadge = (nodeStatus: string) => {
    switch (nodeStatus) {
      case 'Completed':
        return <Badge className="bg-green-500">完成</Badge>;
      case 'Failed':
        return <Badge className="bg-red-500">失败</Badge>;
      case 'Running':
        return <Badge className="bg-blue-500">运行中</Badge>;
      default:
        return <Badge variant="outline">等待</Badge>;
    }
  };

  const progress = nodeResults.length > 0
    ? (nodeResults.filter((n) => n.status === 'Completed').length /
        nodeResults.length) *
      100
    : 0;

  const duration = startTime
    ? Math.floor((Date.now() - startTime) / 1000)
    : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>工作流执行中</CardTitle>
            <CardDescription>工作流 ID: {workflowId}</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
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
        <div className="flex items-center justify-between">
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
          {nodeResults.length > 0 && (
            <Badge variant="outline">
              {completedNodes.length} / {nodeResults.length} 节点
            </Badge>
          )}
        </div>

        {/* 进度条 */}
        {nodeResults.length > 0 && (
          <div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>进度</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* 节点结果 */}
        {nodeResults.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">节点执行结果</h3>
            <div className="space-y-2">
              {nodeResults.map((node, index) => (
                <div
                  key={node.node_id}
                  className="flex items-start gap-3 p-3 border rounded-lg"
                >
                  <div className="mt-0.5">{getNodeStatusIcon(node.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{node.node_id}</span>
                      {getNodeStatusBadge(node.status)}
                    </div>
                    {node.output && (
                      <div className="text-sm text-muted-foreground">
                        <div className="font-medium mb-1">输出:</div>
                        <div className="bg-muted p-2 rounded text-xs overflow-x-auto">
                          {node.output.length > 200
                            ? `${node.output.slice(0, 200)}...`
                            : node.output}
                        </div>
                      </div>
                    )}
                    {node.error && (
                      <div className="text-sm text-red-500">
                        <div className="font-medium mb-1">错误:</div>
                        <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded text-xs">
                          {node.error}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>等待节点执行结果...</p>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-2">
              <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-red-900 dark:text-red-100">
                  执行失败
                </div>
                <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
