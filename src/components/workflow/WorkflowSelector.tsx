/**
 * 多智能体工作流选择器组件
 *
 * 允许用户选择和执行预定义的工作流
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../UI/card';
import { Button } from '../UI/button';
import { Badge } from '../UI/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../UI/tabs';
import { Play, FileText, Settings, Zap } from 'lucide-react';

// 动态导入 Tauri API 的辅助函数
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  file_path: string;
  nodes_count: number;
}

interface WorkflowSelectorProps {
  onExecute?: (workflowId: string) => void;
  targetPath?: string;
}

export function WorkflowSelector({ onExecute, targetPath = './src' }: WorkflowSelectorProps) {
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      const result = await invoke<WorkflowTemplate[]>('get_default_workflows');
      setWorkflows(result);
    } catch (error) {
      console.error('加载工作流失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeQuickWorkflow = async (workflowType: string) => {
    try {
      setExecuting(workflowType);

      // 🔥 FIX: 通过 sendMessage 触发工作流，而不是直接调用 Tauri 命令
      // 这样可以触发 shouldSkipChat 逻辑，避免重复调用 AI
      const { useChatStore } = await import('../../stores/useChatStore');
      const chatStore = useChatStore.getState();

      // 根据工作流类型生成触发文本
      const triggerTexts: Record<string, string> = {
        'code_review': '/workflow code-review',
        'exploration': '/workflow exploration',
        'quality_check': '/workflow quality-check',
      };

      const triggerText = triggerTexts[workflowType] || `/workflow ${workflowType}`;

      // 通过 sendMessage 触发工作流（这样会触发 IntentHandler 和 shouldSkipChat）
      await chatStore.sendMessage(triggerText);

      // 工作流会在后台执行，不需要等待
      console.log('[WorkflowSelector] ✅ Workflow triggered via sendMessage:', triggerText);
    } catch (error) {
      console.error('执行工作流失败:', error);
      throw error;
    } finally {
      setExecuting(null);
    }
  };

  const executeFromFile = async (filePath: string) => {
    try {
      // 🔥 FIX: 通过 sendMessage 触发工作流，而不是直接调用 Tauri 命令
      const { useChatStore } = await import('../../stores/useChatStore');
      const chatStore = useChatStore.getState();

      // 使用文件路径作为触发文本
      const triggerText = `/workflow ${filePath}`;

      // 通过 sendMessage 触发工作流
      await chatStore.sendMessage(triggerText);

      console.log('[WorkflowSelector] ✅ Workflow triggered from file via sendMessage:', triggerText);
    } catch (error) {
      console.error('执行工作流失败:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-40">
            <div className="text-muted-foreground">加载工作流...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">多智能体工作流</h2>
        <p className="text-muted-foreground">
          选择一个工作流模板来自动化您的代码任务
        </p>
      </div>

      <Tabs defaultValue="quick" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quick">
            <Zap className="w-4 h-4 mr-2" />
            快速工作流
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="w-4 h-4 mr-2" />
            工作流模板
          </TabsTrigger>
          <TabsTrigger value="custom">
            <Settings className="w-4 h-4 mr-2" />
            自定义工作流
          </TabsTrigger>
        </TabsList>

        {/* 快速工作流 */}
        <TabsContent value="quick" className="space-y-4">
          <div className="grid gap-4">
            <QuickWorkflowCard
              title="代码审查"
              description="自动探索、审查、测试和生成文档"
              icon="🔍"
              workflowType="code_review"
              executing={executing}
              onExecute={() => executeQuickWorkflow('code_review')}
            />
            <QuickWorkflowCard
              title="代码探索"
              description="快速探索和分析项目结构"
              icon="🧭"
              workflowType="exploration"
              executing={executing}
              onExecute={() => executeQuickWorkflow('exploration')}
            />
            <QuickWorkflowCard
              title="质量检查"
              description="全面的代码质量检查和分析"
              icon="✅"
              workflowType="quality_check"
              executing={executing}
              onExecute={() => executeQuickWorkflow('quality_check')}
            />
          </div>
        </TabsContent>

        {/* 工作流模板 */}
        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4">
            {workflows.map((workflow) => (
              <TemplateCard
                key={workflow.id}
                workflow={workflow}
                executing={executing}
                onExecute={() => executeFromFile(workflow.file_path)}
              />
            ))}
          </div>
        </TabsContent>

        {/* 自定义工作流 */}
        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>自定义工作流</CardTitle>
              <CardDescription>
                创建您自己的多智能体工作流
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                自定义工作流编辑器即将推出...
              </p>
              <Button variant="outline" disabled className="mt-4">
                即将推出
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface QuickWorkflowCardProps {
  title: string;
  description: string;
  icon: string;
  workflowType: string;
  executing: string | null;
  onExecute: () => Promise<void>;
}

function QuickWorkflowCard({
  title,
  description,
  icon,
  workflowType,
  executing,
  onExecute,
}: QuickWorkflowCardProps) {
  const isExecuting = executing === workflowType;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{icon}</span>
              <h3 className="text-lg font-semibold">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{description}</p>
            <Button
              onClick={onExecute}
              disabled={isExecuting}
              className="w-full sm:w-auto"
            >
              {isExecuting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                  执行中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  运行工作流
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TemplateCardProps {
  workflow: WorkflowTemplate;
  executing: string | null;
  onExecute: () => Promise<void>;
}

function TemplateCard({ workflow, executing, onExecute }: TemplateCardProps) {
  const isExecuting = executing === workflow.id;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{workflow.name}</CardTitle>
            <CardDescription>{workflow.description}</CardDescription>
          </div>
          <Badge variant="secondary">{workflow.nodes_count} 节点</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Button
          onClick={onExecute}
          disabled={isExecuting}
          className="w-full"
        >
          {isExecuting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
              执行中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              执行工作流
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
