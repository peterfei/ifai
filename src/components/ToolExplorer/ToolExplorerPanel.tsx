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
  System: 'bg-gray-500',
  Other: 'bg-slate-500',
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
  ReadOnly: 'bg-green-100 text-green-800 border-green-200',
  WorkspaceWrite: 'bg-blue-100 text-blue-800 border-blue-200',
  Prompt: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  DangerFullAccess: 'bg-red-100 text-red-800 border-red-200',
  Allow: 'bg-purple-100 text-purple-800 border-purple-200',
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
      className="tool-explorer-panel h-full flex flex-col bg-background"
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={18}
          />
          <input
            data-testid="tool-search-input"
            type="text"
            placeholder="搜索工具名称或描述..."
            value={filter.searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
                      : 'border-border hover:bg-muted'
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
                      : 'border-border hover:bg-muted'
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
            className="text-sm text-muted-foreground hover:text-foreground underline"
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
            <p className="text-muted-foreground mb-2">没有找到匹配的工具</p>
            <button
              onClick={resetFilter}
              className="text-sm text-primary hover:underline"
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
                  <span className="text-sm text-muted-foreground">({tools.length})</span>
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
