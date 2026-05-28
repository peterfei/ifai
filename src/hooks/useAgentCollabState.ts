/**
 * useAgentCollabState — Agent 协作状态同步 hook
 *
 * 职责：
 * - 监听 agent:status Tauri 事件
 * - 订阅 agentStore.runningAgents 变更
 * - 派生 AgentDot[] + compactText 同步到 AgentCollabStore
 *
 * 设计原则：
 * - 纯副作用 hook，不返回值
 * - 通过 subscribe 响应式同步，无需手动轮询
 * - 数据驱动：AgentDot 由 runningAgents 推导而非硬编码
 */
import { useEffect, useRef } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useAgentCollabStore } from '../stores/agentCollabStore';
import { getAgentDotConfig } from '../types/agent-collaboration';
import type { AgentDot } from '../types/agent-collaboration';

/**
 * 判断 Agent 是否活跃
 * 只有 running / waitingfortool / initializing 视为活跃
 */
function isAgentActive(status: string): boolean {
  return ['running', 'waitingfortool', 'initializing'].includes(status);
}

/**
 * 从 runningAgents 推导 AgentDot[] + compactText
 */
function deriveAgentState(): { dots: AgentDot[]; text: string } {
  const agents = useAgentStore.getState().runningAgents;
  const activeCount = agents.filter((a) => isAgentActive(a.status)).length;
  const totalCount = agents.length;

  const dots: AgentDot[] = agents.map((a) => {
    const config = getAgentDotConfig(a.type);
    return {
      id: a.id,
      label: config.label,
      gradient: config.gradient,
      isActive: isAgentActive(a.status),
    };
  });

  const text = totalCount > 0 ? `${activeCount}/${totalCount} Agent 活跃` : '';

  return { dots, text };
}

/**
 * 同步 Agent 状态到 AgentCollabStore
 */
function syncAgentState(): void {
  const { dots, text } = deriveAgentState();
  useAgentCollabStore.getState().setAgentDots(dots, text);
}

export function useAgentCollabState(): void {
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // 初始同步
    syncAgentState();

    // 订阅 agentStore 变更
    const unsub = useAgentStore.subscribe(() => {
      syncAgentState();
    });
    unsubRef.current = unsub;

    // 尝试监听 Tauri agent:status 事件（非 Tauri 环境静默失败）
    let cancelled = false;

    async function setupTauriListener() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        await listen('agent:status', () => {
          if (!cancelled) {
            syncAgentState();
          }
        });
      } catch {
        // 非 Tauri 环境（浏览器 dev）静默失败
      }
    }

    setupTauriListener();

    return () => {
      cancelled = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);
}
