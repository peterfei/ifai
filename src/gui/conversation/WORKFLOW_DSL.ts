/**
 * WORKFLOW_DSL — 工作流步骤数据声明
 *
 * 数据驱动的工作流步骤定义，支持：
 * - 任务元数据（标题、步骤、Agent 分配）
 * - 任务清单（可勾选的步骤列表）
 * - 审批卡片数据（ApprovalCard）
 * - 交互卡片数据（InteractionCard）
 */

import { AGENT_DSL } from './AGENT_DSL';

/* ===== 类型定义 ===== */

/**
 * 任务清单项
 */
export interface TaskItem {
  /** 任务文本 */
  text: string;
  /** 是否已完成 */
  completed: boolean;
}

/**
 * 任务进度数据
 */
export interface TaskProgress {
  /** 当前步骤 */
  currentStep: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 进度百分比（0-100） */
  percentage: number;
}

/**
 * 任务数据 DSL
 *
 * 完整的任务元数据，用于驱动 ProgressCard 渲染
 */
export interface TaskData {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 当前活跃的 Agent 类型 */
  activeAgent: keyof typeof AGENT_DSL;
  /** 涉及的 Agent 类型列表 */
  agents: Array<keyof typeof AGENT_DSL>;
  /** 任务进度 */
  progress: TaskProgress;
  /** 任务清单 */
  taskList: TaskItem[];
}

/* ===== 审批卡片类型 ===== */

/**
 * 风险等级
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * 文件变更项
 */
export interface FileChangeItem {
  /** 文件路径 */
  path: string;
  /** 变更统计（如 "+42 -18"） */
  change: string;
  /** 风险等级 */
  risk: RiskLevel;
}

/**
 * 审批动作
 */
export type ApprovalAction = 'continue' | 'skip' | 'stop';

/**
 * 审批卡片数据
 */
export interface ApprovalData {
  /** 审批类型 */
  type: 'schema_change' | 'code_review' | 'test_generation' | 'security_scan' | string;
  /** 审批标题 */
  title: string;
  /** 审批描述 */
  description: string;
  /** 整体风险等级 */
  overallRisk: RiskLevel;
  /** 受影响的文件列表 */
  files: FileChangeItem[];
  /** 批准后的动作 */
  onApprove: ApprovalAction;
  /** 拒绝后的动作 */
  onReject: ApprovalAction;
}

/* ===== 交互卡片类型 ===== */

/**
 * 交互模式
 */
export type InteractionMode = 'single' | 'multiple';

/**
 * 选项标签
 */
export interface OptionTag {
  /** 标签文本 */
  label: string;
  /** 标签颜色（可选，默认为灰色） */
  color?: 'brand' | 'emerald' | 'amber' | 'red' | string;
}

/**
 * 交互选项
 */
export interface InteractionOption {
  /** 选项 ID */
  id: string;
  /** 选项标签 */
  label: string;
  /** 选项描述 */
  desc: string;
  /** 选项标签（可选） */
  tag?: string;
  /** 标签颜色（可选） */
  tagColor?: string;
}

/**
 * 交互卡片数据
 */
export interface InteractionData {
  /** 交互类型 */
  type: 'single' | 'multiple';
  /** 交互标题 */
  title: string;
  /** 问题文本 */
  question: string;
  /** 紧凑模式下的提示文本 */
  compactAsk: string;
  /** 选项列表 */
  options: InteractionOption[];
  /** 选择后的动作 */
  onSelect: ApprovalAction;
}

/* ===== 文件变更卡片类型 ===== */

/**
 * 文件变更类型
 */
export type FileChangeType = 'create' | 'modify' | 'delete' | 'rename';

/**
 * 变更详情
 */
export interface FileChangeDetails {
  /** 变更类型 */
  type: FileChangeType;
  /** 旧路径（重命名时使用） */
  oldPath?: string;
  /** 新增行数 */
  additions?: number;
  /** 删除行数 */
  deletions?: number;
  /** 变更摘要 */
  summary?: string;
}

/**
 * 文件变更卡片数据
 */
export interface FileChangeData {
  /** 文件路径 */
  path: string;
  /** 变更详情 */
  change: FileChangeDetails;
  /** 语言类型（用于语法高亮） */
  language?: string;
}

/* ===== 工具调用卡片类型 ===== */

