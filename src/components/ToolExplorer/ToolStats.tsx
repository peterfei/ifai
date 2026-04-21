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
import { useTranslation } from 'react-i18next';
import type { ToolStatsResponse } from '../../types/tool';
import { getToolCategoryClass, getToolPermissionClass } from '../../utils/toolExplorerI18n';
import './ToolStats.css';

/**
 * 工具统计组件
 */
export const ToolStats: React.FC<{ stats: ToolStatsResponse }> = ({ stats }) => {
  const { t } = useTranslation();

  const getCategoryLabel = (category: string) =>
    t(`toolExplorer.categories.${category}`, { defaultValue: category });

  const getPermissionLabel = (permission: string) =>
    t(`toolExplorer.permissions.${permission}`, { defaultValue: permission });

  return (
    <div data-testid="tool-stats" className="tool-stats theme-panel-muted theme-border rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {/* 总工具数 */}
        <div className="flex items-center gap-2">
          <span className="theme-text-subtle">{t('toolExplorer.totalTools')}</span>
          <span
            data-testid="tool-total-count"
            className="theme-text-accent text-lg font-bold"
          >
            {stats.total_count}
          </span>
        </div>

        {/* 分类统计 */}
        {Object.keys(stats.category_counts).length > 0 && (
          <div className="flex items-center gap-2">
            <span className="theme-text-subtle">{t('toolExplorer.filters.category')}:</span>
            <div
              data-testid="tool-category-counts"
              className="flex flex-wrap gap-1.5"
            >
              {Object.entries(stats.category_counts).map(([category, count]) => (
                <span
                  key={category}
                  className={`${getToolCategoryClass(category)} rounded border px-2 py-0.5 text-xs`}
                >
                  {t('toolExplorer.countLabel', {
                    label: getCategoryLabel(category),
                    count,
                  })}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 权限统计 */}
        {Object.keys(stats.permission_counts).length > 0 && (
          <div className="flex items-center gap-2">
            <span className="theme-text-subtle">{t('toolExplorer.filters.permission')}:</span>
            <div
              data-testid="tool-permission-counts"
              className="flex flex-wrap gap-1.5"
            >
              {Object.entries(stats.permission_counts).map(([permission, count]) => (
                <span
                  key={permission}
                  className={`${getToolPermissionClass(permission)} rounded px-2 py-0.5 text-xs`}
                >
                  {t('toolExplorer.countLabel', {
                    label: getPermissionLabel(permission),
                    count,
                  })}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
