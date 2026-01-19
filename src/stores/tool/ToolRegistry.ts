/**
 * 工具注册表
 * 负责管理所有工具的注册、查找和执行
 * @module ToolRegistry
 */

import type {
  ToolDefinition,
  ToolCategory,
  ToolContext,
  ToolResult
} from '../../types/toolRegistry';

/**
 * 工具注册表类
 */
export class ToolRegistry {
  /** 工具映射表 */
  private tools = new Map<string, ToolDefinition>();
  /** 分类索引 */
  private categoryIndex = new Map<ToolCategory, Set<string>>();

  /**
   * 注册工具
   * @param definition - 工具定义
   * @throws {Error} 如果工具已注册
   */
  register<TArgs = any, TResult = any>(
    definition: ToolDefinition<TArgs, TResult>
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" already registered`);
    }

    // 存储工具定义
    this.tools.set(definition.name, definition);

    // 更新分类索引
    if (!this.categoryIndex.has(definition.category)) {
      this.categoryIndex.set(definition.category, new Set());
    }
    this.categoryIndex.get(definition.category)!.add(definition.name);
  }

  /**
   * 检查工具是否已注册
   * @param name - 工具名称
   * @returns 是否已注册
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取工具定义
   * @param name - 工具名称
   * @returns 工具定义或 undefined
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 列出工具
   * @param category - 可选的分类过滤
   * @returns 工具定义数组
   */
  list(category?: ToolCategory): ToolDefinition[] {
    if (category) {
      const names = this.categoryIndex.get(category);
      return names
        ? Array.from(names).map((n) => this.tools.get(n)!).filter(Boolean)
        : [];
    }
    return Array.from(this.tools.values());
  }

  /**
   * 执行工具
   * @param name - 工具名称
   * @param args - 工具参数
   * @param context - 执行上下文
   * @returns 执行结果
   */
  async execute<TArgs = any, TResult = any>(
    name: string,
    args: TArgs,
    context: ToolContext
  ): Promise<ToolResult<TResult>> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool "${name}" not found` };
    }

    try {
      return await tool.handler(args, context);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
