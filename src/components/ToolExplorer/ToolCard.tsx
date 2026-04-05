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
  ReadOnly: 'bg-green-100 text-green-800 border-green-200',
  WorkspaceWrite: 'bg-blue-100 text-blue-800 border-blue-200',
  Prompt: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  DangerFullAccess: 'bg-red-100 text-red-800 border-red-200',
  Allow: 'bg-purple-100 text-purple-800 border-purple-200',
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
      className="tool-card group relative p-4 border border-border rounded-lg hover:border-primary hover:shadow-md transition-all cursor-pointer bg-card"
    >
      {/* 危险工具标识 */}
      {tool.is_dangerous && (
        <div
          data-testid="tool-dangerous-badge"
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded-full border border-red-200"
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
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
          size={18}
        />
      </div>

      {/* 工具描述 */}
      <p
        data-testid="tool-description"
        className="text-sm text-muted-foreground mb-3 line-clamp-2"
      >
        {tool.description}
      </p>

      {/* 权限级别 */}
      <div
        data-testid="tool-permission"
        className={`
          inline-flex px-2 py-0.5 text-xs font-medium rounded border
          ${permissionColors[tool.required_permission] || 'bg-gray-100 text-gray-800'}
        `}
      >
        {tool.required_permission}
      </div>

      {/* 工具分类 */}
      <div className="mt-2 text-xs text-muted-foreground">
        {tool.category}
      </div>
    </div>
  );
};
