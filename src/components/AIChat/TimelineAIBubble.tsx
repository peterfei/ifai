/**
 * TimelineAIBubble - AI 气泡组件
 *
 * 样式特点:
 * - 右对齐
 * - 深色背景 (#1e293b)
 * - 浅色文字 (#e2e8f0)
 * - 圆角 18px，左下角 4px
 * - 支持代码块折叠
 *
 * @version v0.3.1
 */

import React, { useState } from 'react';

interface TimelineAIBubbleProps {
  time: string;
  timestamp: number;
  content: string;
  hasCode?: boolean;
  codeLanguage?: string;
  codeLines?: number;
  onClick?: () => void;
  'data-testid'?: string;
}

export const TimelineAIBubble: React.FC<TimelineAIBubbleProps> = ({
  time,
  timestamp,
  content,
  hasCode = false,
  codeLanguage,
  codeLines,
  onClick,
  'data-testid': dataTestId
}) => {
  const [codeExpanded, setCodeExpanded] = useState(false);

  // 格式化时间标签
  const formatTimeLabel = (ts: number): string => {
    const date = new Date(ts);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // 截断内容预览（取前100个字符）
  const truncateContent = (text: string, maxLength = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="flex flex-col gap-1">
      {/* 时间标签和头像 */}
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs text-gray-400">🤖 AI</span>
        <span className="text-xs text-gray-500 font-mono">
          {formatTimeLabel(timestamp)}
        </span>
      </div>

      {/* 气泡 */}
      <div
        className="
          self-end
          max-w-[70%]
          rounded-2xl
          rounded-br-sm
          bg-[#1e293b]
          text-gray-200
          px-4
          py-3
          shadow-md
          cursor-pointer
          hover:bg-[#252f3f]
          transition-colors
          duration-150
          border
          border-gray-700/50
        "
        onClick={onClick}
        data-testid={dataTestId}
      >
        {/* 消息预览 */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {truncateContent(content)}
        </p>

        {/* 代码块折叠标识 */}
        {hasCode && codeLanguage && codeLines && (
          <div
            className="mt-2 flex items-center justify-between gap-2 px-3 py-2 bg-[#0f172a] rounded-lg cursor-pointer hover:bg-[#1a2332] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setCodeExpanded(!codeExpanded);
            }}
            data-testid="code-collapse-button"
          >
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>📂</span>
              <span>{codeLanguage}</span>
              <span className="text-gray-500">({codeLines}行)</span>
            </div>
            <span className="text-xs text-blue-400">
              {codeExpanded ? '收起 ▲' : '展开 ▼'}
            </span>
          </div>
        )}

        {/* 展开的代码内容 - 始终存在于 DOM 中 */}
        {hasCode && (
          <div
            className={`mt-2 p-3 bg-[#0f172a] rounded-lg overflow-x-auto ${codeExpanded ? '' : 'hidden'}`}
            data-testid="timeline-code-block"
          >
            <pre className="text-xs text-gray-300 font-mono">
              <code>{content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineAIBubble;
