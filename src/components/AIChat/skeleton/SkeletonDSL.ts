/**
 * 骨架屏 DSL（Domain-Specific Language）类型定义
 *
 * 元编程架构核心：通过声明式配置定义骨架屏结构
 * 避免过程化代码，实现"配置即代码"的设计理念
 */

/**
 * 骨架屏节点类型 - 联合类型定义所有支持的节点
 */
export type SkeletonNode =
  | SkeletonBlockNode
  | SkeletonFlexNode
  | SkeletonRepeatNode
  | SkeletonTextNode;

/**
 * 基础占位块节点
 *
 * @example
 * ```ts
 * const block: SkeletonBlockNode = {
 *   type: 'block',
 *   width: '100%',
 *   height: '60-120px',  // 支持随机范围
 *   borderRadius: 8,
 *   shimmer: true,
 * };
 * ```
 */
export interface SkeletonBlockNode {
  type: 'block';
  /** 宽度，支持固定值、百分比或随机范围（如 '60-100%'） */
  width?: string | number;
  /** 高度，支持固定值、像素或随机范围（如 '60-120px'） */
  height?: string | number;
  /** 圆角半径 */
  borderRadius?: string | number;
  /** 是否显示微光动画 */
  shimmer?: boolean;
  /** 背景颜色（CSS 类名或颜色值） */
  backgroundColor?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

/**
 * Flexbox 容器节点
 *
 * @example
 * ```ts
 * const flex: SkeletonFlexNode = {
 *   type: 'flex',
 *   direction: 'column',
 *   gap: 16,
 *   children: [
 *     { type: 'block', width: '100%', height: '40px' },
 *     { type: 'block', width: '80%', height: '40px' },
 *   ],
 * };
 * ```
 */
export interface SkeletonFlexNode {
  type: 'flex';
  /** Flex 方向 */
  direction: 'row' | 'column';
  /** 子元素间距 */
  gap: number;
  /** 子节点数组 */
  children: SkeletonNode[];
  /** 对齐方式 */
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  /** 主轴对齐 */
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

/**
 * 重复元素节点
 *
 * @example
 * ```ts
 * const repeat: SkeletonRepeatNode = {
 *   type: 'repeat',
 *   count: '3-5',  // 重复 3-5 次（随机）
 *   content: {
 *     type: 'block',
 *     width: '100%',
 *     height: '60px',
 *   },
 * };
 * ```
 */
export interface SkeletonRepeatNode {
  type: 'repeat';
  /** 重复次数，支持固定值或随机范围（如 '3-5'） */
  count: number | string;
  /** 要重复的内容节点 */
  content: SkeletonNode;
}

/**
 * 文本占位符节点
 *
 * @example
 * ```ts
 * const text: SkeletonTextNode = {
 *   type: 'text',
 *   width: '60-100%',
 *   lines: 2,  // 2 行文本
 * };
 * ```
 */
export interface SkeletonTextNode {
  type: 'text';
  /** 宽度，支持固定值、百分比或随机范围 */
  width?: string | number;
  /** 文本行数 */
  lines?: number;
  /** 行高 */
  lineHeight?: number;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

/**
 * 容器配置
 */
export interface SkeletonContainerConfig {
  /** 定位方式 */
  position: 'overlay' | 'inline';
  /** 动画类型 */
  animation: 'fade' | 'slide' | 'scale' | 'none';
  /** 动画时长（毫秒） */
  duration: number;
  /** 是否使用 pointer-events: none */
  pointerEventsNone?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 骨架屏设计定义
 *
 * @example
 * ```ts
 * const design: SkeletonDesign = {
 *   container: {
 *     position: 'overlay',
 *     animation: 'fade',
 *     duration: 300,
 *   },
 *   structure: [
 *     {
 *       type: 'repeat',
 *       count: '3-5',
 *       content: {
 *         type: 'block',
 *         width: '100%',
 *         height: '60-120px',
 *         shimmer: true,
 *       },
 *     },
 *   ],
 * };
 * ```
 */
export interface SkeletonDesign {
  /** 容器配置 */
  container: SkeletonContainerConfig;
  /** 骨架屏结构树 */
  structure: SkeletonNode[];
}

/**
 * 解析后的随机值
 * @internal
 */
export interface ParsedRandomValue {
  min: number;
  max: number;
  isRandom: boolean;
}

/**
 * 工具函数：解析随机范围值
 * @internal
 */
export function parseRandomValue(value: string | number): ParsedRandomValue {
  if (typeof value === 'number') {
    return { min: value, max: value, isRandom: false };
  }

  if (typeof value === 'string') {
    // 匹配范围格式：'3-5', '60-100%', '60-120px'
    const rangeMatch = value.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      return { min, max, isRandom: true };
    }

    // 解析百分比
    const percentMatch = value.match(/^(\d+(?:\.\d+)?)%$/);
    if (percentMatch) {
      const num = parseFloat(percentMatch[1]);
      return { min: num, max: num, isRandom: false };
    }

    // 解析像素值
    const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
    if (pxMatch) {
      const num = parseFloat(pxMatch[1]);
      return { min: num, max: num, isRandom: false };
    }
  }

  // 默认返回固定值
  return { min: 0, max: 0, isRandom: false };
}

/**
 * 工具函数：从随机值范围中获取值
 * @internal
 */
export function getRandomValue(parsed: ParsedRandomValue): number {
  if (!parsed.isRandom) {
    return parsed.min;
  }

  return parsed.min + Math.random() * (parsed.max - parsed.min);
}

/**
 * 工具函数：格式化随机值为 CSS 字符串
 * @internal
 */
export function formatRandomValue(
  value: string | number,
  parsed: ParsedRandomValue,
  randomValue: number
): string {
  if (typeof value === 'number') {
    return `${value}px`;
  }

  if (parsed.isRandom) {
    // 保持原始格式
    if (value.includes('%')) {
      return `${randomValue}%`;
    }
    if (value.includes('px')) {
      return `${randomValue}px`;
    }
    return `${randomValue}px`;
  }

  return value;
}
