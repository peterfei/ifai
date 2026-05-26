// ============================================================
// useWorkflowProgress — 工作流 progress 事件监听 hook
//
// 监听 Tauri "workflow:progress" 事件，按 nodeId 更新 PhaseData[]。
// mode 由 Rust 端 WorkflowScheduler 直接下发，GUI 不推导。
// 参考: design.md §6.5
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PhaseData, ProgressPayload, SubItem } from '../types/workflow';

interface UseWorkflowProgressOptions {
  /** 初始 phase 列表（从 invoke 返回的工作流解析） */
  initialPhases?: Omit<PhaseData, 'progress' | 'status' | 'sub'>[];
  /** 是否监听 Tauri 事件（默认 true） */
  listenEvents?: boolean;
}

interface UseWorkflowProgressReturn {
  /** 当前 phase 数据 */
  phaseData: PhaseData[];
  /** 是否有正在运行的 phase */
  isRunning: boolean;
  /** 已完成的 phase 数 */
  completedCount: number;
  /** 总的 phase 数 */
  totalCount: number;
  /** 手动更新某个 phase */
  updatePhase: (nodeId: string, updates: Partial<PhaseData>) => void;
  /** 初始化/重置 phase 数据 */
  initializePhases: (phases: Omit<PhaseData, 'progress' | 'status' | 'sub'>[]) => void;
  /** 从 progress 事件更新 */
  handleProgressEvent: (payload: ProgressPayload) => void;
}

export function useWorkflowProgress(
  options?: UseWorkflowProgressOptions
): UseWorkflowProgressReturn {
  const { listenEvents = true } = options ?? {};

  const [phaseData, setPhaseData] = useState<PhaseData[]>(() => {
    if (options?.initialPhases) {
      return options.initialPhases.map(p => ({
        ...p,
        progress: 0,
        status: 'pending' as const,
      }));
    }
    return [];
  });

  const unlistenRef = useRef<(() => void) | null>(null);

  // 更新单个 phase
  const updatePhase = useCallback((nodeId: string, updates: Partial<PhaseData>) => {
    setPhaseData(prev =>
      prev.map(p => (p.nodeId === nodeId ? { ...p, ...updates } : p))
    );
  }, []);

  // 处理 progress 事件
  const handleProgressEvent = useCallback((payload: ProgressPayload) => {
    setPhaseData(prev =>
      prev.map(p => {
        if (p.nodeId !== payload.nodeId) return p;

        const updates: Partial<PhaseData> = {};
        if (payload.status !== undefined) updates.status = payload.status;
        if (payload.progress !== undefined) updates.progress = payload.progress;
        if (payload.subItems !== undefined) {
          updates.sub = payload.subItems.map((s: SubItem | string) =>
            typeof s === 'string' ? { name: s, status: payload.status } : s
          );
        }
        // mode 由 Rust 端直接下发，不做 GUI 推导
        if (payload.mode !== undefined) updates.mode = payload.mode;

        return { ...p, ...updates };
      })
    );
  }, []);

  // 初始化 phases
  const initializePhases = useCallback(
    (phases: Omit<PhaseData, 'progress' | 'status' | 'sub'>[]) => {
      setPhaseData(
        phases.map(p => ({
          ...p,
          progress: 0,
          status: 'pending' as const,
        }))
      );
    },
    []
  );

  // 监听 Tauri 事件
  useEffect(() => {
    if (!listenEvents) return;

    let cancelled = false;

    async function setupListener() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<ProgressPayload>('workflow:progress', (event) => {
          if (!cancelled) {
            handleProgressEvent(event.payload);
          }
        });
        unlistenRef.current = unlisten;
      } catch {
        // 非 Tauri 环境（浏览器 dev）静默失败
      }
    }

    setupListener();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [listenEvents, handleProgressEvent]);

  // 计算派生状态
  const isRunning = phaseData.some(p => p.status === 'running');
  const completedCount = phaseData.filter(p => p.status === 'done').length;
  const totalCount = phaseData.length;

  return {
    phaseData,
    isRunning,
    completedCount,
    totalCount,
    updatePhase,
    initializePhases,
    handleProgressEvent,
  };
}
