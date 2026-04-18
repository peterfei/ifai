/**
 * 工作流执行状态监控组件
 *
 * 实时显示工作流执行进度和状态
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../UI/card';

// 动态导入 Tauri API 的辅助函数
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

async function listen<T>(event: string, handler: (event: { payload: T }) => void) {
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen<T>(event, handler);
}
import { Badge } from '../UI/badge';
import { Button } from '../UI/button';
import { CheckCircle, XCircle, Clock, AlertCircle, X } from 'lucide-react';
import {
  getWorkflowStatusBadgeClass,
  getWorkflowStatusLabel,
  getWorkflowStatusTextClass,
} from './workflowStatusMeta';

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
  const { t } = useTranslation();
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
        console.error('[WorkflowMonitor] Failed to fetch workflow status:', err);
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
        return <CheckCircle className="theme-text-success w-5 h-5" />;
      case 'Failed':
        return <XCircle className="theme-text-danger w-5 h-5" />;
      case 'Running':
        return <Clock className="theme-text-info w-5 h-5 animate-spin" />;
      default:
        return <AlertCircle className="theme-text-subtle w-5 h-5" />;
    }
  };

  const getNodeStatusBadge = (nodeStatus: string) => {
    return (
      <Badge variant="outline" className={getWorkflowStatusBadgeClass(nodeStatus)}>
        {getWorkflowStatusLabel(nodeStatus, t)}
      </Badge>
    );
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
    <Card className="theme-panel theme-border w-full border">
      <CardHeader className="theme-panel-muted theme-border border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="theme-text">{t('workflow.monitor.title')}</CardTitle>
            <CardDescription className="theme-text-subtle">
              {t('workflow.monitor.workflowId', { id: workflowId })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="theme-text-subtle text-sm">{t('workflow.monitor.duration')}</div>
              <div className="theme-text text-lg font-semibold">
                {t('workflow.monitor.durationSeconds', { count: duration })}
              </div>
            </div>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="theme-button-ghost"
                title={t('common.close')}
                aria-label={t('common.close')}
              >
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
              <Clock className="theme-text-info w-5 h-5 animate-pulse" />
            )}
            {status === 'Completed' && (
              <CheckCircle className="theme-text-success w-5 h-5" />
            )}
            {status === 'Failed' && (
              <XCircle className="theme-text-danger w-5 h-5" />
            )}
            <span className={`font-semibold ${getWorkflowStatusTextClass(status)}`}>
              {getWorkflowStatusLabel(status, t)}
            </span>
          </div>
          {nodeResults.length > 0 && (
            <Badge variant="outline" className="theme-panel-elevated theme-border theme-text-muted border">
              {t('workflow.monitor.completedNodes', {
                completed: completedNodes.length,
                total: nodeResults.length,
              })}
            </Badge>
          )}
        </div>

        {/* 进度条 */}
        {nodeResults.length > 0 && (
          <div>
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
              <span>{t('workflow.monitor.progress')}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* 节点结果 */}
        {nodeResults.length > 0 ? (
          <div className="space-y-2">
            <h3 className="theme-text text-sm font-semibold">{t('workflow.monitor.nodeResults')}</h3>
            <div className="space-y-2">
              {nodeResults.map((node) => (
                <div
                  key={node.node_id}
                  className="theme-panel-muted theme-border flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="mt-0.5">{getNodeStatusIcon(node.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="theme-text font-medium">{node.node_id}</span>
                      {getNodeStatusBadge(node.status)}
                    </div>
                    {node.output && (
                      <div className="theme-text-subtle text-sm">
                        <div className="theme-text font-medium mb-1">{t('workflow.monitor.output')}</div>
                        <div className="theme-code-surface theme-border overflow-x-auto rounded border p-2 text-xs">
                          {node.output.length > 200
                            ? `${node.output.slice(0, 200)}...`
                            : node.output}
                        </div>
                      </div>
                    )}
                    {node.error && (
                      <div className="text-sm">
                        <div className="theme-text-danger font-medium mb-1">{t('workflow.monitor.error')}</div>
                        <div className="theme-surface-danger theme-text rounded p-2 text-xs">
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
          <div className="theme-text-subtle py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('workflow.monitor.waitingForResults')}</p>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="theme-surface-danger rounded-lg p-4">
            <div className="flex items-start gap-2">
              <XCircle className="theme-text-danger mt-0.5 w-5 h-5" />
              <div className="flex-1">
                <div className="theme-text font-semibold">
                  {t('workflow.monitor.executionFailed')}
                </div>
                <div className="theme-text mt-1 text-sm">
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
