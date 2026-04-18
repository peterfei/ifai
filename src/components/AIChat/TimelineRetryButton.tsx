/**
 * TimelineRetryButton - 时间线加载失败重试按钮
 *
 * @version v0.3.1
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col items-center justify-center p-4 gap-2"
      data-testid={dataTestId}
    >
      {/* 错误消息 */}
      <span
        className="text-xs theme-text-danger"
        data-testid="timeline-error-message"
      >
        {message}
      </span>

      {/* 重试按钮 */}
      <button
        onClick={onRetry}
        className="px-4 py-2 theme-button-primary text-sm rounded-lg transition-colors duration-150 theme-shadow"
      >
        {t('aiChat.timeline.retry')}
      </button>
    </div>
  );
};

export default TimelineRetryButton;
