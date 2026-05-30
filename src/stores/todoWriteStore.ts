/**
 * TodoWrite 任务 Store
 *
 * 专门用于 TodoWrite 工具的简单任务列表管理
 * 与后端 TaskStore 对应
 *
 * @module todoWriteStore
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TaskItem, TaskStatus } from '../services/taskStoreService';
import { taskStoreService } from '../services/taskStoreService';
import { PersistenceManager } from '../services/storage/PersistenceManager';

export type PanelState = 'full' | 'collapsed' | 'hidden';

/* ===== 线程级任务缓存 ===== */

/**
 * 内存缓存：每个线程的任务快照
 * 切换线程时保存/恢复，不持久化到 localStorage
 */
const _threadTaskCache = new Map<string, TaskItem[]>();

interface TodoWriteStoreState {
  // 状态
  tasks: TaskItem[];
  isLoading: boolean;
  error: string | null;

  // 面板状态（三态：full/collapsed/hidden）
  panelState: PanelState;
  setPanelState: (state: PanelState) => void;
  togglePanel: () => void;

  // 统计信息
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };

  // Actions
  loadTasks: () => Promise<void>;
  updateTaskStatus: (index: number, status: TaskStatus) => Promise<void>;
  clearTasks: () => Promise<void>;
  removeTask: (index: number) => Promise<void>;

  // 从 TodoWrite 工具调用同步
  syncFromToolCall: (todos: any[]) => void;

  // 线程级任务保存/恢复
  saveTasksForThread: (threadId: string) => void;
  loadTasksForThread: (threadId: string) => void;

  // 🔥 FIX: 修复损坏的 store 数据
  repairStore: () => void;

  // 内部方法
  updateStats: () => void;
  checkAutoCollapse: () => void;
}

/**
 * TodoWrite 任务 Store
 *
 * 管理由 AI TodoWrite 工具创建的简单任务列表
 */