/**
 * 工具状态
 */
export type ToolStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'approved' | 'rejected' | 'executing';

/**
 * 工具调用卡片数据
 */
export interface ToolCallData {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description?: string;
  /** 工具状态 */
  status: ToolStatus;
  /** 工具参数 */
  args?: Record<string, any>;
  /** 工具结果 */
  result?: any;
  /** 错误信息 */
  error?: string;
  /** 执行时长（毫秒） */
  duration?: number;
}

/* ===== 错误修复卡片类型 ===== */

/**
 * 错误严重程度
 */
export type ErrorSeverity = 'error' | 'warning' | 'info';

/**
 * 错误修复卡片数据
 */
export interface ErrorFixData {
  /** 错误消息 */
  message: string;
  /** 错误严重程度 */
  severity: ErrorSeverity;
  /** 错误位置（文件名:行号） */
  location?: string;
  /** 建议的修复方案 */
  suggestions: Array<{
    title: string;
    description: string;
    code?: string;
  }>;
  /** 是否已自动修复 */
  autoFixed?: boolean;
}

/* ===== Composer 卡片类型 ===== */

/**
 * Composer 状态
 */
export type ComposerStatus = 'drafting' | 'reviewing' | 'applying' | 'done';

/**
 * Composer 卡片数据
 */
export interface ComposerData {
  /** Composer 标题 */
  title: string;
  /** Composer 状态 */
  status: ComposerStatus;
  /** 变更文件列表 */
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
  /** 总变更统计 */
  stats: {
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: number;
  };
  /** 操作按钮 */
  actions?: Array<{
    label: string;
    action: string;
  }>;
}

/* ===== Mock 数据 ===== */

/**
 * MOCK_APPROVAL_DATA — Mock 审批数据
 *
 * 场景：重构Agent 建议将手动状态管理替换为 React Hook Form + Zod 验证方案
 */
export const MOCK_APPROVAL_DATA: ApprovalData = {
  type: 'schema_change',
  title: '确认 Schema 变更',
  description: '重构Agent 建议将手动状态管理替换为 React Hook Form + Zod 验证方案。需修改登录表单组件及相关类型定义。',
  overallRisk: 'medium',
  files: [
    { path: 'src/components/LoginForm.tsx', change: '+42 -18', risk: 'medium' },
    { path: 'src/schema/loginSchema.ts', change: '+15 -0', risk: 'low' },
    { path: 'src/types/auth.ts', change: '+8 -3', risk: 'low' },
  ],
  onApprove: 'continue',
  onReject: 'stop',
};

/**
 * MOCK_APPROVAL_DATA_HIGH_RISK — 高风险审批数据
 *
 * 场景：安全审查发现 SQL 注入风险
 */
export const MOCK_APPROVAL_DATA_HIGH_RISK: ApprovalData = {
  type: 'code_review',
  title: '确认安全漏洞修复',
  description: '分析Agent 在 PR #142 中发现 SQL 注入风险和 XSS 漏洞。建议立即修复后再合并。',
  overallRisk: 'high',
  files: [
    { path: 'src/api/userSearch.ts', change: '+28 -14', risk: 'high' },
    { path: 'src/components/UserList.tsx', change: '+15 -8', risk: 'high' },
  ],
  onApprove: 'continue',
  onReject: 'stop',
};

/**
 * MOCK_INTERACTION_DATA_SINGLE — Mock 单选交互数据
 *
 * 场景：询问用户偏好的迁移策略
 */
export const MOCK_INTERACTION_DATA_SINGLE: InteractionData = {
  type: 'single',
  title: '选择迁移策略',
  question: '请选择您偏好的登录模块迁移策略：',
  compactAsk: '正在征求您的意见...',
  options: [
    {
      id: 'full',
      label: '全面重构',
      desc: '重新实现整个登录模块，代码更整洁',
      tag: '推荐',
      tagColor: 'brand',
    },
    {
      id: 'incr',
      label: '渐进式改造',
      desc: '保留现有接口，逐步替换内部实现',
      tag: '稳妥',
    },
    {
      id: 'hybrid',
      label: '混合方案',
      desc: '核心逻辑重写，UI 层渐进替换',
      tag: '平衡',
      tagColor: 'amber',
    },
  ],
  onSelect: 'continue',
};

