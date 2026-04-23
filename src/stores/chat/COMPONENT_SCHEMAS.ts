/**
 * 📜 组件特定配置（声明式配置）
 *
 * 为每个参与消息流的组件定义特定的配置，
 * 包括输入输出字段、转换规则等。
 *
 * @module COMPONENT_SCHEMAS
 */

import type { MessageFlowSchema } from './META_MESSAGE_FLOW_SCHEMA';

/**
 * 组件配置类型定义
 */
interface ComponentConfig {
  /** 输入字段列表 */
  inputs?: string[];

  /** 输出字段列表 */
  outputs?: string[];

  /** 是否自动转换 */
  autoTransform?: boolean;

  /** 是否自动继承所有字段 */
  autoInheritFields?: boolean;

  /** 是否自动映射所有字段 */
  autoMapAllFields?: boolean;

  /** 是否保留元数据 */
  preserveMetadata?: boolean;

  /** 字段转换规则 */
  transformations?: Record<string, ((value: any) => any) | string>;

  /** 事件负载类型 */
  eventPayload?: string;

  /** 清理策略 */
  sanitizeStrategy?: string;

  /** 内容访问器 */
  contentAccessor?: string;
}

/**
 * 组件特定配置
 */
export const COMPONENT_SCHEMAS: Record<string, ComponentConfig> = {
  /**
   * MessageBuilder 配置
   *
   * 负责构建用户消息，包括多模态内容的处理
   */
  MessageBuilder: {
    inputs: ['content', 'attachments'],
    outputs: [
      'id',
      'role',
      'content',
      'multiModalContent',
      'timestamp',
      'toolCalls',
      'segments',
    ],
    transformations: {
      content: 'enrichText',
      attachments: 'toMultiModalContent',
    },
  },

  /**
   * SendMessageOrchestrator 配置
   *
   * 负责编排消息发送流程，包括事件发射
   */
  SendMessageOrchestrator: {
    eventPayload: 'chat:message:sent',
    autoTransform: true,
    autoInheritFields: true,
  },

  /**
   * StoreMapper 配置
   *
   * 负责将事件映射到存储状态
   */
  StoreMapper: {
    autoMapAllFields: true,
    preserveMetadata: true,
  },

  /**
   * useChatStore 配置
   *
   * 负责聊天状态管理和 API 调用
   */
  useChatStore: {
    sanitizeStrategy: 'preferMultiModal',
    contentAccessor: 'auto',
  },
} as const;

/**
 * 组件配置类型
 */
export type ComponentSchemas = typeof COMPONENT_SCHEMAS;

/**
 * 组件名称类型
 */
export type ComponentName = keyof ComponentSchemas;

/**
 * 获取组件配置
 *
 * @param componentName 组件名称
 * @returns 组件配置
 */
export function getComponentSchema(componentName: ComponentName): ComponentConfig {
  return COMPONENT_SCHEMAS[componentName];
}

/**
 * 检查组件是否支持自动映射
 *
 * @param componentName 组件名称
 * @returns 是否支持自动映射
 */
export function supportsAutoMapping(componentName: ComponentName): boolean {
  const config = getComponentSchema(componentName);
  return !!(config.autoMapAllFields || config.autoInheritFields);
}

/**
 * 获取组件的输出字段
 *
 * @param componentName 组件名称
 * @returns 输出字段列表
 */
export function getOutputFields(componentName: ComponentName): string[] {
  const config = getComponentSchema(componentName);
  return config.outputs || [];
}

/**
 * 获取组件的输入字段
 *
 * @param componentName 组件名称
 * @returns 输入字段列表
 */
export function getInputFields(componentName: ComponentName): string[] {
  const config = getComponentSchema(componentName);
  return config.inputs || [];
}