export const useTodoWriteStore = create<TodoWriteStoreState>()(
  persist(
    (set, get) => ({
      // 初始状态
      tasks: [],
      isLoading: false,
      error: null,
      panelState: 'hidden' as PanelState,
      stats: {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
      },

      // 面板控制
      setPanelState: (state: PanelState) => set({ panelState: state }),
      togglePanel: () => set((state) => {
        if (state.panelState === 'hidden') return { panelState: 'full' };
        if (state.panelState === 'collapsed') return { panelState: 'full' };
        return { panelState: 'hidden' };
      }),

      // 加载任务列表
      loadTasks: async () => {
        set({ isLoading: true, error: null });
        try {
          const tasks = await taskStoreService.getTasks();
          set({ tasks, isLoading: false });
          get().updateStats();
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : String(error),
            isLoading: false,
          });
        }
      },

      // 更新任务状态
      updateTaskStatus: async (index, status) => {
        set({ error: null });
        const previousTasks = get().tasks;

        try {
          // 乐观更新
          const updatedTasks = [...previousTasks];
          if (index >= 0 && index < updatedTasks.length) {
            updatedTasks[index] = { ...updatedTasks[index], status };
            set({ tasks: updatedTasks });
            get().updateStats();
            get().checkAutoCollapse();
          }

          // 调用后端
          await taskStoreService.updateTask(index, status);
        } catch (error) {
          // 回滚
          set({ tasks: previousTasks });
          set({
            error: error instanceof Error ? error.message : String(error),
          });
          // 重新加载以获取正确状态
          get().loadTasks();
        }
      },

      // 清空任务列表
      clearTasks: async () => {
        set({ error: null });
        try {
          await taskStoreService.clearTasks();
          set({ tasks: [] });
          get().updateStats();
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      // 删除指定任务
      removeTask: async (index) => {
        set({ error: null });
        const previousTasks = get().tasks;

        try {
          // 乐观更新
          const updatedTasks = previousTasks.filter((_, i) => i !== index);
          set({ tasks: updatedTasks });
          get().updateStats();

          // 调用后端
          await taskStoreService.removeTask(index);
        } catch (error) {
          // 回滚
          set({ tasks: previousTasks });
          set({
            error: error instanceof Error ? error.message : String(error),
          });
          // 重新加载
          get().loadTasks();
        }
      },

      // 从 TodoWrite 工具调用同步任务
      syncFromToolCall: (todos) => {
        try {
          const tasks: TaskItem[] = todos.map((todo) => ({
            content: todo.content || '',
            activeForm: todo.activeForm || todo.content || '',
            status: (todo.status || 'pending') as TaskStatus,
          }));

          // 自动展开面板
          set({ tasks, panelState: 'full' });
          get().updateStats();
          get().checkAutoCollapse();
        } catch (error) {
          console.error('[TodoWriteStore] Failed to sync from tool call:', error);
          set({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      // 线程级保存：切换线程前，将当前任务缓存到旧线程
      saveTasksForThread: (threadId: string) => {
        const tasks = get().tasks;
        if (tasks.length > 0) {
          _threadTaskCache.set(threadId, [...tasks]);
        } else {
          _threadTaskCache.delete(threadId);
        }
      },

      // 线程级恢复：切换线程后，从缓存加载新线程的任务
      loadTasksForThread: (threadId: string) => {
        const tasks = _threadTaskCache.get(threadId) || [];
        set({ tasks, panelState: tasks.length > 0 ? 'full' : 'hidden' });
        get().updateStats();
      },

      // 更新统计信息
      updateStats: () => {
        const tasks = get().tasks;
        const stats = {
          total: tasks.length,
          pending: tasks.filter((t) => t.status === 'pending').length,
          inProgress: tasks.filter((t) => t.status === 'in_progress').length,
          completed: tasks.filter((t) => t.status === 'completed').length,
        };
        set({ stats });
      },

      // 检查是否应自动折叠（所有任务完成时）
      checkAutoCollapse: () => {
        const { stats, panelState } = get();
        if (stats.total > 0 && stats.completed === stats.total && panelState === 'full') {
          setTimeout(() => {
            if (get().panelState === 'full' && get().stats.completed === get().stats.total) {
              set({ panelState: 'collapsed' });
            }
          }, 800);
        }
      },

      // 🔥 FIX: 修复损坏的 store 数据
      repairStore: () => {
        const state = get();
        let needsRepair = false;

        // 检查 tasks 是否为数组
        if (!Array.isArray(state.tasks)) {
          console.error('[TodoWriteStore] ❌ tasks is not an array:', state.tasks);
          needsRepair = true;
        }

        // 检查 panelState 是否有效
        if (!['full', 'collapsed', 'hidden'].includes(state.panelState)) {
          console.error('[TodoWriteStore] ❌ invalid panelState:', state.panelState);
          needsRepair = true;
        }

        if (needsRepair) {
          console.log('[TodoWriteStore] 🔧 Repairing store...');
          set({
            tasks: Array.isArray(state.tasks) ? state.tasks : [],
            panelState: ['full', 'collapsed', 'hidden'].includes(state.panelState)
              ? state.panelState
              : 'hidden',
          });
        }
      },
    }),
    {
      name: 'ifai-todowrite-store',
      // 🚀 Phase 2: 从 localStorage 迁移到 IndexedDB（通过 PersistenceManager 路由）
      storage: createJSONStorage(() => PersistenceManager.getInstance()),
      // 持久化任务列表和面板状态
      partialize: (state) => ({
        tasks: state.tasks,
        panelState: state.panelState,
      }),
    }
  )
);

// 辅助 hooks
export const useTodoWriteTasks = () => useTodoWriteStore((state) => state.tasks);
export const useTodoWriteStats = () => useTodoWriteStore((state) => state.stats);
export const useTodoWriteLoading = () => useTodoWriteStore((state) => state.isLoading);
export const useTodoWriteError = () => useTodoWriteStore((state) => state.error);
