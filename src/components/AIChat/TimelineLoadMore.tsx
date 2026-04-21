/**
 * TimelineLoadMore - 时间线加载更多按钮
 *
 * @version v0.3.1
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

interface TimelineLoadMoreProps {
  onClick: () => void;
  'data-testid'?: string;
}

export const TimelineLoadMore: React.FC<TimelineLoadMoreProps> = ({
  onClick,
  'data-testid': dataTestId
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center justify-center p-4"
      data-testid={dataTestId}
    >
      <button
        onClick={onClick}
        className="px-6 py-2 theme-button-secondary text-sm rounded-lg transition-colors duration-150 flex items-center gap-2"
      >
        <span className="theme-text-accent">⋯</span>
        <span>{t('aiChat.timeline.loadMore')}</span>
      </button>
    </div>
  );
};

export default TimelineLoadMore;
