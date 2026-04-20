/**
 * 工具审批策略 — 薄包装层
 *
 * 所有逻辑已迁移至 src/core/approval/ToolApprovalRegistry.ts
 * 此文件仅保留导出以维持向后兼容。
 */

export {
  categorizeTool,
  shouldAutoApprove,
  type ToolCategory,
  type ApprovalContext,
} from '../core/approval/ToolApprovalRegistry';
