/**
 * 任务实施服务
 * v0.2.6 新增
 *
 * 负责任务的读取、实施和状态更新
 */

import { readFileContent } from '../utils/fileSystem';
import { parseTasksMarkdown, updateTaskStatus, generateTasksMarkdown, findTask, getTaskPath, TasksFile, Task } from '../utils/taskParser';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTaskStore } from '../stores/taskStore';
import { TaskStatus as MonitorStatus, TaskCategory, TaskPriority, TaskMetadata } from '../components/TaskMonitor/types';

export class TaskExecutionService {
  private tasksFile: TasksFile | null = null;
  private tasksFilePath: string = '';

  /**
   * 同步任务到 TaskStore (用于 Mission Control 仪表盘显示)
   */
  private syncWithStore(): void {
    if (!this.tasksFile) return;

    const taskStore = useTaskStore.getState();

    console.log(`[TaskExecution] Syncing ${this.tasksFile.tasks.length} tasks to store`);
    console.log(`[TaskExecution] Current store has ${taskStore.tasks.length} tasks`);

    // 首先移除所有不在文件中的任务（已删除的任务）
    const taskIdsInFile = new Set(this.tasksFile.tasks.map(t => t.id));
    const tasksToRemove = taskStore.tasks.filter(t => !taskIdsInFile.has(t.id));

    if (tasksToRemove.length > 0) {
      console.log(`[TaskExecution] Removing ${tasksToRemove.length} tasks that are no longer in file`);
      tasksToRemove.forEach(t => {
        taskStore.removeTask(t.id);
      });
    }

    // 然后更新或添加每个任务
    this.tasksFile.tasks.forEach(task => {
      // 映射任务状态
      let status = MonitorStatus.PENDING;
      if (task.status === 'in_progress') status = MonitorStatus.RUNNING;
      if (task.status === 'done') status = MonitorStatus.SUCCESS;
      if (task.status === 'failed') status = MonitorStatus.FAILED;

      const existingTask = taskStore.tasks.find(t => t.id === task.id);

      const metadata: TaskMetadata = {
        id: task.id,
        title: task.title,
        description: task.content,
        status: status,
        category: TaskCategory.GENERATION, // AI 实施任务默认为生成类
        priority: TaskPriority.NORMAL,
        createdAt: existingTask ? existingTask.createdAt : Date.now(),
        startedAt: existingTask?.startedAt,
        completedAt: task.status === 'done' ? (existingTask?.completedAt || Date.now()) : existingTask?.completedAt,
        progress: {
          current: task.status === 'done' ? 100 : (task.status === 'in_progress' ? 50 : 0),
          total: 100,
          percentage: task.status === 'done' ? 100 : (task.status === 'in_progress' ? 50 : 0)
        }
      };

      // 使用 addTask 而不是批量替换，这样可以触发正确的更新
      taskStore.addTask(metadata);

      console.log(`[TaskExecution] Synced task ${task.id}: status=${task.status} -> monitor=${status}`);
    });

    console.log(`[TaskExecution] Sync complete. Store now has ${taskStore.tasks.length} tasks`);
  }

  /**
   * 从当前打开的提案中加载任务
   */
  async loadTasksFromProposal(proposalId: string, rootPath: string): Promise<TasksFile> {
    const tasksPath = `${rootPath}/.ifai/changes/${proposalId}/tasks.md`;
    this.tasksFilePath = tasksPath;

    try {
      const content = await readFileContent(tasksPath);
      this.tasksFile = parseTasksMarkdown(content, proposalId);
      this.syncWithStore();
      return this.tasksFile;
    } catch (e) {
      throw new Error(`Failed to load tasks: ${e}`);
    }
  }

