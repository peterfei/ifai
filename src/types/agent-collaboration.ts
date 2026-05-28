/**
 * Agent Collaboration Types
 *
 * 与高保真原型对齐的数据结构定义：
 * - AgentCompactBar: renderAgentDots()
 * - AgentWorkspaceCard: renderInlineAgentView()
 * - ExploreCard: renderExploreView()
 * - ApprovalCard (增强): renderApprovalCard()
 * - InteractionCard (增强): renderInteractionCard()
 */

/* ===== AgentCompactBar ===== */

/** Agent 圆点数据（对应原型 AGENTS 数组） */
export interface AgentDot {
  /** Agent ID，如 'PM', 'RF', 'TS', 'DP', 'AN', 'CD', 'EX' */
  id: string;
  /** 缩写标签 */
  label: string;
  /** Tailwind 渐变类，如 'from-brand-400 to-brand-600' */
  gradient: string;
  /** 是否活跃 */
  isActive: boolean;
}

/* ===== AgentWorkspaceCard ===== */

/** 子 Agent 进度项 */
export interface AgentProgressItem {
  agentId: string;
  label: string;
  gradient: string;
  progress: number; // 0-100
  isActive: boolean;
  statusText: string; // '工作中' | '已完成' | '就绪'
}

/** 任务分解项（对应原型 TASK_BREAKDOWN） */
export interface TaskItem {
  task: string;
  agent: string;
}

/** AgentWorkspaceCard 数据（对应原型 renderInlineAgentView stepData） */
export interface AgentWorkspaceData {
  /** 当前步骤名 */
  stepLabel: string;
  /** 当前步骤索引 */
  stepIndex: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 活跃 Agent ID 列表 */
  activeAgents: string[];
  /** 是否由 PM 分配 */
  assignFromPM: boolean;
  /** 紧凑消息文本 */
  compactMsg: string;
  /** Agent 进度映射 { agentId: progress } */
  progress: Record<string, number>;
  /** 任务分解列表 */
  taskBreakdown?: TaskItem[];
  /** 全部步骤名列表 */
  steps?: string[];
}

/* ===== ExploreCard ===== */

/** 探索阶段文件项 */
export interface ExploreSubItem {
  name: string;
  status: 'done' | 'running' | 'pending';
}

/** 探索阶段（对应原型 ExplorePhase） */
export interface ExplorePhase {
  mode: 'sequential' | 'parallel';
  intent: string;
  progress: number;
  status: 'done' | 'running' | 'pending';
  sub: ExploreSubItem[];
}

/** ExploreCard 数据（对应原型 renderExploreView explore 字段） */
export interface ExploreData {
  phases: ExplorePhase[];
}

/* ===== ApprovalCard 扩展 ===== */

/** 审批文件项 */
export interface ApprovalFile {
  path: string;
  change: string;
  risk: 'low' | 'medium' | 'high';
}

/** 风险级别配置 */
export interface RiskConfig {
  label: string;
  color: string;
  dot: string;
}

/** ApprovalCard approve/reject 结果 */
export type ApprovalResult = 'approved' | 'rejected';

/* ===== AGENT_DOT_CONFIG（原型 AGENTS 数组的 React 版本） ===== */

/**
 * Agent 圆点/头像的颜色配置（与原型 AGENTS 数组 1:1 映射）
 * 用于 AgentCompactBar 和 AgentWorkspaceCard 的 Agent 头像渲染
 */
export const AGENT_DOT_CONFIG: Record<string, { label: string; gradient: string; color: string }> = {
  PM: { label: 'PM', gradient: 'from-brand-400 to-brand-600', color: 'brand' },
  RF: { label: 'RF', gradient: 'from-emerald-400 to-emerald-600', color: 'emerald' },
  TS: { label: 'TS', gradient: 'from-sky-400 to-sky-600', color: 'sky' },
  DP: { label: 'DP', gradient: 'from-amber-400 to-amber-600', color: 'amber' },
  AN: { label: 'AN', gradient: 'from-pink-400 to-pink-600', color: 'pink' },
  CD: { label: 'CD', gradient: 'from-slate-400 to-slate-500', color: 'slate' },
  EX: { label: 'EX', gradient: 'from-purple-400 to-purple-600', color: 'purple' },
};

/**
 * 获取 Agent 圆点配置
 */
export function getAgentDotConfig(id: string): { label: string; gradient: string; color: string } {
  return AGENT_DOT_CONFIG[id] || { label: id, gradient: 'from-white/40 to-white/20', color: 'white' };
}
