/**
 * TimelineProgress - 时间线加载进度条组件
 *
 * 显示当前已加载的消息数量和总数量
 *
 * @version v0.3.1
 */

import React from 'react';

interface TimelineProgressProps {
  loaded: number;
  total: number;
  'data-testid'?: string;
}

export const TimelineProgress: React.FC<TimelineProgressProps> = ({
  loaded,
  total,
  'data-testid': dataTestId
}) => {
  // 计算加载百分比
  const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <div
      className="px-4 py-2 bg-[#252526] border-b border-gray-700/50 flex items-center justify-between"
      data-testid={dataTestId}
    >
      {/* 进度文字 */}
      <span className="text-xs text-gray-400">
        ✅ 已加载 <span className="text-white font-medium">{loaded}</span>/{total} 条消息
      </span>

      {/* 进度百分比 */}
      <span className="text-xs text-gray-500">
        {percentage}%
      </span>
    </div>
  );
};

export default TimelineProgress;
