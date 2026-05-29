/**
 * approvalAdapter — approvalMeta → ApprovalCard 适配器
 *
 * 将 LLM 回复中的 approvalMeta 元数据适配为 ApprovalCard 所需的数据格式。
 * 后端在 LLM 返回 toolCalls 时注入 approvalMeta 字段，前端据此渲染审批卡片。
 *
 * 设计原则：
 * - RISK_MAP: 声明式风险等级映射（零 if-else）
 * - match + adapt 自描述：新增卡片类型 = 写一个新的 adapter
 */
import type { MessageAdapter } from '../MessageAdapterRegistry';
import type { RiskLevel } from '../WORKFLOW_DSL';
import { categorizeTool } from '../../../core/approval/ToolApprovalRegistry';

/* ===== 声明式配置 ===== */

const RISK_MAP: Record<string, RiskLevel> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

/* ===== 适配器 ===== */

export const approvalAdapter: MessageAdapter = {
  id: 'approval',
  match: (msg: any) => !!msg.approvalMeta,
  adapt: (msg: any) => ({
    cardType: 'approval',
    id: msg.id,
    role: msg.role,
    content: msg.content,
    data: {
      title: msg.approvalMeta.title || '确认执行操作',
      description: msg.approvalMeta.summary || '',
      overallRisk: RISK_MAP[msg.approvalMeta.risk] ?? 'medium',
      files: (msg.approvalMeta.files || []).map((f: any) => ({
        path: f.path,
        change: f.change,
        risk: RISK_MAP[f.risk] ?? 'medium',
      })),
      onApprove: 'continue' as const,
      onReject: 'stop' as const,
      // ApprovalCard 数据驱动按钮所需字段
      toolName: msg.approvalMeta.toolName || '',
      toolCategory: msg.approvalMeta.toolName ? categorizeTool(msg.approvalMeta.toolName) : '',
      argsPreview: msg.approvalMeta.argsPreview || '',
    },
  }),
};
