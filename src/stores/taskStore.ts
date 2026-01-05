/**
 * Task Store - Zustand State Management
 *
 * Central state management for task monitoring system.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import type {
  TaskMetadata,
  TaskStore,
  TaskUpdate,
  TaskFilter,
  TaskStatus,
  TaskCategory,
  TaskPriority,
} from '../components/TaskMonitor/types';

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_FILTER: TaskFilter = {
  status: 'all',
  category: 'all',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a task with defaults
 */
export function createTask(
  base: Partial<TaskMetadata> & Pick<TaskMetadata, 'title' | 'category'>
): TaskMetadata {
  const now = Date.now();
  return {
    id: base.id || generateTaskId(),
    title: base.title,
    category: base.category,
    status: (base.status || 'pending') as TaskStatus,
    priority: (base.priority || 'normal') as TaskPriority,
    description: base.description,
    icon: base.icon,
    createdAt: base.createdAt || now,
    startedAt: base.startedAt,
    completedAt: base.completedAt,
    estimatedDuration: base.estimatedDuration,
    progress: base.progress || { current: 0, total: 100, percentage: 0 },
    metrics: base.metrics,
    result: base.result,
    actions: base.actions,
    data: base.data,
  };
}

// ============================================================================
// Store
// ============================================================================

interface TaskStoreExtended extends Omit<TaskStore, 'tasks'> {
  tasks: TaskMetadata[];
  setTasks: (tasks: TaskMetadata[]) => void;
}

