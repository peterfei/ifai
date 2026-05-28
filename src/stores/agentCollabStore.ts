/**
 * AgentCollabStore — Agent 协作轻量 Store
 *
 * 职责：
 * - 存储 AgentCompactBar 所需的最小状态（agentDots, compactText）
 * - 卡片数据直接从 message.metadata 读取（不存储在此）
 * - 从 agentStore.runningAgents 同步推导 agentDots
 *
 * 设计原则：
 * - 轻量：仅存 compact bar 状态，不存卡片数据
 * - 推导式：hasActiveAgents 从 agentDots 推导，非手动设置
 */
import { create } from 'zustand';
import type { AgentDot } from '../types/agent-collaboration';

/* ===== 类型定义 ===== */

export interface AgentCollabState {
  /** Agent 圆点列表（AgentCompactBar 渲染用） */
  agentDots: AgentDot[];
  /** 紧凑文本（AgentCompactBar 显示用） */
  compactText: string;
  /** 是否有活跃 Agent（推导值） */
  hasActiveAgents: boolean;
}

export interface AgentCollabActions {
  /**
   * 设置 Agent 圆点和紧凑文本
   * hasActiveAgents 自动推导
   */
  setAgentDots: (dots: AgentDot[], text: string) => void;
  /** 清理所有协作状态 */
  clearCollab: () => void;
}

export type AgentCollabStore = AgentCollabState & AgentCollabActions;

/* ===== Store 实例 ===== */

export const useAgentCollabStore = create<AgentCollabStore>((set) => ({
  // 初始状态
  agentDots: [],
  compactText: '',
  hasActiveAgents: false,

  // Actions
  setAgentDots: (dots, text) =>
    set({
      agentDots: dots,
      compactText: text,
      hasActiveAgents: dots.some((d) => d.isActive),
    }),

  clearCollab: () =>
    set({
      agentDots: [],
      compactText: '',
      hasActiveAgents: false,
    }),
}));
