/**
 * OpenSpec 提案类型定义
 * v0.2.6 新增
 */

/**
 * 提案位置
 */
export type ProposalLocation = 'proposals' | 'changes' | 'archive';

/**
 * 提案状态
 */
export type ProposalStatus = 'draft' | 'approved' | 'rejected' | 'archived';

/**
 * 提案任务类别
 */
export type ProposalTaskCategory = 'development' | 'testing' | 'documentation';

/**
 * Spec Delta 类型
 */
export type SpecDeltaType = 'ADDED' | 'MODIFIED' | 'REMOVED';

/**
 * 提案任务
 */
export interface ProposalTask {
  id: string;
  title: string;
  description: string;
  category: ProposalTaskCategory;
  estimatedHours: number;
  dependencies?: string[];
}

/**
 * Spec 增量
 */
export interface SpecDelta {
  capability: string;
  type: SpecDeltaType;
  content: string;
  scenarios?: Scenario[];
}

/**
 * 场景定义
 */
export interface Scenario {
  name: string;
  description: string;
  given?: string;
  when: string;
  then: string;
}

/**
 * 提案影响范围
 */
export interface ProposalImpact {
  specs: string[];
  files: string[];
  breakingChanges: boolean;
}

/**
 * OpenSpec 提案
 */
export interface OpenSpecProposal {
  id: string;                          // change ID (如: add-user-authentication)
  path: string;                        // .ifai/proposals/{id}/ 或 .ifai/changes/{id}/
  status: ProposalStatus;
  location: ProposalLocation;         // 当前所在目录

  // proposal.md 内容
  why: string;
  whatChanges: string[];
  impact: ProposalImpact;

  // tasks.md 内容
  tasks: ProposalTask[];

  // spec deltas
  specDeltas: SpecDelta[];

  // design.md 内容 (可选)
  design?: string;

  // 元数据
  createdAt: number;
  updatedAt: number;
  validated: boolean;

  // 验证结果
  validationErrors?: string[];
  validationWarnings?: string[];
}

/**
 * 提案索引项 (用于 index.json)
 */
export interface ProposalIndexItem {
  id: string;
  title: string;
  status: ProposalStatus;
  location: ProposalLocation;
  createdAt: number;
  updatedAt: number;
}

/**
 * 提案索引
 */
export interface ProposalIndex {
  proposals: ProposalIndexItem[];
  lastUpdated: number;
}

/**
 * 提案创建选项
 */
export interface CreateProposalOptions {
  id?: string;                    // 可选，不指定则自动生成
  why: string;
  whatChanges: string[];
  impact: ProposalImpact;
  tasks: ProposalTask[];
  specDeltas: SpecDelta[];
  design?: string;
}

/**
 * 提案更新选项
 */
export interface UpdateProposalOptions {
  status?: ProposalStatus;
  why?: string;
  whatChanges?: string[];
  impact?: ProposalImpact;
  tasks?: ProposalTask[];
  specDeltas?: SpecDelta[];
  design?: string;
}
