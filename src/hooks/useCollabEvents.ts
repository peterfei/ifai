/**
 * useCollabEvents — Agent 协作事件监听 hook
 *
 * 职责：
 * - 监听 workflow executor 发射的 CollabEvent Tauri 事件
 * - 将事件数据同步到 agentCollabStore / agentStore
 *
 * 设计原则：
 * - 纯副作用 hook，不返回值
 * - 使用动态 import 避免非 Tauri 环境报错
 * - cancelled 标志防止 unmount 后脏更新
 *
 * 事件列表（与 schemas/events.yaml 对齐）：
 * - agent:spawn:begin      → agent 开始执行
 * - agent:spawn:end        → agent 执行完成
 * - agent:close            → agent 工作结束
 * - agent:interaction:begin → 等待用户交互
 * - agent:interaction:end   → 用户已交互
 */
import { useEffect, useRef } from 'react';
import { useAgentCollabStore } from '../stores/agentCollabStore';

// ============================================================
// 事件负载类型（与 schemas/events.yaml 字段对齐）
// ============================================================

interface SpawnBeginPayload {
  agent_id: string;
  agent_type: string;
  task: string;
}

interface SpawnEndPayload {
  agent_id: string;
  result: string;
  duration_ms: number;
}

interface AgentClosePayload {
  agent_id: string;
}

interface InteractionBeginPayload {
  agent_id: string;
  question: string;
  options: string[];
}

interface InteractionEndPayload {
  agent_id: string;
  response: string;
}

type CollabPayload =
  | SpawnBeginPayload
  | SpawnEndPayload
  | AgentClosePayload
  | InteractionBeginPayload
  | InteractionEndPayload;

// ============================================================
// 事件名称常量
// ============================================================

const EVENTS = {
  SPAWN_BEGIN: 'agent:spawn:begin',
  SPAWN_END: 'agent:spawn:end',
  CLOSE: 'agent:close',
  INTERACTION_BEGIN: 'agent:interaction:begin',
  INTERACTION_END: 'agent:interaction:end',
} as const;

// ============================================================
// Hook
// ============================================================

export function useCollabEvents(): void {
  const unlistenersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    async function setupListeners() {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        // agent:spawn:begin — agent 开始执行
        const unlistenSpawnBegin = await listen<CollabPayload>(
          EVENTS.SPAWN_BEGIN,
          (event) => {
            if (cancelled) return;
            const payload = event.payload as SpawnBeginPayload;
            // 在 agentCollabStore 中记录活跃 agent
            useAgentCollabStore.getState().setAgentDots(
              [
                {
                  id: payload.agent_id,
                  label: payload.agent_type.slice(0, 2).toUpperCase(),
                  gradient: 'from-brand-400 to-brand-600',
                  isActive: true,
                },
              ],
              `${payload.agent_type} 正在 ${payload.task.slice(0, 40)}`,
            );
          },
        );
        unlisteners.push(unlistenSpawnBegin);

        // agent:spawn:end — agent 执行完成
        const unlistenSpawnEnd = await listen<CollabPayload>(
          EVENTS.SPAWN_END,
          (event) => {
            if (cancelled) return;
            const payload = event.payload as SpawnEndPayload;
            // 将对应 agent 标记为非活跃
            const store = useAgentCollabStore.getState();
            const updatedDots = store.agentDots.map((dot) =>
              dot.id === payload.agent_id ? { ...dot, isActive: false } : dot,
            );
            const resultText =
              payload.result === 'completed' ? '已完成' : '执行失败';
            store.setAgentDots(updatedDots, resultText);
          },
        );
        unlisteners.push(unlistenSpawnEnd);

        // agent:close — agent 工作结束，从 dots 移除
        const unlistenClose = await listen<CollabPayload>(
          EVENTS.CLOSE,
          (event) => {
            if (cancelled) return;
            const payload = event.payload as AgentClosePayload;
            const store = useAgentCollabStore.getState();
            const remainingDots = store.agentDots.filter(
              (dot) => dot.id !== payload.agent_id,
            );
            const hasActive = remainingDots.some((dot) => dot.isActive);
            store.setAgentDots(
              remainingDots,
              hasActive ? `${remainingDots.filter((d) => d.isActive).length} Agent 活跃` : '',
            );
          },
        );
        unlisteners.push(unlistenClose);

        // agent:interaction:begin — 等待用户交互
        const unlistenInteractionBegin = await listen<CollabPayload>(
          EVENTS.INTERACTION_BEGIN,
          (event) => {
            if (cancelled) return;
            const payload = event.payload as InteractionBeginPayload;
            const store = useAgentCollabStore.getState();
            const updatedDots = store.agentDots.map((dot) =>
              dot.id === payload.agent_id
                ? { ...dot, isActive: true }
                : dot,
            );
            store.setAgentDots(updatedDots, `等待用户输入: ${payload.question.slice(0, 30)}`);
          },
        );
        unlisteners.push(unlistenInteractionBegin);

        // agent:interaction:end — 用户已交互
        const unlistenInteractionEnd = await listen<CollabPayload>(
          EVENTS.INTERACTION_END,
          (event) => {
            if (cancelled) return;
            const payload = event.payload as InteractionEndPayload;
            const store = useAgentCollabStore.getState();
            const updatedDots = store.agentDots.map((dot) =>
              dot.id === payload.agent_id
                ? { ...dot, isActive: false }
                : dot,
            );
            const hasActive = updatedDots.some((dot) => dot.isActive);
            store.setAgentDots(
              updatedDots,
              hasActive ? `${updatedDots.filter((d) => d.isActive).length} Agent 活跃` : '已收到反馈',
            );
          },
        );
        unlisteners.push(unlistenInteractionEnd);
      } catch {
        // 非 Tauri 环境（浏览器 dev / SSR）静默失败
      }
    }

    setupListeners();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
      unlistenersRef.current = [];
    };
  }, []);
}
