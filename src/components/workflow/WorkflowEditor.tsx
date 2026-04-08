/**
 * 工作流可视化编辑器组件
 *
 * 提供拖拽式工作流编辑界面
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// 动态导入 Tauri API 的辅助函数
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Trash2,
  Play,
  Save,
  GitBranch,
  Box,
  Settings,
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
  { value: 'explore', label: '探索', icon: '🧭', color: 'bg-blue-500' },
  { value: 'review', label: '审查', icon: '🔍', color: 'bg-green-500' },
  { value: 'refactor', label: '重构', icon: '🔧', color: 'bg-purple-500' },
  { value: 'test', label: '测试', icon: '🧪', color: 'bg-orange-500' },
  { value: 'doc', label: '文档', icon: '📄', color: 'bg-pink-500' },
  { value: 'task_breakdown', label: '任务拆解', icon: '📋', color: 'bg-indigo-500' },
  { value: 'proposal_generator', label: '提案生成', icon: '💡', color: 'bg-yellow-500' },
  { value: 'general_purpose', label: '通用', icon: '⚙️', color: 'bg-gray-500' },
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
            <div className="text-center py-8 text-muted-foreground">
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
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>还没有连接，添加节点后会自动创建</p>
            </div>
          ) : (
            <div className="space-y-2">
              {edges.map((edge, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{edge.from}</Badge>
                    <GitBranch className="w-4 h-4 text-muted-foreground" />
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
    icon: string;
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
      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agentType?.icon}</span>
          <div>
            <Input
              value={node.label}
              onChange={(e) => onUpdate({ ...node, label: e.target.value })}
              className="font-semibold"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex items-center gap-2 mt-1">
              <Badge className={agentType?.color}>{agentType?.label}</Badge>
              <span className="text-xs text-muted-foreground">#{index + 1}</span>
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
        <div className="mt-3 pt-3 border-t space-y-3">
          <div>
            <Label>智能体类型</Label>
            <Select
              value={node.agent_type}
              onValueChange={(value) => {
                onUpdate({ ...node, agent_type: value });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <span className="mr-2">{type.icon}</span>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
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
