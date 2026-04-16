/**
 * DSL 解释器实现
 *
 * 元编程架构核心：通用 DSL 解释器
 * 将声明式结构定义转换为 React 组件
 */

import React, { useMemo, memo } from 'react';
import {
  SkeletonNode,
  SkeletonBlockNode,
  SkeletonFlexNode,
  SkeletonRepeatNode,
  SkeletonTextNode,
  SkeletonDesign,
  parseRandomValue,
  getRandomValue,
  formatRandomValue,
} from './SkeletonDSL';

/**
 * 渲染上下文
 * @internal
 */
interface RenderContext {
  /** 随机种子（确保每次渲染时随机值一致） */
  seed: number;
  /** 获取下一个随机值 */
  nextRandom: () => number;
}

/**
 * 创建渲染上下文
 * @internal
 */
function createRenderContext(): RenderContext {
  let seed = Date.now();

  return {
    seed,
    nextRandom: () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    },
  };
}

/**
 * 渲染基础占位块
 * @internal
 */
const SkeletonBlock: React.FC<{
  node: SkeletonBlockNode;
  context: RenderContext;
}> = memo(({ node, context }) => {
  const style: React.CSSProperties = {
    ...node.style,
  };

  // 解析并应用宽度
  if (node.width !== undefined) {
    const parsedWidth = parseRandomValue(node.width);
    const randomWidth = parsedWidth.isRandom ? getRandomValue(parsedWidth) : parsedWidth.min;
    style.width = formatRandomValue(node.width, parsedWidth, randomWidth);
  }

  // 解析并应用高度
  if (node.height !== undefined) {
    const parsedHeight = parseRandomValue(node.height);
    const randomHeight = parsedHeight.isRandom ? getRandomValue(parsedHeight) : parsedHeight.min;
    style.height = formatRandomValue(node.height, parsedHeight, randomHeight);
  }

  // 应用圆角
  if (node.borderRadius !== undefined) {
    style.borderRadius = typeof node.borderRadius === 'number'
      ? `${node.borderRadius}px`
      : node.borderRadius;
  }

  // 应用背景色
  if (node.backgroundColor) {
    style.backgroundColor = node.backgroundColor;
  } else {
    style.backgroundColor = '#374151'; // 默认灰色
  }

  // 构建类名
  const className = [
    'skeleton-block',
    node.className,
    node.shimmer ? 'skeleton-shimmer' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={className} style={style} />;
});

SkeletonBlock.displayName = 'SkeletonBlock';

/**
 * 渲染 Flexbox 容器
 * @internal
 */
const SkeletonFlex: React.FC<{
  node: SkeletonFlexNode;
  context: RenderContext;
}> = memo(({ node, context }) => {
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: node.direction,
    gap: node.gap,
    alignItems: node.alignItems,
    justifyContent: node.justifyContent,
    ...node.style,
  };

  const className = ['skeleton-flex', node.className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} style={style}>
      {node.children.map((child, index) => (
        <SkeletonNodeRenderer key={index} node={child} context={context} />
      ))}
    </div>
  );
});

SkeletonFlex.displayName = 'SkeletonFlex';

/**
 * 渲染重复元素
 * @internal
 */
const SkeletonRepeat: React.FC<{
  node: SkeletonRepeatNode;
  context: RenderContext;
}> = memo(({ node, context }) => {
  // 解析重复次数
  const parsedCount = parseRandomValue(node.count);
  const count = parsedCount.isRandom
    ? Math.floor(getRandomValue(parsedCount))
    : parsedCount.min;

  const items = Array.from({ length: count }, (_, index) => (
    <SkeletonNodeRenderer key={index} node={node.content} context={context} />
  ));

  return <>{items}</>;
});

SkeletonRepeat.displayName = 'SkeletonRepeat';

/**
 * 渲染文本占位符
 * @internal
 */
const SkeletonText: React.FC<{
  node: SkeletonTextNode;
  context: RenderContext;
}> = memo(({ node, context }) => {
  const style: React.CSSProperties = {
    ...node.style,
  };

  // 解析并应用宽度
  if (node.width !== undefined) {
    const parsedWidth = parseRandomValue(node.width);
    const randomWidth = parsedWidth.isRandom ? getRandomValue(parsedWidth) : parsedWidth.min;
    style.width = formatRandomValue(node.width, parsedWidth, randomWidth);
  }

  const lines = node.lines ?? 1;
  const lineHeight = node.lineHeight ?? 16;

  const className = ['skeleton-text', node.className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} style={style}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          style={{
            height: `${lineHeight}px`,
            backgroundColor: '#374151',
            borderRadius: '4px',
            marginTop: index > 0 ? '4px' : '0',
          }}
        />
      ))}
    </div>
  );
});

SkeletonText.displayName = 'SkeletonText';

/**
 * 节点渲染器
 * @internal
 */
const SkeletonNodeRenderer: React.FC<{
  node: SkeletonNode;
  context: RenderContext;
}> = memo(({ node, context }) => {
  switch (node.type) {
    case 'block':
      return <SkeletonBlock node={node} context={context} />;
    case 'flex':
      return <SkeletonFlex node={node} context={context} />;
    case 'repeat':
      return <SkeletonRepeat node={node} context={context} />;
    case 'text':
      return <SkeletonText node={node} context={context} />;
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = node;
      return null;
  }
});

SkeletonNodeRenderer.displayName = 'SkeletonNodeRenderer';

/**
 * DSL 解释器属性
 */
export interface DSLRendererProps {
  /** 骨架屏设计定义 */
  design: SkeletonDesign;
  /** 是否可见 */
  visible?: boolean;
  /** 自定义容器类名 */
  className?: string;
  /** 自定义容器样式 */
  style?: React.CSSProperties;
}

/**
 * DSL 解释器组件
 *
 * @example
 * ```tsx
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
 *
 * <DSLRenderer design={design} visible={true} />
 * ```
 */
export const DSLRenderer: React.FC<DSLRendererProps> = memo(({
  design,
  visible = true,
  className,
  style,
}) => {
  // 创建渲染上下文（确保每次渲染时随机值一致）
  const context = useMemo(() => createRenderContext(), []);

  if (!visible) {
    return null;
  }

  // 🔥 根据 position 模式决定容器样式
  const isOverlay = design.container.position === 'overlay';
  const containerStyle: React.CSSProperties = {
    position: isOverlay ? 'absolute' : 'relative',
    ...(isOverlay ? { inset: 0 } : {}),
    // 🔥 关键：骨架屏激活时需要响应事件（因为实际内容已被隐藏）
    pointerEvents: 'auto',
    // 🔥 只有 overlay 模式才需要背景色和 z-index
    ...(isOverlay ? {
      backgroundColor: '#111827', // 与 AIChat 背景色一致
      zIndex: 100, // 确保在所有内容之上
    } : {}),
    opacity: 0,
    animation: design.container.animation !== 'none'
      ? `skeleton-fade-in ${design.container.duration}ms ease-in-out forwards`
      : undefined,
    ...style,
  };

  const containerClassName = [
    'skeleton-container',
    isOverlay ? 'skeleton-overlay' : 'skeleton-inline',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={containerClassName}
      style={containerStyle}
      role="status"
      aria-live="polite"
      aria-label="正在加载聊天..."
    >
      {design.structure.map((node, index) => (
        <SkeletonNodeRenderer key={index} node={node} context={context} />
      ))}
    </div>
  );
});

DSLRenderer.displayName = 'DSLRenderer';
