/**
 * 工作流内嵌监控器 - Claude Code 1:1 风格
 *
 * 实时显示工作流节点执行过程，带连线和详细参数信息
 */

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Card } from '../UI/card';
import { Badge } from '../UI/badge';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Zap, Search, FileText, Edit, Code, Play, Network } from 'lucide-react';
import { WorkflowDAGMonitor, type DAGNode, type DAGEdge, type ToolCallDetails } from './WorkflowDAGMonitor';
// 🔥 CRITICAL FIX: 直接导入 chatEventBus，避免访问时机问题
import { chatEventBus } from '../../stores/chat/eventBus/ChatEventBus';

// ==================== 工具函数 ====================

/**
 * 🔥 从工具输出中提取关键信息，生成简洁的摘要
 * 类似 claw-code 的 "Read 980 lines" 格式
 *
 * 支持两种格式：
 * 1. 纯文本格式："Line count: 980"
 * 2. JSON 格式：{"line_count": 980, "content": "..."}
 */
function parseToolOutputSummary(toolName: string, output: string): string {
  const parts: string[] = [];

  // 🔥 首先尝试解析 JSON 格式（agent_read_file 等工具返回 JSON）
  try {
    const jsonData = JSON.parse(output);

    // 提取 line_count
    if (jsonData.line_count !== undefined) {
      const lines = jsonData.line_count;
      parts.push(`${lines} lines`);
    }

    // 提取 file_count（agent_list_dir 可能返回）
    if (jsonData.file_count !== undefined) {
      const files = jsonData.file_count;
      parts.push(`${files} files`);
    }

    // 提取 char_count
    if (jsonData.char_count !== undefined || jsonData.character_count !== undefined) {
      const chars = jsonData.char_count || jsonData.character_count;
      parts.push(`${chars} chars`);
    }

    // 如果从 JSON 中提取到了信息，直接返回
    if (parts.length > 0) {
      return parts.join(', ');
    }
  } catch (e) {
    // 不是 JSON 格式，继续尝试纯文本解析
  }

  // 🔥 纯文本格式解析（read_file, write_file 等工具）
  // 提取行数信息
  const lineCountMatch = output.match(/Line count:\s*(\d+)/i);
  if (lineCountMatch) {
    const lines = parseInt(lineCountMatch[1], 10);
    parts.push(`${lines} lines`);
  }

  // 提取字符数信息
  const charCountMatch = output.match(/(\d+)\s+characters/i);
  if (charCountMatch) {
    const chars = parseInt(charCountMatch[1], 10);
    parts.push(`${chars} chars`);
  }

  // 提取替换次数
  const replaceMatch = output.match(/Replaced\s+(\d+)\s+occurrence/i);
  if (replaceMatch) {
    const replacements = parseInt(replaceMatch[1], 10);
    parts.push(`${replacements} ${replacements === 1 ? 'replacement' : 'replacements'}`);
  }

  // 提取匹配数量（搜索工具）
  const matchesMatch = output.match(/Found\s+(\d+)\s+match/i);
  if (matchesMatch) {
    const matches = parseInt(matchesMatch[1], 10);
    parts.push(`${matches} ${matches === 1 ? 'match' : 'matches'}`);
  }

  // 提取文件数量（列表工具）
  const filesMatch = output.match(/(\d+)\s+files?\s+found/i);
  if (filesMatch) {
    const files = parseInt(filesMatch[1], 10);
    parts.push(`${files} files`);
  }

  return parts.length > 0 ? parts.join(', ') : '';
}

/**
 * claw-code 风格：格式化工具调用标题
 * 将工具调用格式化为简洁的一行显示
 */
