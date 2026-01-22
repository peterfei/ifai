/**
 * 工具分类状态管理
 *
 * 使用Zustand管理工具分类状态和历史记录
 */

import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import type {
  ClassificationResult,
  ClassificationHistoryItem,
  ToolCategory,
  ClassificationLayer,
} from '@/types/toolClassification';
import { toolClassificationService } from '@/services/toolClassificationService';

/**
 * 用户反馈数据
 */
export interface ClassificationFeedback {
  id: string;
  input: string;
  result: ClassificationResult;
  isCorrect: boolean;
  timestamp: number;
  /** 用户预期类别（如果分类错误） */
  expectedCategory?: ToolCategory;
  /** 备注 */
  notes?: string;
}

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
  /** 用户反馈数据 */
  feedback: ClassificationFeedback[];
  /** 反馈统计 */
  feedbackStats: {
    total: number;
    correct: number;
    incorrect: number;
    accuracyRate: number;
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
  /** 提交反馈 */
  submitFeedback: (input: string, result: ClassificationResult, isCorrect: boolean, expectedCategory?: ToolCategory, notes?: string) => void;
  /** 删除反馈 */
  removeFeedback: (id: string) => void;
  /** 清空反馈 */
  clearFeedback: () => void;
  /** 更新反馈统计 */
  updateFeedbackStats: () => void;
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
  feedback: [],
  feedbackStats: {
    total: 0,
    correct: 0,
    incorrect: 0,
    accuracyRate: 0,
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
  subscribeWithSelector(
    persist(
      (set, get) => ({
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

    /**
     * 提交反馈
     */
    submitFeedback: (input: string, result: ClassificationResult, isCorrect: boolean, expectedCategory?: ToolCategory, notes?: string) => {
      const feedbackItem: ClassificationFeedback = {
        id: generateId(),
        input,
        result,
        isCorrect,
        expectedCategory,
        notes,
        timestamp: Date.now(),
      };

      set((state) => ({
        feedback: [feedbackItem, ...state.feedback].slice(0, 500), // 保留最近500条反馈
      }));

      // 更新反馈统计
      get().updateFeedbackStats();
    },

    /**
     * 删除反馈
     */
    removeFeedback: (id: string) => {
      set((state) => ({
        feedback: state.feedback.filter((item) => item.id !== id),
      }));
      get().updateFeedbackStats();
    },

    /**
     * 清空反馈
     */
    clearFeedback: () => {
      set({ feedback: [] });
      get().updateFeedbackStats();
    },

    /**
     * 更新反馈统计
     */
    updateFeedbackStats: () => {
      const { feedback } = get();

      const correct = feedback.filter((f) => f.isCorrect).length;
      const incorrect = feedback.filter((f) => !f.isCorrect).length;

      set({
        feedbackStats: {
          total: feedback.length,
          correct,
          incorrect,
          accuracyRate: feedback.length > 0 ? (correct / feedback.length) * 100 : 0,
        },
      });
    },
  })),
  {
    name: 'tool-classification-storage',
    version: 1,
    // 只持久化历史记录和反馈数据，不包括当前状态
    partialize: (state) => ({
      history: state.history,
      feedback: state.feedback,
      stats: state.stats,
      feedbackStats: state.feedbackStats,
    }),
  })
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

/**
 * 选择器：获取反馈数据
 */
export const useFeedback = () =>
  useToolClassificationStore((state) => state.feedback);

/**
 * 选择器：获取反馈统计
 */
export const useFeedbackStats = () =>
  useToolClassificationStore((state) => state.feedbackStats);
