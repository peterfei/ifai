/**
 * MessageAdapterRegistry — 消息适配器注册表
 *
 * 将真实 LLM 消息格式（content + toolCalls[]）适配为卡片所需的数据格式（{ cardType, data }）。
 *
 * 设计原则（元编程）：
 * - 引擎 `adaptMessageToCard` 零分支：通过遍历注册表实现
 * - 每个适配器自描述（match + adapt），新增卡片类型 = register 一个新适配器
 * - 与 MessageCardRegistry、blockingStepRegistry、layoutRegistry 一致的 Registry 模式
 *
 * 注意：approvalAdapter 由 ToolApproval 内联处理降级为走 MessageCard（数据驱动按钮）。
 * 当 message.approvalMeta 存在时，ApprovalCard 接管审批 UI，ToolApproval 内联按钮隐藏。
 */
import { Registry } from '../registry/registry';

/* ===== 类型定义 ===== */

export interface AdaptedCardMessage {
  cardType: string;
  id: string;
  role: string;
  content: string;
  data: Record<string, any>;
}

export interface MessageAdapter {
  id: string;
  /** 匹配函数：此消息是否由此适配器处理？ */
  match(message: any): boolean;
  /** 适配函数：将消息转换为卡片格式。返回 null 表示跳过。 */
  adapt(message: any): AdaptedCardMessage | null;
}

/* ===== 注册表实例 ===== */

export const MessageAdapterRegistry = new Registry<MessageAdapter>();

/* ===== 注册适配器（集中注册，避免循环依赖） ===== */

import { cardTypePassthroughAdapter } from './adapters/cardTypePassthroughAdapter';
import { exploreAdapter } from './adapters/exploreAdapter';
import { agentWorkspaceAdapter } from './adapters/agentWorkspaceAdapter';
import { toolCallAdapter } from './adapters/toolCallAdapter';
import { interactionAdapter } from './adapters/interactionAdapter';
import { approvalAdapter } from './adapters/approvalAdapter';
import { streamingFileWriteAdapter } from './adapters/streamingFileWriteAdapter';

MessageAdapterRegistry.register('cardType-passthrough', cardTypePassthroughAdapter);
MessageAdapterRegistry.register('agent-workspace', agentWorkspaceAdapter);
MessageAdapterRegistry.register('explore', exploreAdapter);
MessageAdapterRegistry.register('approval', approvalAdapter);
MessageAdapterRegistry.register('streaming-file-write', streamingFileWriteAdapter);
MessageAdapterRegistry.register('tool-call', toolCallAdapter);
MessageAdapterRegistry.register('interaction', interactionAdapter);

/* ===== 引擎 — 零分支 ===== */

/**
 * 将消息适配为卡片格式。
 * 遍历注册表，第一个 match 返回 true 的适配器执行 adapt。
 * 没有适配器匹配时返回 null（安全降级到默认渲染）。
 */
export function adaptMessageToCard(message: any): AdaptedCardMessage | null {
  if (!message) return null;

  for (const [, adapter] of MessageAdapterRegistry.entries()) {
    if (adapter.match(message)) {
      return adapter.adapt(message);
    }
  }
  return null;
}
