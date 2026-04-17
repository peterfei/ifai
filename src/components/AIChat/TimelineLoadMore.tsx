/**
 * TimelineLoadMore - 时间线加载更多按钮
 *
 * @version v0.3.1
 */

import React from 'react';

interface TimelineLoadMoreProps {
  onClick: () => void;
  'data-testid'?: string;
}

export const TimelineLoadMore: React.FC<TimelineLoadMoreProps> = ({
  onClick,
  'data-testid': dataTestId
}) => {
  return (
    <div
      className="flex items-center justify-center p-4"
      data-testid={dataTestId}
    >
      <button
        onClick={onClick}
        className="px-6 py-2 theme-button-secondary text-sm rounded-lg transition-colors duration-150 flex items-center gap-2"
      >
        <span className="text-blue-500">⋯</span>
        <span>加载更多...</span>
      </button>
    </div>
  );
};

export default TimelineLoadMore;
