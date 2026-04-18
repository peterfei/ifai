/**
 * 多智能体工作流选择器组件
 *
 * 允许用户选择和执行预定义的工作流
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
import { Button } from '../UI/button';
import { Badge } from '../UI/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../UI/tabs';
import { Play, FileText, Settings, Zap, Search, Compass, CheckCircle2 } from 'lucide-react';

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
  onExecute?: (workflowId: string, workflowType?: string) => void;
  targetPath?: string;
}

export function WorkflowSelector({ onExecute, targetPath = './src' }: WorkflowSelectorProps) {
  const { t } = useTranslation();
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
      console.error('[WorkflowSelector] Failed to load workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeQuickWorkflow = async (workflowType: string) => {
    try {
      setExecuting(workflowType);

      // 🔥 通知父组件工作流开始执行（用于 DAG 监控）
      if (onExecute) {
        // 映射 workflowType 到实际的工作流 ID
        const workflowIdMap: Record<string, string> = {
          'code_review': 'quick-code-review',
          'exploration': 'quick-exploration',
          'quality_check': 'quick-quality-check',
        };
        const workflowId = workflowIdMap[workflowType] || `quick-${workflowType}`;
        onExecute(workflowId, workflowType);
      }

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
      console.error('[WorkflowSelector] Failed to execute workflow:', error);
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
      console.error('[WorkflowSelector] Failed to execute workflow from file:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <Card className="theme-panel theme-border border">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-40">
            <div className="theme-text-subtle">{t('workflow.selector.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="theme-text text-2xl font-bold">{t('workflow.selector.title')}</h2>
        <p className="theme-text-subtle">
          {t('workflow.selector.description')}
        </p>
      </div>

      <Tabs defaultValue="quick" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quick">
            <Zap className="w-4 h-4 mr-2" />
            {t('workflow.selector.tabs.quick')}
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="w-4 h-4 mr-2" />
            {t('workflow.selector.tabs.templates')}
          </TabsTrigger>
          <TabsTrigger value="custom">
            <Settings className="w-4 h-4 mr-2" />
            {t('workflow.selector.tabs.custom')}
          </TabsTrigger>
        </TabsList>

        {/* 快速工作流 */}
        <TabsContent value="quick" className="space-y-4">
          <div className="grid gap-4">
            <QuickWorkflowCard
              title={t('workflow.selector.quick.codeReview.title')}
              description={t('workflow.selector.quick.codeReview.description')}
              icon={Search}
              workflowType="code_review"
              executing={executing}
              onExecute={() => executeQuickWorkflow('code_review')}
            />
            <QuickWorkflowCard
              title={t('workflow.selector.quick.exploration.title')}
              description={t('workflow.selector.quick.exploration.description')}
              icon={Compass}
              workflowType="exploration"
              executing={executing}
              onExecute={() => executeQuickWorkflow('exploration')}
            />
            <QuickWorkflowCard
              title={t('workflow.selector.quick.qualityCheck.title')}
              description={t('workflow.selector.quick.qualityCheck.description')}
              icon={CheckCircle2}
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
          <Card className="theme-panel theme-border border">
            <CardHeader className="theme-panel-muted theme-border border-b">
              <CardTitle className="theme-text">{t('workflow.selector.custom.title')}</CardTitle>
              <CardDescription>
                {t('workflow.selector.custom.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="theme-text-subtle text-sm">
                {t('workflow.selector.custom.comingSoonDescription')}
              </p>
              <Button variant="outline" disabled className="theme-button-secondary mt-4">
                {t('workflow.selector.custom.comingSoon')}
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
  icon: React.ComponentType<{ className?: string }>;
  workflowType: string;
  executing: string | null;
  onExecute: () => Promise<void>;
}

function QuickWorkflowCard({
  title,
  description,
  icon: Icon,
  workflowType,
  executing,
  onExecute,
}: QuickWorkflowCardProps) {
  const { t } = useTranslation();
  const isExecuting = executing === workflowType;

  return (
    <Card className="theme-panel theme-border theme-shadow border transition-shadow hover:shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="theme-surface-info flex h-10 w-10 items-center justify-center rounded-xl">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="theme-text text-lg font-semibold">{title}</h3>
            </div>
            <p className="theme-text-subtle mb-4 text-sm">{description}</p>
            <Button
              onClick={onExecute}
              disabled={isExecuting}
              className="theme-button-primary w-full sm:w-auto"
            >
              {isExecuting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                  {t('workflow.selector.executing')}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  {t('workflow.selector.run')}
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
  const { t } = useTranslation();
  const isExecuting = executing === workflow.id;

  return (
    <Card className="theme-panel theme-border theme-shadow border transition-shadow hover:shadow-md">
      <CardHeader className="theme-panel-muted theme-border border-b">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="theme-text text-lg">{workflow.name}</CardTitle>
            <CardDescription>{workflow.description}</CardDescription>
          </div>
          <Badge variant="outline" className="theme-panel-elevated theme-border theme-text-muted border">
            {t('workflow.selector.templateNodes', { count: workflow.nodes_count })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Button
          onClick={onExecute}
          disabled={isExecuting}
          className="theme-button-primary w-full"
        >
          {isExecuting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              {t('workflow.selector.executing')}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {t('workflow.selector.run')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
