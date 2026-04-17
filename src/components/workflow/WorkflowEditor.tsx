/**
 * 工作流可视化编辑器组件
 *
 * 提供拖拽式工作流编辑界面
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../UI/card';
import { Button } from '../UI/button';
import { Input } from '../UI/input';
import { Label } from '../UI/label';
import { Textarea } from '../UI/textarea';
import { Select } from '../UI/select';
import { Badge } from '../UI/badge';

// 动态导入 Tauri API 的辅助函数
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}
import {
  Plus,
  Trash2,
  Play,
  Save,
  GitBranch,
  Box,
  Settings,
  Compass,
  Search as SearchIcon,
  Wrench,
  FlaskConical,
  FileText,
  ListChecks,
  Lightbulb,
  Bot,
} from 'lucide-react';

interface WorkflowNode {
  id: string;
  agent_type: string;
  label?: string;
  config?: any;
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

interface WorkflowEditorProps {
  onSave?: (workflow: any) => void;
  onExecute?: (workflowId: string) => void;
}

const AGENT_TYPES = [
  { value: 'explore', label: '探索', icon: Compass, color: 'bg-blue-500/15 text-blue-500' },
  { value: 'review', label: '审查', icon: SearchIcon, color: 'bg-green-500/15 text-green-500' },
  { value: 'refactor', label: '重构', icon: Wrench, color: 'bg-purple-500/15 text-purple-500' },
  { value: 'test', label: '测试', icon: FlaskConical, color: 'bg-orange-500/15 text-orange-500' },
  { value: 'doc', label: '文档', icon: FileText, color: 'bg-pink-500/15 text-pink-500' },
  { value: 'task_breakdown', label: '任务拆解', icon: ListChecks, color: 'bg-indigo-500/15 text-indigo-500' },
  { value: 'proposal_generator', label: '提案生成', icon: Lightbulb, color: 'bg-yellow-500/15 text-yellow-500' },
  { value: 'general_purpose', label: '通用', icon: Bot, color: 'bg-neutral-500/15 text-neutral-500' },
];

export function WorkflowEditor({ onSave, onExecute }: WorkflowEditorProps) {
  const [workflowId, setWorkflowId] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [executing, setExecuting] = useState(false);

  // 添加节点
  const addNode = useCallback(() => {
    const newId = `node_${nodes.length + 1}`;
    const newNode: WorkflowNode = {
      id: newId,
      agent_type: 'explore',
      label: `节点 ${nodes.length + 1}`,
    };
    setNodes([...nodes, newNode]);
  }, [nodes]);

  // 删除节点
  const removeNode = useCallback((nodeId: string) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.from !== nodeId && e.to !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  }, [nodes, edges, selectedNode]);

  // 添加边
  const addEdge = useCallback((from: string, to: string) => {
    // 检查是否已存在
    const exists = edges.some(e => e.from === from && e.to === to);
    if (!exists && from !== to) {
      setEdges([...edges, { from, to }]);
    }
  }, [edges]);

  // 删除边
  const removeEdge = useCallback((from: string, to: string) => {
    setEdges(edges.filter(e => !(e.from === from && e.to === to)));
  }, [edges]);

  // 保存工作流
  const handleSave = async () => {
    try {
      const workflow = await invoke('create_custom_workflow', {
        id: workflowId || `custom_${Date.now()}`,
        name: workflowName,
        description: workflowDescription,
        nodes,
        edges,
      });

      if (onSave) {
        onSave(workflow);
      }

      return workflow;
    } catch (error) {
      console.error('保存工作流失败:', error);
      throw error;
    }
  };

  // 执行工作流
  const handleExecute = async () => {
    try {
      setExecuting(true);

      // 先保存
      const workflow = await handleSave();

      // 再执行
      const workflowIdResult = await invoke<string>('execute_workflow', {
        workflow,
      });

      if (onExecute) {
        onExecute(workflowIdResult);
      }

      return workflowIdResult;
    } catch (error) {
      console.error('执行工作流失败:', error);
      throw error;
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 工作流基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle>工作流配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="workflow-id">工作流 ID</Label>
              <Input
                id="workflow-id"
                placeholder="custom-workflow"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="workflow-name">工作流名称</Label>
              <Input
                id="workflow-name"
                placeholder="我的工作流"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="workflow-description">描述</Label>
              <Textarea
                id="workflow-description"
                placeholder="描述这个工作流的作用..."
                value={workflowDescription}
                onChange={(e) => setWorkflowDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 节点编辑器 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>节点</CardTitle>
            <Button onClick={addNode} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              添加节点
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <div className="theme-text-subtle py-8 text-center">
              <Box className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>还没有节点，点击"添加节点"开始创建</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nodes.map((node, index) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  index={index}
                  agentTypes={AGENT_TYPES}
                  isSelected={selectedNode?.id === node.id}
                  onSelect={() => setSelectedNode(node)}
                  onUpdate={(updatedNode) => {
                    const newNodes = [...nodes];
                    newNodes[index] = updatedNode;
                    setNodes(newNodes);
                  }}
                  onRemove={() => removeNode(node.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 连接编辑器 */}
      <Card>
        <CardHeader>
          <CardTitle>连接</CardTitle>
        </CardHeader>
        <CardContent>
          {edges.length === 0 ? (
            <div className="theme-text-subtle py-8 text-center">
              <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>还没有连接，添加节点后会自动创建</p>
            </div>
          ) : (
            <div className="space-y-2">
              {edges.map((edge, index) => (
                <div
                  key={index}
                  className="theme-panel-muted theme-border flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{edge.from}</Badge>
                    <GitBranch className="theme-text-subtle w-4 h-4" />
                    <Badge variant="outline">{edge.to}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEdge(edge.from, edge.to)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <div className="flex gap-4">
        <Button onClick={handleSave} variant="outline">
          <Save className="w-4 h-4 mr-2" />
          保存工作流
        </Button>
        <Button
          onClick={handleExecute}
          disabled={!workflowId || nodes.length === 0 || executing}
        >
          {executing ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              执行中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              执行工作流
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface NodeCardProps {
  node: WorkflowNode;
  index: number;
  agentTypes: Array<{
    value: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }>;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (node: WorkflowNode) => void;
  onRemove: () => void;
}

function NodeCard({
  node,
  index,
  agentTypes,
  isSelected,
  onSelect,
  onUpdate,
  onRemove,
}: NodeCardProps) {
  const agentType = agentTypes.find(t => t.value === node.agent_type);

  return (
    <div
      className={`theme-border rounded-lg border p-4 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-500/10 border-blue-500/30' : 'theme-panel-muted hover:border-blue-500/20'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {agentType && (
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${agentType.color}`}>
              <agentType.icon className="h-5 w-5" />
            </div>
          )}
          <div>
            <Input
              value={node.label}
              onChange={(e) => onUpdate({ ...node, label: e.target.value })}
              className="font-semibold"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex items-center gap-2 mt-1">
              <Badge className={agentType?.color}>{agentType?.label}</Badge>
              <span className="theme-text-subtle text-xs">#{index + 1}</span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {isSelected && (
        <div className="theme-border mt-3 space-y-3 border-t pt-3">
          <div>
            <Label>智能体类型</Label>
            <Select
              value={node.agent_type}
              onChange={(e) => {
                onUpdate({ ...node, agent_type: e.target.value });
              }}
            >
              {agentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>节点 ID</Label>
            <Input
              value={node.id}
              onChange={(e) => onUpdate({ ...node, id: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
