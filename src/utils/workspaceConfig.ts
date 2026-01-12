/**
 * 工作区配置文件管理工具
 * @since v0.3.0
 */

import { save } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { toast } from 'sonner';
import type { WorkspaceConfig, WorkspaceRootConfig } from '../stores/workspaceConfig';

/**
 * 保存工作区配置到文件
 * @param config 工作区配置对象
 * @param filePath 可选的文件路径，如果未提供则弹出保存对话框
 * @returns 保存的文件路径
 */
export async function saveWorkspaceFile(
  config: WorkspaceConfig,
  filePath?: string
): Promise<string> {
  try {
    let targetPath = filePath;

    // 如果没有提供路径，弹出保存对话框
    if (!targetPath) {
      // 根据工作区名称生成默认文件名
      const defaultFileName = config.name
        ? `${config.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.workspace.json`
        : 'workspace.json';

      const saved = await save({
        title: 'Save Workspace',
        defaultPath: defaultFileName,
        filters: [
          {
            name: 'Workspace Config',
            extensions: ['json']
          },
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });

      if (saved === null) {
        throw new Error('User cancelled save operation');
      }

      targetPath = saved;
    }

    // 转换配置为 JSON 字符串
    const configJson = JSON.stringify(config, null, 2);

    // 写入文件
    await writeTextFile(targetPath, configJson);

    console.log('[workspaceConfig] Saved workspace config to:', targetPath);
    return targetPath;
  } catch (error) {
    console.error('[workspaceConfig] Failed to save workspace config:', error);
    toast.error(`Failed to save workspace: ${error}`);
    throw error;
  }
}

/**
 * 从文件加载工作区配置
 * @param filePath 可选的文件路径，如果未提供则弹出打开对话框
 * @returns 工作区配置对象
 */
export async function loadWorkspaceFile(
  filePath?: string
): Promise<WorkspaceConfig> {
  try {
    let targetPath = filePath;

    // 如果没有提供路径，弹出打开对话框
    if (!targetPath) {
      const opened = await open({
        title: 'Open Workspace',
        multiple: false,
        filters: [
          {
            name: 'Workspace Config',
            extensions: ['json']
          },
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });

      if (opened === null) {
        throw new Error('User cancelled open operation');
      }

      targetPath = opened;
    }

    // 读取文件内容
    const configJson = await readTextFile(targetPath);

    // 解析 JSON
    const config = JSON.parse(configJson) as WorkspaceConfig;

    // 验证配置格式
    if (!config.version || !config.roots || !Array.isArray(config.roots)) {
      throw new Error('Invalid workspace config format');
    }

    console.log('[workspaceConfig] Loaded workspace config from:', targetPath);
    return config;
  } catch (error) {
    console.error('[workspaceConfig] Failed to load workspace config:', error);
    toast.error(`Failed to load workspace: ${error}`);
    throw error;
  }
}

/**
 * 验证工作区根目录是否存在
 * @param rootPath 根目录路径
 * @returns 是否存在
 */
export async function validateWorkspaceRoot(rootPath: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    return await exists(rootPath);
  } catch (error) {
    console.error('[workspaceConfig] Failed to validate root:', error);
    return false;
  }
}

/**
 * 获取工作区配置的默认文件名
 * @param workspaceName 工作区名称（可选）
 * @returns 配置文件名
 */
export function getWorkspaceConfigFileName(workspaceName?: string): string {
  if (workspaceName) {
    // 使用工作区名称，替换空格和特殊字符
    const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${sanitizedName}.workspace.json`;
  }
  return '.workspace.json';
}
