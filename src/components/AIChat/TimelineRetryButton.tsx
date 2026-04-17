/**
 * TimelineRetryButton - 时间线加载失败重试按钮
 *
 * @version v0.3.1
 */

import React from 'react';

interface TimelineRetryButtonProps {
  message: string;
  onRetry: () => void;
  'data-testid'?: string;
}

export const TimelineRetryButton: React.FC<TimelineRetryButtonProps> = ({
  message,
  onRetry,
  'data-testid': dataTestId
}) => {
  return (
    <div
      className="flex flex-col items-center justify-center p-4 gap-2"
      data-testid={dataTestId}
    >
      {/* 错误消息 */}
      <span
        className="text-xs text-red-400"
        data-testid="timeline-error-message"
      >
        {message}
      </span>

      {/* 重试按钮 */}
      <button
        onClick={onRetry}
        className="px-4 py-2 theme-button-primary text-sm rounded-lg transition-colors duration-150 theme-shadow"
      >
        重试
      </button>
    </div>
  );
};

export default TimelineRetryButton;
