/**
 * TimelineBubbleSkeleton - 气泡骨架屏组件
 *
 * 在内容加载过程中显示占位符，提升用户体验
 *
 * @version v0.3.1
 */

import React from 'react';

interface TimelineBubbleSkeletonProps {
  type: 'user' | 'assistant';
  'data-testid'?: string;
}

export const TimelineBubbleSkeleton: React.FC<TimelineBubbleSkeletonProps> = ({
  type,
  'data-testid': dataTestId
}) => {
  const isUser = type === 'user';

  return (
    <div
      className={`flex flex-col ${isUser ? 'items-start' : 'items-end'} gap-1`}
      data-testid={dataTestId}
    >
      {/* 时间标签骨架 */}
      <div className="flex items-center gap-2 px-2">
        <div className="w-12 h-3 theme-panel-muted rounded animate-pulse" />
      </div>

      {/* 气泡骨架 */}
      <div
        className={`
          max-w-[70%]
          rounded-2xl
          ${isUser ? 'rounded-bl-sm bg-blue-500/10 border border-blue-500/20' : 'rounded-br-sm theme-panel-muted border theme-border'}
          px-4
          py-3
          animate-pulse
        `}
      >
        {/* 文本骨架 */}
        <div className="space-y-2">
          <div className="w-32 h-3 theme-panel rounded" />
          <div className="w-48 h-3 theme-panel rounded" />
          <div className="w-24 h-3 theme-panel rounded" />
        </div>

        {/* 代码块骨架（仅 AI 气泡） */}
        {!isUser && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 theme-code-surface border theme-border rounded">
            <div className="w-4 h-4 theme-panel rounded" />
            <div className="w-16 h-3 theme-panel rounded" />
            <div className="w-8 h-3 theme-panel rounded" />
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineBubbleSkeleton;
