/**
 * 工作流执行结果展示组件
 *
 * 显示工作流执行的详细结果
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  getWorkflowStatusBadgeClass,
  getWorkflowStatusLabel,
  getWorkflowStatusTextClass,
} from './workflowStatusMeta';

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
  const { t, i18n } = useTranslation();
  const formatDecimal = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString(i18n.language);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return t('workflow.inlineMonitor.duration.millisecondsShort', { value: ms });
    }

    if (ms < 60000) {
      return t('workflow.inlineMonitor.duration.secondsShort', {
        value: formatDecimal(ms / 1000),
      });
    }

    return t('workflow.inlineMonitor.duration.minutesShort', {
      value: formatDecimal(ms / 60000),
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="theme-text-success w-5 h-5" />;
      case 'Failed':
        return <XCircle className="theme-text-danger w-5 h-5" />;
      case 'Skipped':
        return <AlertCircle className="theme-text-subtle w-5 h-5" />;
      default:
        return <Clock className="theme-text-info w-5 h-5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant="outline" className={getWorkflowStatusBadgeClass(status)}>
        {getWorkflowStatusLabel(status, t)}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* 整体摘要 */}
      <Card className="theme-panel theme-border border">
        <CardHeader className="theme-panel-muted theme-border border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="theme-text">{t('workflow.results.title')}</CardTitle>
              <CardDescription className="theme-text-subtle">
                {t('workflow.results.workflowId', { id: results.workflow_id })}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {onExport && (
                <Button variant="outline" size="sm" onClick={onExport} className="theme-button-secondary">
                  <Download className="w-4 h-4 mr-2" />
                  {t('workflow.results.export')}
                </Button>
              )}
              {onShare && (
                <Button variant="outline" size="sm" onClick={onShare} className="theme-button-secondary">
                  <Share2 className="w-4 h-4 mr-2" />
                  {t('workflow.results.share')}
                </Button>
              )}
              {onRetry && results.status === 'Failed' && (
                <Button size="sm" onClick={onRetry} className="theme-button-primary">
                  <Clock className="w-4 h-4 mr-2" />
                  {t('workflow.results.retry')}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(results.status)}
                <span className="theme-text font-semibold">{t('workflow.results.status')}</span>
              </div>
              <div className="text-2xl font-bold">
                {getStatusBadge(results.status)}
              </div>
            </div>

            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <div className="theme-text-subtle mb-1 text-sm">{t('workflow.results.totalDuration')}</div>
              <div className="theme-text text-2xl font-bold">
                {formatDuration(results.total_duration)}
              </div>
            </div>

            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <div className="theme-text-subtle mb-1 text-sm">{t('workflow.results.completedNodesLabel')}</div>
              <div className="theme-text text-2xl font-bold">
                {results.summary.completed_nodes}/{results.summary.total_nodes}
              </div>
            </div>

            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <div className="theme-text-subtle mb-1 text-sm">{t('workflow.results.failedNodesLabel')}</div>
              <div className={`text-2xl font-bold ${getWorkflowStatusTextClass('Failed')}`}>
                {results.summary.failed_nodes}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="theme-text-subtle text-sm">{t('workflow.results.startedAt')}</div>
              <div className="theme-text font-semibold">{formatTimestamp(results.started_at)}</div>
            </div>
            <div>
              <div className="theme-text-subtle text-sm">{t('workflow.results.completedAt')}</div>
              <div className="theme-text font-semibold">{formatTimestamp(results.completed_at)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 节点详情 */}
      <Card className="theme-panel theme-border border">
        <CardHeader className="theme-panel-muted theme-border border-b">
          <CardTitle className="theme-text">{t('workflow.results.nodeDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">
                {t('workflow.results.tabs.all', { count: results.node_results.length })}
              </TabsTrigger>
              <TabsTrigger value="completed">
                {t('workflow.results.tabs.completed', { count: results.summary.completed_nodes })}
              </TabsTrigger>
              <TabsTrigger value="failed">
                {t('workflow.results.tabs.failed', { count: results.summary.failed_nodes })}
              </TabsTrigger>
              <TabsTrigger value="skipped">
                {t('workflow.results.tabs.skipped', { count: results.summary.skipped_nodes })}
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
        <Card className="theme-panel theme-border border">
          <CardHeader className="theme-panel-muted theme-border border-b">
            <CardTitle className="theme-text">{t('workflow.results.exportOptions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Button
                variant="outline"
                className="theme-button-secondary h-20 flex-col"
                onClick={() => onExport()}
              >
                <FileText className="w-6 h-6 mb-2" />
                <span>{t('workflow.results.exportFormats.json')}</span>
              </Button>
              <Button
                variant="outline"
                className="theme-button-secondary h-20 flex-col"
                onClick={() => onExport()}
              >
                <FileText className="w-6 h-6 mb-2" />
                <span>{t('workflow.results.exportFormats.markdown')}</span>
              </Button>
              <Button
                variant="outline"
                className="theme-button-secondary h-20 flex-col"
                onClick={() => onExport()}
              >
                <FileText className="w-6 h-6 mb-2" />
                <span>{t('workflow.results.exportFormats.pdf')}</span>
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
  const { t } = useTranslation();
  const duration =
    node.started_at && node.completed_at
      ? node.completed_at - node.started_at
      : 0;

  return (
    <Card className="theme-panel-muted theme-border border">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="mt-1">{getStatusIcon(node.status)}</div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="theme-text font-semibold">{node.node_id}</h4>
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
                <div className="theme-text text-sm font-medium mb-1">{t('workflow.results.output')}</div>
                <div className="theme-code-surface theme-border max-h-40 overflow-x-auto overflow-y-auto rounded border p-3 text-sm">
                  <pre className="whitespace-pre-wrap">{node.output}</pre>
                </div>
              </div>
            )}

            {node.error && (
              <div className="mb-2">
                <div className="theme-text-danger text-sm font-medium mb-1">{t('workflow.results.error')}</div>
                <div className="theme-surface-danger theme-text p-3 text-sm">
                  {node.error}
                </div>
              </div>
            )}

            {node.metadata && Object.keys(node.metadata).length > 0 && (
              <div>
                <div className="theme-text text-sm font-medium mb-1">{t('workflow.results.metadata')}</div>
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
