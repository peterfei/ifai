/**
 * v0.2.9 代码审查 Store
 *
 * 管理代码审查状态和历史记录
 */

import { create } from 'zustand';
import type { ReviewIssue, ReviewResult } from '../components/CodeReview';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 审查历史记录
 */
export interface ReviewHistory {
  /** 审查 ID */
  id: string;

  /** 时间戳 */
  timestamp: number;

  /** 提交哈希 */
  commitHash?: string;

  /** 问题列表 */
  issues: ReviewIssue[];

  /** 状态 */
  status: 'pending' | 'fixed' | 'ignored';
}

/**
 * 自定义审查规则
 */
export interface CustomReviewRule {
  /** 规则 ID */
  id: string;

  /** 规则名称 */
  name: string;

  /** 匹配模式（正则表达式） */
  pattern: string;

  /** 严重级别 */
  severity: 'critical' | 'error' | 'warning' | 'info';

  /** 错误消息 */
  message: string;
}

// ============================================================================
// Store 状态
// ============================================================================

interface CodeReviewState {
  /** 当前审查结果 */
  currentReview: ReviewResult | null;

  /** 是否显示审查模态框 */
  isReviewModalOpen: boolean;

  /** 审查历史记录 */
  reviewHistory: ReviewHistory[];

  /** 自定义审查规则 */
  customRules: CustomReviewRule[];

  /** 是否显示审查历史面板 */
  isHistoryPanelOpen: boolean;

  // Actions

  /** 设置当前审查结果 */
  setCurrentReview: (review: ReviewResult | null) => void;

  /** 打开审查模态框 */
  openReviewModal: () => void;

  /** 关闭审查模态框 */
  closeReviewModal: () => void;

  /** 添加审查历史记录 */
  addReviewHistory: (history: ReviewHistory) => void;

  /** 清空审查历史 */
  clearReviewHistory: () => void;

  /** 设置自定义规则 */
  setCustomRules: (rules: CustomReviewRule[]) => void;

  /** 添加自定义规则 */
  addCustomRule: (rule: CustomReviewRule) => void;

  /** 删除自定义规则 */
  removeCustomRule: (ruleId: string) => void;

  /** 切换历史面板显示 */
  toggleHistoryPanel: () => void;

  /** 应用修复 */
  applyFix: (issueId: string) => Promise<void>;

  /** 应用所有修复 */
  applyAllFixes: () => Promise<void>;

  /** 忽略问题并提交 */
  ignoreAndCommit: () => Promise<void>;
}

// ============================================================================
// Store 实现
// ============================================================================

export const useCodeReviewStore = create<CodeReviewState>((set, get) => ({
  currentReview: null,
  isReviewModalOpen: false,
  reviewHistory: [],
  customRules: [],
  isHistoryPanelOpen: false,

  setCurrentReview: (review) => {
    set({ currentReview: review });
  },

  openReviewModal: () => {
    set({ isReviewModalOpen: true });
  },

  closeReviewModal: () => {
    set({ isReviewModalOpen: false });
  },

  addReviewHistory: (history) => {
    set((state) => ({
      reviewHistory: [...state.reviewHistory, history],
    }));
  },

  clearReviewHistory: () => {
    set({ reviewHistory: [] });
  },

  setCustomRules: (rules) => {
    set({ customRules: rules });
  },

  addCustomRule: (rule) => {
    set((state) => ({
      customRules: [...state.customRules, rule],
    }));
  },

  removeCustomRule: (ruleId) => {
    set((state) => ({
      customRules: state.customRules.filter((rule) => rule.id !== ruleId),
    }));
  },

  toggleHistoryPanel: () => {
    set((state) => ({
      isHistoryPanelOpen: !state.isHistoryPanelOpen,
    }));
  },

  applyFix: async (issueId) => {
    const state = get();
    const issue = state.currentReview?.issues.find((i) => i.id === issueId);

    if (!issue) {
      console.warn('[CodeReview] Issue not found:', issueId);
      return;
    }

    // TODO: 实现应用修复逻辑
    console.log('[CodeReview] Applying fix for issue:', issue);

    // 更新问题状态
    if (state.currentReview) {
      set({
        currentReview: {
          ...state.currentReview,
          issues: state.currentReview.issues.map((i) =>
            i.id === issueId ? { ...i, hasFix: false } : i
          ),
        },
      });
    }
  },

  applyAllFixes: async () => {
    const state = get();
    const fixableIssues = state.currentReview?.issues.filter((i) => i.hasFix) || [];

    console.log('[CodeReview] Applying all fixes:', fixableIssues.length);

    // TODO: 实现批量应用修复逻辑

    // 关闭模态框
    set({ isReviewModalOpen: false });
  },

  ignoreAndCommit: async () => {
    console.log('[CodeReview] Ignoring issues and committing');

    // TODO: 实现忽略并提交逻辑

    // 关闭模态框
    set({ isReviewModalOpen: false });
  },
}));

// ============================================================================
// E2E 测试辅助
// ============================================================================

if (typeof window !== 'undefined') {
  (window as any).__codeReviewStore = useCodeReviewStore;
  // E2E 测试使用的别名
  (window as any).__reviewStore = useCodeReviewStore;
}
