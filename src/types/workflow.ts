// ============================================================
// 工作流数据类型定义（v2: TUI 统一格式）
//
// PhaseData/SubItem — 旧版（保持向后兼容）
// ToolItem/NodeData/WorkflowData — 新版 TUI 列表渲染
// ============================================================

export type PhaseStatus = 'done' | 'running' | 'pending';
export type PhaseMode = 'sequential' | 'parallel';

// ── 旧版类型（保持向后兼容） ──

/** 子项目（工具调用 / 文件扫描项） */
export interface SubItem {
  name: string;
  status: PhaseStatus;
}

/** 单个 phase 的运行时数据 */
export interface PhaseData {
  nodeId: string;
  mode: PhaseMode;
  intent: string;
  progress: number;
  status: PhaseStatus;
  sub?: SubItem[];
}

/** Tauri workflow:progress 事件的 payload */
export interface ProgressPayload {
  nodeId: string;
  mode: PhaseMode;
  status: PhaseStatus;
  progress: number;
  subItems?: SubItem[];
}

/** 统计行数据 */
export interface StatsInfo {
  doneCount: number;
  totalCount: number;
  elapsedSecs: number;
}

// ── 新版 TUI 列表类型 ──

/** 单个工具执行记录 */
export interface ToolItem {
  toolName: string;
  status: PhaseStatus;
  elapsedSecs: number;
  target?: string;
  tokenCount?: number;
}

/** 单个节点运行时数据 */
export interface NodeData {
  nodeId: string;
  agentType: string;
  intent: string;
  status: PhaseStatus;
  tools: ToolItem[];
  elapsedSecs: number;
  totalTokens: number;
}

/** 工作流汇总 */
export interface WorkflowData {
  workflowId: string;
  intent: string;
  nodes: NodeData[];
  totalElapsedSecs: number;
  totalTokens: number;
  totalTools: number;
  status: 'running' | 'done';
}

/** 统一 progress 事件（单事件 + type 路由字段） */
export type ProgressEventType = 'tool' | 'node' | 'summary';

export interface ToolProgressPayload {
  nodeId: string;
  toolName: string;
  status: PhaseStatus;
  elapsedSecs: number;
  target?: string;
  tokenCount?: number;
}

export interface NodeProgressPayload {
  nodeId: string;
  status: PhaseStatus;
  elapsedSecs: number;
  totalTokens: number;
}

export interface SummaryPayload {
  totalElapsedSecs: number;
  totalTokens: number;
  totalTools: number;
}

export interface WorkflowProgressEvent {
  type: ProgressEventType;
  payload: ToolProgressPayload | NodeProgressPayload | SummaryPayload;
}

/** 更新函数签名 */
export type WorkflowUpdater = (fn: (prev: WorkflowData) => WorkflowData) => void;
