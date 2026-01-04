/**
 * 任务拆解与可视化系统 - 类型定义
 * v0.2.6 新增功能
 */

/**
 * 任务节点状态
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * 任务类别
 */
export type TaskCategory = 'development' | 'testing' | 'documentation' | 'design' | 'research';

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * 任务节点
 */
export interface TaskNode {
  /** 唯一标识符 */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述（可选） */
  description?: string;
  /** 任务状态 */
  status: TaskStatus;
  /** 依赖的任务 ID 列表 */
  dependencies: string[];
  /** 子任务列表 */
  children: TaskNode[];
  /** 预估工时（小时） */
  estimatedHours?: number;
  /** 任务类别 */
  category?: TaskCategory;
  /** 验收标准 */
  acceptanceCriteria?: string[];
  /** 优先级 */
  priority?: TaskPriority;
  /** 分配给（可选，用于未来团队协作） */
  assignee?: string;
  /** 标签 */
  tags?: string[];
}

/**
 * 任务拆解状态
 */
export type BreakdownStatus = 'draft' | 'in_progress' | 'completed' | 'failed';

/**
 * 任务拆解结果
 */
export interface TaskBreakdown {
  /** 唯一标识符，格式：tb-{timestamp}-{slug} */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description: string;
  /** 用户的原始输入提示 */
  originalPrompt: string;
  /** 任务树 */
  taskTree: TaskNode;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 拆解状态 */
  status: BreakdownStatus;
  /** OpenSpec 提案信息（可选） */
  openspecProposal?: {
    /** 变更 ID */
    changeId: string;
    /** 提案路径 */
    path: string;
    /** 是否通过验证 */
    isValid: boolean;
  };
  /** 总预估工时（计算值） */
  totalEstimatedHours?: number;
  /** 任务统计 */
  stats?: {
    /** 总任务数 */
    total: number;
    /** 待办任务数 */
    pending: number;
    /** 进行中任务数 */
    inProgress: number;
    /** 已完成任务数 */
    completed: number;
    /** 失败任务数 */
    failed: number;
  };
}

/**
 * 简化的任务节点（用于创建新任务）
 */
export interface CreateTaskNode {
  title: string;
  description?: string;
  estimatedHours?: number;
  category?: TaskCategory;
  priority?: TaskPriority;
  acceptanceCriteria?: string[];
}

/**
 * 任务拆解输入
 */
export interface TaskBreakdownInput {
  /** 任务描述 */
  prompt: string;
  /** 上下文信息（可选） */
  context?: string;
  /** 约束条件（可选） */
  constraints?: string[];
  /** 优先级（可选） */
  priority?: TaskPriority;
}
