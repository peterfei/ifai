/**
 * Tool Call 去重管理器
 * 处理 API 返回重复 tool_call 的情况（如智谱、DeepSeek）
 * @module AgentDeduplication
 */

/**
 * Tool Call 去重器接口
 */
export interface ToolCallDeduplicator {
  /** 添加重复映射 */
  addDuplicate(skippedId: string, canonicalId: string): void;
  /** 获取规范 ID */
  getCanonicalId(id: string): string | undefined;
  /** 清理所有映射 */
  clearAll(): void;
}

/**
 * 创建 Tool Call 去重管理器
 * @returns 去重管理器实例
 */
export function createToolCallDeduplicator(): ToolCallDeduplicator {
  /** 去重映射表：被跳过的 ID -> 规范 ID */
  const deduplicatedIds: Record<string, string> = {};

  return {
    /**
     * 添加重复映射
     * @param skippedId - 被跳过的 ID（重复的 ID）
     * @param canonicalId - 规范 ID（首次出现的 ID）
     */
    addDuplicate(skippedId: string, canonicalId: string): void {
      deduplicatedIds[skippedId] = canonicalId;
    },

    /**
     * 获取规范 ID
     * @param id - 可能的重复 ID
     * @returns 规范 ID，如果不存在映射则返回 undefined
     */
    getCanonicalId(id: string): string | undefined {
      return deduplicatedIds[id];
    },

    /**
     * 清理所有映射
     */
    clearAll(): void {
      Object.keys(deduplicatedIds).forEach((k) => delete deduplicatedIds[k]);
    }
  };
}
