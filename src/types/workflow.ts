// ============================================================
// 工作流 Phase 数据类型定义
//
// PhaseData 是 WorkflowRunner progress 事件 + YAML 定义的合并产物。
// GUI 端不推导 mode/mapping，所有数据由 Rust 端 WorkflowScheduler 计算后下发。
// 参考: design.md §6.3
// ============================================================

export type PhaseStatus = 'done' | 'running' | 'pending';
export type PhaseMode = 'sequential' | 'parallel';

/** 子项目（工具调用 / 文件扫描项） */
export interface SubItem {
  name: string;
  status: PhaseStatus;
}

/** 单个 phase 的运行时数据 */
export interface PhaseData {
  /** Rust 端下发的节点 ID，用于 progress 事件匹配 */
  nodeId: string;
  /** 执行模式（WorkflowScheduler 计算后下发） */
  mode: PhaseMode;
  /** 阶段意图文字 */
  intent: string;
  /** 0–100 进度 */
  progress: number;
  /** 运行状态 */
  status: PhaseStatus;
  /** 工具执行列表（运行时填充） */
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
  /** 已完成的工具数 */
  doneCount: number;
  /** 工具总数 */
  totalCount: number;
  /** 已耗时（秒） */
  elapsedSecs: number;
}
