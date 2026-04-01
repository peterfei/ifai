/**
 * 任务存储服务
 *
 * 与后端 TaskStore 交互的接口层
 *
 * @module taskStoreService
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

/**
 * 任务项
 */
export interface TaskItem {
  content: string;
  activeForm: string;
  status: TaskStatus;
}

/**
 * 任务统计信息
 */
export interface TaskStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
}

/**
 * 任务存储服务
 */
export const taskStoreService = {
  /**
   * 获取当前任务列表
   */
  async getTasks(): Promise<TaskItem[]> {
    try {
      return await invoke<TaskItem[]>('get_tasks');
    } catch (error) {
      console.error('[TaskStore] Failed to get tasks:', error);
      throw new Error(`Failed to get tasks: ${error}`);
    }
  },

  /**
   * 更新任务状态
   *
   * @param index - 任务索引（从 0 开始）
   * @param status - 新状态
   */
  async updateTask(index: number, status: TaskStatus): Promise<void> {
    try {
      await invoke('update_task', { index, status });
    } catch (error) {
      console.error('[TaskStore] Failed to update task:', error);
      throw new Error(`Failed to update task: ${error}`);
    }
  },

  /**
   * 清空任务列表
   */
  async clearTasks(): Promise<void> {
    try {
      await invoke('clear_tasks');
    } catch (error) {
      console.error('[TaskStore] Failed to clear tasks:', error);
      throw new Error(`Failed to clear tasks: ${error}`);
    }
  },

  /**
   * 删除指定任务
   *
   * @param index - 任务索引（从 0 开始）
   */
  async removeTask(index: number): Promise<TaskItem> {
    try {
      return await invoke<TaskItem>('remove_task', { index });
    } catch (error) {
      console.error('[TaskStore] Failed to remove task:', error);
      throw new Error(`Failed to remove task: ${error}`);
    }
  },

  /**
   * 获取任务统计信息
   */
  async getTaskStats(): Promise<TaskStats> {
    try {
      return await invoke<TaskStats>('get_task_stats');
    } catch (error) {
      console.error('[TaskStore] Failed to get task stats:', error);
      throw new Error(`Failed to get task stats: ${error}`);
    }
  },
};
