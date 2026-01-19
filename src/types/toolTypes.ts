/**
 * 工具类型定义
 * 为所有内置工具定义精确的参数和返回值类型
 * @module toolTypes
 */

// ============================================================================
// 文件系统工具类型
// ============================================================================

/**
 * agent_write_file 参数
 */
export interface WriteFileArgs {
  path: string;
  content: string;
}

/**
 * agent_read_file 参数
 */
export interface ReadFileArgs {
  path: string;
}

/**
 * agent_list_dir 参数
 */
export interface ListDirArgs {
  path: string;
}

/**
 * agent_delete_file 参数
 */
export interface DeleteFileArgs {
  path: string;
}

/**
 * agent_search_files 参数
 */
export interface SearchFilesArgs {
  path: string;
  pattern: string;
  recursive?: boolean;
}

// ============================================================================
// Bash 工具类型
// ============================================================================

/**
 * agent_bash 参数
 */
export interface BashArgs {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

// ============================================================================
// Agent 工具类型
// ============================================================================

/**
 * agent_launch_agent 参数
 */
export interface LaunchAgentArgs {
  agentType: string;
  task: string;
}

/**
 * agent_approve_action 参数
 */
export interface ApproveActionArgs {
  id: string;
  approved: boolean;
}

// ============================================================================
// 通用工具返回值类型
// ============================================================================

/**
 * 工具执行成功的基本返回值
 */
export interface ToolSuccessResult {
  success: true;
  output?: string;
  data?: unknown;
}

/**
 * 工具执行失败的返回值
 */
export interface ToolErrorResult {
  success: false;
  error: string;
}

/**
 * 工具执行结果（联合类型）
 */
export type ToolResult<T = unknown> = ToolSuccessResult & { data?: T };

/**
 * 文件写入结果
 */
export interface WriteFileResult {
  success: true;
  output: string; // 格式: "File written: {path}"
}

/**
 * 文件读取结果
 */
export interface ReadFileResult {
  success: true;
  output: string; // 文件内容
}

/**
 * 目录列表结果
 */
export interface ListDirResult {
  success: true;
  output: string; // JSON 格式的目录条目
}

/**
 * 文件删除结果
 */
export interface DeleteFileResult {
  success: true;
  output: string; // 格式: "File deleted: {path}"
}

/**
 * 文件搜索结果
 */
export interface SearchFilesResult {
  success: true;
  output: string; // JSON 格式的搜索结果
  data?: string[]; // 匹配的文件路径列表
}

/**
 * Bash 执行结果
 */
export interface BashResult {
  success: true;
  output: string; // 命令输出
  data?: {
    exitCode: number;
    stdout: string;
    stderr: string;
  };
}

/**
 * Agent 启动结果
 */
export interface LaunchAgentResult {
  success: true;
  output: string; // Agent ID
  data?: {
    agentId: string;
    agentType: string;
  };
}

// ============================================================================
// 工具类型映射表
// ============================================================================

/**
 * 工具名称到参数类型的映射
 */
export interface ToolArgsMap {
  'agent_write_file': WriteFileArgs;
  'agent_read_file': ReadFileArgs;
  'agent_list_dir': ListDirArgs;
  'agent_delete_file': DeleteFileArgs;
  'agent_search_files': SearchFilesArgs;
  'agent_bash': BashArgs;
  'agent_launch_agent': LaunchAgentArgs;
  'agent_approve_action': ApproveActionArgs;
}

/**
 * 工具名称到返回值类型的映射
 */
export interface ToolResultMap {
  'agent_write_file': WriteFileResult;
  'agent_read_file': ReadFileResult;
  'agent_list_dir': ListDirResult;
  'agent_delete_file': DeleteFileResult;
  'agent_search_files': SearchFilesResult;
  'agent_bash': BashResult;
  'agent_launch_agent': LaunchAgentResult;
  'agent_approve_action': ToolSuccessResult;
}

/**
 * 获取工具的参数类型
 */
export type GetToolArgs<TName extends keyof ToolArgsMap> = ToolArgsMap[TName];

/**
 * 获取工具的返回值类型
 */
export type GetToolResult<TName extends keyof ToolResultMap> = ToolResultMap[TName];
