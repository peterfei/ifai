/**
 * Tool Card Component
 *
 * P3: 通用工具系统 UI - 工具卡片组件
 *
 * 显示单个工具的基本信息：
 * - 工具名称
 * - 工具描述
 * - 权限级别
 * - 危险标识
 */

import React from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToolStore } from '../../stores/toolStore';
import type { ToolDescriptionResponse } from '../../types/tool';
import {
  getLocalizedToolCategoryLabel,
  getLocalizedToolDescription,
  getLocalizedToolName,
  getLocalizedToolPermissionLabel,
  getToolPermissionClass,
} from '../../utils/toolExplorerI18n';
import './ToolCard.css';

/**
 * 工具卡片组件
 */
export const ToolCard: React.FC<{ tool: ToolDescriptionResponse }> = ({ tool }) => {
  const { t } = useTranslation();
  const { selectTool } = useToolStore();

  const toolName = getLocalizedToolName(tool, t);
  const permissionLabel = getLocalizedToolPermissionLabel(tool.required_permission, t);
  const categoryLabel = getLocalizedToolCategoryLabel(tool.category, t);
  const description = getLocalizedToolDescription(tool, t);

  const permissionClass = getToolPermissionClass(tool.required_permission);

  const handleClick = () => {
    selectTool(tool);
  };

  return (
    <div
      data-testid={`tool-card-${tool.name.toLowerCase()}`}
      onClick={handleClick}
      className="tool-card theme-panel-muted theme-border group relative cursor-pointer rounded-lg border p-4 transition-all hover:border-[var(--accent-soft-border)] hover:shadow-md"
    >
      {/* 危险工具标识 */}
      {tool.is_dangerous && (
        <div
          data-testid="tool-dangerous-badge"
          className="theme-badge-danger absolute top-2 right-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
        >
          <AlertTriangle size={12} />
          <span>{t('toolExplorer.danger')}</span>
        </div>
      )}

      {/* 工具名称 */}
      <div className="flex items-start justify-between mb-2">
        <h3
          data-testid="tool-name"
          className="tool-card-title theme-text text-base font-semibold font-mono transition-colors group-hover:text-[var(--accent-color)]"
        >
          {toolName}
        </h3>
        <ChevronRight
          className="theme-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
          size={18}
        />
      </div>

      {/* 工具描述 */}
      <p
        data-testid="tool-description"
        className="theme-text-subtle mb-3 line-clamp-2 text-sm"
      >
        {description}
      </p>

      {/* 权限级别 */}
      <div
        data-testid="tool-permission"
        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${permissionClass}`}
      >
        {permissionLabel}
      </div>

      {/* 工具分类 */}
      <div className="theme-text-subtle mt-2 text-xs">
        {categoryLabel}
      </div>
    </div>
  );
};