function formatToolCallClawStyle(tool: ToolCallDetails): { title: string; summary: string; icon: string } {
  const { tool_name, tool_input, tool_output, is_error, execution_time_ms } = tool;

  // 默认图标
  let icon = is_error ? '❌' : '✅';
  let title = tool_name;
  let summary = '';

  // 解析工具输入参数
  let params: string[] = [];
  try {
    const input = JSON.parse(tool_input);

    // 🔥 错误状态时保留 ❌ 图标，不设置工具特定图标
    if (!is_error) {
      switch (tool_name) {
        case 'read_file':
        case 'agent_read_file':
          icon = '📄';
          const readPath = input.path || input.rel_path || input.file || '?';
          title = `Read`;
          params = [`"${readPath}"`];
          break;

      case 'write_file':
      case 'agent_write_file':
        icon = '✏️';
        const writePath = input.path || input.rel_path || input.file || '?';
        title = `Write`;
        params = [`"${writePath}"`];
        break;

      case 'edit_file':
      case 'agent_edit_file':
        icon = '📝';
        const editPath = input.path || input.rel_path || input.file || '?';
        title = `Edit`;
        params = [`"${editPath}"`];
        break;

      case 'glob_search':
      case 'agent_glob_search':
      case 'Glob':
        icon = '🔎';
        const pattern = input.pattern || '?';
        title = `Glob`;
        params = [`"${pattern}"`];
        break;

      case 'grep_search':
      case 'agent_grep_search':
      case 'Grep':
        icon = '🔍';
        const grepPattern = input.pattern || input.query || '?';
        title = `Grep`;
        params = [`"${grepPattern}"`];
        break;

      case 'list_dir':
      case 'agent_list_dir':
        icon = '📁';
        const dirPath = input.path || input.rel_path || '.';
        title = `List`;
        params = [`"${dirPath}"`];
        break;

      case 'bash':
      case 'Bash':
        icon = '$';
        const command = input.command || input.cmd || '?';
        title = `Bash`;
        params = [`"${command}"`];
        break;

      default:
        // 通用格式
        title = tool_name;
        const entries = Object.entries(input).slice(0, 2);
        params = entries.map(([key, value]) => {
          const strValue = typeof value === 'string' ? `"${value}"` : String(value);
          return `${key}=${strValue}`;
        });
      }
    } else {
      // 🔥 错误状态：仍然格式化标题和参数，但保留 ❌ 图标
      switch (tool_name) {
        case 'read_file':
        case 'agent_read_file':
          const readPath = input.path || input.rel_path || input.file || '?';
          title = `Read`;
          params = [`"${readPath}"`];
          break;

        case 'write_file':
        case 'agent_write_file':
          const writePath = input.path || input.rel_path || input.file || '?';
          title = `Write`;
          params = [`"${writePath}"`];
          break;

        case 'glob_search':
        case 'agent_glob_search':
        case 'Glob':
          const pattern = input.pattern || '?';
          title = `Glob`;
          params = [`"${pattern}"`];
          break;

        default:
          title = tool_name;
          const entries = Object.entries(input).slice(0, 2);
          params = entries.map(([key, value]) => {
            const strValue = typeof value === 'string' ? `"${value}"` : String(value);
            return `${key}=${strValue}`;
          });
      }
    }
  } catch (e) {
    // JSON 解析失败，使用工具名称
    title = tool_name;
  }

  // 解析工具输出摘要
  summary = parseToolOutputSummary(tool_name, tool_output);

  // 添加执行时间
  if (execution_time_ms !== undefined && execution_time_ms > 0) {
    const timeStr = execution_time_ms < 1000
      ? `${execution_time_ms}ms`
      : `${(execution_time_ms / 1000).toFixed(1)}s`;
    if (summary) {
      summary += `, ${timeStr}`;
    } else {
      summary = timeStr;
    }
  }

  // 格式化标题：ToolName(param1, param2)
  const titleWithParams = params.length > 0
    ? `${title}(${params.join(', ')})`
    : title;

  return { title: titleWithParams, summary, icon };
}

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

/**
 * 获取 ChatEventBus 实例
 * 🔥 CRITICAL FIX: 直接返回导入的 chatEventBus，避免访问时机问题
 */
