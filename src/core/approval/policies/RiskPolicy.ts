/**
 * 风险策略 — 薄包装层
 *
 * 所有逻辑已迁移至 src/core/approval/ToolApprovalRegistry.ts
 * 此文件仅保留导出以维持向后兼容。
 */

export type { RiskLevel, RiskContext } from '../ToolApprovalRegistry';

/** 惰性引用，避免顶层 await */
let _registry: any = null;
function getRegistry() {
  if (!_registry) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _registry = require('../ToolApprovalRegistry').toolApprovalRegistry;
  }
  return _registry;
}

/**
 * @deprecated 使用 toolApprovalRegistry.calculateRisk()
 */
export class RiskPolicy {
  calculateRisk(context: { toolName: string; args: any; editorMode: 'vibe' | 'spec' | 'standard' }): 'low' | 'medium' | 'high' {
    return getRegistry().calculateRisk(context.toolName, context.args, context.editorMode);
  }

  shouldAutoApprove(level: 'low' | 'medium' | 'high', _editorMode: string): boolean {
    return level === 'low';
  }
}
