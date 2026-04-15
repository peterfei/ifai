/**
 * 风险策略 — 薄包装层
 *
 * 所有逻辑已迁移至 src/core/approval/ToolApprovalRegistry.ts
 * 此文件仅保留导出以维持向后兼容。
 */

export type { RiskLevel, RiskContext } from '../ToolApprovalRegistry';

// 🔥 FIX: 使用静态导入替代 require，兼容 vitest mock
import { toolApprovalRegistry as registry } from '../ToolApprovalRegistry';

/**
 * @deprecated 使用 toolApprovalRegistry.calculateRisk()
 */
export class RiskPolicy {
  calculateRisk(context: { toolName: string; args: any; editorMode: 'vibe' | 'spec' | 'standard' }): 'low' | 'medium' | 'high' {
    return registry.calculateRisk(context.toolName, context.args, context.editorMode);
  }

  shouldAutoApprove(level: 'low' | 'medium' | 'high', _editorMode: string): boolean {
    return level === 'low';
  }

  /**
   * 路径风险评估（仅供测试使用）
   * @deprecated 测试代码应直接使用 ToolApprovalRegistry
   */
  calculatePathRisk(path: string): 'low' | 'medium' | 'high' {
    // @ts-expect-error - 访问私有方法用于测试
    return registry.calculatePathRisk(path);
  }
}
