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

/** 状态映射表：源状态 → UI 状态（声明式查表） */
const STATUS_MAP: Record<string, string> = {
  pending: 'pending',
  executing: 'running',
  running: 'running',
  completed: 'success',
  failed: 'failed',
  approved: 'success',
  rejected: 'cancelled',
};

/**
 * 多工具聚合优先级表（声明式，零 if-else）
 * 优先级从高到下，first-match wins。
 * 每项 [predicate, sourceStatus] — predicate 检查子工具状态集，sourceStatus 用于 STATUS_MAP 查表。
 */
const AGGREGATE_PRIORITY: Array<{ test: (stats: Set<string>) => boolean; status: string }> = [
  { test: stats => stats.has('error') || stats.has('failed'),                        status: 'failed' },
  { test: stats => stats.has('executing') || stats.has('running'),                    status: 'running' },
  { test: stats => stats.has('pending'),                                              status: 'pending' },
  { test: stats => true, /* default / all completed */                                status: 'completed' },
];

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
  const stats = new Set(calls.map(tc => tc.status));
  const overallStatus = AGGREGATE_PRIORITY.find(rule => rule.test(stats))?.status ?? 'completed';

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
