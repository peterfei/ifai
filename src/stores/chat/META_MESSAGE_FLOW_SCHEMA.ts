/**
 * 📜 消息流元数据（声明式配置）
 *
 * 核心哲学：
 * - 配置即代码
 * - 元数据驱动业务逻辑
 * - 避免硬编码和重复逻辑
 *
 * @module META_MESSAGE_FLOW_SCHEMA
 */

/**
 * 消息流元数据配置
 */
export const MESSAGE_FLOW_SCHEMA = {
  /**
   * 字段传播策略
   *
   * 定义字段在消息流中如何自动传播
   */
  fieldPropagation: {
    /** 传播模式：自动传播 */
    mode: 'auto' as const,

    /** 自动继承的字段列表 */
    autoInherit: ['multiModalContent'] as const[],

    /** 支持通配符：自动传播所有字段 */
    wildcard: true as const,
  },

  /**
   * 内容访问策略
   *
   * 定义如何选择和转换消息内容
   */
  contentStrategy: {
    /** 模式：优先使用多模态内容 */
    mode: 'preferMultiModal' as const,

    /** 回退字段：当多模态内容不存在时使用 */
    fallback: 'content' as const,

    /** 验证模式：严格类型验证 */
    validation: 'strict' as const,
  },

  /**
   * 日志策略
   *
   * 定义数据流日志的行为
   */
  logging: {
    /** 是否启用日志 */
    enabled: true as const,

    /** 日志级别 */
    level: 'debug' as const,

    /** 自动追踪的字段 */
    autoTrack: ['multiModalContent'] as const[],

    /** 使用的装饰器 */
    decorator: 'LogDataFlow' as const,
  },

  /**
   * 类型安全策略
   */
  typeSafety: {
    /** 启用类型守卫 */
    enableTypeGuards: true as const,

    /** 启用类型收窄 */
    enableNarrowing: true as const,

    /** 禁止使用 `as any` */
    noAny: true as const,
  },
} as const;

/**
 * 字段传播配置类型
 */
export type FieldPropagationConfig = typeof MESSAGE_FLOW_SCHEMA.fieldPropagation;

/**
 * 内容策略配置类型
 */
export type ContentStrategyConfig = typeof MESSAGE_FLOW_SCHEMA.contentStrategy;

/**
 * 日志配置类型
 */
export type LoggingConfig = typeof MESSAGE_FLOW_SCHEMA.logging;

/**
 * 类型安全配置类型
 */
export type TypeSafetyConfig = typeof MESSAGE_FLOW_SCHEMA.typeSafety;

/**
 * 完整元数据配置类型
 */
export type MessageFlowSchema = typeof MESSAGE_FLOW_SCHEMA;
