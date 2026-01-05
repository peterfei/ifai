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

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      // State
      tasks: new Map<string, TaskMetadata>(),
      activeTaskId: null,
      filter: DEFAULT_FILTER,
      history: [],
      maxHistorySize: 100,

      // ============================================================================
      // Task Operations
      // ============================================================================

      /**
       * Add a new task
       */
      addTask: (task: TaskMetadata) => {
        set((state) => {
          const tasks = new Map(state.tasks);
          tasks.set(task.id, task);

          // Set as active if no active task
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
          const tasks = new Map(state.tasks);
          const task = tasks.get(id);

          if (!task) return state;

          const updatedTask: TaskMetadata = {
            ...task,
            ...updates,
            // Recalculate percentage if progress changed
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

          tasks.set(id, updatedTask);

          return { tasks };
        });
      },

      /**
       * Remove a task
       */
      removeTask: (id: string) => {
        set((state) => {
          const tasks = new Map(state.tasks);
          const task = tasks.get(id);

          if (task) {
            // Add to history before removing
            const history = [task, ...state.history].slice(0, state.maxHistorySize);

            tasks.delete(id);

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
        return get().tasks.get(id);
      },

      /**
       * Get tasks by status
       */
      getTasksByStatus: (status: TaskStatus) => {
        const tasks = get().tasks;
        return Array.from(tasks.values()).filter((task) => task.status === status);
      },

      /**
       * Get tasks by category
       */
      getTasksByCategory: (category: TaskCategory) => {
        const tasks = get().tasks;
        return Array.from(tasks.values()).filter((task) => task.category === category);
      },

      /**
       * Get all tasks as array
       */
      getAllTasks: () => {
        return Array.from(get().tasks.values());
      },

      /**
       * Get filtered tasks
       */
      getFilteredTasks: () => {
        const { tasks, filter } = get();
        const taskArray = Array.from(tasks.values());

        return taskArray.filter((task) => {
          // Status filter
          if (filter.status !== 'all' && task.status !== filter.status) {
            return false;
          }

          // Category filter
          if (filter.category !== 'all' && task.category !== filter.category) {
            return false;
          }

          // Search filter
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
          const tasks = new Map<string, TaskMetadata>();
          const completedTasks: TaskMetadata[] = [];

          for (const [id, task] of state.tasks) {
            if (task.status === 'success' || task.status === 'failed' || task.status === 'cancelled') {
              completedTasks.push(task);
            } else {
              tasks.set(id, task);
            }
          }

          // Add to history
          const history = [...completedTasks, ...state.history].slice(0, state.maxHistorySize);

          return { tasks, history };
        });
      },

      /**
       * Cancel all running tasks
       */
      cancelAll: () => {
        set((state) => {
          const tasks = new Map(state.tasks);

          for (const [id, task] of state.tasks) {
            if (task.status === 'running' || task.status === 'pending') {
              tasks.set(id, {
                ...task,
                status: 'cancelled' as TaskStatus,
                completedAt: Date.now(),
              });
            }
          }

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
        // Don't persist active tasks (they'll be recreated)
        tasks: undefined,
        activeTaskId: undefined,
        filter: undefined,
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
  const tasks = useTaskStore(state => state.tasks);
  const filter = useTaskStore(state => state.filter, shallow);
  
  return useMemo(() => {
    const taskArray = Array.from(tasks.values());
    return taskArray.filter((task) => {
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
  const tasks = useTaskStore(state => state.tasks);
  
  return useMemo(() => {
    const taskArray = Array.from(tasks.values());
    return {
      total: taskArray.length,
      running: taskArray.filter((t) => t.status === 'running').length,
      success: taskArray.filter((t) => t.status === 'success').length,
      failed: taskArray.filter((t) => t.status === 'failed').length,
      pending: taskArray.filter((t) => t.status === 'pending').length,
    };
  }, [tasks]);
};

/**
 * Hook to get active task
 */
export const useActiveTask = () => {
  const activeTaskId = useTaskStore(state => state.activeTaskId);
  const tasks = useTaskStore(state => state.tasks);
  return useMemo(() => activeTaskId ? tasks.get(activeTaskId) : null, [activeTaskId, tasks]);
};