  /**
   * 从指定文件路径加载任务
   */
  async loadTasksFromFile(filePath: string): Promise<TasksFile> {
    this.tasksFilePath = filePath;

    try {
      const content = await readFileContent(filePath);
      // 从路径中提取 proposalId
      const pathMatch = filePath.match(/\/\.ifai\/changes\/([^/]+)\//);
      const proposalId = pathMatch ? pathMatch[1] : undefined;

      this.tasksFile = parseTasksMarkdown(content, proposalId);
      this.syncWithStore();
      return this.tasksFile;
    } catch (e) {
      throw new Error(`Failed to load tasks from file: ${e}`);
    }
  }

  /**
   * 获取当前加载的任务文件
   */
  getTasksFile(): TasksFile | null {
    return this.tasksFile;
  }

  /**
   * 查找任务
   */
  findTask(taskId: string): Task | undefined {
    if (!this.tasksFile) return undefined;
    return findTask(this.tasksFile, taskId);
  }

  /**
   * 获取任务路径（从根到当前任务）
   */
  getTaskPath(taskId: string): Task[] {
    if (!this.tasksFile) return [];
    return getTaskPath(this.tasksFile, taskId);
  }

  /**
   * 开始实施任务
   */
  async startTask(taskId: string): Promise<void> {
    if (!this.tasksFile) {
      throw new Error('No tasks file loaded');
    }

    // 检查任务是否存在
    const task = this.findTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // 更新状态为 in_progress
    this.tasksFile = updateTaskStatus(this.tasksFile, taskId, 'in_progress');
    this.syncWithStore();

    // 保存到文件
    await this.saveToFile();

    console.log('[TaskExecution] Started task:', taskId);
  }

  /**
   * 完成任务
   */
  async completeTask(taskId: string): Promise<void> {
    if (!this.tasksFile) {
      throw new Error('No tasks file loaded');
    }

    // 更新状态为 done
    this.tasksFile = updateTaskStatus(this.tasksFile, taskId, 'done');
    this.syncWithStore();

    // 保存到文件
    await this.saveToFile();

    console.log('[TaskExecution] Completed task:', taskId);
  }

  /**
   * 保存当前任务状态到文件
   */
  private async saveToFile(): Promise<void> {
    if (!this.tasksFile || !this.tasksFilePath) {
      throw new Error('No tasks file or path to save');
    }

    const newContent = generateTasksMarkdown(this.tasksFile);

    try {
      // 从完整路径中提取项目根路径和相对路径
      // 路径格式：/Users/xxx/projectName/.ifai/changes/xxx/tasks.md
      // 需要提取：rootPath=/Users/xxx/projectName, relPath=.ifai/changes/xxx/tasks.md

      const parts = this.tasksFilePath.split('/.ifai/');
      if (parts.length !== 2) {
        throw new Error(`Invalid tasks path format: ${this.tasksFilePath}`);
      }

      const rootPath = parts[0]; // /Users/xxx/projectName
      const relPath = '.ifai/' + parts[1]; // .ifai/changes/xxx/tasks.md

      console.log('[TaskExecution] Saving tasks:', { rootPath, relPath });

      await invoke('agent_write_file', {
        rootPath: rootPath,
        relPath: relPath,
        content: newContent
      });
      console.log('[TaskExecution] Saved tasks to:', this.tasksFilePath);
    } catch (e) {
      console.error('[TaskExecution] Failed to save tasks:', e);
      throw new Error(`Failed to save tasks: ${e}`);
    }
  }

  /**
   * 获取下一个待办任务
   */
  getNextTodoTask(): Task | undefined {
    if (!this.tasksFile) return undefined;

    // 找到第一个状态为 todo 的任务
    return this.tasksFile.tasks.find(t => t.status === 'todo');
  }

  /**
   * 获取所有待办任务
   */
  getTodoTasks(): Task[] {
    if (!this.tasksFile) return [];
    return this.tasksFile.tasks.filter(t => t.status === 'todo');
  }

  /**
   * 获取进行中的任务
   */
  getInProgressTasks(): Task[] {
    if (!this.tasksFile) return [];
    return this.tasksFile.tasks.filter(t => t.status === 'in_progress');
  }

  /**
   * 获取已完成的任务
   */
  getCompletedTasks(): Task[] {
    if (!this.tasksFile) return [];
    return this.tasksFile.tasks.filter(t => t.status === 'done');
  }

  /**
   * 获取任务统计
   */
  getTaskStats(): { total: number; todo: number; inProgress: number; done: number } {
    if (!this.tasksFile) {
      return { total: 0, todo: 0, inProgress: 0, done: 0 };
    }

    return {
      total: this.tasksFile.tasks.length,
      todo: this.tasksFile.tasks.filter(t => t.status === 'todo').length,
      inProgress: this.tasksFile.tasks.filter(t => t.status === 'in_progress').length,
      done: this.tasksFile.tasks.filter(t => t.status === 'done').length,
    };
  }
}

// 单例实例
let taskExecutionService: TaskExecutionService | null = null;

export function getTaskExecutionService(): TaskExecutionService {
  if (!taskExecutionService) {
    taskExecutionService = new TaskExecutionService();
  }
  return taskExecutionService;
}