export const useTaskStore = create<TaskStoreExtended>()(
  persist(
    (set, get) => ({
      // State
      tasks: [],
      activeTaskId: null,
      filter: DEFAULT_FILTER,
      history: [],
      maxHistorySize: 100,

      // ============================================================================
      // Task Operations
      // ============================================================================

      setTasks: (tasks: TaskMetadata[]) => {
        // 强制触发更新：使用新数组引用
        // 同时触发 Zustand 的内部更新机制
        set({ tasks: [...tasks] });
      },

      /**
       * Add a new task
       */
      addTask: (task: TaskMetadata) => {
        set((state) => {
          const exists = state.tasks.find(t => t.id === task.id);
          if (exists) {
            return {
              tasks: state.tasks.map(t => t.id === task.id ? task : t)
            };
          }

          const tasks = [...state.tasks, task];
          const activeTaskId = state.activeTaskId || task.id;

          return {
            tasks,
            activeTaskId,
          };
        });
      },

      /**
       * Update an existing task
       */
      updateTask: (id: string, updates: TaskUpdate) => {
        set((state) => {
          const tasks = state.tasks.map(task => {
            if (task.id !== id) return task;

            return {
              ...task,
              ...updates,
              progress: updates.progress
                ? {
                    ...updates.progress,
                    percentage:
                      updates.progress.percentage ||
                      (updates.progress.total > 0
                        ? Math.round((updates.progress.current / updates.progress.total) * 100)
                        : 0),
                  }
                : task.progress,
            };
          });

          return { tasks };
        });
      },

      /**
       * Remove a task
       */
      removeTask: (id: string) => {
        set((state) => {
          const task = state.tasks.find(t => t.id === id);

          if (task) {
            const history = [task, ...state.history].slice(0, state.maxHistorySize);
            const tasks = state.tasks.filter(t => t.id !== id);

            return {
              tasks,
              history,
              activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
            };
          }

          return state;
        });
      },

      // ============================================================================
      // Query
      // ============================================================================

      /**
       * Get a task by ID
       */
      getTask: (id: string) => {
        return get().tasks.find(t => t.id === id);
      },

      /**
       * Get tasks by status
       */
      getTasksByStatus: (status: TaskStatus) => {
        return get().tasks.filter((task) => task.status === status);
      },

      /**
       * Get tasks by category
       */
      getTasksByCategory: (category: TaskCategory) => {
        return get().tasks.filter((task) => task.category === category);
      },

      /**
       * Get all tasks as array
       */
      getAllTasks: () => {
        return get().tasks;
      },

      /**
       * Get filtered tasks
       */
      getFilteredTasks: () => {
        const { tasks, filter } = get();

        return tasks.filter((task) => {
          if (filter.status && filter.status !== 'all' && task.status !== filter.status) {
            return false;
          }

          if (filter.category && filter.category !== 'all' && task.category !== filter.category) {
            return false;
          }

          if (filter.search) {
            const search = filter.search.toLowerCase();
            return (
              task.title.toLowerCase().includes(search) ||
              task.description?.toLowerCase().includes(search)
            );
          }

          return true;
        });
      },

      // ============================================================================
      // Batch Operations
      // ============================================================================

      /**
       * Clear completed tasks
       */
      clearCompleted: () => {
        set((state) => {
          const completedTasks = state.tasks.filter(t => t.status === 'success' || t.status === 'failed' || t.status === 'cancelled');
          const remainingTasks = state.tasks.filter(t => !(t.status === 'success' || t.status === 'failed' || t.status === 'cancelled'));

          const history = [...completedTasks, ...state.history].slice(0, state.maxHistorySize);

          return { tasks: remainingTasks, history };
        });
      },

      /**
       * Cancel all running tasks
       */
      cancelAll: () => {
        set((state) => {
          const tasks = state.tasks.map(task => {
            if (task.status === 'running' || task.status === 'pending') {
              return {
                ...task,
                status: 'cancelled' as TaskStatus,
                completedAt: Date.now(),
              };
            }
            return task;
          });

          return { tasks };
        });
      },

      // ============================================================================
      // Filter & View
      // ============================================================================

      /**
       * Set filter
       */
      setFilter: (filter: TaskFilter) => {
        set({ filter: { ...DEFAULT_FILTER, ...filter } });
      },

      /**
       * Set active task
       */
      setActiveTask: (id: string | null) => {
        set({ activeTaskId: id });
      },

      // ============================================================================
      // History
      // ============================================================================

      /**
       * Clear history
       */
      clearHistory: () => {
        set({ history: [] });
      },

      /**
       * Get history
       */
      getHistory: () => {
        return get().history;
      },
    }),
    {
      name: 'task-storage',
      version: 1,
      partialize: (state) => ({
        history: state.history,
        maxHistorySize: state.maxHistorySize,
        // Don't persist active tasks
        tasks: [],
      }),
    }
  )
);

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook to get filtered tasks (Memoized)
 */
export const useFilteredTasks = () => {
  // 不使用 shallow 比较，让 Zustand 使用默认的引用比较
  // 这样每次 tasks 数组引用变化时都会触发更新
  const tasks = useTaskStore(state => state.tasks);
  const filter = useTaskStore(state => state.filter);

  return useMemo(() => {
    return tasks.filter((task) => {
      if (filter.status !== 'all' && task.status !== filter.status) return false;
      if (filter.category !== 'all' && task.category !== filter.category) return false;
      if (filter.search) {
        const search = filter.search.toLowerCase();
        return task.title.toLowerCase().includes(search) ||
               task.description?.toLowerCase().includes(search);
      }
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks, filter]);
};

/**
 * Hook to get task counts (Memoized)
 */
export const useTaskCounts = () => {
  // 不使用 shallow 比较
  const tasks = useTaskStore(state => state.tasks);

  return useMemo(() => {
    return {
      total: tasks.length,
      running: tasks.filter((t) => t.status === 'running').length,
      success: tasks.filter((t) => t.status === 'success').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
    };
  }, [tasks]);
};

/**
 * Hook to get active task
 */
export const useActiveTask = () => {
  const activeTaskId = useTaskStore(state => state.activeTaskId);
  const tasks = useTaskStore(state => state.tasks);
  return useMemo(() => tasks.find(t => t.id === activeTaskId) || null, [activeTaskId, tasks]);
};
