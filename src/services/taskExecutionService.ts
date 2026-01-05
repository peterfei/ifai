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

export class TaskExecutionService {
  private tasksFile: TasksFile | null = null;
  private tasksFilePath: string = '';

  /**
   * 从当前打开的提案中加载任务
   */
  async loadTasksFromProposal(proposalId: string, rootPath: string): Promise<TasksFile> {
    const tasksPath = `${rootPath}/.ifai/changes/${proposalId}/tasks.md`;
    this.tasksFilePath = tasksPath;

    try {
      const content = await readFileContent(tasksPath);
      this.tasksFile = parseTasksMarkdown(content, proposalId);
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
