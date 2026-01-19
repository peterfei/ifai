/**
 * Agent 资源限制器
 * 管理并发的 agent 数量限制
 * @module agentResourceLimiter
 */

/**
 * 资源限制配置
 */
export interface ResourceLimits {
  /** 最大并发 agent 数量 */
  maxConcurrentAgents: number;
}

/**
 * 启动验证结果
 */
export interface LaunchValidationResult {
  /** 是否允许启动 */
  canLaunch: boolean;
  /** 拒绝原因（如果不能启动） */
  reason?: string;
}

/**
 * 资源统计信息
 */
export interface ResourceStats {
  /** 当前运行的 agent 数量 */
  currentCount: number;
  /** 最大并发数 */
  maxConcurrentAgents: number;
  /** 可用槽位数 */
  availableSlots: number;
  /** 资源利用率 (0-1) */
  utilization: number;
}

/**
 * Agent 资源限制器接口
 */
export interface IAgentResourceLimiter {
  /** 设置资源限制 */
  setLimits(limits: ResourceLimits): void;
  /** 获取当前限制 */
  getLimits(): ResourceLimits;
  /** 检查是否可以启动 agent */
  canLaunchAgent(count: number): boolean;
  /** 验证启动条件 */
  validateLaunch(agentId: string): LaunchValidationResult;
  /** 记录 agent 启动 */
  recordLaunch(agentId: string): void;
  /** 记录 agent 完成 */
  recordCompletion(agentId: string): void;
  /** 获取当前数量 */
  getCurrentCount(): number;
  /** 获取统计信息 */
  getStats(): ResourceStats;
  /** 清空所有记录 */
  clear(): void;
}

/**
 * 默认资源限制
 */
const DEFAULT_LIMITS: ResourceLimits = {
  maxConcurrentAgents: 5
};

/**
 * 创建 Agent 资源限制器
 */
export function createAgentResourceLimiter(): IAgentResourceLimiter {
  let limits: ResourceLimits = { ...DEFAULT_LIMITS };
  const runningAgents = new Set<string>();

  return {
    setLimits(newLimits: ResourceLimits): void {
      limits = { ...newLimits };
    },

    getLimits(): ResourceLimits {
      return { ...limits };
    },

    canLaunchAgent(count: number): boolean {
      return runningAgents.size + count <= limits.maxConcurrentAgents;
    },

    validateLaunch(agentId: string): LaunchValidationResult {
      const currentCount = runningAgents.size;

      if (currentCount >= limits.maxConcurrentAgents) {
        return {
          canLaunch: false,
          reason: `已达到最大并发数 (${limits.maxConcurrentAgents})，当前运行: ${currentCount}`
        };
      }

      return { canLaunch: true };
    },

    recordLaunch(agentId: string): void {
      runningAgents.add(agentId);
    },

    recordCompletion(agentId: string): void {
      runningAgents.delete(agentId);
    },

    getCurrentCount(): number {
      return runningAgents.size;
    },

    getStats(): ResourceStats {
      const currentCount = runningAgents.size;
      const availableSlots = Math.max(0, limits.maxConcurrentAgents - currentCount);
      const utilization = limits.maxConcurrentAgents > 0
        ? currentCount / limits.maxConcurrentAgents
        : 0;

      return {
        currentCount,
        maxConcurrentAgents: limits.maxConcurrentAgents,
        availableSlots,
        utilization
      };
    },

    clear(): void {
      runningAgents.clear();
    }
  };
}
