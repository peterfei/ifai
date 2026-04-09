/**
 * 多智能体工作流主页面
 *
 * 整合所有工作流功能的主界面
 */

import React, { useState } from 'react';
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
const WORKFLOW_NODE_CONFIGS: Record<string, { nodes: DAGNodeType[]; edges: DAGEdgeType[] }> = {
  'quick-code-review': {
    nodes: [
      { id: 'explore', label: '探索代码', agentType: 'explore', status: 'pending' },
      { id: 'review', label: '代码审查', agentType: 'review', status: 'pending' },
      { id: 'refactor', label: '重构建议', agentType: 'refactor', status: 'pending' },
    ],
    edges: [
      { from: 'explore', to: 'review' },
      { from: 'review', to: 'refactor' },
    ],
  },
  'quick-exploration': {
    nodes: [
      { id: 'explore', label: '快速探索', agentType: 'explore', status: 'pending' },
    ],
    edges: [],
  },
  'quick-quality-check': {
    nodes: [
      { id: 'review', label: '代码审查', agentType: 'review', status: 'pending' },
      { id: 'security', label: '安全检查', agentType: 'review', status: 'pending' },
    ],
    edges: [
      { from: 'review', to: 'security' },
    ],
  },
};

export function WorkflowsPage() {
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

  const handleWorkflowExecute = (workflowId: string, workflowType?: string) => {
    // 获取节点配置
    const nodeConfig = workflowType ? WORKFLOW_NODE_CONFIGS[workflowType] : undefined;

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
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">多智能体工作流</h1>
          <p className="text-muted-foreground mt-1">
            自动化代码分析、审查、重构和测试
          </p>
        </div>
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
      </div>

      {/* 运行中的工作流 */}
      {executingWorkflows.length > 0 && (
        <Card className="border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              运行中的工作流 ({executingWorkflows.length})
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
                    <div className="font-semibold">{workflow.id}</div>
                    <div className="text-sm text-muted-foreground">
                      开始于:{' '}
                      {new Date(workflow.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                  >
                    查看
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
            快速工作流
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="w-4 h-4 mr-2" />
            工作流模板
          </TabsTrigger>
          <TabsTrigger value="editor">
            <Settings className="w-4 h-4 mr-2" />
            自定义编辑器
          </TabsTrigger>
          <TabsTrigger value="monitor">
            <Activity className="w-4 h-4 mr-2" />
            执行监控
          </TabsTrigger>
        </TabsList>

        {/* 快速工作流 */}
        <TabsContent value="select" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>目标路径</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md"
                  placeholder="./src"
                />
                <Button variant="outline">浏览</Button>
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
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">没有正在运行的工作流</p>
                  <p className="text-sm">
                    从"快速工作流"或"工作流模板"启动一个工作流
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
            <CardTitle>已完成的工作流 ({completedWorkflows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-semibold">{workflow.id}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(workflow.startTime).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        workflow.status === 'completed'
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}
                    >
                      {workflow.status === 'completed' ? '成功' : '失败'}
                    </span>
                    <Button variant="outline" size="sm">
                      查看结果
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default WorkflowsPage;
