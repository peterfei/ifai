/**
 * Tool Explorer Panel
 *
 * P3: 通用工具系统 UI - 主面板组件
 *
 * 显示所有已注册工具的列表，支持：
 * - 按分类组织
 * - 按权限过滤
 * - 搜索功能
 * - 查看详情
 * - 统计信息
 */

import React, { useEffect, useMemo } from 'react';
import { Search, File, Code, Globe, Terminal, Settings, AlertTriangle } from 'lucide-react';
import { useToolStore, useFilteredTools, useToolStats, useToolLoading } from '../../stores/toolStore';
import { ToolCard } from './ToolCard';
import { ToolDetailDialog } from './ToolDetailDialog';
import { ToolStats } from './ToolStats';
import { ToolCategory, ToolPermission } from '../../types/tool';
import './ToolExplorerPanel.css';

/**
 * 分类图标映射
 */
const categoryIcons: Record<string, React.ReactNode> = {
  File: <File size={20} />,
  Search: <Search size={20} />,
  Command: <Terminal size={20} />,
  Network: <Globe size={20} />,
  System: <Settings size={20} />,
  Other: <Code size={20} />,
};

/**
 * 分类颜色映射
 */
const categoryColors: Record<string, string> = {
  File: 'bg-blue-500',
  Search: 'bg-purple-500',
  Command: 'bg-orange-500',
  Network: 'bg-green-500',
  System: 'bg-zinc-500',
  Other: 'bg-neutral-500',
};

/**
 * 权限级别标签
 */
const permissionLabels: Record<string, string> = {
  ReadOnly: '只读',
  WorkspaceWrite: '写入',
  Prompt: '提示',
  DangerFullAccess: '危险',
  Allow: '允许',
};

/**
 * 权限颜色
 */
const permissionColors: Record<string, string> = {
  ReadOnly: 'bg-green-500/12 text-green-500 border-green-500/20',
  WorkspaceWrite: 'bg-blue-500/12 text-blue-500 border-blue-500/20',
  Prompt: 'bg-amber-500/12 text-amber-500 border-amber-500/20',
  DangerFullAccess: 'bg-red-500/12 text-red-500 border-red-500/20',
  Allow: 'bg-purple-500/12 text-purple-500 border-purple-500/20',
};

/**
 * 工具探索器面板组件
 */
export const ToolExplorerPanel: React.FC = () => {
  const { loadTools, filter, setFilter, resetFilter, error, clearError } = useToolStore();
  const filteredTools = useFilteredTools();
  const stats = useToolStats();
  const isLoading = useToolLoading();

  // 初始加载工具列表
  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // 处理搜索输入
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter({ searchQuery: e.target.value });
  };

  // 处理分类过滤
  const handleCategoryFilter = (category: string) => {
    const currentCategories = filter.categories;
    const newCategories = currentCategories.includes(category as ToolCategory)
      ? currentCategories.filter((c) => c !== category)
      : [...currentCategories, category as ToolCategory];

    setFilter({ categories: newCategories });
  };

  // 处理权限过滤
  const handlePermissionFilter = (permission: string) => {
    const currentPermissions = filter.permissions;
    const newPermissions = currentPermissions.includes(permission as ToolPermission)
      ? currentPermissions.filter((p) => p !== permission)
      : [...currentPermissions, permission as ToolPermission];

    setFilter({ permissions: newPermissions });
  };

  // 按分类组织工具
  const toolsByCategory = useMemo(() => {
    const grouped: Record<string, typeof filteredTools> = {};
    for (const tool of filteredTools) {
      if (!grouped[tool.category]) {
        grouped[tool.category] = [];
      }
      grouped[tool.category].push(tool);
    }
    return grouped;
  }, [filteredTools]);

  return (
    <div
      data-testid="tool-explorer-panel"
      className="tool-explorer-panel theme-panel h-full flex flex-col"
    >
      {/* 头部：搜索和统计 */}
      <div className="tool-explorer-header border-b border-border p-4 space-y-4">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">工具浏览器</h1>
          {error && (
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle size={16} />
              <span className="text-sm">{error}</span>
              <button
                onClick={clearError}
                className="text-xs underline hover:no-underline"
              >
                关闭
              </button>
            </div>
          )}
        </div>

        {/* 统计信息 */}
        {stats && <ToolStats stats={stats} />}

        {/* 搜索框 */}
        <div className="relative">
          <Search
            className="theme-text-subtle absolute left-3 top-1/2 -translate-y-1/2"
            size={18}
          />
          <input
            data-testid="tool-search-input"
            type="text"
            placeholder="搜索工具名称或描述..."
            value={filter.searchQuery}
            onChange={handleSearchChange}
            className="theme-input-surface theme-border theme-text w-full rounded-md border py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* 过滤器 */}
      <div className="tool-filters border-b border-border p-4 space-y-3">
        {/* 分类过滤 */}
        <div>
          <div className="text-sm font-medium mb-2">分类</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryIcons).map(([category, icon]) => (
              <button
                key={category}
                data-testid={`filter-category-${category.toLowerCase()}`}
                onClick={() => handleCategoryFilter(category)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors
                  ${
                    filter.categories.includes(category as ToolCategory)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'theme-panel-muted theme-border theme-text-muted hover:bg-[var(--hover-bg)]'
                  }
                `}
              >
                {icon}
                <span>{category}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 权限过滤 */}
        <div>
          <div className="text-sm font-medium mb-2">权限级别</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(permissionLabels).map(([permission, label]) => (
              <button
                key={permission}
                data-testid={`filter-permission-${permission.toLowerCase()}`}
                onClick={() => handlePermissionFilter(permission)}
                className={`
                  px-3 py-1.5 rounded-md text-sm border transition-colors
                  ${
                    filter.permissions.includes(permission as ToolPermission)
                      ? permissionColors[permission]
                      : 'theme-panel-muted theme-border theme-text-muted hover:bg-[var(--hover-bg)]'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 重置按钮 */}
        {(filter.categories.length > 0 ||
          filter.permissions.length > 0 ||
          filter.searchQuery) && (
          <button
            onClick={resetFilter}
            className="text-sm text-blue-500 hover:text-blue-400 underline"
          >
            重置过滤器
          </button>
        )}
      </div>

      {/* 工具列表 */}
      <div className="tool-list flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="theme-text-subtle mb-2">没有找到匹配的工具</p>
            <button
              onClick={resetFilter}
              className="text-sm text-blue-500 hover:underline"
            >
              清除过滤器
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(toolsByCategory).map(([category, tools]) => (
              <div
                key={category}
                data-testid={`tool-category-${category.toLowerCase()}`}
                className="tool-category"
              >
                {/* 分类标题 */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-md ${categoryColors[category]}`}>
                    {categoryIcons[category]}
                  </div>
                  <h2 className="text-lg font-semibold">{category}</h2>
                  <span className="theme-text-subtle text-sm">({tools.length})</span>
                </div>

                {/* 工具卡片网格 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tools.map((tool) => (
                    <ToolCard key={tool.name} tool={tool} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 工具详情对话框 */}
      <ToolDetailDialog />
    </div>
  );
};
