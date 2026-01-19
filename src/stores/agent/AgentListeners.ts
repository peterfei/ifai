/**
 * Agent 事件监听器管理
 * 负责管理 Agent 的 Tauri 事件监听器生命周期
 * @module AgentListeners
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentEventPayload } from '../../types/agent';

/**
 * Agent 事件监听器接口
 */
export interface AgentEventListener {
  /** 初始化监听器 */
  init: (agentId: string) => Promise<UnlistenFn>;
  /** 注册外部创建的 unlisten 函数 */
  register: (agentId: string, unlisten: UnlistenFn) => void;
  /** 清理特定监听器 */
  cleanup: (agentId: string) => void;
  /** 清理所有监听器 */
  cleanupAll: () => void;
}

/**
 * 创建 Agent 事件监听器管理器
 * @returns 监听器管理器实例
 */
export function createAgentListeners(): AgentEventListener {
  /** 活跃的监听器映射表 */
  const activeListeners: Record<string, UnlistenFn> = {};

  return {
    /**
     * 初始化 Agent 事件监听器
     * @param agentId - Agent ID
     * @returns 取消监听函数
     */
    init: async (agentId: string) => {
      const eventId = `agent_${agentId}`;
      const unlisten = await listen<AgentEventPayload>(eventId, () => {
        // 事件处理逻辑将在后续与 agentStore 集成时实现
        // 当前仅作为占位符
      });
      activeListeners[agentId] = unlisten;
      return unlisten;
    },

    /**
     * 注册外部创建的 unlisten 函数
     * @param agentId - Agent ID
     * @param unlisten - 取消监听函数
     */
    register: (agentId: string, unlisten: UnlistenFn) => {
      activeListeners[agentId] = unlisten;
    },

    /**
     * 清理特定 Agent 的监听器
     * @param agentId - Agent ID
     */
    cleanup: (agentId: string) => {
      const unlisten = activeListeners[agentId];
      if (unlisten) {
        unlisten();
        delete activeListeners[agentId];
      }
    },

    /**
     * 清理所有监听器
     */
    cleanupAll: () => {
      Object.values(activeListeners).forEach((unlisten) => unlisten());
      Object.keys(activeListeners).forEach((k) => delete activeListeners[k]);
    }
  };
}
