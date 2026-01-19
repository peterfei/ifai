/**
 * 工具注册系统类型定义
 * @module toolRegistry
 */

/**
 * 工具分类
 */
export type ToolCategory = 'fs' | 'bash' | 'agent' | 'custom';

/**
 * 工具定义接口
 * @template TArgs - 工具参数类型
 * @template TResult - 工具返回数据类型
 */
export interface ToolDefinition<TArgs = any, TResult = any> {
  /** 工具名称 */
  name: string;
  /** 工具分类 */
  category: ToolCategory;
  /** 工具描述 */
  description: string;
  /** JSON Schema 格式的参数定义 */
  schema: Record<string, unknown>;
  /** 是否需要用户批准 */
  requiresApproval: boolean;
  /** 是否为危险操作 */
  isDangerous?: boolean;
  /** 工具处理器 */
  handler: ToolHandler<TArgs, TResult>;
}

/**
 * 工具处理器类型
 * @template TArgs - 参数类型
 * @template TResult - 返回数据类型
 */
export type ToolHandler<TArgs = any, TResult = any> = (
  args: TArgs,
  context: ToolContext
) => Promise<ToolResult<TResult>>;

/**
 * 工具执行上下文
 */
export interface ToolContext {
  /** 关联的消息 ID */
  messageId: string;
  /** 关联的线程 ID */
  threadId: string;
  /** 项目根目录 */
  projectRoot: string;
  /** 关联的 Agent ID（可选） */
  agentId?: string;
}

/**
 * 工具执行结果
 * @template T - 返回数据类型
 */
export interface ToolResult<T = any> {
  /** 是否成功 */
  success: boolean;
  /** 输出文本 */
  output?: string;
  /** 返回数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
}
