/**
 * Tool Store
 *
 * P3: 通用工具系统 UI - 状态管理
 *
 * 管理工具描述系统的状态，包括：
 * - 工具列表加载
 * - 过滤和搜索
 * - 选中的工具详情
 * - 统计信息
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  ToolDescriptionResponse,
  ToolListResponse,
  ToolFilter,
  ToolCategory,
  ToolPermission,
} from '../types/tool';

/**
 * 工具 Store 状态
 */
interface ToolState {
  /** 所有工具 */
  tools: ToolDescriptionResponse[];

  /** 按分类组织的工具 */
  toolsByCategory: Record<string, ToolDescriptionResponse[]>;

  /** 按权限组织的工具 */
  toolsByPermission: Record<string, ToolDescriptionResponse[]>;

  /** 当前过滤器 */
  filter: ToolFilter;

  /** 选中的工具（用于详情显示） */
  selectedTool: ToolDescriptionResponse | null;

  /** 是否正在加载 */
  isLoading: boolean;

  /** 错误信息 */
  error: string | null;

  /** 统计信息 */
  stats: {
    total_count: number;
    category_counts: Record<string, number>;
    permission_counts: Record<string, number>;
  } | null;
}

/**
 * 工具 Store 操作
 */
interface ToolActions {
  /** 加载所有工具 */
  loadTools: () => Promise<void>;

  /** 根据权限过滤工具 */
  loadToolsByPermission: (permission: ToolPermission) => Promise<void>;

  /** 获取单个工具详情 */
  loadToolDetail: (name: string) => Promise<ToolDescriptionResponse | null>;

  /** 设置过滤器 */
  setFilter: (filter: Partial<ToolFilter>) => void;

  /** 选中工具 */
  selectTool: (tool: ToolDescriptionResponse | null) => void;

  /** 清除错误 */
  clearError: () => void;

  /** 重置过滤器 */
  resetFilter: () => void;
}

/**
 * 默认过滤器
 */
const defaultFilter: ToolFilter = {
  searchQuery: '',
  categories: [],
  permissions: [],
};

/**
 * 创建工具 Store
 */
export const useToolStore = create<ToolState & ToolActions>((set, get) => ({
  // 初始状态
  tools: [],
  toolsByCategory: {},
  toolsByPermission: {},
  filter: defaultFilter,
  selectedTool: null,
  isLoading: false,
  error: null,
  stats: null,

  // 加载所有工具
  loadTools: async () => {
    set({ isLoading: true, error: null });
    try {
      const response: ToolListResponse = await invoke('get_tool_descriptions');

      set({
        tools: response.tools,
        toolsByCategory: response.by_category,
        toolsByPermission: response.by_permission,
        stats: response.stats,
        isLoading: false,
      });
    } catch (error) {
      console.error('[ToolStore] Failed to load tools:', error);
      set({
        error: String(error),
        isLoading: false,
      });
    }
  },

  // 根据权限过滤工具
  loadToolsByPermission: async (permission: ToolPermission) => {
    set({ isLoading: true, error: null });
    try {
      const tools: ToolDescriptionResponse[] = await invoke('get_tools_by_permission', {
        maxPermission: permission,
      });

      set({
        tools,
        isLoading: false,
      });
    } catch (error) {
      console.error('[ToolStore] Failed to load tools by permission:', error);
      set({
        error: String(error),
        isLoading: false,
      });
    }
  },

  // 获取单个工具详情
  loadToolDetail: async (name: string) => {
    try {
      const tool: ToolDescriptionResponse = await invoke('get_tool_description', {
        name,
      });
      return tool;
    } catch (error) {
      console.error('[ToolStore] Failed to load tool detail:', error);
      set({ error: String(error) });
      return null;
    }
  },

  // 设置过滤器
  setFilter: (newFilter: Partial<ToolFilter>) => {
    const currentFilter = get().filter;
    set({
      filter: { ...currentFilter, ...newFilter },
    });
  },

  // 选中工具
  selectTool: (tool: ToolDescriptionResponse | null) => {
    set({ selectedTool: tool });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },

  // 重置过滤器
  resetFilter: () => {
    set({ filter: defaultFilter });
  },
}));

/**
 * Hook: 获取过滤后的工具列表
 */
export const useFilteredTools = () => {
  const tools = useToolStore((state) => state.tools);
  const filter = useToolStore((state) => state.filter);

  return tools.filter((tool) => {
    // 搜索过滤
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      const matchesSearch =
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // 分类过滤
    if (filter.categories.length > 0) {
      if (!filter.categories.includes(tool.category as ToolCategory)) {
        return false;
      }
    }

    // 权限过滤
    if (filter.permissions.length > 0) {
      if (
        !filter.permissions.includes(tool.required_permission as ToolPermission)
      ) {
        return false;
      }
    }

    return true;
  });
};

/**
 * Hook: 获取工具统计信息
 */
export const useToolStats = () => {
  return useToolStore((state) => state.stats);
};

/**
 * Hook: 获取加载状态
 */
export const useToolLoading = () => {
  return useToolStore((state) => state.isLoading);
};

/**
 * Hook: 获取错误信息
 */
export const useToolError = () => {
  return useToolStore((state) => state.error);
};

/**
 * Hook: 获取选中的工具
 */
export const useSelectedTool = () => {
  return useToolStore((state) => state.selectedTool);
};

/**
 * Hook: 获取工具列表（按分类）
 */
export const useToolsByCategory = (category: string) => {
  return useToolStore((state) => state.toolsByCategory[category] || []);
};

/**
 * Hook: 获取工具列表（按权限）
 */
export const useToolsByPermission = (permission: string) => {
  return useToolStore((state) => state.toolsByPermission[permission] || []);
};
