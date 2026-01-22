/**
 * 工具分类 Store 单元测试
 *
 * 测试工具分类状态管理、历史记录和反馈功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToolClassificationStore } from '@/stores/toolClassificationStore';
import type { ClassificationResult } from '@/types/toolClassification';

// Mock toolClassificationService
vi.mock('@/services/toolClassificationService', () => ({
  toolClassificationService: {
    classify: vi.fn(),
    batchClassify: vi.fn(),
  },
}));

describe('ToolClassificationStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useToolClassificationStore.getState().reset();
  });

  describe('初始状态', () => {
    it('应该有正确的初始状态', () => {
      const state = useToolClassificationStore.getState();

      expect(state.history).toEqual([]);
      expect(state.currentResult).toBeNull();
      expect(state.currentInput).toBe('');
      expect(state.isClassifying).toBe(false);
      expect(state.error).toBeNull();
      expect(state.feedback).toEqual([]);
    });

    it('应该有正确的初始统计信息', () => {
      const stats = useToolClassificationStore.getState().stats;

      expect(stats.totalCount).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });

    it('应该有正确的初始反馈统计', () => {
      const feedbackStats = useToolClassificationStore.getState().feedbackStats;

      expect(feedbackStats.total).toBe(0);
      expect(feedbackStats.correct).toBe(0);
      expect(feedbackStats.incorrect).toBe(0);
      expect(feedbackStats.accuracyRate).toBe(0);
    });
  });

  describe('历史记录管理', () => {
    it('应该正确添加历史记录', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.95,
        matchType: 'exact',
      };

      const store = useToolClassificationStore.getState();
      store.history = [{
        id: 'test-1',
        input: '/read test.txt',
        result: mockResult,
        timestamp: Date.now(),
        latencyMs: 0.5,
      }];

      store.updateStats();
      expect(useToolClassificationStore.getState().stats.totalCount).toBe(1);
    });

    it('应该正确删除历史记录项', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.95,
        matchType: 'exact',
      };

      const store = useToolClassificationStore.getState();
      const item = {
        id: 'test-1',
        input: '/read test.txt',
        result: mockResult,
        timestamp: Date.now(),
        latencyMs: 0.5,
      };

      store.history = [item];
      store.removeHistoryItem('test-1');

      expect(useToolClassificationStore.getState().history).toHaveLength(0);
    });

    it('应该正确清空历史记录', () => {
      const store = useToolClassificationStore.getState();
      store.clearHistory();

      expect(useToolClassificationStore.getState().history).toHaveLength(0);
    });
  });

  describe('统计信息', () => {
    it('应该正确计算按类别统计', () => {
      const store = useToolClassificationStore.getState();

      const mockResults = [
        { layer: 'layer1' as const, category: 'file_operations' as const, confidence: 0.9, matchType: 'exact' },
        { layer: 'layer1' as const, category: 'file_operations' as const, confidence: 0.85, matchType: 'exact' },
        { layer: 'layer2' as const, category: 'code_generation' as const, confidence: 0.75, matchType: 'keyword' },
      ];

      store.history = mockResults.map((result, i) => ({
        id: `test-${i}`,
        input: `test ${i}`,
        result,
        timestamp: Date.now(),
        latencyMs: 5,
      }));

      store.updateStats();

      const stats = useToolClassificationStore.getState().stats;
      expect(stats.byCategory.file_operations).toBe(2);
      expect(stats.byCategory.code_generation).toBe(1);
    });

    it('应该正确计算按层级统计', () => {
      const store = useToolClassificationStore.getState();

      const mockResults = [
        { layer: 'layer1' as const, category: 'file_operations' as const, confidence: 0.9, matchType: 'exact' },
        { layer: 'layer2' as const, category: 'code_generation' as const, confidence: 0.75, matchType: 'keyword' },
        { layer: 'layer3' as const, category: 'ai_chat' as const, confidence: 0.6, matchType: 'llm' },
      ];

      store.history = mockResults.map((result, i) => ({
        id: `test-${i}`,
        input: `test ${i}`,
        result,
        timestamp: Date.now(),
        latencyMs: 10,
      }));

      store.updateStats();

      const stats = useToolClassificationStore.getState().stats;
      expect(stats.byLayer.layer1).toBe(1);
      expect(stats.byLayer.layer2).toBe(1);
      expect(stats.byLayer.layer3).toBe(1);
    });

    it('应该正确计算平均置信度', () => {
      const store = useToolClassificationStore.getState();

      const mockResults = [
        { layer: 'layer1' as const, category: 'file_operations' as const, confidence: 0.9, matchType: 'exact' },
        { layer: 'layer2' as const, category: 'code_generation' as const, confidence: 0.7, matchType: 'keyword' },
      ];

      store.history = mockResults.map((result, i) => ({
        id: `test-${i}`,
        input: `test ${i}`,
        result,
        timestamp: Date.now(),
        latencyMs: 5,
      }));

      store.updateStats();

      const stats = useToolClassificationStore.getState().stats;
      expect(stats.averageConfidence).toBeCloseTo(0.8, 1);
    });
  });

  describe('反馈管理', () => {
    it('应该正确添加正面反馈', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.95,
        matchType: 'exact',
      };

      const store = useToolClassificationStore.getState();
      store.submitFeedback('/read test.txt', mockResult, true);

      expect(useToolClassificationStore.getState().feedback).toHaveLength(1);
      expect(useToolClassificationStore.getState().feedback[0].isCorrect).toBe(true);
    });

    it('应该正确添加负面反馈', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer3',
        category: 'ai_chat',
        confidence: 0.5,
        matchType: 'llm',
      };

      const store = useToolClassificationStore.getState();
      store.submitFeedback('test input', mockResult, false, 'code_analysis');

      expect(useToolClassificationStore.getState().feedback).toHaveLength(1);
      expect(useToolClassificationStore.getState().feedback[0].isCorrect).toBe(false);
      expect(useToolClassificationStore.getState().feedback[0].expectedCategory).toBe('code_analysis');
    });

    it('应该正确计算反馈统计', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.95,
        matchType: 'exact',
      };

      const store = useToolClassificationStore.getState();

      // 添加3个正面反馈和1个负面反馈
      store.submitFeedback('test 1', mockResult, true);
      store.submitFeedback('test 2', mockResult, true);
      store.submitFeedback('test 3', mockResult, true);
      store.submitFeedback('test 4', mockResult, false);

      const feedbackStats = useToolClassificationStore.getState().feedbackStats;
      expect(feedbackStats.total).toBe(4);
      expect(feedbackStats.correct).toBe(3);
      expect(feedbackStats.incorrect).toBe(1);
      expect(feedbackStats.accuracyRate).toBeCloseTo(75, 0);
    });

    it('应该正确删除反馈', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.95,
        matchType: 'exact',
      };

      const store = useToolClassificationStore.getState();
      store.submitFeedback('test input', mockResult, true);

      const feedbackId = useToolClassificationStore.getState().feedback[0].id;
      store.removeFeedback(feedbackId);

      expect(useToolClassificationStore.getState().feedback).toHaveLength(0);
    });

    it('应该正确清空反馈', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.95,
        matchType: 'exact',
      };

      const store = useToolClassificationStore.getState();
      store.submitFeedback('test 1', mockResult, true);
      store.submitFeedback('test 2', mockResult, false);

      store.clearFeedback();

      expect(useToolClassificationStore.getState().feedback).toHaveLength(0);
      expect(useToolClassificationStore.getState().feedbackStats.total).toBe(0);
    });
  });

  describe('重置状态', () => {
    it('应该正确重置所有状态', () => {
      const mockResult: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.95,
        matchType: 'exact',
      };

      const store = useToolClassificationStore.getState();

      // 添加一些数据
      store.history = [{
        id: 'test-1',
        input: '/read test.txt',
        result: mockResult,
        timestamp: Date.now(),
        latencyMs: 0.5,
      }];
      store.submitFeedback('test', mockResult, true);

      // 重置
      store.reset();

      // 验证所有状态都已重置
      const state = useToolClassificationStore.getState();
      expect(state.history).toHaveLength(0);
      expect(state.currentResult).toBeNull();
      expect(state.currentInput).toBe('');
      expect(state.isClassifying).toBe(false);
      expect(state.error).toBeNull();
      expect(state.feedback).toHaveLength(0);
    });
  });
});
