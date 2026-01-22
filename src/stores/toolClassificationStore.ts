/**
 * 工具分类状态管理
 *
 * 使用Zustand管理工具分类状态和历史记录
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ClassificationResult,
  ClassificationHistoryItem,
  ToolCategory,
  ClassificationLayer,
} from '@/types/toolClassification';
import { toolClassificationService } from '@/services/toolClassificationService';

/**
 * 工具分类Store状态
 */
interface ToolClassificationState {
  /** 历史记录 */
  history: ClassificationHistoryItem[];
  /** 当前分类结果 */
  currentResult: ClassificationResult | null;
  /** 当前输入 */
  currentInput: string;
  /** 是否正在分类 */
  isClassifying: boolean;
  /** 错误信息 */
  error: string | null;
  /** 统计信息 */
  stats: {
    totalCount: number;
    byCategory: Record<ToolCategory, number>;
    byLayer: Record<ClassificationLayer, number>;
    averageConfidence: number;
  };
}

/**
 * 工具分类Store操作
 */
interface ToolClassificationActions {
  /** 分类输入 */
  classify: (input: string) => Promise<void>;
  /** 批量分类 */
  batchClassify: (inputs: string[]) => Promise<ClassificationResult[]>;
  /** 清空历史 */
  clearHistory: () => void;
  /** 删除历史记录项 */
  removeHistoryItem: (id: string) => void;
  /** 重置状态 */
  reset: () => void;
  /** 更新统计信息 */
  updateStats: () => void;
}

/**
 * 初始状态
 */
const initialState: ToolClassificationState = {
  history: [],
  currentResult: null,
  currentInput: '',
  isClassifying: false,
  error: null,
  stats: {
    totalCount: 0,
    byCategory: {
      file_operations: 0,
      code_generation: 0,
      code_analysis: 0,
      terminal_commands: 0,
      ai_chat: 0,
      search_operations: 0,
      no_tool_needed: 0,
    },
    byLayer: {
      layer1: 0,
      layer2: 0,
      layer3: 0,
    },
    averageConfidence: 0,
  },
};

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 工具分类Store
 */
export const useToolClassificationStore = create<
  ToolClassificationState & ToolClassificationActions
>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    /**
     * 分类输入
     */
    classify: async (input: string) => {
      set({ isClassifying: true, error: null, currentInput: input });

      try {
        const response = await toolClassificationService.classify(input);

        const historyItem: ClassificationHistoryItem = {
          id: generateId(),
          input,
          result: response.result,
          timestamp: Date.now(),
          latencyMs: response.latencyMs,
        };

        set((state) => ({
          currentResult: response.result,
          history: [historyItem, ...state.history].slice(0, 100), // 保留最近100条
          isClassifying: false,
        }));

        // 更新统计信息
        get().updateStats();
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '分类失败',
          isClassifying: false,
        });
        throw error;
      }
    },

    /**
     * 批量分类
     */
    batchClassify: async (inputs: string[]) => {
      set({ isClassifying: true, error: null });

      try {
        const response = await toolClassificationService.batchClassify(inputs);

        const historyItems: ClassificationHistoryItem[] = response.results.map((result, index) => ({
          id: generateId(),
          input: inputs[index],
          result,
          timestamp: Date.now(),
          latencyMs: response.totalLatencyMs / inputs.length,
        }));

        set((state) => ({
          history: [...historyItems, ...state.history].slice(0, 100),
          isClassifying: false,
        }));

        // 更新统计信息
        get().updateStats();

        return response.results;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '批量分类失败',
          isClassifying: false,
        });
        throw error;
      }
    },

    /**
     * 清空历史
     */
    clearHistory: () => {
      set({ history: [] });
      get().updateStats();
    },

    /**
     * 删除历史记录项
     */
    removeHistoryItem: (id: string) => {
      set((state) => ({
        history: state.history.filter((item) => item.id !== id),
      }));
      get().updateStats();
    },

    /**
     * 重置状态
     */
    reset: () => {
      set(initialState);
    },

    /**
     * 更新统计信息
     */
    updateStats: () => {
      const { history } = get();

      if (history.length === 0) {
        set({
          stats: initialState.stats,
        });
        return;
      }

      const byCategory: Record<ToolCategory, number> = {
        file_operations: 0,
        code_generation: 0,
        code_analysis: 0,
        terminal_commands: 0,
        ai_chat: 0,
        search_operations: 0,
        no_tool_needed: 0,
      };

      const byLayer: Record<ClassificationLayer, number> = {
        layer1: 0,
        layer2: 0,
        layer3: 0,
      };

      let totalConfidence = 0;

      for (const item of history) {
        byCategory[item.result.category]++;
        byLayer[item.result.layer]++;
        totalConfidence += item.result.confidence;
      }

      set({
        stats: {
          totalCount: history.length,
          byCategory,
          byLayer,
          averageConfidence: totalConfidence / history.length,
        },
      });
    },
  }))
);

/**
 * 选择器：获取历史记录
 */
export const useHistoryItems = () =>
  useToolClassificationStore((state) => state.history);

/**
 * 选择器：获取当前分类结果
 */
export const useCurrentResult = () =>
  useToolClassificationStore((state) => state.currentResult);

/**
 * 选择器：获取是否正在分类
 */
export const useIsClassifying = () =>
  useToolClassificationStore((state) => state.isClassifying);

/**
 * 选择器：获取错误信息
 */
export const useClassificationError = () =>
  useToolClassificationStore((state) => state.error);

/**
 * 选择器：获取统计信息
 */
export const useClassificationStats = () =>
  useToolClassificationStore((state) => state.stats);
