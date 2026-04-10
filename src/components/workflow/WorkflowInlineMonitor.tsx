/**
 * 工作流内嵌监控器 - Claude Code 1:1 风格
 *
 * 实时显示工作流节点执行过程，带连线和详细参数信息
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../UI/card';
import { Badge } from '../UI/badge';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Zap, Search, FileText, Edit, Code, Play, Network } from 'lucide-react';
import { WorkflowDAGMonitor, type DAGNode, type DAGEdge, type ToolCallDetails } from './WorkflowDAGMonitor';

// ==================== 类型定义 ====================

interface ParsedNodeInfo {
  operation: string;        // Read, Write, Search, Agent 等
  parameters?: Record<string, string>;  // 解析出的参数
  rawLabel: string;         // 原始标签
}

interface WorkflowNode {
  id: string;
  type: 'search' | 'read' | 'write' | 'agent' | 'tool' | 'command';
  label: string;
  parsedInfo?: ParsedNodeInfo;  // 解析后的节点信息
  status: 'pending' | 'running' | 'completed' | 'failed';
  details?: string;
  timestamp?: number;
  duration?: number;  // 执行时长（毫秒）
  /** 🔥 工具调用详细信息列表 */
  tool_calls?: ToolCallDetails[];
}

interface WorkflowInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  progress?: number;
  currentNode?: string;
  nodes?: WorkflowNode[];
}

interface WorkflowInlineMonitorProps {
  workflowId: string;
  onComplete?: () => void;
}

// ==================== 辅助函数 ====================

/** 将 WorkflowNode 转换为 DAGNode 格式 */
function convertToDAGNode(workflowNode: WorkflowNode): DAGNode {
  return {
    id: workflowNode.id,
    label: workflowNode.label,
    agentType: workflowNode.type,
    status: workflowNode.status,
    startedAt: workflowNode.timestamp,
    completedAt: workflowNode.timestamp ? workflowNode.timestamp + (workflowNode.duration || 0) : undefined,
    output: workflowNode.details,
    error: workflowNode.status === 'failed' ? workflowNode.details : undefined,
    tool_calls: workflowNode.tool_calls,  // 🔥 传递工具调用信息
  };
}

/** 从 WorkflowNode 数组生成 DAG 边 */
function generateDAGEdges(nodes: WorkflowNode[]): DAGEdge[] {
  const edges: DAGEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      from: nodes[i].id,
      to: nodes[i + 1].id,
    });
  }
  return edges;
}

// ==================== 节点信息解析器 ====================

/**
 * 解析节点标签，提取操作和参数
 *
 * 支持的节点格式示例：
 * - Read(package.json)
 * - Search(pattern:"src", path:"./src")
 * - Agent(analyze_project)
 */
