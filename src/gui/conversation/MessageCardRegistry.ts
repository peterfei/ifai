/**
 * MessageCardRegistry — 消息类型注册表
 *
 * 基于 Registry<T> 模式的消息类型渲染分发机制：
 * - 注册消息类型 → React 组件的映射
 * - resolveCardType() 从消息推断 cardType
 * - 支持运行时扩展新消息类型
 *
 * 设计原则：
 * - 新增消息类型 = register() 调用，AIChat 代码零修改
 * - 未注册类型安全降级到 TextMessageCard（不抛异常）
 */

import { Registry } from '../registry/registry';
import type React from 'react';

/* ===== 类型定义 ===== */

/**
 * MessageCard 消息属性
 *
 * 所有消息卡片组件的通用 props 接口
 */
export interface MessageCardProps {
  /** 消息数据 */
  message: any;
  /** 操作回调（如审批确认、拒绝等） */
  onAction?: (action: string, data?: any) => void;
  /** 是否紧凑模式（对话模式下为 true） */
  compact?: boolean;
}

/**
 * MessageCard 组件类型
 */
export type MessageCardComponent = React.ComponentType<MessageCardProps>;

/**
 * ToolCall 数据结构
 */
interface ToolCall {
  id: string;
  name: string;
  [key: string]: any;
}

/**
 * Composer 数据结构
 */
interface Composer {
  [key: string]: any;
}

/**
 * Error 数据结构
 */
interface ErrorData {
  message: string;
  [key: string]: any;
}

/**
 * Message 数据结构（简化版）
 */
interface Message {
  id?: string;
  cardType?: string;
  toolCalls?: ToolCall[] | null;
  composer?: Composer | null;
  error?: ErrorData | null;
  [key: string]: any;
}

/* ===== MessageCardRegistry 实例 ===== */

/**
 * MessageCardRegistry — 消息类型注册表实例
 *
 * 基于 Registry<MessageCardComponent>
 */
export const MessageCardRegistry = new Registry<MessageCardComponent>();

/* ===== 默认占位组件 ===== */

/**
 * 占位组件
 * 用于默认注册，实际渲染时会被替换为真实组件
 */
const PlaceholderCard: MessageCardComponent = () => {
  return null; // 占位，实际使用时会被真实组件替换
};

/* ===== 注册默认类型 ===== */

/**
 * 注册 8 个默认消息类型
 *
 * 注意：这里先注册占位组件，后续在对应的卡片组件实现时会替换
 */
const DEFAULT_TYPES: Array<{ type: string; component: MessageCardComponent }> = [
  { type: 'text', component: PlaceholderCard },
  { type: 'approval', component: PlaceholderCard },
  { type: 'interaction', component: PlaceholderCard },
  { type: 'progress', component: PlaceholderCard },
  { type: 'file-change', component: PlaceholderCard },
  { type: 'tool-call', component: PlaceholderCard },
  { type: 'composer', component: PlaceholderCard },
  { type: 'error-fix', component: PlaceholderCard },
];

for (const { type, component } of DEFAULT_TYPES) {
  MessageCardRegistry.register(type, component);
}

/* ===== 注册真实组件（替换占位符） ===== */

import { ProgressCard } from './cards/ProgressCard';
import { ApprovalCard } from './cards/ApprovalCard';
import { InteractionCard } from './cards/InteractionCard';

// ProgressCard 替换占位符
MessageCardRegistry.register('progress', ProgressCard);

// ApprovalCard 替换占位符
MessageCardRegistry.register('approval', ApprovalCard);

// InteractionCard 替换占位符
MessageCardRegistry.register('interaction', InteractionCard);

/* ===== resolveCardType 函数 ===== */

/**
 * resolveCardType — 从消息推断 cardType
 *
 * 优先级：
 * 1. 消息自带的 cardType 字段
 * 2. 根据 toolCalls / error / composer 字段推断
 * 3. 默认 'text'
 *
 * @param message - 消息对象
 * @returns 卡片类型字符串
 *
 * @example
 * resolveCardType({ cardType: 'approval' }) // → 'approval'
 * resolveCardType({ toolCalls: [...] })     // → 'tool-call'
 * resolveCardType({})                       // → 'text'
 */
export function resolveCardType(message: Message | null | undefined): string {
  // 空值安全
  if (!message) {
    return 'text';
  }

  // 1. 优先使用消息自带的 cardType 字段
  if (message.cardType) {
    return message.cardType;
  }

  // 2. 根据特殊字段推断
  // toolCalls 推断为 tool-call
  if (message.toolCalls && message.toolCalls.length > 0) {
    return 'tool-call';
  }

  // composer 推断为 composer
  if (message.composer) {
    return 'composer';
  }

  // error 推断为 error-fix
  if (message.error) {
    return 'error-fix';
  }

  // 3. 默认返回 text
  return 'text';
}

/* ===== 工具函数 ===== */

/**
 * 获取所有已注册的消息类型
 *
 * @returns 消息类型数组
 */
export function getRegisteredCardTypes(): string[] {
  return MessageCardRegistry.entries().map(([type]) => type);
}

/**
 * 检查消息类型是否已注册
 *
 * @param type - 消息类型
 * @returns 是否已注册
 */
export function hasCardType(type: string): boolean {
  return MessageCardRegistry.has(type);
}

/**
 * 获取消息类型对应的组件
 *
 * @param type - 消息类型
 * @returns 消息组件，未注册时返回 undefined
 */
export function getCardComponent(type: string): MessageCardComponent | undefined {
  return MessageCardRegistry.get(type);
}

/**
 * 渲染消息卡片（安全降级）
 *
 * @param message - 消息对象
 * @param fallback - 降级组件（默认使用 TextMessageCard）
 * @returns 消息组件或降级组件
 */
export function renderMessageCard(
  message: Message,
  fallback: MessageCardComponent = PlaceholderCard
): MessageCardComponent {
  const cardType = resolveCardType(message);
  const component = MessageCardRegistry.get(cardType);

  // 未注册类型使用降级组件
  return component || fallback;
}