/**
 * MOCK_INTERACTION_DATA_MULTIPLE — Mock 多选交互数据
 *
 * 场景：选择安全扫描范围
 */
export const MOCK_INTERACTION_DATA_MULTIPLE: InteractionData = {
  type: 'multiple',
  title: '选择扫描范围',
  question: '请选择需要安全扫描的检查项（可多选）：',
  compactAsk: '请选择扫描范围...',
  options: [
    {
      id: 'sqli',
      label: 'SQL 注入检测',
      desc: '扫描数据库查询中的拼接注入风险',
      tag: '高危',
      tagColor: 'red',
    },
    {
      id: 'xss',
      label: 'XSS 漏洞检测',
      desc: '扫描前端模板中的跨站脚本风险',
      tag: '高危',
      tagColor: 'red',
    },
    {
      id: 'dep',
      label: '依赖漏洞检查',
      desc: '检查第三方库的已知 CVE 漏洞',
      tag: '中危',
      tagColor: 'amber',
    },
    {
      id: 'secret',
      label: '密钥泄露检测',
      desc: '扫描硬编码密钥和凭据泄露风险',
      tag: '中危',
      tagColor: 'amber',
    },
  ],
  onSelect: 'continue',
};

/**
 * MOCK_FILE_CHANGE_DATA — Mock 文件变更数据
 *
 * 场景：创建新的登录组件
 */
export const MOCK_FILE_CHANGE_DATA: FileChangeData = {
  path: 'src/components/LoginForm.tsx',
  change: {
    type: 'create',
    additions: 156,
    deletions: 0,
    summary: '创建基于 React Hook Form 的登录表单组件',
  },
  language: 'typescript',
};

/**
 * MOCK_FILE_CHANGE_MODIFY — Mock 文件修改数据
 *
 * 场景：修改现有组件
 */
export const MOCK_FILE_CHANGE_MODIFY: FileChangeData = {
  path: 'src/components/UserList.tsx',
  change: {
    type: 'modify',
    additions: 42,
    deletions: 18,
    summary: '添加虚拟滚动和性能优化',
  },
  language: 'typescript',
};

/**
 * MOCK_TOOL_CALL_DATA — Mock 工具调用数据
 *
 * 场景：执行数据库查询
 */
export const MOCK_TOOL_CALL_DATA: ToolCallData = {
  name: 'execute_sql_query',
  description: '执行 SQL 查询获取用户列表',
  status: 'success',
  args: {
    query: 'SELECT * FROM users LIMIT 10',
  },
  result: {
    rows: 10,
    data: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ],
  },
  duration: 245,
};

/**
 * MOCK_TOOL_CALL_RUNNING — Mock 运行中的工具调用
 *
 * 场景：正在执行文件搜索
 */
export const MOCK_TOOL_CALL_RUNNING: ToolCallData = {
  name: 'search_files',
  description: '搜索包含 "useState" 的所有文件',
  status: 'running',
  args: {
    pattern: 'useState',
    path: './src',
  },
};

/**
 * MOCK_ERROR_FIX_DATA — Mock 错误修复数据
 *
 * 场景：TypeScript 类型错误
 */
export const MOCK_ERROR_FIX_DATA: ErrorFixData = {
  message: "Type 'string' is not assignable to type 'number'",
  severity: 'error',
  location: 'src/components/LoginForm.tsx:42:5',
  suggestions: [
    {
      title: '将 userId 转换为 number',
      description: '使用 parseInt() 或 Number() 将字符串转换为数字',
      code: 'const userId = parseInt(props.userId, 10);',
    },
    {
      title: '修改类型定义',
      description: '将 userId 的类型从 number 改为 string',
    },
  ],
};

/**
 * MOCK_ERROR_FIX_WARNING — Mock 警告数据
 *
 * 场景：废弃警告
 */
export const MOCK_ERROR_FIX_WARNING: ErrorFixData = {
  message: 'Warning: componentWillMount is deprecated',
  severity: 'warning',
  location: 'src/components/LoginForm.tsx:28:10',
  suggestions: [
    {
      title: '迁移到 componentDidMount',
      description: '将初始化逻辑移到 componentDidMount 生命周期方法',
    },
  ],
  autoFixed: true,
};

/**
 * MOCK_COMPOSER_DATA — Mock Composer 数据
 *
 * 场景：多文件变更 Composer
 */
