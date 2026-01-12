/**
 * v0.3.0: 代码异味检测状态管理
 *
 * 管理代码分析结果和 UI 状态
 */

import { create } from 'zustand';
import { CodeAnalysisResult, CodeSmell, codeAnalysisService } from '../services/codeAnalysis';

interface CodeSmellState {
  // 分析结果映射（按文件路径）
  results: Map<string, CodeAnalysisResult>;

  // 当前显示的文件路径
  activeFilePath: string | null;

  // 是否正在分析
  isAnalyzing: boolean;

  // 是否显示面板
  isPanelOpen: boolean;

  // 当前选中的异味
  selectedSmell: CodeSmell | null;

  // 自动分析开关
  autoAnalyze: boolean;

  // Actions
  analyzeFile: (filePath: string, content: string, language: string) => Promise<CodeAnalysisResult>;
  clearResults: () => void;
  setActiveFile: (filePath: string) => void;
  setPanelOpen: (open: boolean) => void;
  setSelectedSmell: (smell: CodeSmell | null) => void;
  setAutoAnalyze: (enabled: boolean) => void;
  getResult: (filePath: string) => CodeAnalysisResult | undefined;
  getAllResults: () => CodeAnalysisResult[];
  getSummary: () => { total: number; error: number; warning: number; info: number };
}

export const useCodeSmellStore = create<CodeSmellState>((set, get) => ({
  results: new Map(),
  activeFilePath: null,
  isAnalyzing: false,
  isPanelOpen: false,
  selectedSmell: null,
  autoAnalyze: true,

  analyzeFile: async (filePath: string, content: string, language: string) => {
    set({ isAnalyzing: true });

    try {
      const result = await codeAnalysisService.analyzeCode(filePath, content, language);

      set((state) => {
        const newResults = new Map(state.results);
        newResults.set(filePath, result);
        return {
          results: newResults,
          isAnalyzing: false,
          activeFilePath: filePath,
        };
      });

      return result;
    } catch (error) {
      console.error('[CodeSmellStore] 分析失败:', error);
      set({ isAnalyzing: false });
      throw error;
    }
  },

  clearResults: () => {
    set({ results: new Map(), activeFilePath: null, selectedSmell: null });
  },

  setActiveFile: (filePath: string) => {
    set({ activeFilePath: filePath });
  },

  setPanelOpen: (open: boolean) => {
    set({ isPanelOpen: open });
  },

  setSelectedSmell: (smell: CodeSmell | null) => {
    set({ selectedSmell: smell });
  },

  setAutoAnalyze: (enabled: boolean) => {
    set({ autoAnalyze: enabled });
  },

  getResult: (filePath: string) => {
    return get().results.get(filePath);
  },

  getAllResults: () => {
    return Array.from(get().results.values());
  },

  getSummary: () => {
    const allResults = get().getAllResults();
    return allResults.reduce(
      (acc, result) => ({
        total: acc.total + result.summary.total,
        error: acc.error + result.summary.error,
        warning: acc.warning + result.summary.warning,
        info: acc.info + result.summary.info,
      }),
      { total: 0, error: 0, warning: 0, info: 0 }
    );
  },
}));
