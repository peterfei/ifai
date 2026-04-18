/**
 * 多智能体工作流主页面
 *
 * 整合所有工作流功能的主界面
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  WorkflowSelector,
  WorkflowEditor,
  WorkflowMonitor,
  WorkflowDAGMonitor,
  WorkflowResults,
} from '../components/workflow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/UI/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/UI/card';
import { Button } from '../components/UI/button';
import { Input } from '../components/UI/input';
import {
  Zap,
  FileText,
  Settings,
  Activity,
  ArrowLeft,
} from 'lucide-react';
import type { DAGNode as DAGNodeType, DAGEdge as DAGEdgeType } from '../components/workflow/WorkflowDAGMonitor';

// 简化的 URL 参数处理
function useURLSearchParams() {
  const params = new URLSearchParams(window.location.search);
  const setParams = (newParams: Record<string, string>) => {
    const searchParams = new URLSearchParams();
    Object.entries(newParams).forEach(([key, value]) => {
      searchParams.set(key, value);
    });
    const newURL = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.pushState({}, '', newURL);
  };
  return [params, setParams] as const;
}

interface WorkflowExecution {
  id: string;
  startTime: number;
  status: 'running' | 'completed' | 'failed';
  workflowType?: string;
  nodes?: DAGNodeType[];
  edges?: DAGEdgeType[];
}

// 工作流节点配置映射（与后端 workflow_commands.rs 保持一致）
const getWorkflowNodeConfigs = (t: (key: string) => string): Record<string, { nodes: DAGNodeType[]; edges: DAGEdgeType[] }> => ({
  'quick-code-review': {
    nodes: [
      { id: 'explore', label: t('workflow.page.nodes.explore'), agentType: 'explore', status: 'pending' },
      { id: 'review', label: t('workflow.page.nodes.review'), agentType: 'review', status: 'pending' },
      { id: 'refactor', label: t('workflow.page.nodes.refactor'), agentType: 'refactor', status: 'pending' },
    ],
    edges: [
      { from: 'explore', to: 'review' },
      { from: 'review', to: 'refactor' },
    ],
  },
  'quick-exploration': {
    nodes: [
      { id: 'explore', label: t('workflow.page.nodes.quickExplore'), agentType: 'explore', status: 'pending' },
    ],
    edges: [],
  },
  'quick-quality-check': {
    nodes: [
      { id: 'review', label: t('workflow.page.nodes.review'), agentType: 'review', status: 'pending' },
      { id: 'security', label: t('workflow.page.nodes.security'), agentType: 'review', status: 'pending' },
    ],
    edges: [
      { from: 'review', to: 'security' },
    ],
  },
});

export function WorkflowsPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useURLSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') || 'select'
  );
  const [executingWorkflows, setExecutingWorkflows] = useState<
    WorkflowExecution[]
  >([]);
  const [completedWorkflows, setCompletedWorkflows] = useState<
    WorkflowExecution[]
  >([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<
    string | null
  >(null);
  const [targetPath, setTargetPath] = useState('./src');
  const workflowNodeConfigs = getWorkflowNodeConfigs(t);

  const handleWorkflowExecute = (workflowId: string, workflowType?: string) => {
    // 获取节点配置
    const nodeConfig = workflowType ? workflowNodeConfigs[workflowType] : undefined;

    const execution: WorkflowExecution = {
      id: workflowId,
      startTime: Date.now(),
      status: 'running',
      workflowType,
      nodes: nodeConfig?.nodes,
      edges: nodeConfig?.edges,
    };

    setExecutingWorkflows((prev) => [...prev, execution]);
    setSelectedWorkflowId(workflowId);
    setActiveTab('monitor');

    // 更新 URL
    updateTabParam('monitor');
  };

  const handleWorkflowComplete = (result: any) => {
    setExecutingWorkflows((prev) =>
      prev.filter((w) => w.id !== result.workflow_id)
    );

    setCompletedWorkflows((prev) => [
      ...prev,
      {
        id: result.workflow_id,
        startTime: result.started_at || Date.now(),
        status: result.status.toLowerCase(),
      },
    ]);
  };

  const handleWorkflowError = (error: string) => {
    // 错误处理
    console.error('工作流执行错误:', error);
  };

  const handleCloseMonitor = () => {
    setSelectedWorkflowId(null);
    setActiveTab('select');
    updateTabParam('select');
  };

  const updateTabParam = (tab: string) => {
    setSearchParams({ tab: tab });
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    updateTabParam(value);
  };

  return (
    <div className="theme-panel theme-text h-full overflow-y-auto">
      <div className="container mx-auto space-y-6 py-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="theme-text text-3xl font-bold">{t('workflow.page.title')}</h1>
          <p className="theme-text-subtle mt-1">
            {t('workflow.page.description')}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('workflow.page.back')}
        </Button>
      </div>

      {/* 运行中的工作流 */}
      {executingWorkflows.length > 0 && (
        <Card className="theme-surface-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="theme-text-accent h-5 w-5" />
              {t('workflow.page.running', { count: executingWorkflows.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {executingWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="theme-text font-semibold">{workflow.id}</div>
                    <div className="theme-text-subtle text-sm">
                      {t('workflow.page.startedAt', {
                        time: new Date(workflow.startTime).toLocaleTimeString(i18n.language),
                      })}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                  >
                    {t('workflow.page.view')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 主功能标签页 */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="select">
            <Zap className="w-4 h-4 mr-2" />
            {t('workflow.page.tabs.select')}
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="w-4 h-4 mr-2" />
            {t('workflow.page.tabs.templates')}
          </TabsTrigger>
          <TabsTrigger value="editor">
            <Settings className="w-4 h-4 mr-2" />
            {t('workflow.page.tabs.editor')}
          </TabsTrigger>
          <TabsTrigger value="monitor">
            <Activity className="w-4 h-4 mr-2" />
            {t('workflow.page.tabs.monitor')}
          </TabsTrigger>
        </TabsList>

        {/* 快速工作流 */}
        <TabsContent value="select" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('workflow.page.targetPath')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  className="flex-1"
                  placeholder={t('workflow.page.targetPathPlaceholder')}
                />
                <Button variant="outline">{t('workflow.page.browse')}</Button>
              </div>
            </CardContent>
          </Card>

          <WorkflowSelector
            targetPath={targetPath}
            onExecute={handleWorkflowExecute}
          />
        </TabsContent>

        {/* 工作流模板 */}
        <TabsContent value="templates">
          <WorkflowSelector
            targetPath={targetPath}
            onExecute={handleWorkflowExecute}
          />
        </TabsContent>

        {/* 自定义编辑器 */}
        <TabsContent value="editor">
          <WorkflowEditor
            onSave={(workflow) => {
              console.log('保存工作流:', workflow);
            }}
            onExecute={handleWorkflowExecute}
          />
        </TabsContent>

        {/* 执行监控 */}
        <TabsContent value="monitor">
          {selectedWorkflowId ? (
            (() => {
              const currentWorkflow = executingWorkflows.find(w => w.id === selectedWorkflowId);
              const hasDAGConfig = currentWorkflow?.nodes && currentWorkflow?.edges;

              // 如果有 DAG 配置，使用 DAG 监控器
              if (hasDAGConfig && currentWorkflow.nodes && currentWorkflow.edges) {
                return (
                  <WorkflowDAGMonitor
                    workflowId={selectedWorkflowId}
                    nodes={currentWorkflow.nodes}
                    edges={currentWorkflow.edges}
                    onComplete={handleWorkflowComplete}
                    onError={handleWorkflowError}
                    onClose={handleCloseMonitor}
                  />
                );
              }

              // 否则使用传统的监控器
              return (
                <WorkflowMonitor
                  workflowId={selectedWorkflowId}
                  onComplete={handleWorkflowComplete}
                  onError={handleWorkflowError}
                  onClose={handleCloseMonitor}
                />
              );
            })()
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="theme-text-subtle py-12 text-center">
                  <Activity className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="theme-text text-lg mb-2">{t('workflow.page.idleTitle')}</p>
                  <p className="text-sm">
                    {t('workflow.page.idleDescription')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 已完成的工作流 */}
      {completedWorkflows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('workflow.page.completed', { count: completedWorkflows.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="theme-border flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="theme-text font-semibold">{workflow.id}</div>
                    <div className="theme-text-subtle text-sm">
                      {new Date(workflow.startTime).toLocaleString(i18n.language)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        workflow.status === 'completed'
                          ? 'theme-badge-success'
                          : 'theme-badge-danger'
                      }`}
                    >
                      {workflow.status === 'completed'
                        ? t('workflow.shared.status.completed')
                        : t('workflow.shared.status.failed')}
                    </span>
                    <Button variant="outline" size="sm">
                      {t('workflow.page.viewResults')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

export default WorkflowsPage;
