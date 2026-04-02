/**
 * 统一工具调用服务 (P4 迁移)
 *
 * 封装所有 Agent 工具的 Tauri invoke 调用，提供类型安全的 API。
 * 未来可以扩展为支持缓存、批处理等功能。
 *
 * @module toolService
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// 类型定义
// ============================================================================

export interface WriteFileOptions {
  rootPath: string;
  relPath: string;
  content: string;
}

export interface ReadFileOptions {
  rootPath: string;
  relPath: string;
}

export interface ListDirOptions {
  rootPath: string;
  relPath?: string;
}

export interface ScanProjectOptions {
  rootPath: string;
  relPath?: string;
  maxDepth?: number;
}

export interface DeleteFileOptions {
  rootPath: string;
  relPath: string;
}

// ============================================================================
// 工具服务类
// ============================================================================

/**
 * Agent 工具统一调用服务
 *
 * 提供：
 * - 类型安全的工具调用 API
 * - 统一的错误处理
 * - 便于未来扩展（缓存、批处理等）
 */
export class ToolService {
  /**
   * 写入文件
   *
   * @deprecated 使用 ToolRouter 作为后端实现，此接口保持向后兼容
   */
  static async writeFile(options: WriteFileOptions): Promise<string> {
    const { rootPath, relPath, content } = options;

    return await invoke<string>('agent_write_file', {
      rootPath,
      relPath,
      content
    });
  }

  /**
   * 读取文件
   *
   * @deprecated 使用 ToolRouter 作为后端实现，此接口保持向后兼容
   */
  static async readFile(options: ReadFileOptions): Promise<string> {
    const { rootPath, relPath } = options;

    return await invoke<string>('agent_read_file', {
      rootPath,
      relPath
    });
  }

  /**
   * 列出目录内容
   *
   * @deprecated 使用 ToolRouter 作为后端实现，此接口保持向后兼容
   */
  static async listDir(options: ListDirOptions): Promise<string[]> {
    const { rootPath, relPath = '.' } = options;

    return await invoke<string[]>('agent_list_dir', {
      rootPath,
      relPath
    });
  }

  /**
   * 扫描项目结构
   *
   * @deprecated 使用 ToolRouter 作为后端实现，此接口保持向后兼容
   */
  static async scanProject(options: ScanProjectOptions): Promise<string> {
    const { rootPath, relPath = '.', maxDepth = 3 } = options;

    return await invoke<string>('agent_scan_project', {
      rootPath,
      relPath,
      maxDepth
    });
  }

  /**
   * 删除文件
   *
   * 注意：此工具未迁移到 ToolRouter，保留原始实现
   */
  static async deleteFile(options: DeleteFileOptions): Promise<string> {
    const { rootPath, relPath } = options;

    return await invoke<string>('agent_delete_file', {
      rootPath,
      relPath
    });
  }

  // ============================================================================
  // 便捷方法
  // ============================================================================

  /**
   * 便捷方法：写入任务文件
   * 用于 taskExecutionService 等
   */
  static async writeTasksFile(rootPath: string, tasksFilePath: string, content: string): Promise<void> {
    // 解析路径：rootPath/.ifai/changes/xxx/tasks.md
    const parts = tasksFilePath.split('/.ifai/');
    if (parts.length !== 2) {
      throw new Error(`Invalid tasks path format: ${tasksFilePath}`);
    }

    const relPath = '.ifai/' + parts[1];

    await this.writeFile({
      rootPath,
      relPath,
      content
    });
  }

  /**
   * 便捷方法：回滚文件修改
   * 用于 AIChat 回滚操作
   */
  static async rollbackFile(rootPath: string, relPath: string, originalContent: string): Promise<void> {
    await this.writeFile({
      rootPath,
      relPath,
      content: originalContent
    });
  }

  /**
   * 便捷方法：删除新增文件
   * 用于 AIChat 回滚操作
   */
  static async rollbackDelete(rootPath: string, relPath: string): Promise<void> {
    await this.deleteFile({
      rootPath,
      relPath
    });
  }
}

// ============================================================================
// 导出
// ============================================================================

export default ToolService;
