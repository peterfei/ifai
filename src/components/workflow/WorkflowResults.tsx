/**
 * 工作流执行结果展示组件
 *
 * 显示工作流执行的详细结果
 */

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../UI/card';
import { Badge } from '../UI/badge';
import { Button } from '../UI/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../UI/tabs';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Share2,
  Clock,
  FileText,
} from 'lucide-react';

interface NodeResult {
  node_id: string;
  status: string;
  output?: string;
  error?: string;
  started_at?: number;
  completed_at?: number;
  metadata?: Record<string, any>;
}

interface WorkflowExecutionResults {
  workflow_id: string;
  status: string;
  node_results: NodeResult[];
  started_at: number;
  completed_at: number;
  total_duration: number;
  summary: {
    total_nodes: number;
    completed_nodes: number;
    failed_nodes: number;
    skipped_nodes: number;
  };
}

interface WorkflowResultsProps {
  results: WorkflowExecutionResults;
  onExport?: () => void;
  onShare?: () => void;
  onRetry?: () => void;
}

export function WorkflowResults({
  results,
  onExport,
  onShare,
  onRetry,
}: WorkflowResultsProps) {
  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'Failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'Skipped':
        return <AlertCircle className="theme-text-subtle w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return <Badge className="bg-green-500">完成</Badge>;
      case 'Failed':
        return <Badge className="bg-red-500">失败</Badge>;
      case 'Skipped':
        return <Badge variant="outline">跳过</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 整体摘要 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>工作流执行结果</CardTitle>
              <CardDescription>工作流 ID: {results.workflow_id}</CardDescription>
            </div>
            <div className="flex gap-2">
              {onExport && (
                <Button variant="outline" size="sm" onClick={onExport}>
                  <Download className="w-4 h-4 mr-2" />
                  导出
                </Button>
              )}
              {onShare && (
                <Button variant="outline" size="sm" onClick={onShare}>
                  <Share2 className="w-4 h-4 mr-2" />
                  分享
                </Button>
              )}
              {onRetry && results.status === 'Failed' && (
                <Button size="sm" onClick={onRetry}>
                  <Clock className="w-4 h-4 mr-2" />
                  重试
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(results.status)}
                <span className="font-semibold">状态</span>
              </div>
              <div className="text-2xl font-bold">
                {getStatusBadge(results.status)}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="theme-text-subtle mb-1 text-sm">总耗时</div>
              <div className="text-2xl font-bold">
                {formatDuration(results.total_duration)}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="theme-text-subtle mb-1 text-sm">完成节点</div>
              <div className="text-2xl font-bold">
                {results.summary.completed_nodes}/{results.summary.total_nodes}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="theme-text-subtle mb-1 text-sm">失败节点</div>
              <div className="text-2xl font-bold text-red-500">
                {results.summary.failed_nodes}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="theme-text-subtle text-sm">开始时间</div>
              <div className="font-semibold">{formatTimestamp(results.started_at)}</div>
            </div>
            <div>
              <div className="theme-text-subtle text-sm">完成时间</div>
              <div className="font-semibold">{formatTimestamp(results.completed_at)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 节点详情 */}
      <Card>
        <CardHeader>
          <CardTitle>节点执行详情</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">
                全部 ({results.node_results.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                成功 ({results.summary.completed_nodes})
              </TabsTrigger>
              <TabsTrigger value="failed">
                失败 ({results.summary.failed_nodes})
              </TabsTrigger>
              <TabsTrigger value="skipped">
                跳过 ({results.summary.skipped_nodes})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4 mt-4">
              {results.node_results.map((node) => (
                <NodeResultCard
                  key={node.node_id}
                  node={node}
                  formatDuration={formatDuration}
                  getStatusIcon={getStatusIcon}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4 mt-4">
              {results.node_results
                .filter((n) => n.status === 'Completed')
                .map((node) => (
                  <NodeResultCard
                    key={node.node_id}
                    node={node}
                    formatDuration={formatDuration}
                    getStatusIcon={getStatusIcon}
                    getStatusBadge={getStatusBadge}
                  />
                ))}
            </TabsContent>

            <TabsContent value="failed" className="space-y-4 mt-4">
              {results.node_results
                .filter((n) => n.status === 'Failed')
                .map((node) => (
                  <NodeResultCard
                    key={node.node_id}
                    node={node}
                    formatDuration={formatDuration}
                    getStatusIcon={getStatusIcon}
                    getStatusBadge={getStatusBadge}
                  />
                ))}
            </TabsContent>

            <TabsContent value="skipped" className="space-y-4 mt-4">
              {results.node_results
                .filter((n) => n.status === 'Skipped')
                .map((node) => (
                  <NodeResultCard
                    key={node.node_id}
                    node={node}
                    formatDuration={formatDuration}
                    getStatusIcon={getStatusIcon}
                    getStatusBadge={getStatusBadge}
                  />
                ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 导出选项 */}
      {onExport && (
        <Card>
          <CardHeader>
            <CardTitle>导出选项</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Button
                variant="outline"
                className="h-20 flex-col"
                onClick={() => onExport()}
              >
                <FileText className="w-6 h-6 mb-2" />
                <span>导出为 JSON</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col"
                onClick={() => onExport()}
              >
                <FileText className="w-6 h-6 mb-2" />
                <span>导出为 Markdown</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col"
                onClick={() => onExport()}
              >
                <FileText className="w-6 h-6 mb-2" />
                <span>导出为 PDF</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface NodeResultCardProps {
  node: NodeResult;
  formatDuration: (ms: number) => string;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusBadge: (status: string) => React.ReactNode;
}

function NodeResultCard({
  node,
  formatDuration,
  getStatusIcon,
  getStatusBadge,
}: NodeResultCardProps) {
  const duration =
    node.started_at && node.completed_at
      ? node.completed_at - node.started_at
      : 0;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="mt-1">{getStatusIcon(node.status)}</div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">{node.node_id}</h4>
              <div className="flex items-center gap-2">
                {duration > 0 && (
                  <span className="theme-text-subtle text-sm">
                    {formatDuration(duration)}
                  </span>
                )}
                {getStatusBadge(node.status)}
              </div>
            </div>

            {node.output && (
              <div className="mb-2">
                <div className="text-sm font-medium mb-1">输出:</div>
                <div className="theme-code-surface theme-border max-h-40 overflow-x-auto overflow-y-auto rounded border p-3 text-sm">
                  <pre className="whitespace-pre-wrap">{node.output}</pre>
                </div>
              </div>
            )}

            {node.error && (
              <div className="mb-2">
                <div className="text-sm font-medium mb-1 text-red-500">错误:</div>
                <div className="rounded border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {node.error}
                </div>
              </div>
            )}

            {node.metadata && Object.keys(node.metadata).length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">元数据:</div>
                <div className="theme-code-surface theme-border rounded border p-3 text-sm">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(node.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