function parseNodeInfo(nodeId: string, message: string): ParsedNodeInfo {
  // 尝试从 nodeId 中解析（格式：operation(param1, param2, ...)）
  const functionMatch = nodeId.match(/^(\w+)\((.*)\)$/);
  if (functionMatch) {
    const [, operation, paramsStr] = functionMatch;
    const parameters: Record<string, string> = {};

    // 解析参数：支持 key:value, key:"value", 或单纯的 value
    if (paramsStr.trim()) {
      // 先尝试匹配带键名的参数
      const keyValuePattern = /(\w+):(?:\s*"([^"]*)"|\s*'([^']*)'|\s*([^\s,]+))/g;
      let match;
      let remainingStr = paramsStr;

      // 提取所有带键名的参数
      while ((match = keyValuePattern.exec(paramsStr)) !== null) {
        const key = match[1];
        const value = match[2] || match[3] || match[4];
        if (key && value) {
          parameters[key] = value;
          // 从字符串中移除已匹配的部分
          remainingStr = remainingStr.replace(match[0], '');
        }
      }

      // 如果还有剩余内容，可能是没有键名的参数
      const trimmedRemaining = remainingStr.trim();
      if (trimmedRemaining && !Object.keys(parameters).length) {
        // 移除引号和逗号，提取纯值
        const pureValue = trimmedRemaining.replace(/^['",]|['",]$/g, '').trim();
        if (pureValue) {
          parameters['arg'] = pureValue;
        }
      }
    }

    return {
      operation,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      rawLabel: nodeId,
    };
  }

  // 尝试从 message 中解析
  const messageLower = message.toLowerCase();
  if (messageLower.includes('search') || messageLower.includes('搜索')) {
    return {
      operation: 'Search',
      rawLabel: message,
    };
  }
  if (messageLower.includes('read') || messageLower.includes('读取')) {
    return {
      operation: 'Read',
      rawLabel: message,
    };
  }
  if (messageLower.includes('write') || messageLower.includes('写入')) {
    return {
      operation: 'Write',
      rawLabel: message,
    };
  }
  if (messageLower.includes('agent') || messageLower.includes('代理')) {
    return {
      operation: 'Agent',
      rawLabel: message,
    };
  }

  // 默认返回原始标签
  return {
    operation: nodeId,
    rawLabel: nodeId,
  };
}

/**
 * 格式化节点显示标签（Claude Code 风格）
 */
function formatNodeLabel(parsedInfo: ParsedNodeInfo): string {
  const { operation, parameters } = parsedInfo;

  if (!parameters || Object.keys(parameters).length === 0) {
    return operation;
  }

  // 格式化参数：operation(key1:value1, key2:value2, ...)
  const paramsStr = Object.entries(parameters)
    .map(([key, value]) => {
      // 如果值包含空格或特殊字符，用引号包裹
      if (value.includes(' ') || value.includes(',') || value.includes(':')) {
        return `${key}:"${value}"`;
      }
      return `${key}:${value}`;
    })
    .join(', ');

  return `${operation}(${paramsStr})`;
}

// ==================== 节点图标映射 ====================

const getNodeIcon = (type: WorkflowNode['type'], status: WorkflowNode['status']) => {
  const iconProps = "w-4 h-4 flex-shrink-0";

  if (status === 'completed') {
    return <CheckCircle className={`${iconProps} text-green-500`} />;
  }
  if (status === 'failed') {
    return <XCircle className={`${iconProps} text-red-500`} />;
  }
  if (status === 'running') {
    return <Clock className={`${iconProps} text-blue-500 animate-spin`} />;
  }

  // 🔥 Pending 状态显示灰色图标
  if (status === 'pending') {
    switch (type) {
      case 'search':
        return <Search className={`${iconProps} text-gray-300`} />;
      case 'read':
        return <FileText className={`${iconProps} text-gray-300`} />;
      case 'write':
        return <Edit className={`${iconProps} text-gray-300`} />;
      case 'agent':
        return <Code className={`${iconProps} text-gray-300`} />;
      case 'tool':
        return <Zap className={`${iconProps} text-gray-300`} />;
      case 'command':
        return <Play className={`${iconProps} text-gray-300`} />;
      default:
        return <Clock className={`${iconProps} text-gray-300`} />;
    }
  }

  // 默认 Pending 状态显示类型图标
  switch (type) {
    case 'search':
      return <Search className={`${iconProps} text-gray-400`} />;
    case 'read':
      return <FileText className={`${iconProps} text-gray-400`} />;
    case 'write':
      return <Edit className={`${iconProps} text-gray-400`} />;
    case 'agent':
      return <Code className={`${iconProps} text-gray-400`} />;
    case 'tool':
      return <Zap className={`${iconProps} text-gray-400`} />;
    case 'command':
      return <Play className={`${iconProps} text-gray-400`} />;
    default:
      return <Clock className={`${iconProps} text-gray-400`} />;
  }
};

// ==================== 辅助函数 ====================

function getChatEventBus() {
  if (typeof window !== 'undefined') {
    return (window as any).__GLOBAL_CHAT_EVENT_BUS__;
  }
  return null;
}

/**
 * 解析节点类型
 */
function parseNodeType(nodeId: string, parsedInfo: ParsedNodeInfo): WorkflowNode['type'] {
  const operationLower = parsedInfo.operation.toLowerCase();
  const nodeIdLower = nodeId.toLowerCase();

  if (operationLower.includes('search') || nodeIdLower.includes('search')) {
    return 'search';
  }
  if (operationLower.includes('read') || nodeIdLower.includes('read')) {
    return 'read';
  }
  if (operationLower.includes('write') || nodeIdLower.includes('write')) {
    return 'write';
  }
  if (operationLower.includes('agent') || nodeIdLower.includes('agent')) {
    return 'agent';
  }
  if (operationLower.includes('command') || nodeIdLower.includes('command')) {
    return 'command';
  }

  return 'tool';
}

// ==================== 全局工作流状态管理（跨组件实例持久化） ====================
// 🔥 FIX: 使用全局 Map 来存储工作流状态，防止 StrictMode 导致的组件重新挂载问题
const globalWorkflowStates = new Map<string, WorkflowInfo>();
const globalWorkflowListeners = new Map<string, Set<() => void>>();
// 🔥 FIX 2: 全局追踪已设置的监听器，避免重复设置
const globalSetListeners = new Map<string, Set<{ unsubscribe: () => void }>>();
// 🔥 FIX 3: 全局活跃工作流列表，防止组件卸载时丢失
const globalActiveWorkflows = new Set<string>();
const globalActiveWorkflowsListeners = new Set<() => void>();

// 🔥 导出全局状态供其他组件使用
export { globalActiveWorkflows, globalActiveWorkflowsListeners };

// 🔥 暴露全局状态到 window 对象供 E2E 测试使用
if (typeof window !== 'undefined') {
  (window as any).__GLOBAL_WORKFLOW_STATES__ = globalWorkflowStates;
  (window as any).__GLOBAL_ACTIVE_WORKFLOWS__ = globalActiveWorkflows;
  (window as any).__any_workflow_progress_received = false;  // 🔥 诊断标志：是否收到任何进度事件

  // 🔥 全局诊断监听器：捕获所有 workflow:progress 事件，无论 workflow_id 是什么
  console.log('[WorkflowInlineMonitor] 🔍 Setting up GLOBAL diagnostic listener for ALL workflow:progress events');
  const setupGlobalDiagnosticListener = () => {
    // 延迟设置，确保 chatEventBus 已初始化
    setTimeout(() => {
      try {
        const { getChatEventBus } = require('@/stores/chat/eventBus/ChatEventBus');
        const chatEventBus = getChatEventBus();
        if (chatEventBus) {
          chatEventBus.on('workflow:progress' as any, (payload: any) => {
            // 标记：收到了至少一个进度事件
            (window as any).__any_workflow_progress_received = true;

            console.log('[WorkflowInlineMonitor] 🔍 [GLOBAL DIAGNOSTIC] Received workflow:progress event:', {
              eventType: payload.event_type,
              workflowId: payload.workflowId,
              workflow_id: payload.workflow_id,
              nodeId: payload.node_id,
              hasToolDetails: !!payload.tool_details,
              toolName: payload.tool_details?.tool_name,
              message: payload.message,
              timestamp: payload.timestamp
            });

            // 🔥 关键诊断：检查 workflow_id 字段是否存在和匹配
            if (!payload.workflowId && !payload.workflow_id) {
              console.warn('[WorkflowInlineMonitor] ⚠️ [GLOBAL DIAGNOSTIC] Event has NO workflow_id field!', payload);
            }
          });
          console.log('[WorkflowInlineMonitor] ✅ [GLOBAL DIAGNOSTIC] Listener registered successfully');
        } else {
          console.warn('[WorkflowInlineMonitor] ⚠️ [GLOBAL DIAGNOSTIC] chatEventBus not available yet');
        }
      } catch (error) {
        console.error('[WorkflowInlineMonitor] ❌ [GLOBAL DIAGNOSTIC] Failed to setup listener:', error);
      }
    }, 1000);  // 延迟 1 秒，确保应用已完全初始化
  };

  setupGlobalDiagnosticListener();

  console.log('[WorkflowInlineMonitor] 🔓 Exposed global workflow states to window for testing');
}

export function updateGlobalWorkflowState(workflowId: string, updates: Partial<WorkflowInfo>) {
  const current = globalWorkflowStates.get(workflowId) || {
    id: workflowId,
    name: '工作流执行中',
    status: 'running' as const,
    startTime: Date.now(),
    progress: 0,
    nodes: []
  };

  const updated = { ...current, ...updates };
  globalWorkflowStates.set(workflowId, updated);

  console.log('[updateGlobalWorkflowState] 📝 Updating workflow state:', {
    workflowId,
    updates,
    newNodesCount: updated.nodes?.length || 0,
    listenersCount: globalWorkflowListeners.get(workflowId)?.size || 0
  });

  // 通知所有监听器
  const listeners = globalWorkflowListeners.get(workflowId);
  if (listeners && listeners.size > 0) {
    console.log('[updateGlobalWorkflowState] 🔔 Notifying', listeners.size, 'listeners');
    listeners.forEach(listener => listener());
  } else {
    console.log('[updateGlobalWorkflowState] ⚠️ No listeners to notify for workflowId:', workflowId);
  }
}

// 🔥 FIX: 添加全局活跃工作流管理函数
export function addActiveWorkflow(workflowId: string) {
  const wasEmpty = globalActiveWorkflows.size === 0;
  globalActiveWorkflows.add(workflowId);
  console.log('[addActiveWorkflow] ✅ Added workflow:', workflowId, 'total:', globalActiveWorkflows.size);
  // 通知所有监听器
  globalActiveWorkflowsListeners.forEach(listener => listener());
}

export function removeActiveWorkflow(workflowId: string) {
  globalActiveWorkflows.delete(workflowId);
  console.log('[removeActiveWorkflow] ✅ Removed workflow:', workflowId, 'remaining:', globalActiveWorkflows.size);
  // 通知所有监听器
  globalActiveWorkflowsListeners.forEach(listener => listener());
}

// 🔥 清理工作流的全局监听器
export function cleanupWorkflowListeners(workflowId: string) {
  const listeners = globalSetListeners.get(workflowId);
  if (listeners) {
    listeners.forEach(({ unsubscribe }) => {
      try {
        unsubscribe();
      } catch (e) {
        console.error('[WorkflowInlineMonitor] Error unsubscribing:', e);
      }
    });
    globalSetListeners.delete(workflowId);
  }
}

// ==================== 主组件 ====================

export function WorkflowInlineMonitor({ workflowId, onComplete }: WorkflowInlineMonitorProps) {
  // 🔥 DEBUG: 添加组件挂载日志
  console.log('[WorkflowInlineMonitor] 🔧 Component function called, workflowId:', workflowId);

  const [workflow, setWorkflow] = useState<WorkflowInfo>(() => {
    // 🔥 尝试从全局状态获取，如果存在则使用全局状态
    // 🔥 CRITICAL FIX: 总是创建新对象，避免引用共享
    const globalState = globalWorkflowStates.get(workflowId);
    if (globalState) {
      return { ...globalState, nodes: globalState.nodes ? [...globalState.nodes] : [] };
    }
    return {
      id: workflowId,
      name: '工作流执行中',
      status: 'running',
      startTime: Date.now(),
      progress: 0,
      currentNode: '初始化...',
      nodes: []
    };
  });
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'dag'>('list'); // 🔥 添加视图模式状态

  // 🔥 DEBUG: 监听 workflow 状态变化
  useEffect(() => {
    console.log('[WorkflowInlineMonitor] 🔄 Workflow state changed:', {
      workflowId,
      nodesCount: workflow.nodes?.length || 0,
      status: workflow.status,
      timestamp: Date.now()
    });
  }, [workflow, workflowId]);

  // 🔥 FIX: 注册全局状态监听器
  useEffect(() => {
    const instanceId = Math.random().toString(36).substring(7);
    console.log('[WorkflowInlineMonitor] 🔧 Component mounted/updated, workflowId:', workflowId, 'instance:', instanceId);

    const updateFromGlobal = () => {
      const globalState = globalWorkflowStates.get(workflowId);
      if (globalState) {
        console.log('[WorkflowInlineMonitor] 🔄 Updating from global state:', workflowId, {
          nodesCount: globalState.nodes?.length || 0,
          status: globalState.status,
          nodes: globalState.nodes?.map(n => ({ id: n.id, label: n.label })),
          instanceId
        });
        // 🔥 CRITICAL FIX: 创建新对象引用，确保 React 检测到状态变化
        // 深拷贝 nodes 数组和其中的对象，并添加唯一标识符强制刷新
        const newWorkflowState = {
          ...globalState,
          nodes: globalState.nodes ? globalState.nodes.map(node => ({ ...node })) : [],
          _forceUpdate: Date.now()  // 🔥 添加时间戳，确保 React 检测到状态变化
        };
        console.log('[WorkflowInlineMonitor] 🔄 Calling setWorkflow with new state:', {
          workflowId,
          nodesCount: newWorkflowState.nodes?.length || 0,
          status: newWorkflowState.status,
          instanceId,
          _forceUpdate: newWorkflowState._forceUpdate
        });
        setWorkflow(newWorkflowState);
        // 🔥 DEBUG: 立即检查状态是否更新
        setTimeout(() => {
          console.log('[WorkflowInlineMonitor] 🔍 State check after updateFromGlobal:', {
            workflowId,
            currentNodesCount: globalState.nodes?.length || 0
          });
        }, 100);
      } else {
        console.log('[WorkflowInlineMonitor] ⚠️ No global state found for workflowId:', workflowId, 'instance:', instanceId);
      }
    };

    // 🔥 CRITICAL: 立即从全局状态同步，防止 StrictMode 导致的状态不同步
    updateFromGlobal();

    // 添加监听器
    if (!globalWorkflowListeners.has(workflowId)) {
      globalWorkflowListeners.set(workflowId, new Set());
    }
    const listeners = globalWorkflowListeners.get(workflowId)!;
    listeners.add(updateFromGlobal);
    console.log('[WorkflowInlineMonitor] ✅ Added global state listener, total count:', listeners.size, 'instance:', instanceId);

    return () => {
      // 🔥 CRITICAL FIX: 在 cleanup 中删除监听器，避免调用已卸载组件的闭包
      console.log('[WorkflowInlineMonitor] 🧹 Cleanup called for global state listener, instance:', instanceId);
      const listeners = globalWorkflowListeners.get(workflowId);
      if (listeners) {
        listeners.delete(updateFromGlobal);
        console.log('[WorkflowInlineMonitor] ✅ Removed global state listener, remaining count:', listeners.size, 'instance:', instanceId);
      }
    };
  }, [workflowId]);

  // 监听工作流事件
  useEffect(() => {
    const instanceId = Math.random().toString(36).substring(7);
    console.log('[WorkflowInlineMonitor] 🎯 Setting up event listeners for workflowId:', workflowId, 'instance:', instanceId);

    const chatEventBus = getChatEventBus();
    if (!chatEventBus) {
      console.error('[WorkflowInlineMonitor] ❌ chatEventBus not available');
      return;
    }

    // 🔥 FIX: 检查是否已经为这个 workflowId 设置了监听器（避免重复监听）
    // 🔥 CRITICAL: 不要在 StrictMode 下跳过设置，因为清理函数可能会提前清理
    // 🔥 FIX 2: 使用 ref 来追踪是否已经设置过监听器
    const existingListeners = globalSetListeners.get(workflowId);
    if (existingListeners && existingListeners.size > 0) {
      console.log('[WorkflowInlineMonitor] ⚠️ Listeners already exist for workflowId:', workflowId, 'count:', existingListeners.size);
      // 🔥 CRITICAL FIX: 不返回！我们需要确保至少有一组监听器在工作
      // 如果现有监听器被清理了，我们需要重新设置
    }

    console.log('[WorkflowInlineMonitor] ✅ Setting up new listeners for workflowId:', workflowId, 'instance:', instanceId);

    // 🔥 初始化全局监听器记录（如果不存在）
    if (!globalSetListeners.has(workflowId)) {
      globalSetListeners.set(workflowId, new Set());
    }

    const unsubscribeStarted = chatEventBus.on('workflow:started' as any, (payload: any) => {
      if (payload.workflowId === workflowId || payload.workflow_id === workflowId) {
        console.log('[WorkflowInlineMonitor] 📋 workflow:started received for workflowId:', workflowId);

        // 🔥 FIX: 提取计划节点信息，立即创建所有节点（pending 状态）
        // 这样用户可以在工作流开始时就看到所有计划节点，而不是等待节点执行
        const plannedNodes = payload.nodes || [];
        console.log('[WorkflowInlineMonitor] 📋 Planned nodes:', plannedNodes);

        // 将计划节点转换为 WorkflowNode 格式（pending 状态）
        const initialNodes = plannedNodes.map((plannedNode: any) => {
          // 解析节点类型
          const parsedInfo: ParsedNodeInfo = {
            operation: plannedNode.agent_type || plannedNode.label || plannedNode.id,
            rawLabel: plannedNode.label || plannedNode.id
          };
          const nodeType = parseNodeType(plannedNode.id, parsedInfo);

          return {
            id: plannedNode.id,
            type: nodeType,
            label: plannedNode.label || plannedNode.id,
            parsedInfo,
            status: 'pending' as const,  // 🔥 关键：所有节点初始为 pending 状态
            details: '等待执行...',
            timestamp: undefined,
          };
        });

        console.log('[WorkflowInlineMonitor] ✅ Created initial pending nodes:', initialNodes.length);

        updateGlobalWorkflowState(workflowId, {
          name: payload.workflowType || payload.workflow_type || '工作流执行中',
          status: 'running',
          startTime: Date.now(),
          nodes: initialNodes,  // 🔥 包含所有计划节点（pending 状态）
        });
      }
    });

    const unsubscribeProgress = chatEventBus.on('workflow:progress' as any, (payload: any) => {
      const payloadWorkflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitor] 📊 workflow:progress received:', {
        workflowId,
        payloadWorkflowId,
        matches: payloadWorkflowId === workflowId,
        event_type: payload.event_type,
        node_id: payload.node_id,
        message: payload.message,
        instanceId
      });

      if (payloadWorkflowId === workflowId) {
        const nodeId = payload.node_id || payload.currentNode;
        const message = payload.message || payload.details || '';

        console.log('[WorkflowInlineMonitor] ✅ Processing event:', {
          eventType: payload.event_type,
          nodeId,
          message,
          instanceId
        });

        // 🔥 根据 event_type 区分处理逻辑（参考 claw-code 的实现）
        const eventType = payload.event_type;

        // ========================================
        // 1. tool_call 事件：只更新工具调用信息，不创建新节点
        // ========================================
        if (eventType === 'tool_call') {
          if (payload.tool_details) {
            console.log('[WorkflowInlineMonitor] 🔧 Processing tool_call event');

            const currentGlobalState = globalWorkflowStates.get(workflowId);
            const existingNodeIndex = currentGlobalState?.nodes?.findIndex(n => n.id === nodeId) ?? -1;

            if (existingNodeIndex >= 0) {
              // 更新现有节点的工具调用信息
              let updatedNodes = [...(currentGlobalState?.nodes || [])];
              const existingNode = updatedNodes[existingNodeIndex];
              const existingToolCalls = existingNode.tool_calls || [];

              // 🔥 防重复：使用工具名称、输入和时间戳生成唯一标识符
              const toolKey = `${payload.tool_details.tool_name}_${payload.tool_details.tool_input}_${payload.timestamp || Date.now()}`;
              const isDuplicate = existingToolCalls.some((existingTool: any) => {
                const existingKey = `${existingTool.tool_name}_${existingTool.tool_input}_${payload.timestamp || Date.now()}`;
                return existingKey === toolKey || (
                  existingTool.tool_name === payload.tool_details.tool_name &&
                  existingTool.tool_input === payload.tool_details.tool_input &&
                  existingTool.tool_output === payload.tool_details.tool_output
                );
              });

              if (isDuplicate) {
                console.log('[WorkflowInlineMonitor] ⚠️ Duplicate tool call detected, skipping:', toolKey);
                return;
              }

              updatedNodes[existingNodeIndex] = {
                ...existingNode,
                tool_calls: [...existingToolCalls, payload.tool_details],
                // 🔥 保持 running 状态，不改变节点状态
              };

              globalWorkflowStates.set(workflowId, {
                ...currentGlobalState!,
                nodes: updatedNodes,
              });

              // 🔥 通知监听器更新
              updateGlobalWorkflowState(workflowId, {
                nodes: updatedNodes,
              });

              console.log('[WorkflowInlineMonitor] ✅ Added tool call to node:', {
                nodeId,
                toolCount: updatedNodes[existingNodeIndex].tool_calls?.length,
                nodeStatus: updatedNodes[existingNodeIndex].status
              });

              return; // 🔥 早期返回，不创建新节点
            } else {
              console.log('[WorkflowInlineMonitor] ⚠️ No node found for tool_call, creating new node');
              // 如果没有找到节点，创建一个临时节点（继续执行下面的逻辑）
            }
          } else {
            // 没有 tool_details 的 tool_call 事件，忽略
            console.log('[WorkflowInlineMonitor] ⚠️ tool_call event has no tool_details, ignoring');
            return;
          }
        }

        // ========================================
        // 2. node_started 事件：将 pending 节点更新为 running，将之前的 running 节点标记为 completed
        // ========================================
        if (eventType === 'node_started') {
          console.log('[WorkflowInlineMonitor] 🔵 Processing node_started event for node:', nodeId);

          const currentGlobalState = globalWorkflowStates.get(workflowId);
          let updatedNodes = [...(currentGlobalState?.nodes || [])];

          // 🔥 检查是否已存在相同 ID 的节点
          const existingNodeIndex = updatedNodes.findIndex(n => n.id === nodeId);

          if (existingNodeIndex >= 0) {
            console.log('[WorkflowInlineMonitor] ✅ Node exists, updating from pending/running:', nodeId);
            // 如果节点已存在，更新其状态为 running
            updatedNodes[existingNodeIndex] = {
              ...updatedNodes[existingNodeIndex],
              status: 'running' as const,
              timestamp: Date.now(),  // 🔥 设置开始时间
              details: message,
            };
          } else {
            console.log('[WorkflowInlineMonitor] ⚠️ Node not found in planned nodes, creating new node:', nodeId);
            // 🔥 如果节点不在计划列表中（兼容情况），将之前的 running 节点标记为 completed
            updatedNodes = updatedNodes.map(node => {
              if (node.status === 'running' && node.id !== nodeId) {
                const duration = Date.now() - (node.timestamp || Date.now());
                console.log('[WorkflowInlineMonitor] ✅ Marking previous running node as completed:', node.id, 'duration:', duration);
                return {
                  ...node,
                  status: 'completed' as const,
                  duration,
                };
              }
              return node;
            });

            // 🔥 解析节点信息
            const parsedInfo = parseNodeInfo(nodeId, message);
            const nodeType = parseNodeType(nodeId, parsedInfo);

            // 🔥 创建新的 running 节点
            const newNode: WorkflowNode = {
              id: nodeId || `node-${Date.now()}`,
              type: nodeType,
              label: formatNodeLabel(parsedInfo),
              parsedInfo,
              status: 'running' as const,
              details: message,
              timestamp: Date.now(),
            };

            // 🔥 添加新节点
            updatedNodes.push(newNode);

            console.log('[WorkflowInlineMonitor] ✅ Created new running node:', {
              nodeId: newNode.id,
              label: newNode.label,
              status: newNode.status,
              totalNodes: updatedNodes.length
            });
          }

          // 🔥 更新全局状态
          updateGlobalWorkflowState(workflowId, {
            currentNode: nodeId,
            nodes: updatedNodes,
            progress: Math.min(((updatedNodes.length) / 10) * 100, 95)
          });

          return; // 🔥 早期返回
        }

        // ========================================
        // 3. node_completed 事件：将节点标记为 completed
        // ========================================
        if (eventType === 'node_completed') {
          console.log('[WorkflowInlineMonitor] 🟢 Processing node_completed event');

          const currentGlobalState = globalWorkflowStates.get(workflowId);
          let updatedNodes = [...(currentGlobalState?.nodes || [])];

          const existingNodeIndex = updatedNodes.findIndex(n => n.id === nodeId);

          if (existingNodeIndex >= 0) {
            const existingNode = updatedNodes[existingNodeIndex];
            const duration = Date.now() - (existingNode.timestamp || Date.now());

            updatedNodes[existingNodeIndex] = {
              ...existingNode,
              status: 'completed' as const,
              duration,
              details: message,
            };

            console.log('[WorkflowInlineMonitor] ✅ Marked node as completed:', {
              nodeId,
              duration,
              totalNodes: updatedNodes.length
            });

            // 🔥 更新全局状态
            updateGlobalWorkflowState(workflowId, {
              nodes: updatedNodes,
            });
          } else {
            console.log('[WorkflowInlineMonitor] ⚠️ Node not found for node_completed:', nodeId);
          }

          return; // 🔥 早期返回
        }

        // ========================================
        // 4. 其他事件：创建新节点（兼容旧逻辑）
        // ========================================
        console.log('[WorkflowInlineMonitor] 📝 Processing generic event:', eventType);

        // 🔥 解析节点信息
        const parsedInfo = parseNodeInfo(nodeId, message);
        const nodeType = parseNodeType(nodeId, parsedInfo);

        // 🔥 解析工具调用详细信息（用于新节点）
        let tool_calls: ToolCallDetails[] | undefined = undefined;
        if (payload.tool_details) {
          tool_calls = [payload.tool_details];
        }

        // 🔥 使用全局状态更新
        const currentGlobalState = globalWorkflowStates.get(workflowId);
        const existingNodeIndex = currentGlobalState?.nodes?.findIndex(n => n.id === nodeId) ?? -1;
        let updatedNodes = [...(currentGlobalState?.nodes || [])];

        if (existingNodeIndex >= 0) {
          // 找到现有节点，更新其状态
          const existingNode = updatedNodes[existingNodeIndex];
          const duration = Date.now() - (existingNode.timestamp || Date.now());

          // 🔥 合并工具调用信息
          const existingToolCalls = existingNode.tool_calls || [];
          const mergedToolCalls = tool_calls ? [...existingToolCalls, ...tool_calls] : existingToolCalls;

          updatedNodes[existingNodeIndex] = {
            ...existingNode,
            status: 'completed',
            duration,
            tool_calls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
            details: message
          };
        } else {
          // 🔥 将之前的 running 节点标记为 completed
          updatedNodes = updatedNodes.map(node => {
            if (node.status === 'running') {
              const duration = Date.now() - (node.timestamp || Date.now());
              return {
                ...node,
                status: 'completed' as const,
                duration,
              };
            }
            return node;
          });

          // 添加新节点
          const newNode: WorkflowNode = {
            id: nodeId || `node-${Date.now()}`,
            type: nodeType,
            label: formatNodeLabel(parsedInfo),
            parsedInfo,
            status: 'running',
            details: message,
            timestamp: Date.now(),
            tool_calls,
          };

          updatedNodes.push(newNode);
        }

        console.log('[WorkflowInlineMonitor] 🔄 Updating global state with', updatedNodes.length, 'nodes for instance:', instanceId);
        updateGlobalWorkflowState(workflowId, {
          currentNode: nodeId,
          nodes: updatedNodes,
          progress: Math.min(((updatedNodes.length) / 10) * 100, 95)
        });
      }
    });

    const unsubscribeCompleted = chatEventBus.on('workflow:completed' as any, (payload: any) => {
      if (payload.workflowId === workflowId || payload.workflow_id === workflowId) {
        console.log('[WorkflowInlineMonitor] 📋 Workflow completed event received:', { workflowId, payload, instanceId });
        const currentGlobalState = globalWorkflowStates.get(workflowId);
        updateGlobalWorkflowState(workflowId, {
          status: 'completed' as const,
          progress: 100,
          endTime: Date.now(),
          name: '工作流已完成',  // 🔥 强制更新名称
          nodes: (currentGlobalState?.nodes || []).map(n => {
            // 如果还有 running 节点，标记为 completed
            if (n.status === 'running') {
              return {
                ...n,
                status: 'completed' as const,
                duration: n.timestamp ? Date.now() - n.timestamp : undefined
              };
            }
            return n;
          })
        });

        // 🔥 清理全局监听器（延迟5秒，防止组件还在使用）
        setTimeout(() => {
          console.log('[WorkflowInlineMonitor] 🧹 Delayed cleanup for workflowId:', workflowId);
          cleanupWorkflowListeners(workflowId);
        }, 5000);

        console.log('[WorkflowInlineMonitor] ✅ Calling onComplete callback');
        onComplete?.();
      }
    });

    const unsubscribeError = chatEventBus.on('workflow:error' as any, (payload: any) => {
      if (payload.workflowId === workflowId || payload.workflow_id === workflowId) {
        console.log('[WorkflowInlineMonitor] ❌ Workflow error event received:', { workflowId, payload, instanceId });
        const currentGlobalState = globalWorkflowStates.get(workflowId);
        updateGlobalWorkflowState(workflowId, {
          status: 'failed' as const,
          endTime: Date.now(),
          name: '工作流失败',  // 🔥 强制更新名称
          nodes: (currentGlobalState?.nodes || []).map(n => ({
            ...n,
            status: n.status === 'running' ? 'failed' as const : n.status
          }))
        });
      }
    });

    // 🔥 将所有 unsubscribe 函数保存到全局记录中
    const listenerSet = globalSetListeners.get(workflowId)!;
    listenerSet.add({ unsubscribe: unsubscribeStarted });
    listenerSet.add({ unsubscribe: unsubscribeProgress });
    listenerSet.add({ unsubscribe: unsubscribeCompleted });
    listenerSet.add({ unsubscribe: unsubscribeError });

    console.log('[WorkflowInlineMonitor] ✅ Listeners registered, total count:', listenerSet.size, 'for instance:', instanceId);

    return () => {
      console.log('[WorkflowInlineMonitor] 🧹 Cleanup called for workflowId:', workflowId, 'instance:', instanceId);
      // 🔥 CRITICAL FIX: 不要在这里清理监听器，让工作流完成时清理
      // 这样可以避免 StrictMode 导致的清理问题
      // 只清理全局状态监听器
      const listeners = globalWorkflowListeners.get(workflowId);
      if (listeners) {
        console.log('[WorkflowInlineMonitor] 🧹 Notifying', listeners.size, 'global listeners for instance:', instanceId);
        listeners.forEach(listener => listener());
      }
    };
  }, [workflowId]); // 🔥 FIX: 移除 onComplete 依赖，只在 workflowId 变化时重新监听

  // 🔥 FIX: 运行中的工作流自动展开，确保用户能看到实时进度
  useEffect(() => {
    if (workflow.status === 'running' && !isExpanded) {
      console.log('[WorkflowInlineMonitor] 📖 Auto-expanding running workflow');
      setIsExpanded(true);
    }
  }, [workflow.status]);

  // 自动收起已完成的工作流（延长到 10 秒，让用户有时间查看结果）
  useEffect(() => {
    if (workflow.status === 'completed' || workflow.status === 'failed') {
      const timer = setTimeout(() => {
        console.log('[WorkflowInlineMonitor] 📁 Auto-collapsing completed workflow');
        setIsExpanded(false);
      }, 10000); // 🔥 延长到 10 秒
      return () => clearTimeout(timer);
    }
  }, [workflow.status]);

  // 获取状态颜色
  const getStatusColor = () => {
    switch (workflow.status) {
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-blue-500';
    }
  };

  const getStatusText = () => {
    switch (workflow.status) {
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return '执行中...';
    }
  };

  // 计算运行时间
  const duration = workflow.endTime
    ? Math.floor((workflow.endTime - (workflow.startTime || Date.now())) / 1000)
    : Math.floor((Date.now() - (workflow.startTime || Date.now())) / 1000);

  // 🔥 如果时间为负数或无效，显示默认值
  const displayDuration = duration < 0 ? 0 : duration;

  // 🔥 根据状态更新工作流名称
  const displayName = workflow.status === 'completed'
    ? '工作流已完成'
    : workflow.status === 'failed'
    ? '工作流失败'
    : workflow.name;

  // 🔥 DEBUG: 添加更多日志
  console.log('[WorkflowInlineMonitor] 🎨 Rendering:', {
    workflowId,
    displayName,
    status: workflow.status,
    nodesCount: workflow.nodes?.length || 0,
    nodes: workflow.nodes?.map(n => ({ id: n.id, label: n.label, status: n.status })),
    isExpanded  // 🔥 DEBUG: 输出展开状态
  });

  return (
    <>
      {/* 🔥 添加渐进式动画的 CSS keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="mx-auto max-w-2xl my-4 relative z-50" data-workflow-monitor={workflowId}>
        <Card className="border-2 border-blue-500 shadow-xl bg-gradient-to-br from-blue-100 via-blue-50 to-purple-100 dark:from-blue-900/50 dark:via-blue-950/40 dark:to-purple-900/50 dark:border-blue-400">
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-white/5 transition-colors rounded-t-lg"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm">{displayName}</span>
            <Badge variant="outline" className={getStatusColor()}>
              {getStatusText()}
            </Badge>
            {workflow.nodes && workflow.nodes.length > 0 && (
              <Badge variant="outline" className="text-gray-500">
                {workflow.nodes.length} 步
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* 🔥 视图模式切换按钮 */}
            {workflow.nodes && workflow.nodes.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode(viewMode === 'list' ? 'dag' : 'list');
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                title={viewMode === 'list' ? '切换到 DAG 视图' : '切换到列表视图'}
              >
                {viewMode === 'list' ? (
                  <>
                    <Network className="w-3 h-3" />
                    DAG视图
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3" />
                    列表视图
                  </>
                )}
              </button>
            )}
            <span className="text-xs text-muted-foreground">{displayDuration}s</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* 展开内容 */}
        {isExpanded && (
          <div className="px-4 pb-4">
            {/* 🔥 视图模式切换 */}
            {viewMode === 'dag' && workflow.nodes && workflow.nodes.length > 0 ? (
              /* DAG 视图 */
              <div className="py-2">
                <WorkflowDAGMonitor
                  workflowId={workflowId}
                  nodes={workflow.nodes.map(convertToDAGNode)}
                  edges={generateDAGEdges(workflow.nodes)}
                  onComplete={() => {
                    // DAG 视图完成时，切换回列表视图
                    setViewMode('list');
                    onComplete?.();
                  }}
                />
              </div>
            ) : (
              /* 列表视图 - Claude Code 风格 */
              <>
                {workflow.nodes && workflow.nodes.length > 0 ? (
              <div className="relative">
                {/* 背景连线 */}
                <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-700/30" />

                <div className="space-y-1">
                  {workflow.nodes.map((node, index) => (
                    <div
                      key={node.id}
                      className={`relative flex items-start gap-3 py-1.5 transition-all rounded ${
                        node.status === 'running'
                          ? 'bg-blue-100 dark:bg-blue-500/10 -mx-2 px-2'
                          : node.status === 'failed'
                          ? 'bg-red-100 dark:bg-red-500/10 -mx-2 px-2'
                          : node.status === 'pending'
                          ? 'bg-gray-50 dark:bg-gray-800/30 -mx-2 px-2 opacity-75'
                          : 'hover:bg-gray-100 dark:hover:bg-white/5 -mx-2 px-2'
                      }`}
                      style={{
                        // 🔥 添加渐进式淡入动画，让节点逐个显示
                        animation: `fadeInUp 0.3s ease-out ${Math.min(index * 0.15, 1.5)}s both`,
                        opacity: 0,
                        transform: 'translateY(8px)'
                      }}
                      // 🔥 动画完成后显示正常状态
                      onAnimationEnd={(e) => {
                        e.currentTarget.style.opacity = node.status === 'pending' ? '0.75' : '1';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* 节点图标 */}
                      <div className="relative z-10 mt-0.5">
                        {getNodeIcon(node.type, node.status)}
                      </div>

                      {/* 节点内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Claude Code 风格的节点标签 */}
                          <span className={`text-xs font-mono ${
                            node.status === 'running'
                              ? 'text-blue-400'
                              : node.status === 'completed'
                              ? 'text-green-400'
                              : node.status === 'failed'
                              ? 'text-red-400'
                              : node.status === 'pending'
                              ? 'text-gray-400'
                              : 'text-gray-400'
                          }`}>
                            {node.label}
                          </span>

                          {/* 状态标签 */}
                          {node.status === 'pending' && (
                            <span className="text-xs text-gray-400">等待中</span>
                          )}
                          {node.status === 'running' && (
                            <span className="text-xs text-blue-500 animate-pulse">运行中</span>
                          )}

                          {/* 执行时长 */}
                          {node.duration && (
                            <span className="text-xs text-gray-500">
                              {(node.duration / 1000).toFixed(2)}s
                            </span>
                          )}

                          {/* 🔥 工具调用数量指示器 */}
                          {node.tool_calls && node.tool_calls.length > 0 && (
                            <span className="text-xs text-purple-500 bg-purple-500/10 px-1.5 py-0.5 rounded">
                              ⚡ {node.tool_calls.length} 个工具调用
                            </span>
                          )}
                        </div>

                        {/* 🔥 工具调用详细信息列表 */}
                        {node.tool_calls && node.tool_calls.length > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {node.tool_calls.map((tool, idx) => (
                              <div
                                key={idx}
                                className={`text-xs font-mono p-1.5 rounded ${
                                  tool.is_error
                                    ? 'bg-red-500/10 border border-red-500/20'
                                    : 'bg-blue-500/10 border border-blue-500/20'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={tool.is_error ? 'text-red-400' : 'text-blue-400'}>
                                    {tool.is_error ? '❌' : '✅'} {tool.tool_name}
                                  </span>
                                  {tool.execution_time_ms !== undefined && (
                                    <span className="text-gray-500">
                                      {tool.execution_time_ms}ms
                                    </span>
                                  )}
                                  {tool.output_length > 0 && (
                                    <span className="text-gray-500">
                                      {tool.output_length} 字符
                                    </span>
                                  )}
                                </div>
                                {tool.tool_input && (
                                  <details className="mt-1 group">
                                    <summary className="cursor-pointer text-gray-500 hover:text-gray-300 text-xs">
                                      输入参数
                                    </summary>
                                    <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                                      {tool.tool_input}
                                    </pre>
                                  </details>
                                )}
                                {tool.tool_output && (
                                  <details className="mt-1 group">
                                    <summary className="cursor-pointer text-gray-500 hover:text-gray-300 text-xs">
                                      输出结果
                                    </summary>
                                    <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 max-h-20 overflow-y-auto">
                                      {tool.tool_output}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* 详细信息（后备） */
                          node.details && node.details !== node.label && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate font-mono max-w-md">
                              {node.details}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* 🔥 空状态提示 - 仅在没有计划节点时显示 */
              <div className="flex items-center justify-center py-8 text-center">
                <div className="space-y-2">
                  <div className="w-8 h-8 mx-auto flex items-center justify-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {workflow.status === 'running' ? '正在准备工作流...' : '等待节点信息...'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    workflowId: {workflowId}
                  </p>
                </div>
              </div>
            )}

            {/* 当前节点（还没有在列表中的） */}
            {workflow.status === 'running' && workflow.currentNode && !workflow.nodes?.some(n => n.id === workflow.currentNode) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground py-2">
                <div className="w-4 h-4 flex items-center justify-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                </div>
                <span>正在执行: {workflow.currentNode}</span>
              </div>
            )}

            {/* 完成状态 */}
            {workflow.status === 'completed' && (
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mt-2">
                <CheckCircle className="w-3 h-3" />
                <span>工作流执行完成</span>
              </div>
            )}

            {/* 失败状态 */}
            {workflow.status === 'failed' && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 mt-2">
                <XCircle className="w-3 h-3" />
                <span>工作流执行失败</span>
              </div>
            )}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
    </>
  );
}

// ==================== 容器组件 ====================

// 🔥 CRITICAL FIX: 使用 React.memo 防止不必要的重新渲染
const WorkflowInlineMonitorContainerMemo = function WorkflowInlineMonitorContainer() {
  const [activeWorkflows, setActiveWorkflows] = useState<string[]>(() => {
    // 🔥 CRITICAL FIX: 初始化时从全局状态获取
    return Array.from(globalActiveWorkflows);
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setIsInitialized(true);

    const chatEventBus = getChatEventBus();
    if (!chatEventBus) {
      console.error('[WorkflowInlineMonitorContainer] chatEventBus not available');
      return;
    }

    console.log('[WorkflowInlineMonitorContainer] 🔧 Setting up event listeners');

    // 🔥 FIX: 检查是否已经有活跃的工作流
    const existingWorkflows = Array.from(globalActiveWorkflows);
    if (existingWorkflows.length > 0) {
      console.log('[WorkflowInlineMonitorContainer] 🔄 Found existing workflows:', existingWorkflows);
      setActiveWorkflows(existingWorkflows);
    }

    // 🔥 CRITICAL: 监听全局 activeWorkflows 变化
    const updateFromGlobal = () => {
      const current = Array.from(globalActiveWorkflows);
      console.log('[WorkflowInlineMonitorContainer] 🔄 Updating from global activeWorkflows:', current);
      setActiveWorkflows(current);
    };

    // 立即同步一次
    updateFromGlobal();

    // 添加监听器
    globalActiveWorkflowsListeners.add(updateFromGlobal);

    // 监听工作流启动
    const unsubscribeStarted = chatEventBus.on('workflow:started' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitorContainer] Workflow started:', workflowId);

      // 🔥 CRITICAL FIX: 初始化全局状态，确保 WorkflowInlineMonitor 挂载时状态已存在
      updateGlobalWorkflowState(workflowId, {
        name: payload.workflowType || payload.workflow_type || '工作流执行中',
        status: 'running',
        startTime: Date.now(),
        nodes: []
      });

      // 🔥 FIX: 使用全局函数添加活跃工作流
      addActiveWorkflow(workflowId);
    });

    // 🔥 CRITICAL FIX: 监听 workflow:progress 事件来自动检测新工作流
    // 因为真实后端可能不会发送 workflow:started 事件
    const unsubscribeProgress = chatEventBus.on('workflow:progress' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitorContainer] 📊 Workflow progress received:', {
        workflowId,
        eventType: payload.event_type,
        nodeId: payload.node_id,
        message: payload.message,
        currentActiveWorkflows: Array.from(globalActiveWorkflows),
        allPayload: payload
      });

      // 🔥 如果这是新工作流，自动添加到活跃工作流列表
      if (workflowId && !globalActiveWorkflows.has(workflowId)) {
        console.log('[WorkflowInlineMonitorContainer] 🆕 Detected new workflow from progress event:', workflowId);
        addActiveWorkflow(workflowId);

        // 🔥 初始化全局状态
        updateGlobalWorkflowState(workflowId, {
          name: '工作流执行中',
          status: 'running',
          startTime: Date.now(),
          nodes: []
        });
      }

      // 🔥 DEBUG: 检查全局状态
      const globalState = globalWorkflowStates.get(workflowId);
      console.log('[WorkflowInlineMonitorContainer] 🔍 Global state for workflow:', {
        workflowId,
        hasState: !!globalState,
        nodesCount: globalState?.nodes?.length || 0,
        nodes: globalState?.nodes?.map(n => ({ id: n.id, label: n.label, status: n.status }))
      });
    });

    // 监听工作流完成
    const unsubscribeCompleted = chatEventBus.on('workflow:completed' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitorContainer] Workflow completed:', workflowId);

      // 🔥 3秒后自动移除监控器
      setTimeout(() => {
        removeActiveWorkflow(workflowId);
        console.log('[WorkflowInlineMonitorContainer] Auto-removed completed workflow monitor:', workflowId);
      }, 3000);
    });

    // 监听工作流错误
    const unsubscribeError = chatEventBus.on('workflow:error' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.error('[WorkflowInlineMonitorContainer] Workflow error:', workflowId);

      // 🔥 3秒后自动移除监控器
      setTimeout(() => {
        removeActiveWorkflow(workflowId);
        console.log('[WorkflowInlineMonitorContainer] Auto-removed failed workflow monitor:', workflowId);
      }, 3000);
    });

    return () => {
      console.log('[WorkflowInlineMonitorContainer] 🧹 Cleanup called');
      globalActiveWorkflowsListeners.delete(updateFromGlobal);
      unsubscribeStarted();
      unsubscribeProgress();
      unsubscribeCompleted();
      unsubscribeError();
    };
  }, []);

  // 🔥 未初始化时不显示任何内容
  if (!isInitialized) {
    return null;
  }

  // 🔥 DEBUG: 添加调试日志
  console.log('[WorkflowInlineMonitorContainer] 🎨 Rendering:', {
    activeWorkflows,
    activeWorkflowsCount: activeWorkflows.length,
    globalActiveWorkflows: Array.from(globalActiveWorkflows)
  });

  // 🔥 FIX: 如果没有活跃的工作流，返回 null
  if (activeWorkflows.length === 0) {
    console.log('[WorkflowInlineMonitorContainer] ⚠️ No active workflows, returning null');
    return null;
  }

  return (
    <>
      {/* 🔥 真实工作流监控器 */}
      {activeWorkflows.map(workflowId => (
        <WorkflowInlineMonitor
          key={workflowId}
          workflowId={workflowId}
        />
      ))}
    </>
  );
};

// 🔥 CRITICAL FIX: 使用 React.memo 导出，防止不必要的重新渲染
export const WorkflowInlineMonitorContainer = React.memo(WorkflowInlineMonitorContainerMemo);