function getChatEventBus() {
  // 直接返回导入的 chatEventBus，而不是从 window 获取
  // 这样可以确保无论何时调用，都能获得正确的事件总线实例
  return chatEventBus;
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
// 🔥 FIX 4: 全局标志，跟踪容器组件的监听器是否已设置（防止 StrictMode 重复设置）
let globalContainerListenersSetUp = false;

// 🔥 DEBUG: 模块初始化日志
console.log('[WorkflowInlineMonitor] 📦 Module initialized, globalContainerListenersSetUp =', globalContainerListenersSetUp, 'at', Date.now());

// 🔥 导出全局状态供其他组件使用
export { globalActiveWorkflows, globalActiveWorkflowsListeners };

// 🔥 暴露全局状态到 window 对象供 E2E 测试使用
if (typeof window !== 'undefined') {
  (window as any).__GLOBAL_WORKFLOW_STATES__ = globalWorkflowStates;
  (window as any).__GLOBAL_ACTIVE_WORKFLOWS__ = globalActiveWorkflows;
  (window as any).__any_workflow_progress_received = false;  // 🔥 诊断标志：是否收到任何进度事件

  // 🔥 CRITICAL: 暴露 globalSetListeners，允许测试清理监听器
  (window as any).__GLOBAL_SET_LISTENERS__ = globalSetListeners;

  // 🔥 暴露全局标志管理对象（使用 getter/setter 确保访问最新值）
  const containerListenersFlag = {
    get value() { return globalContainerListenersSetUp; },
    set value(v: boolean) { globalContainerListenersSetUp = v; },
    reset() { globalContainerListenersSetUp = false; }
  };
  (window as any).__GLOBAL_CONTAINER_LISTENERS_FLAG__ = containerListenersFlag;

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

        // 🔥 使用 flushSync 强制立即渲染（避免 React 批处理延迟）
        flushSync(() => {
          updateGlobalWorkflowState(workflowId, {
            name: payload.workflowType || payload.workflow_type || '工作流执行中',
            status: 'running',
            startTime: Date.now(),
            nodes: initialNodes,  // 🔥 包含所有计划节点（pending 状态）
          });
        });
        console.log('[WorkflowInlineMonitor] ✅ State updated with flushSync (workflow:started)');
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

        // 🔥 使用 flushSync 强制立即渲染（关键修复）
        if (eventType === 'tool_call') {
          if (payload.tool_details) {
            console.log('[WorkflowInlineMonitor] 🔧 Processing tool_call event');

            const currentGlobalState = globalWorkflowStates.get(workflowId);
            let existingNodeIndex = currentGlobalState?.nodes?.findIndex(n => n.id === nodeId) ?? -1;

            // 🔥 CRITICAL FIX: 如果节点不存在，创建一个新节点
            if (existingNodeIndex < 0) {
              console.log('[WorkflowInlineMonitor] 🆕 Auto-creating node for tool_call:', nodeId);

              const newNode: WorkflowNode = {
                id: nodeId,
                type: 'tool',
                label: payload.tool_details.tool_name,
                status: 'running',
                tool_calls: [payload.tool_details],
                timestamp: payload.timestamp || Date.now(),
              };

              let updatedNodes = [...(currentGlobalState?.nodes || []), newNode];

              flushSync(() => {
                globalWorkflowStates.set(workflowId, {
                  ...currentGlobalState!,
                  nodes: updatedNodes,
                });
                updateGlobalWorkflowState(workflowId, {
                  nodes: updatedNodes,
                });
              });

              console.log('[WorkflowInlineMonitor] ✅ Auto-created node with tool call (flushSync):', {
                nodeId,
                toolName: payload.tool_details.tool_name,
                totalNodes: updatedNodes.length
              });
              return;
            }

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

            // 🔥 CRITICAL: 使用 flushSync 强制立即渲染
            flushSync(() => {
              globalWorkflowStates.set(workflowId, {
                ...currentGlobalState!,
                nodes: updatedNodes,
              });
              updateGlobalWorkflowState(workflowId, {
                nodes: updatedNodes,
              });
            });

            console.log('[WorkflowInlineMonitor] ✅ Added tool call to node (flushSync):', {
              nodeId,
              toolCount: updatedNodes[existingNodeIndex].tool_calls?.length,
              nodeStatus: updatedNodes[existingNodeIndex].status
            });

            return; // 🔥 早期返回，不创建新节点
          } else {
            // 没有 tool_details 的 tool_call 事件，忽略
            console.log('[WorkflowInlineMonitor] ⚠️ tool_call event has no tool_details, ignoring');
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

          // 🔥 CRITICAL: 使用 flushSync 强制立即渲染
          flushSync(() => {
            updateGlobalWorkflowState(workflowId, {
              currentNode: nodeId,
              nodes: updatedNodes,
              progress: Math.min(((updatedNodes.length) / 10) * 100, 95)
            });
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

            // 🔥 CRITICAL: 使用 flushSync 强制立即渲染
            flushSync(() => {
              updateGlobalWorkflowState(workflowId, {
                nodes: updatedNodes,
              });
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

        // 🔥 CRITICAL: 使用 flushSync 强制立即渲染
        flushSync(() => {
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
        return '!text-green-400 !border-green-600';
      case 'failed':
        return '!text-red-400 !border-red-600';
      default:
        return '!text-gray-300 !border-gray-600';
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
      <div className="mx-auto max-w-2xl my-4 relative z-50 bg-gray-900" data-workflow-monitor={workflowId} data-monitor="true">
        <Card className="border border-gray-700 shadow-2xl !bg-gray-900 [&_*]:!bg-transparent">
        {/* 标题栏 - 深色背景，白色文字 */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800 transition-colors border-b border-gray-700"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-white" />
            <span className="font-semibold text-sm text-white">{displayName}</span>
            <Badge variant="outline" className={getStatusColor()}>
              {getStatusText()}
            </Badge>
            {workflow.nodes && workflow.nodes.length > 0 && (
              <Badge variant="outline" className="!text-gray-300 border-gray-600 bg-gray-800">
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
                className="flex items-center gap-1 text-xs text-gray-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800"
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
            <span className="text-xs text-gray-400">{displayDuration}s</span>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
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
                <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-600/50" />

                <div className="space-y-1">
                  {workflow.nodes.map((node, index) => (
                    <div
                      key={node.id}
                      data-node-id={node.id}
                      className={`relative flex items-start gap-3 py-1.5 transition-all rounded ${
                        node.status === 'running'
                          ? 'bg-gray-800 -mx-2 px-2'
                          : node.status === 'failed'
                          ? 'bg-red-950/30 -mx-2 px-2'
                          : node.status === 'pending'
                          ? 'bg-gray-800/50 -mx-2 px-2 opacity-75'
                          : 'hover:bg-gray-800/50 -mx-2 px-2'
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
                        {/* 🔥 claw-code 风格：如果有工具调用，直接显示工具信息 */}
                        {node.tool_calls && node.tool_calls.length > 0 ? (
                          <>
                            {node.tool_calls.map((tool, idx) => {
                              const { title, summary, icon } = formatToolCallClawStyle(tool);
                              const isSuccess = !tool.is_error;

                              return (
                                <div
                                  key={idx}
                                  className={`mb-1.5 last:mb-0`}
                                >
                                  {/* 工具标题行 - 深色背景，白色文字 */}
                                  <div className="flex flex-col gap-0.5">
                                    {/* 第一行：工具名称和参数 - 白色文字 */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-semibold text-white">
                                        {icon} {title}
                                      </span>
                                      {/* 状态指示器 */}
                                      {!isSuccess && (
                                        <span className="text-xs text-red-400">✗</span>
                                      )}
                                      {isSuccess && (
                                        <span className="text-xs text-green-400">✓</span>
                                      )}
                                    </div>

                                    {/* 第二行：执行结果摘要 - 亮色文字 */}
                                    {summary && (
                                      <div className="text-xs text-gray-300 ml-1">
                                        {summary}
                                      </div>
                                    )}
                                  </div>

                                  {/* 可折叠的详细输出 */}
                                  {(tool.tool_input || tool.tool_output) && (
                                    <details className="mt-1 group" open={false}>
                                      <summary className="cursor-pointer text-gray-400 hover:text-gray-200 text-xs">
                                        详情
                                      </summary>
                                      <div className="mt-1 space-y-1">
                                        {tool.tool_input && (
                                          <div className="text-xs">
                                            <span className="text-gray-400 font-medium">输入:</span>
                                            <pre className="mt-0.5 text-xs text-gray-200 overflow-x-auto bg-black p-2 rounded border border-gray-700">
                                              {tool.tool_input}
                                            </pre>
                                          </div>
                                        )}
                                        {tool.tool_output && (
                                          <div className="text-xs">
                                            <span className="text-gray-400 font-medium">输出:</span>
                                            <pre className="mt-0.5 text-xs text-gray-200 overflow-x-auto bg-black p-2 rounded border border-gray-700 max-h-32 overflow-y-auto">
                                              {tool.tool_output}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    </details>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          /* 无工具调用时的节点标签 - 白色文字 */
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* 节点标签 - 白色文字 */}
                              <span className="text-xs font-mono font-semibold text-white">
                                {node.label}
                              </span>

                              {/* 状态标签 - 亮色文字 */}
                              {node.status === 'pending' && (
                                <span className="text-xs text-gray-400">等待中</span>
                              )}
                              {node.status === 'running' && (
                                <span className="text-xs text-white animate-pulse">运行中</span>
                              )}
                              {node.status === 'completed' && (
                                <span className="text-xs text-green-400">✓ 完成</span>
                              )}
                              {node.status === 'failed' && (
                                <span className="text-xs text-red-400">✗ 失败</span>
                              )}

                              {/* 执行时长 */}
                              {node.duration && (
                                <span className="text-xs text-gray-400">
                                  {(node.duration / 1000).toFixed(2)}s
                                </span>
                              )}
                            </div>

                            {/* 详细信息（后备） */}
                            {node.details && node.details !== node.label && (
                              <div className="text-xs text-gray-400 mt-0.5 truncate font-mono max-w-md">
                                {node.details}
                              </div>
                            )}
                          </>
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
                    <div className="w-3 h-3 bg-gray-500 rounded-full animate-pulse" />
                  </div>
                  <p className="text-sm text-gray-400">
                    {workflow.status === 'running' ? '正在准备工作流...' : '等待节点信息...'}
                  </p>
                  <p className="text-xs text-gray-500">
                    workflowId: {workflowId}
                  </p>
                </div>
              </div>
            )}

            {/* 当前节点（还没有在列表中的） */}
            {workflow.status === 'running' && workflow.currentNode && !workflow.nodes?.some(n => n.id === workflow.currentNode) && (
              <div className="flex items-center gap-3 text-xs text-gray-400 py-2">
                <div className="w-4 h-4 flex items-center justify-center">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                </div>
                <span>正在执行: {workflow.currentNode}</span>
              </div>
            )}

            {/* 完成状态 - 绿色亮色 */}
            {workflow.status === 'completed' && (
              <div className="flex items-center gap-2 text-xs text-green-400 mt-2">
                <CheckCircle className="w-3 h-3" />
                <span className="text-green-400">工作流执行完成</span>
              </div>
            )}

            {/* 失败状态 - 红色亮色 */}
            {workflow.status === 'failed' && (
              <div className="flex items-center gap-2 text-xs text-red-400 mt-2">
                <XCircle className="w-3 h-3" />
                <span className="text-red-400">工作流执行失败</span>
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
  // 🔥 DEBUG: 添加组件挂载日志
  console.log('[WorkflowInlineMonitorContainer] 🔧 Component function called');

  const [activeWorkflows, setActiveWorkflows] = useState<string[]>(() => {
    // 🔥 CRITICAL FIX: 初始化时从全局状态获取
    return Array.from(globalActiveWorkflows);
  });

  // 🔥 CRITICAL FIX: 立即设置 isInitialized 为 true，不依赖 useEffect
  // 这样可以避免 useEffect 延迟执行的问题
  const [isInitialized] = useState(true);

  // 🔥 CRITICAL FIX: 使用 ref 来跟踪监听器设置状态，确保在重置后能重新设置
  const listenersSetUpRef = useRef(false);
  const chatEventBusRef = useRef<any>(null);

  // 🔥 DEBUG: 添加状态日志
  console.log('[WorkflowInlineMonitorContainer] 📊 State:', {
    isInitialized,
    activeWorkflowsCount: activeWorkflows.length,
    activeWorkflows,
    globalActiveWorkflows: Array.from(globalActiveWorkflows),
    chatEventBusAvailable: !!getChatEventBus(),
    globalContainerListenersSetUp,
    listenersSetUpRef: listenersSetUpRef.current
  });

  // 🔥 CRITICAL FIX: 将监听器设置逻辑移到 useLayoutEffect 中
  // 确保在每次渲染时检查并设置监听器
  useLayoutEffect(() => {
    const chatEventBus = getChatEventBus();
    chatEventBusRef.current = chatEventBus;

    console.log('[WorkflowInlineMonitorContainer] 🚀 useLayoutEffect called', {
      chatEventBusAvailable: !!chatEventBus,
      globalContainerListenersSetUp,
      listenersSetUpRef: listenersSetUpRef.current
    });

    if (!chatEventBus) {
      console.error('[WorkflowInlineMonitorContainer] ❌ chatEventBus not available');
      return;
    }

    // 🔥 使用特殊的 'container' key 来存储容器监听器
    const CONTAINER_LISTENERS_KEY = 'container';

    // 🔥 检查是否需要设置监听器（不依赖全局标志）
    const existingListeners = globalSetListeners.get(CONTAINER_LISTENERS_KEY);
    const needsSetup = !existingListeners || existingListeners.size === 0;

    if (!needsSetup) {
      console.log('[WorkflowInlineMonitorContainer] ⏭️ Listeners already exist, skipping');
      return;
    }

    console.log('[WorkflowInlineMonitorContainer] 🔧 Need to set up listeners');

    // 🔥 CRITICAL FIX: 在设置新监听器之前，先清理旧监听器（如果存在）
    if (existingListeners && existingListeners.size > 0) {
      console.log('[WorkflowInlineMonitorContainer] 🧹 Cleaning up existing container listeners:', existingListeners.size);
      existingListeners.forEach(({ unsubscribe }) => {
        try {
          unsubscribe();
        } catch (e) {
          console.error('[WorkflowInlineMonitorContainer] Error unsubscribing:', e);
        }
      });
    }

    // 🔥 初始化容器监听器集合
    globalSetListeners.set(CONTAINER_LISTENERS_KEY, new Set());

    // 监听工作流启动
    const unsubscribeStarted = chatEventBus.on('workflow:started' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitorContainer] 📋 Workflow started:', workflowId);

      // 初始化全局状态
      updateGlobalWorkflowState(workflowId, {
        name: payload.workflowType || payload.workflow_type || '工作流执行中',
        status: 'running' as const,
        startTime: Date.now(),
        nodes: payload.nodes || []
      });

      // 添加活跃工作流
      addActiveWorkflow(workflowId);
    });

    // 监听 workflow:progress 事件来自动检测新工作流
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

      // 如果这是新工作流，自动添加到活跃工作流列表
      if (workflowId && !globalActiveWorkflows.has(workflowId)) {
        console.log('[WorkflowInlineMonitorContainer] 🆕 Detected new workflow from progress event:', workflowId);
        addActiveWorkflow(workflowId);

        // 初始化全局状态
        updateGlobalWorkflowState(workflowId, {
          name: '工作流执行中',
          status: 'running' as const,
          startTime: Date.now(),
        });
      }
    });

    // 监听工作流完成
    const unsubscribeCompleted = chatEventBus.on('workflow:completed' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.log('[WorkflowInlineMonitorContainer] ✅ Workflow completed:', workflowId);

      // 3秒后自动移除监控器
      setTimeout(() => {
        removeActiveWorkflow(workflowId);
        console.log('[WorkflowInlineMonitorContainer] Auto-removed completed workflow monitor:', workflowId);
      }, 3000);

      // 更新全局状态
      updateGlobalWorkflowState(workflowId, {
        status: 'completed' as const,
        progress: 100,
        endTime: Date.now(),
        name: '工作流已完成',
      });

      // 通知完成回调
      // 注意：这里没有直接的回调，而是通过全局状态更新来通知
    });

    // 监听工作流错误
    const unsubscribeError = chatEventBus.on('workflow:error' as any, (payload: any) => {
      const workflowId = payload.workflowId || payload.workflow_id;
      console.error('[WorkflowInlineMonitorContainer] Workflow error:', workflowId);

      // 3秒后自动移除监控器
      setTimeout(() => {
        removeActiveWorkflow(workflowId);
        console.log('[WorkflowInlineMonitorContainer] Auto-removed failed workflow monitor:', workflowId);
      }, 3000);

      // 更新全局状态
      updateGlobalWorkflowState(workflowId, {
        status: 'failed' as const,
        endTime: Date.now(),
        name: '工作流失败',
      });
    });

    // 🔥 保存监听器到全局 Map
    const listenerSet = globalSetListeners.get(CONTAINER_LISTENERS_KEY)!;
    listenerSet.add({ unsubscribe: unsubscribeStarted });
    listenerSet.add({ unsubscribe: unsubscribeProgress });
    listenerSet.add({ unsubscribe: unsubscribeCompleted });
    listenerSet.add({ unsubscribe: unsubscribeError });

    console.log('[WorkflowInlineMonitorContainer] ✅ Container listeners set up successfully, total:', listenerSet.size);

    // 🔥 CRITICAL FIX: 设置全局标志，表示监听器已设置
    globalContainerListenersSetUp = true;
    listenersSetUpRef.current = true;
    console.log('[WorkflowInlineMonitorContainer] 🎯 Set globalContainerListenersSetUp = true');

    // 🔥 清理函数
    return () => {
      console.log('[WorkflowInlineMonitorContainer] 🧹 Cleanup called');
      // 清理所有监听器
      const currentListeners = globalSetListeners.get(CONTAINER_LISTENERS_KEY);
      if (currentListeners) {
        currentListeners.forEach(({ unsubscribe }) => {
          try {
            unsubscribe();
          } catch (e) {
            console.error('[WorkflowInlineMonitorContainer] Error unsubscribing:', e);
          }
        });
        globalSetListeners.delete(CONTAINER_LISTENERS_KEY);
      }
      // 重置 ref
      listenersSetUpRef.current = false;
      globalContainerListenersSetUp = false;
    };
  }, []); // 🔥 CRITICAL: 空依赖数组，只在组件首次挂载时执行

  // 🔥 CRITICAL FIX: 使用 useLayoutEffect 监听全局 activeWorkflows 变化
  useLayoutEffect(() => {
    console.log('[WorkflowInlineMonitorContainer] 🚀 useLayoutEffect called (for global activeWorkflows sync)');

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

    return () => {
      console.log('[WorkflowInlineMonitorContainer] 🧹 Cleanup called (for activeWorkflows sync)');
      globalActiveWorkflowsListeners.delete(updateFromGlobal);
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

// 🔥 CRITICAL FIX: 移除 React.memo，确保在 globalContainerListenersSetUp 重置后能重新设置监听器
// React.memo 会阻止组件重新渲染，导致监听器设置逻辑（在函数体中）不会重新执行
// 如果需要优化性能，可以在组件内部使用 useMemo/useCallback，而不是 memo 整个组件
export const WorkflowInlineMonitorContainer = WorkflowInlineMonitorContainerMemo;
