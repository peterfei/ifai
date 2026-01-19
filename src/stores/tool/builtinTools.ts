/**
 * 内置工具注册
 * @module builtinTools
 */

import { invoke } from '@tauri-apps/api/core';
import { ToolRegistry } from 'ifainew-core';
import type { ToolDefinition } from 'ifainew-core';
import type {
  WriteFileArgs,
  ReadFileArgs,
  ListDirArgs,
  DeleteFileArgs,
  WriteFileResult,
  ReadFileResult,
  ListDirResult,
  DeleteFileResult
} from '@/types/toolTypes';

/** 全局工具注册表实例 */
export const toolRegistry = new ToolRegistry();

// ============================================================================
// 文件系统工具
// ============================================================================

/**
 * agent_write_file - 写入文件
 */
toolRegistry.register<WriteFileArgs, WriteFileResult>({
  name: 'agent_write_file',
  category: 'fs',
  description: 'Write content to a file',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' }
    },
    required: ['path', 'content']
  },
  requiresApproval: true,
  isDangerous: true,
  handler: async (args, context) => {
    try {
      await invoke('agent_write_file', {
        messageId: context.messageId,
        path: args.path,
        content: args.content
      });
      return { success: true, output: `File written: ${args.path}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

/**
 * agent_read_file - 读取文件
 */
toolRegistry.register<ReadFileArgs, ReadFileResult>({
  name: 'agent_read_file',
  category: 'fs',
  description: 'Read content from a file',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' }
    },
    required: ['path']
  },
  requiresApproval: false,
  handler: async (args, context) => {
    try {
      const content = await invoke<string>('agent_read_file', {
        messageId: context.messageId,
        path: args.path
      });
      return { success: true, output: content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

/**
 * agent_list_dir - 列出目录内容
 */
toolRegistry.register<ListDirArgs, ListDirResult>({
  name: 'agent_list_dir',
  category: 'fs',
  description: 'List directory contents',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径' }
    },
    required: ['path']
  },
  requiresApproval: false,
  handler: async (args, context) => {
    try {
      const entries = await invoke<string>('agent_list_dir', {
        messageId: context.messageId,
        path: args.path
      });
      return { success: true, output: entries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

/**
 * agent_delete_file - 删除文件
 */
toolRegistry.register<DeleteFileArgs, DeleteFileResult>({
  name: 'agent_delete_file',
  category: 'fs',
  description: 'Delete a file',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' }
    },
    required: ['path']
  },
  requiresApproval: true,
  isDangerous: true,
  handler: async (args, context) => {
    try {
      await invoke('agent_delete_file', {
        messageId: context.messageId,
        path: args.path
      });
      return { success: true, output: `File deleted: ${args.path}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});
