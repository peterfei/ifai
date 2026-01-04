/**
 * 任务拆解状态管理 Store
 * v0.2.6 新增
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { TaskBreakdown, TaskNode } from '../types/taskBreakdown';
import { useFileStore } from './fileStore';

interface TaskBreakdownState {
  /** 当前任务拆解 */
  currentBreakdown: TaskBreakdown | null;
  /** 任务拆解历史 */
  history: TaskBreakdown[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 是否显示任务树面板 */
  isPanelOpen: boolean;

  /** 设置当前任务拆解 */
  setCurrentBreakdown: (breakdown: TaskBreakdown | null) => void;
  /** 加载任务拆解 */
  loadBreakdown: (id: string) => Promise<TaskBreakdown>;
  /** 保存任务拆解 */
  saveBreakdown: (breakdown: TaskBreakdown) => Promise<void>;
  /** 删除任务拆解 */
  deleteBreakdown: (id: string) => Promise<void>;
  /** 刷新历史列表 */
  refreshHistory: () => Promise<void>;
  /** 清空当前任务拆解 */
  clearCurrent: () => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 打开/关闭任务树面板 */
  setPanelOpen: (open: boolean) => void;
}

export const useTaskBreakdownStore = create<TaskBreakdownState>()(
  persist(
    (set, get) => ({
      currentBreakdown: null,
      history: [],
      isLoading: false,
      error: null,
      isPanelOpen: false,

      setCurrentBreakdown: (breakdown) => {
        set({ currentBreakdown: breakdown });
      },

      loadBreakdown: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          const breakdown: TaskBreakdown = await invoke('load_task_breakdown', {
            id,
            projectRoot: rootPath,
          });

          set({ currentBreakdown: breakdown, isLoading: false });
          return breakdown;
        } catch (e) {
          const errorMsg = `Failed to load task breakdown: ${e}`;
          set({ error: errorMsg, isLoading: false });
          throw new Error(errorMsg);
        }
      },

      saveBreakdown: async (breakdown) => {
        set({ error: null });
        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          await invoke('save_task_breakdown', {
            breakdown,
            projectRoot: rootPath,
          });

          // 刷新历史
          await get().refreshHistory();

          set({ currentBreakdown: breakdown });
        } catch (e) {
          const errorMsg = `Failed to save task breakdown: ${e}`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }
      },

      deleteBreakdown: async (id) => {
        set({ error: null });
        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          await invoke('delete_task_breakdown', { id, projectRoot: rootPath });

          // 如果删除的是当前任务，清空
          const { currentBreakdown } = get();
          if (currentBreakdown?.id === id) {
            set({ currentBreakdown: null });
          }

          // 刷新历史
          await get().refreshHistory();
        } catch (e) {
          const errorMsg = `Failed to delete task breakdown: ${e}`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }
      },

      refreshHistory: async () => {
        set({ error: null });
        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            set({ history: [] });
            return;
          }

          const breakdowns: TaskBreakdown[] = await invoke('list_task_breakdowns', {
            projectRoot: rootPath,
          });

          set({ history: breakdowns });
        } catch (e) {
          const errorMsg = `Failed to refresh history: ${e}`;
          set({ error: errorMsg });
          console.error('[TaskBreakdownStore]', errorMsg);
        }
      },

      clearCurrent: () => {
        set({ currentBreakdown: null });
      },

      setError: (error) => {
        set({ error });
      },

      setPanelOpen: (open) => {
        set({ isPanelOpen: open });
      },
    }),
    {
      name: 'task-breakdown-storage',
      partialize: (state) => ({
        history: state.history,
        // 不持久化 currentBreakdown，避免占用太多空间
      }),
    }
  )
);
