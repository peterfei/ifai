/**
 * 任务拆解状态管理 Store
 * v0.2.6 新增
 *
 * 使用 Zustand 管理任务拆解状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TaskBreakdown, TaskNode, BreakdownStatus, TaskStatus } from '../types/taskBreakdown';

/**
 * 任务拆解状态
 */
interface TaskBreakdownState {
  /** 当前正在查看或编辑的任务拆解 */
  currentBreakdown: TaskBreakdown | null;
  /** 历史任务拆解列表 */
  history: TaskBreakdown[];
  /** 是否正在拆解任务 */
  isBreakingDown: boolean;
  /** 拆解进度 (0-100) */
  breakdownProgress: number;
  /** 拆解错误信息 */
  error: string | null;

  /** 设置当前任务拆解 */
  setCurrentBreakdown: (breakdown: TaskBreakdown | null) => void;
  /** 更新当前任务拆解 */
  updateCurrentBreakdown: (updates: Partial<TaskBreakdown>) => void;
  /** 添加到历史记录 */
  addToHistory: (breakdown: TaskBreakdown) => void;
  /** 从历史记录删除 */
  removeFromHistory: (id: string) => void;
  /** 从历史记录加载 */
  loadFromHistory: (id: string) => void;
  /** 清空当前拆解 */
  clearCurrent: () => void;
  /** 设置拆解状态 */
  setBreakingDown: (isBreakingDown: boolean) => void;
  /** 设置拆解进度 */
  setBreakdownProgress: (progress: number) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 更新任务节点状态 */
  updateTaskNodeStatus: (nodeId: string, status: TaskStatus) => void;
  /** 计算任务统计信息 */
  calculateStats: (taskTree: TaskNode) => {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
  /** 计算总预估工时 */
  calculateTotalHours: (taskTree: TaskNode) => number;
}

/**
 * 递归计算任务统计信息
 */
const calculateTaskStats = (
  taskTree: TaskNode
): { total: number; pending: number; inProgress: number; completed: number; failed: number } => {
  let stats = {
    total: 1,
    pending: taskTree.status === 'pending' ? 1 : 0,
    inProgress: taskTree.status === 'in_progress' ? 1 : 0,
    completed: taskTree.status === 'completed' ? 1 : 0,
    failed: taskTree.status === 'failed' ? 1 : 0,
  };

  if (taskTree.children && taskTree.children.length > 0) {
    for (const child of taskTree.children) {
      const childStats = calculateTaskStats(child);
      stats.total += childStats.total;
      stats.pending += childStats.pending;
      stats.inProgress += childStats.inProgress;
      stats.completed += childStats.completed;
      stats.failed += childStats.failed;
    }
  }

  return stats;
};

/**
 * 递归计算总预估工时
 */
const calculateTotalHours = (taskTree: TaskNode): number => {
  let total = taskTree.estimatedHours || 0;

  if (taskTree.children && taskTree.children.length > 0) {
    for (const child of taskTree.children) {
      total += calculateTotalHours(child);
    }
  }

  return total;
};

/**
 * 递归更新任务节点状态
 */
const updateNodeStatus = (node: TaskNode, nodeId: string, status: TaskStatus): TaskNode => {
  if (node.id === nodeId) {
    return { ...node, status };
  }

  if (node.children && node.children.length > 0) {
    const updatedChildren = node.children.map(child =>
      updateNodeStatus(child, nodeId, status)
    );
    return { ...node, children: updatedChildren };
  }

  return node;
};

/**
 * 创建任务拆解 Store
 */
export const useTaskBreakdownStore = create<TaskBreakdownState>()(
  persist(
    (set, get) => ({
      // 初始状态
      currentBreakdown: null,
      history: [],
      isBreakingDown: false,
      breakdownProgress: 0,
      error: null,

      // 设置当前任务拆解
      setCurrentBreakdown: (breakdown) => {
        set({ currentBreakdown: breakdown });
        if (breakdown) {
          // 如果是新的拆解，计算统计信息和总工时
          const stats = calculateTaskStats(breakdown.taskTree);
          const totalHours = calculateTotalHours(breakdown.taskTree);
          set({
            currentBreakdown: {
              ...breakdown,
              stats,
              totalEstimatedHours: totalHours,
            },
          });
        }
      },

      // 更新当前任务拆解
      updateCurrentBreakdown: (updates) => {
        const { currentBreakdown } = get();
        if (currentBreakdown) {
          const updated = {
            ...currentBreakdown,
            ...updates,
            updatedAt: Date.now(),
          };
          set({ currentBreakdown: updated });
        }
      },

      // 添加到历史记录
      addToHistory: (breakdown) => {
        const { history } = get();
        // 检查是否已存在
        const existingIndex = history.findIndex(h => h.id === breakdown.id);
        let newHistory;
        if (existingIndex >= 0) {
          // 更新现有记录
          newHistory = [...history];
          newHistory[existingIndex] = breakdown;
        } else {
          // 添加到开头
          newHistory = [breakdown, ...history];
        }
        // 限制历史记录数量为 50
        if (newHistory.length > 50) {
          newHistory = newHistory.slice(0, 50);
        }
        set({ history: newHistory });
      },

      // 从历史记录删除
      removeFromHistory: (id) => {
        const { history, currentBreakdown } = get();
        const newHistory = history.filter(h => h.id !== id);
        set({
          history: newHistory,
          // 如果删除的是当前拆解，清空当前
          currentBreakdown: currentBreakdown?.id === id ? null : currentBreakdown,
        });
      },

      // 从历史记录加载
      loadFromHistory: (id) => {
        const { history } = get();
        const breakdown = history.find(h => h.id === id);
        if (breakdown) {
          set({ currentBreakdown: breakdown });
        }
      },

      // 清空当前拆解
      clearCurrent: () => {
        set({ currentBreakdown: null });
      },

      // 设置拆解状态
      setBreakingDown: (isBreakingDown) => {
        set({ isBreakingDown });
      },

      // 设置拆解进度
      setBreakdownProgress: (progress) => {
        set({ breakdownProgress: Math.min(100, Math.max(0, progress)) });
      },

      // 设置错误信息
      setError: (error) => {
        set({ error });
      },

      // 更新任务节点状态
      updateTaskNodeStatus: (nodeId, status) => {
        const { currentBreakdown } = get();
        if (currentBreakdown) {
          const updatedTaskTree = updateNodeStatus(currentBreakdown.taskTree, nodeId, status);
          const stats = calculateTaskStats(updatedTaskTree);
          const totalHours = calculateTotalHours(updatedTaskTree);
          set({
            currentBreakdown: {
              ...currentBreakdown,
              taskTree: updatedTaskTree,
              stats,
              totalEstimatedHours: totalHours,
              updatedAt: Date.now(),
            },
          });
        }
      },

      // 计算任务统计信息
      calculateStats: calculateTaskStats,

      // 计算总预估工时
      calculateTotalHours: calculateTotalHours,
    }),
    {
      name: 'task-breakdown-storage',
      // 持久化配置
      partialize: (state) => ({
        history: state.history,
        // 不持久化 currentBreakdown，避免占用太多空间
        // 不持久化 isBreakingDown、breakdownProgress、error，它们是运行时状态
      }),
    }
  )
);
