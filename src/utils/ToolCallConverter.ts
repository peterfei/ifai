/**
 * 🔥 元编程：工具调用转换器
 *
 * 消除以下重复代码：
 * - useChatStore.ts:514-523
 * - StoreMapper.ts:1324-1339
 *
 * 统一前端格式 ↔ API格式的转换逻辑
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 前端工具调用格式
 */
export interface FrontendToolCall {
  id: string;
  tool?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
  args?: any;
  status?: string;
}

/**
 * OpenAI API工具调用格式
 */
export interface APIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ============================================================================
// 🔥 转换器类 - 纯函数式设计，无状态，可测试
// ============================================================================

export class ToolCallConverter {
  /**
   * 前端格式 → API格式
   *
   * 统一处理以下变体：
   * 1. 标准格式: { id, tool, args }
   * 2. OpenAI格式: { id, function: { name, arguments } }
   */
  static toAPIFormat(toolCalls: FrontendToolCall[]): APIToolCall[] {
    if (!toolCalls || !Array.isArray(toolCalls)) return [];

    return toolCalls.map(this.convertOneToAPI);
  }

  /**
   * API格式 → 前端格式
   */
  static fromAPIFormat(apiToolCalls: APIToolCall[]): FrontendToolCall[] {
    if (!apiToolCalls || !Array.isArray(apiToolCalls)) return [];

    return apiToolCalls.map(this.convertOneFromAPI);
  }

  /**
   * 单个转换：前端 → API
   */
  private static convertOneToAPI(tc: FrontendToolCall): APIToolCall {
    return {
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function?.name || tc.tool || 'unknown',
        arguments: this.normalizeArguments(tc),
      },
    };
  }

  /**
   * 单个转换：API → 前端
   */
  private static convertOneFromAPI(api: APIToolCall): FrontendToolCall {
    return {
      id: api.id,
      tool: api.function.name,
      function: {
        name: api.function.name,
        arguments: api.function.arguments,
      },
      args: this.parseArguments(api.function.arguments),
    };
  }

  /**
   * 参数规范化：统一转换为JSON字符串
   *
   * 处理以下情况：
   * - string → 直接使用
   * - object → JSON.stringify
   * - undefined → "{}"
   */
  private static normalizeArguments(tc: FrontendToolCall): string {
    // 优先使用 function.arguments（如果存在且为字符串）
    if (tc.function?.arguments && typeof tc.function.arguments === 'string') {
      return tc.function.arguments;
    }

    // 尝试使用 tc.args
    if (tc.args) {
      if (typeof tc.args === 'string') {
        return tc.args;
      }
      if (typeof tc.args === 'object') {
        return JSON.stringify(tc.args);
      }
    }

    // 默认空对象
    return '{}';
  }

  /**
   * 参数解析：JSON字符串 → 对象
   */
  private static parseArguments(args: string): any {
    try {
      return JSON.parse(args);
    } catch {
      return {}; // 解析失败返回空对象
    }
  }
}

// ============================================================================
// 便捷函数（函数式编程风格）
// ============================================================================

/**
 * 转换为API格式（柯里化版本）
 */
export const toAPIFormat = (toolCalls: FrontendToolCall[]): APIToolCall[] =>
  ToolCallConverter.toAPIFormat(toolCalls);

/**
 * 从API格式转换（柯里化版本）
 */
export const fromAPIFormat = (apiToolCalls: APIToolCall[]): FrontendToolCall[] =>
  ToolCallConverter.fromAPIFormat(apiToolCalls);

/**
 * 转换单个工具调用
 */
export const convertToolCall = (tc: FrontendToolCall): APIToolCall =>
  ToolCallConverter['convertOneToAPI'](tc);

// ============================================================================
// 类型守卫
// ============================================================================

/**
 * 检查是否为前端工具调用
 */
export function isFrontendToolCall(obj: any): obj is FrontendToolCall {
  return obj && typeof obj === 'object' && typeof obj.id === 'string';
}

/**
 * 检查是否为API工具调用
 */
export function isAPIToolCall(obj: any): obj is APIToolCall {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.type === 'function' &&
    obj.function &&
    typeof obj.function.name === 'string'
  );
}

// ============================================================================
// 单元测试（内联文档）
// ============================================================================

/**
 * 使用示例：
 *
 * ```typescript
 * // 前端 → API
 * const apiCalls = toAPIFormat([
 *   { id: 'call_1', tool: 'read_file', args: { path: '/test' } }
 * ]);
 * // → [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/test"}' } }]
 *
 * // API → 前端
 * const frontendCalls = fromAPIFormat([
 *   { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/test"}' } }
 * ]);
 * // → [{ id: 'call_1', tool: 'read_file', function: { name: 'read_file', arguments: '{"path":"/test"}' }, args: { path: '/test' } }]
 * ```
 */