export const MOCK_COMPOSER_DATA: ComposerData = {
  title: '重构登录模块',
  status: 'reviewing',
  files: [
    { path: 'src/components/LoginForm.tsx', additions: 156, deletions: 42 },
    { path: 'src/schema/loginSchema.ts', additions: 28, deletions: 0 },
    { path: 'src/types/auth.ts', additions: 12, deletions: 8 },
  ],
  stats: {
    totalAdditions: 196,
    totalDeletions: 50,
    filesChanged: 3,
  },
  actions: [
    { label: '查看详情', action: 'view-details' },
    { label: '应用变更', action: 'apply' },
    { label: '取消', action: 'cancel' },
  ],
};

/**
 * MOCK_COMPOSER_DONE — Mock 已完成 Composer
 */
export const MOCK_COMPOSER_DONE: ComposerData = {
  title: '添加用户认证功能',
  status: 'done',
  files: [
    { path: 'src/api/auth.ts', additions: 89, deletions: 0 },
    { path: 'src/components/LoginForm.tsx', additions: 156, deletions: 0 },
  ],
  stats: {
    totalAdditions: 245,
    totalDeletions: 0,
    filesChanged: 2,
  },
};

/* ===== 工具函数 ===== */

/**
 * MOCK_TASK_DATA — Mock 任务数据
 *
 * 用于 TaskProgressPanel 渲染的示例数据
 * 场景：用户执行 /explore 命令，正在探索代码库
 */
export const MOCK_TASK_DATA: TaskData = {
  id: 'task-explore-001',
  title: '探索项目代码库结构',
  activeAgent: 'explore',
  agents: ['explore', 'proposal', 'task'],
  progress: {
    currentStep: 4,
    totalSteps: 8,
    percentage: 50,
  },
  taskList: [
    { text: '扫描项目目录结构', completed: true },
    { text: '识别主要源码文件', completed: true },
    { text: '分析依赖关系', completed: true },
    { text: '提取关键函数和类', completed: true },
    { text: '生成项目结构报告', completed: false },
  ],
};

/**
 * MOCK_TASK_DATA_MULTIPLE — 多 Agent 协作任务
 *
 * 场景：代码重构任务，涉及多个 Agent
 */
export const MOCK_TASK_DATA_MULTIPLE: TaskData = {
  id: 'task-refactor-001',
  title: '重构 AIChat 组件（拆分消息渲染器）',
  activeAgent: 'refactor',
  agents: ['proposal', 'refactor', 'test', 'doc'],
  progress: {
    currentStep: 6,
    totalSteps: 12,
    percentage: 50,
  },
  taskList: [
    { text: '分析当前 AIChat 结构', completed: true },
    { text: '设计消息类型注册表', completed: true },
    { text: '实现 MessageCardRegistry', completed: true },
    { text: '提取审批卡片组件', completed: true },
    { text: '提取进度卡片组件', completed: true },
    { text: '编写单元测试', completed: false },
    { text: '集成到 AIChat', completed: false },
  ],
};

/**
 * MOCK_TASK_DATA_REVIEW — 代码审查任务
 *
 * 场景：代码审查任务
 */
export const MOCK_TASK_DATA_REVIEW: TaskData = {
  id: 'task-review-001',
  title: '审查 PR #123: 添加用户认证功能',
  activeAgent: 'review',
  agents: ['review', 'test'],
  progress: {
    currentStep: 2,
    totalSteps: 5,
    percentage: 40,
  },
  taskList: [
    { text: '审查认证逻辑实现', completed: true },
    { text: '检查错误处理', completed: true },
    { text: '验证测试覆盖', completed: false },
    { text: '检查安全性问题', completed: false },
    { text: '提供审查反馈', completed: false },
  ],
};

/* ===== 工具函数 ===== */

/**
 * 获取 Mock 任务数据列表
 */
export function getMockTaskDataList(): TaskData[] {
  return [
    MOCK_TASK_DATA,
    MOCK_TASK_DATA_MULTIPLE,
    MOCK_TASK_DATA_REVIEW,
  ];
}

/**
 * 根据 ID 获取 Mock 任务数据
 */
export function getMockTaskDataById(id: string): TaskData | undefined {
  return getMockTaskDataList().find(task => task.id === id);
}
