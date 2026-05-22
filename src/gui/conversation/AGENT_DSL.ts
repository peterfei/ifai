/**
 * AGENT_DSL — Agent 元数据声明
 *
 * 统一的 Agent 类型数据源（基于项目已实现的 agent 命令）：
 * - id: 唯一标识符
 * - colorKey: AGENT_PALETTE 的键（用于颜色查表）
 * - name: 显示名称（中文）
 * - abbr: 缩写（2-3 字符）
 * - icon: Lucide icon 名称
 * - color: 颜色四件套（从 AGENT_PALETTE 派生）
 * - command: 斜杠命令（如 '/explore'）
 *
 * 设计原则：
 * - 所有组件共享此 DSL，禁止硬编码 Agent 颜色
 * - 颜色从 PALETTE.ts 派生，零重复
 */

import { AGENT_PALETTE, type ColorQuad } from './PALETTE';

/* ===== 类型定义 ===== */

/**
 * Agent 描述符接口
 *
 * 每个 Agent 类型的完整元数据
 */
export interface AgentDescriptor {
  /** Agent 唯一标识 */
  id: string;
  /** AGENT_PALETTE 的键（用于颜色查表） */
  colorKey: keyof typeof AGENT_PALETTE;
  /** 显示名称（中文） */
  name: string;
  /** 缩写（2-3 字符） */
  abbr: string;
  /** Lucide icon 名称 */
  icon: string;
  /** 颜色四件套（从 AGENT_PALETTE 派生） */
  color: ColorQuad;
  /** 斜杠命令（如 '/explore'） */
  command: string;
}

/* ===== Agent 类型定义 ===== */

/**
 * AGENT_DSL — Agent 元数据声明
 *
 * 项目已实现的 agent 命令类型：
 * - explore: 探索代码库（蓝色）
 * - review: 代码审查（橙色）
 * - test: 测试生成（绿色）
 * - doc: 文档生成（蓝色）
 * - refactor: 重构（橙色）
 * - proposal: 提案生成（青色）
 * - task: 任务拆解（粉色）
 */
export const AGENT_DSL: Record<string, AgentDescriptor> = {
  explore: {
    id: 'explore',
    colorKey: 'explore',
    name: '探索代码库',
    abbr: 'EXP',
    icon: 'Search',
    color: AGENT_PALETTE.explore,
    command: '/explore',
  },
  review: {
    id: 'review',
    colorKey: 'review',
    name: '代码审查',
    abbr: 'REV',
    icon: 'ShieldCheck',
    color: AGENT_PALETTE.review,
    command: '/review',
  },
  test: {
    id: 'test',
    colorKey: 'test',
    name: '测试生成',
    abbr: 'TST',
    icon: 'TestTube',
    color: AGENT_PALETTE.test,
    command: '/test',
  },
  doc: {
    id: 'doc',
    colorKey: 'doc',
    name: '文档生成',
    abbr: 'DOC',
    icon: 'FileText',
    color: AGENT_PALETTE.doc,
    command: '/doc',
  },
  refactor: {
    id: 'refactor',
    colorKey: 'refactor',
    name: '重构代码',
    abbr: 'REF',
    icon: 'Zap',
    color: AGENT_PALETTE.refactor,
    command: '/refactor',
  },
  proposal: {
    id: 'proposal',
    colorKey: 'proposal',
    name: '提案生成',
    abbr: 'PRP',
    icon: 'FileEdit',
    color: AGENT_PALETTE.proposal,
    command: '/proposal',
  },
  task: {
    id: 'task',
    colorKey: 'task',
    name: '任务拆解',
    abbr: 'TSK',
    icon: 'ListTree',
    color: AGENT_PALETTE.task,
    command: '/task',
  },
};

/* ===== 查询函数 ===== */

/**
 * getAgent — 根据 ID 查询 Agent 元数据
 *
 * @param id - Agent ID（如 'explore', 'review'）
 * @returns Agent 描述符，未找到时返回 undefined
 *
 * @example
 * getAgent('explore')
 * // → { id: 'explore', colorKey: 'explore', name: '探索代码库', abbr: 'EXP', icon: 'Search', color: {...}, command: '/explore' }
 *
 * getAgent('UNKNOWN')
 * // → undefined
 */
export function getAgent(id: string | undefined): AgentDescriptor | undefined {
  if (!id) {
    return undefined;
  }

  return AGENT_DSL[id];
}

/* ===== 工具函数 ===== */

/**
 * 获取所有 Agent ID 列表
 *
 * @returns 所有 Agent ID 的数组
 */
export function getAllAgentIds(): string[] {
  return Object.keys(AGENT_DSL);
}

/**
 * 获取所有 Agent 元数据列表
 *
 * @returns 所有 Agent 描述符的数组
 */
export function getAllAgents(): AgentDescriptor[] {
  return Object.values(AGENT_DSL);
}

/**
 * 根据命令查询 Agent
 *
 * @param command - 斜杠命令（如 '/explore'）
 * @returns Agent 描述符，未找到时返回 undefined
 *
 * @example
 * getAgentByCommand('/explore')
 * // → { id: 'explore', ..., command: '/explore' }
 */
export function getAgentByCommand(command: string | undefined): AgentDescriptor | undefined {
  if (!command) {
    return undefined;
  }

  return Object.values(AGENT_DSL).find(agent => agent.command === command);
}
