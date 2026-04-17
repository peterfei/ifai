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
import { useToolStore } from '../../stores/toolStore';
import type { ToolDescriptionResponse } from '../../types/tool';
import './ToolCard.css';

/**
 * 权限级别颜色映射
 */
const permissionColors: Record<string, string> = {
  ReadOnly: 'bg-green-500/12 text-green-500 border-green-500/20',
  WorkspaceWrite: 'bg-blue-500/12 text-blue-500 border-blue-500/20',
  Prompt: 'bg-amber-500/12 text-amber-500 border-amber-500/20',
  DangerFullAccess: 'bg-red-500/12 text-red-500 border-red-500/20',
  Allow: 'bg-purple-500/12 text-purple-500 border-purple-500/20',
};

/**
 * 工具卡片组件
 */
export const ToolCard: React.FC<{ tool: ToolDescriptionResponse }> = ({ tool }) => {
  const { selectTool } = useToolStore();

  const handleClick = () => {
    selectTool(tool);
  };

  return (
    <div
      data-testid={`tool-card-${tool.name.toLowerCase()}`}
      onClick={handleClick}
      className="tool-card theme-panel-muted theme-border group relative cursor-pointer rounded-lg border p-4 transition-all hover:border-blue-500/30 hover:shadow-md"
    >
      {/* 危险工具标识 */}
      {tool.is_dangerous && (
        <div
          data-testid="tool-dangerous-badge"
          className="absolute top-2 right-2 flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/12 px-2 py-0.5 text-xs font-medium text-red-500"
        >
          <AlertTriangle size={12} />
          <span>危险</span>
        </div>
      )}

      {/* 工具名称 */}
      <div className="flex items-start justify-between mb-2">
        <h3
          data-testid="tool-name"
          className="text-base font-semibold font-mono group-hover:text-primary transition-colors"
        >
          {tool.name}
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
        {tool.description}
      </p>

      {/* 权限级别 */}
      <div
        data-testid="tool-permission"
        className={`
          inline-flex px-2 py-0.5 text-xs font-medium rounded border
          ${permissionColors[tool.required_permission] || 'theme-panel theme-border theme-text-muted'}
        `}
      >
        {tool.required_permission}
      </div>

      {/* 工具分类 */}
      <div className="theme-text-subtle mt-2 text-xs">
        {tool.category}
      </div>
    </div>
  );
};
