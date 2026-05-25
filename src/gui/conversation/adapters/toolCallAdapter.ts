/**
 * toolCallAdapter — toolCalls → ToolCallCard 适配器配置
 *
 * 将真实 LLM 消息中的 toolCalls 数组适配为 ToolCallCard 所需的 data 格式。
 * 在 MessageAdapterRegistry 中集中注册。
 *
 * 设计原则：
 * - STATUS_MAP: 声明式查表（零 if-else 状态映射）
 * - TOOL_NAME_FIELDS: 声明式字段优先级配置
 * - 与预览格式归一化：输出 data 结构与 cardType 透传格式一致
 */
import type { MessageAdapter } from '../MessageAdapterRegistry';

/* ===== 声明式配置 ===== */

/** 工具名称字段优先级（扩展只改此数组） */
const TOOL_NAME_FIELDS = ['tool', 'name', 'functionName'];

/** 状态映射表（声明式，零 if-else） */
const STATUS_MAP: Record<string, string> = {
  pending: 'pending',
  executing: 'running',
  running: 'running',
  completed: 'success',
  failed: 'failed',
  approved: 'success',
  rejected: 'cancelled',
};

/* ===== 辅助函数 ===== */

function pickField(obj: any, fields: string[], fallback: string): string {
  return fields.reduce((val: string | null, f: string) => val ?? obj?.[f], null as string | null) ?? fallback;
}

function adaptSingle(call: any): Record<string, any> {
  return {
    name: pickField(call, TOOL_NAME_FIELDS, 'Unknown Tool'),
    toolId: call.id,
    status: STATUS_MAP[call.status] ?? 'pending',
    args: call.args,
    result: call.output ?? call.result,
    duration: (call as any).duration,
  };
}

function adaptMulti(calls: any[]): Record<string, any> {
  // 🔥 FIX: 根据子工具状态推导总体状态，不再硬编码 'pending'
  const allCompleted = calls.every(tc => tc.status === 'completed');
  const anyExecuting = calls.some(tc => tc.status === 'executing' || tc.status === 'running');
  const anyPending = calls.some(tc => tc.status === 'pending');
  const anyError = calls.some(tc => tc.status === 'error' || tc.status === 'failed');

  let overallStatus: string;
  if (allCompleted) overallStatus = 'completed';
  else if (anyError) overallStatus = 'failed';
  else if (anyExecuting) overallStatus = 'running';
  else if (anyPending) overallStatus = 'pending';
  else overallStatus = 'completed';

  return {
    name: `${calls.length} 个工具调用`,
    status: STATUS_MAP[overallStatus] ?? 'pending',
    multiTool: true,
    calls: calls.map((tc: any) => ({
      id: tc.id,
      name: pickField(tc, TOOL_NAME_FIELDS, 'Unknown Tool'),
      status: STATUS_MAP[tc.status] ?? tc.status,
      args: tc.args,
      result: tc.result,
    })),
  };
}

export const toolCallAdapter: MessageAdapter = {
  id: 'tool-call',
  // approvalMeta 的消息由 ToolApproval 内联处理，不渲染 ToolCallCard
  match: (msg: any) => !!msg.toolCalls?.length && !msg.approvalMeta,
  adapt: (msg: any) => {
    const isMulti = msg.toolCalls.length > 1;
    return {
      cardType: 'tool-call',
      id: msg.id,
      role: msg.role,
      content: msg.content,
      data: isMulti ? adaptMulti(msg.toolCalls) : adaptSingle(msg.toolCalls[0]),
    };
  },
};
