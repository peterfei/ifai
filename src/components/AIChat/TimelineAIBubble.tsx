/**
 * TimelineAIBubble - AI 气泡组件
 *
 * 样式特点:
 * - 右对齐
 * - 主题面板背景
 * - 主题文字颜色
 * - 圆角 18px，左下角 4px
 * - 支持代码块折叠
 *
 * @version v0.3.1
 */

import React, { useState } from 'react';
import { Bot, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
        <span className="text-xs theme-text-muted flex items-center gap-1">
          <Bot size={12} />
          {t('aiChat.timeline.assistant')}
        </span>
        <span className="text-xs theme-text-subtle font-mono">
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
          theme-panel-muted
          theme-text
          px-4
          py-3
          theme-shadow
          cursor-pointer
          theme-soft-hover
          transition-colors
          duration-150
          border
          theme-border
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
            className="mt-2 flex items-center justify-between gap-2 px-3 py-2 theme-code-surface border theme-border rounded-lg cursor-pointer hover:border-[var(--accent-soft-border)] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setCodeExpanded(!codeExpanded);
            }}
            data-testid="code-collapse-button"
          >
            <div className="flex items-center gap-2 text-xs theme-text-subtle">
              <Code2 size={12} className="theme-text-accent" />
              <span>{codeLanguage}</span>
              <span className="theme-text-subtle">
                {t('aiChat.timeline.codeLines', { count: codeLines })}
              </span>
            </div>
            <span className="text-xs theme-text-accent flex items-center gap-1">
              {codeExpanded ? t('aiChat.timeline.collapse') : t('aiChat.timeline.expand')}
              {codeExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </div>
        )}

        {/* 展开的代码内容 - 始终存在于 DOM 中 */}
        {hasCode && (
          <div
            className={`mt-2 p-3 theme-code-surface border theme-border rounded-lg overflow-x-auto ${codeExpanded ? '' : 'hidden'}`}
            data-testid="timeline-code-block"
          >
            <pre className="text-xs theme-text-muted font-mono">
              <code>{content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineAIBubble;
