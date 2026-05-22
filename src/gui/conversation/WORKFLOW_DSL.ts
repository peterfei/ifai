/**
 * WORKFLOW_DSL — 工作流步骤数据声明
 *
 * 数据驱动的工作流步骤定义，支持：
 * - 任务元数据（标题、步骤、Agent 分配）
 * - 任务清单（可勾选的步骤列表）
 * - 审批和交互数据（后续 Phase C 实现）
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
 * 完整的任务元数据，用于驱动 TaskProgressPanel 渲染
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

/* ===== Mock 数据 ===== */

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
