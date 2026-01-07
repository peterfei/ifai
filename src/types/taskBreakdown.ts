/**
 * 任务拆解类型定义
 * v0.2.6 新增
 */

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'todo' | 'done';

/**
 * 任务类别
 */
export type TaskCategory = 'development' | 'testing' | 'documentation' | 'design' | 'other' | 'research';

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';

/**
 * 任务节点
 */
export interface TaskNode {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description?: string;
  /** 任务状态 */
  status: TaskStatus;
  /** 任务优先级 */
  priority?: TaskPriority;
  /** 依赖的其他任务 ID */
  dependencies: string[];
  /** 子任务 */
  children: TaskNode[];
  /** 预估工时（小时） */
  estimatedHours?: number;
  /** 任务类别 */
  category?: TaskCategory;
  /** 验收标准 */
  acceptanceCriteria?: string[];
  /** 关联的提案信息（v0.2.6 新增） */
  proposalReference?: {
    /** 提案 ID */
    proposalId: string;
    /** 提案标题 */
    proposalTitle: string;
  };
}

/**
 * 任务拆解结果
 */
export interface TaskBreakdown {
  /** 拆解 ID */
  id: string;
  /** 标题 */
  title: string;
  /** 描述 */
  description: string;
  /** 统计信息 */
  stats?: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    totalHours: number;
  };
  /** 总预估工时 */
  totalEstimatedHours?: number;
  /** 原始提示词 */
  originalPrompt: string;
  /** 任务树 */
  taskTree: TaskNode;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 状态 */
  status: 'draft' | 'in_progress' | 'completed' | 'failed';
  /** 关联的 OpenSpec 提案 */
  openspecProposal?: {
    /** 变更 ID */
    changeId: string;
    /** 路径 */
    path: string;
    /** 是否验证通过 */
    isValid: boolean;
  };
}
