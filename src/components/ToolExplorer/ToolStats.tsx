/**
 * Tool Stats Component
 *
 * P3: 通用工具系统 UI - 统计信息组件
 *
 * 显示工具统计信息：
 * - 总工具数
 * - 各分类数量
 * - 各权限级别数量
 */

import React from 'react';
import type { ToolStatsResponse } from '../../types/tool';
import './ToolStats.css';

/**
 * 工具统计组件
 */
export const ToolStats: React.FC<{ stats: ToolStatsResponse }> = ({ stats }) => {
  return (
    <div data-testid="tool-stats" className="tool-stats theme-panel-muted theme-border rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {/* 总工具数 */}
        <div className="flex items-center gap-2">
          <span className="theme-text-subtle">总工具数:</span>
          <span
            data-testid="tool-total-count"
            className="text-lg font-bold text-primary"
          >
            {stats.total_count}
          </span>
        </div>

        {/* 分类统计 */}
        {Object.keys(stats.category_counts).length > 0 && (
          <div className="flex items-center gap-2">
            <span className="theme-text-subtle">分类:</span>
            <div
              data-testid="tool-category-counts"
              className="flex flex-wrap gap-1.5"
            >
              {Object.entries(stats.category_counts).map(([category, count]) => (
                <span
                  key={category}
                  className="theme-panel theme-border rounded border px-2 py-0.5 text-xs"
                >
                  {category}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 权限统计 */}
        {Object.keys(stats.permission_counts).length > 0 && (
          <div className="flex items-center gap-2">
            <span className="theme-text-subtle">权限:</span>
            <div
              data-testid="tool-permission-counts"
              className="flex flex-wrap gap-1.5"
            >
              {Object.entries(stats.permission_counts).map(([permission, count]) => (
                <span
                  key={permission}
                  className={`
                    px-2 py-0.5 border rounded text-xs
                    ${
                      permission === 'DangerFullAccess'
                        ? 'bg-red-500/12 text-red-500 border-red-500/20'
                        : permission === 'ReadOnly'
                        ? 'bg-green-500/12 text-green-500 border-green-500/20'
                        : 'theme-panel theme-border theme-text-muted'
                    }
                  `}
                >
                  {permission}: {count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
