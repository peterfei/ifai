import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  NodeData,
  WorkflowData,
  ToolProgressPayload,
  NodeProgressPayload,
  SummaryPayload,
  WorkflowProgressEvent,
  WorkflowUpdater,
} from '../types/workflow';

// ── 声明式路由表 ──
// 新增事件类型只需在表中追加一行，钩子代码零修改
type Handler = (payload: any, update: WorkflowUpdater) => void;

const PROGRESS_HANDLERS: Record<string, Handler> = {
  'tool': (p: ToolProgressPayload, update) => {
    update(prev => updateTool(prev, p));
  },
  'node': (p: NodeProgressPayload, update) => {
    update(prev => updateNode(prev, p));
  },
  'summary': (p: SummaryPayload, update) => {
    update(prev => updateSummary(prev, p));
  },
};

// ── 不可变更新函数 ──

function updateTool(prev: WorkflowData, p: ToolProgressPayload): WorkflowData {
  return {
    ...prev,
    nodes: prev.nodes.map(node =>
      node.nodeId === p.nodeId
        ? {
            ...node,
            tools: upsertTool(node.tools, p),
          }
        : node,
    ),
  };
}

function upsertTool(tools: NodeData['tools'], p: ToolProgressPayload): NodeData['tools'] {
  const idx = tools.findIndex(t => t.toolName === p.toolName);
  if (idx >= 0) {
    const updated = [...tools];
    updated[idx] = { ...updated[idx], ...p };
    return updated;
  }
  // append: toolName 不在列表中时追加
  return [...tools, {
    toolName: p.toolName,
    status: p.status,
    elapsedSecs: p.elapsedSecs,
    target: p.target,
    tokenCount: p.tokenCount,
  }];
}

function updateNode(prev: WorkflowData, p: NodeProgressPayload): WorkflowData {
  return {
    ...prev,
    nodes: prev.nodes.map(node =>
      node.nodeId === p.nodeId
        ? { ...node, status: p.status, elapsedSecs: p.elapsedSecs, totalTokens: p.totalTokens }
        : node,
    ),
    status: p.status === 'done' && prev.nodes.every(n => n.nodeId === p.nodeId || n.status === 'done')
      ? 'done'
      : p.status === 'running' ? 'running' : prev.status,
  };
}

function updateSummary(prev: WorkflowData, p: SummaryPayload): WorkflowData {
  return { ...prev, totalElapsedSecs: p.totalElapsedSecs, totalTokens: p.totalTokens, totalTools: p.totalTools, status: 'done' };
}

const INITIAL_STATUS = 'running' as const;

/** useWorkflowData — TUI 列表式工作流进度管理
 *
 * 消费统一 `workflow:progress` 事件（含 type 路由字段），
 * 声明式 PROGRESS_HANDLERS 表驱动更新，零 if-else/switch。
 */
export function useWorkflowData(initialNodes: NodeData[]) {
  const [data, setData] = useState<WorkflowData>({
    workflowId: '',
    intent: '',
    nodes: initialNodes,
    totalElapsedSecs: 0,
    totalTokens: 0,
    totalTools: 0,
    status: initialNodes.some(n => n.status === 'running' || n.status === 'done')
      ? initialNodes.some(n => n.status === 'running') ? 'running' as const : 'done' as const
      : INITIAL_STATUS,
  });

  const dataRef = useRef(data);
  dataRef.current = data;

  const handleProgressEvent = useCallback((event: WorkflowProgressEvent) => {
    const handler = PROGRESS_HANDLERS[event.type];
    if (!handler) return; // 未知 type 静默跳过
    handler(event.payload, setData);
  }, []);

  const getHandlers = useCallback(() => ({ ...PROGRESS_HANDLERS }), []);

  return useMemo(() => ({
    nodes: data.nodes,
    status: data.status,
    totalElapsedSecs: data.totalElapsedSecs,
    totalTokens: data.totalTokens,
    totalTools: data.totalTools,
    handleProgressEvent,
    getHandlers,
  }), [data, handleProgressEvent, getHandlers]);
}
