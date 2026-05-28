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

/** 从工具调用对象中提取名称（兼容 call.function.name 嵌套路径） */
function getToolName(call: any): string {
  return pickField(call, TOOL_NAME_FIELDS, call?.function?.name ?? 'Unknown Tool');
}

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
    name: getToolName(call),
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

  // 聚合连续重复的工具调用
  const grouped = groupConsecutive(calls);

  return {
    name: `${calls.length} 个工具调用`,
    status: STATUS_MAP[overallStatus] ?? 'pending',
    multiTool: true,
    calls: grouped,
  };
}

/**
 * 将连续同名的工具调用合并为一组
 *
 * 例：agent_scan_project × 8 → [{ name: 'agent_scan_project', count: 8, ... }]
 */
function groupConsecutive(calls: any[]): any[] {
  if (calls.length === 0) return [];

  const result: any[] = [];
  let current = null;

  for (const tc of calls) {
    const name = getToolName(tc);

    if (current && current.name === name) {
      // 追加到当前组
      current.count++;
      current.statuses.add(tc.status);
      // 取最新的 args（后面的可能覆盖前面的）
      if (tc.args) current.args = tc.args;
    } else {
      // 新组
      if (current) {
        // 计算最终状态
        const groupStats = new Set(current.statuses);
        const groupStatus = AGGREGATE_PRIORITY.find(rule => rule.test(groupStats))?.status ?? 'completed';
        current.status = STATUS_MAP[groupStatus] ?? 'pending';
        delete current.statuses;
        result.push(current);
      }
      current = {
        id: tc.id,
        name,
        count: 1,
        statuses: new Set([tc.status]),
        args: tc.args,
        result: tc.result,
      };
    }
  }

  // 处理最后一组
  if (current) {
    const groupStats = new Set(current.statuses);
    const groupStatus = AGGREGATE_PRIORITY.find(rule => rule.test(groupStats))?.status ?? 'completed';
    current.status = STATUS_MAP[groupStatus] ?? 'pending';
    delete current.statuses;
    result.push(current);
  }

  return result;
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
