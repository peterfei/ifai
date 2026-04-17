/**
 * TimelineUserBubble - 用户气泡组件
 *
 * 样式特点:
 * - 左对齐
 * - 蓝色背景 (#3b82f6)
 * - 白色文字
 * - 圆角 18px，右下角 4px
 *
 * @version v0.3.1
 */

import React from 'react';
import { User, Code2 } from 'lucide-react';

interface TimelineUserBubbleProps {
  time: string;
  timestamp: number;
  content: string;
  hasCode?: boolean;
  onClick?: () => void;
  'data-testid'?: string;
}

export const TimelineUserBubble: React.FC<TimelineUserBubbleProps> = ({
  time,
  timestamp,
  content,
  hasCode = false,
  onClick,
  'data-testid': dataTestId
}) => {
  // 格式化时间标签
  const formatTimeLabel = (ts: number): string => {
    const date = new Date(ts);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="flex flex-col gap-1">
      {/* 时间标签和头像 */}
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs theme-text-subtle font-mono">
          {formatTimeLabel(timestamp)}
        </span>
        <span className="text-xs theme-text-muted flex items-center gap-1">
          <User size={12} />
          用户
        </span>
      </div>

      {/* 气泡 */}
      <div
        className="
          self-start
          max-w-[70%]
          rounded-2xl
          rounded-bl-sm
          bg-blue-600
          text-white
          px-4
          py-3
          shadow-md
          cursor-pointer
          hover:bg-blue-700
          transition-colors
          duration-150
        "
        onClick={onClick}
        data-testid={dataTestId}
      >
        {/* 消息预览 */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" data-testid="bubble-content">
          {content}
        </p>

        {/* 代码块标识 */}
        {hasCode && (
          <div className="mt-2 flex items-center gap-1 text-xs text-blue-100">
            <Code2 size={12} />
            <span>包含代码</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineUserBubble;
