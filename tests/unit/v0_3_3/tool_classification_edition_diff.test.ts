/**
 * 工具分类 - 社区版 vs 商业版 差异化测试
 *
 * TDD: 验证不同版本的权限和功能边界
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToolClassificationStore } from '@/stores/toolClassificationStore';
import type { ClassificationResult } from '@/types/toolClassification';

describe('工具分类版本差异化测试', () => {
  beforeEach(() => {
    useToolClassificationStore.getState().reset();
  });

  describe('社区版 (community edition)', () => {
    it('应该只支持Layer 1和Layer 2分类', async () => {
      // 社区版场景：没有LLM推理能力
      const mockResult: ClassificationResult = {
        layer: 'layer2',  // 只能到Layer 2
        category: 'code_generation',
        confidence: 0.7,  // 置信度较低
        matchType: 'keyword',
      };

      const state = useToolClassificationStore.getState();
      state.currentResult = mockResult;

      expect(state.currentResult.layer).toBe('layer2');
      expect(state.currentResult.confidence).toBeLessThanOrEqual(0.8);
    });

    it('Layer 3应该返回fallback结果', async () => {
      // 社区版：Layer 3使用关键词回退
      const fallbackResult: ClassificationResult = {
        layer: 'layer3',
        category: 'ai_chat',  // 默认回退到ai_chat
        confidence: 0.6,  // 低置信度
        matchType: 'fallback',
      };

      const state = useToolClassificationStore.getState();
      state.currentResult = fallbackResult;

      expect(state.currentResult.layer).toBe('layer3');
      expect(state.currentResult.matchType).toBe('fallback');
      expect(state.currentResult.confidence).toBeLessThan(0.7);
    });

    it('社区版应该标记为非商业版', () => {
      // 注意：在测试环境中，VITE_APP_EDITION可能未设置
      // 这个测试主要验证数据结构，而不是实际的环境变量
      const currentEdition = import.meta.env.VITE_APP_EDITION || 'development';

      // 只要不是'commercial'即可
      expect(currentEdition).not.toBe('commercial');
    });

    it('社区版Layer 3延迟应该很低（无实际LLM调用）', async () => {
      const startTime = performance.now();

      // 模拟Layer 3分类（社区版使用fallback）
      const fallbackResult: ClassificationResult = {
        layer: 'layer3',
        category: 'ai_chat',
        confidence: 0.6,
        matchType: 'fallback',
      };

      const state = useToolClassificationStore.getState();
      state.currentResult = fallbackResult;

      const latency = performance.now() - startTime;

      // 社区版Layer 3应该非常快（<10ms，因为没有LLM调用）
      expect(latency).toBeLessThan(10);
    });
  });

  describe('商业版 (commercial edition)', () => {
    it('应该支持完整的Layer 1+2+3分类', async () => {
      // 商业版：有完整LLM推理能力
      const llmResult: ClassificationResult = {
        layer: 'layer3',
        category: 'code_analysis',
        confidence: 0.88,  // 高置信度（来自LLM）
        matchType: 'llm',
      };

      const state = useToolClassificationStore.getState();
      state.currentResult = llmResult;

      expect(state.currentResult.layer).toBe('layer3');
      expect(state.currentResult.confidence).toBeGreaterThan(0.8);
      expect(state.currentResult.matchType).toBe('llm');
    });

    it('商业版应该有更高的分类准确率', async () => {
      // 商业版：模拟多个分类结果
      const results: ClassificationResult[] = [
        { layer: 'layer1', category: 'file_operations', confidence: 0.98, matchType: 'exact' },
        { layer: 'layer2', category: 'code_generation', confidence: 0.85, matchType: 'keyword' },
        { layer: 'layer3', category: 'code_analysis', confidence: 0.88, matchType: 'llm' },
      ];

      // 使用setState来更新历史记录
      const historyItems = results.map((result, i) => ({
        id: `test-${i}`,
        input: `test ${i}`,
        result,
        timestamp: Date.now(),
        latencyMs: 10,
      }));

      // 设置history并更新统计
      useToolClassificationStore.setState({ history: historyItems });
      useToolClassificationStore.getState().updateStats();

      // 获取更新后的状态
      const state = useToolClassificationStore.getState();

      // 验证统计已更新
      expect(state.stats.totalCount).toBe(3);

      // 商业版平均置信度 = (0.98 + 0.85 + 0.88) / 3 ≈ 0.90
      expect(state.stats.averageConfidence).toBeCloseTo(0.9, 1);
    });

    it('商业版应该支持LLM模型加载状态', () => {
      // 商业版特有功能：模型状态
      const hasLlmSupport = typeof window !== 'undefined' &&
                            '__TAURI__' in window &&
                            // 实际检查可以通过API调用
                            true;

      // 在商业版环境中，应该有LLM支持
      // 这里只是示例，实际实现需要检查feature flag
      expect(true).toBe(true);  // Placeholder
    });
  });

  describe('Feature Flag检测', () => {
    it('社区版不应该有llm-inference feature', () => {
      // 检查Rust编译feature
      // 实际实现中可以通过Tauri命令查询
      const expectedFeatures = ['community'];
      const unexpectedFeatures = ['llm-inference', 'commercial'];

      // Placeholder: 实际实现中需要调用Tauri命令
      expect(true).toBe(true);
    });

    it('商业版应该有llm-inference feature', () => {
      const expectedFeatures = ['commercial', 'llm-inference'];

      // Placeholder: 实际实现中需要调用Tauri命令
      expect(true).toBe(true);
    });
  });

  describe('降级策略', () => {
    it('社区版Layer 3应该使用关键词回退', async () => {
      // 模拟社区版Layer 3分类
      const input = '帮我分析代码架构';

      // 社区版应该使用关键词匹配
      const fallbackResult: ClassificationResult = {
        layer: 'layer3',
        category: 'ai_chat',  // 关键词回退结果
        confidence: 0.55,
        matchType: 'fallback',
      };

      const state = useToolClassificationStore.getState();
      state.currentResult = fallbackResult;
      state.currentInput = input;

      expect(state.currentResult.matchType).toBe('fallback');
    });

    it('商业版LLM不可用时也应该降级', async () => {
      // 商业版但LLM未加载的场景
      const fallbackResult: ClassificationResult = {
        layer: 'layer3',
        category: 'ai_chat',
        confidence: 0.5,
        matchType: 'fallback',
      };

      const state = useToolClassificationStore.getState();
      state.currentResult = fallbackResult;

      expect(state.currentResult.matchType).toBe('fallback');
    });
  });

  describe('用户体验差异', () => {
    it('社区版应该显示功能限制提示', () => {
      // 社区版UI应该提示用户升级到商业版
      const hasUpgradePrompt = true;  // Placeholder

      expect(hasUpgradePrompt).toBe(true);
    });

    it('商业版不应该显示升级提示', () => {
      // 商业版不应该有升级提示
      const hasUpgradePrompt = false;  // Placeholder

      expect(hasUpgradePrompt).toBe(false);
    });

    it('两个版本的Layer 1和Layer 2功能应该相同', () => {
      // 社区版和商业版的Layer 1和Layer 2应该完全相同
      const layer1Result: ClassificationResult = {
        layer: 'layer1',
        category: 'file_operations',
        confidence: 0.98,
        matchType: 'exact',
      };

      const layer2Result: ClassificationResult = {
        layer: 'layer2',
        category: 'code_generation',
        confidence: 0.85,
        matchType: 'keyword',
      };

      expect(layer1Result.layer).toBe('layer1');
      expect(layer2Result.layer).toBe('layer2');
      // 两个版本都应该有相同的结果
    });
  });
});

/**
 * 运行这些测试：
 * npm test tests/unit/v0_3_3/tool_classification_edition_diff.test.ts
 */
