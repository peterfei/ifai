/**
 * PALETTE + derivePalette 单元测试
 *
 * 测试覆盖：
 * - UT-A.1.1: SEMANTIC_TOKENS 定义验证
 * - UT-A.1.2: derivePalette 返回四件套
 * - UT-A.1.3: AGENT_PALETTE 正确派生
 * - UT-A.1.4: RISK_PALETTE 正确派生
 * - UT-A.1.5: STATUS_PALETTE 正确派生
 * - UT-A.1.6: TAG_PALETTE 正确派生
 * - UT-A.1.7: 未定义的语义色返回安全降级
 */

import { describe, it, expect } from 'vitest';
import {
  SEMANTIC_TOKENS,
  derivePalette,
  AGENT_PALETTE,
  RISK_PALETTE,
  STATUS_PALETTE,
  AGENT_STATUS_PALETTE,
  TAG_PALETTE,
} from '../PALETTE';

describe('PALETTE + derivePalette', () => {
  describe('UT-A.1.1: SEMANTIC_TOKENS 定义', () => {
    it('应包含 6 个语义色', () => {
      expect(SEMANTIC_TOKENS.semantic).toBeDefined();
      expect(SEMANTIC_TOKENS.semantic.success).toBe('#10B981');
      expect(SEMANTIC_TOKENS.semantic.warning).toBe('#F59E0B');
      expect(SEMANTIC_TOKENS.semantic.danger).toBe('#EF4444');
      expect(SEMANTIC_TOKENS.semantic.info).toBe('#3B82F6');
      expect(SEMANTIC_TOKENS.semantic.muted).toBe('#9CA3AF');
      expect(SEMANTIC_TOKENS.semantic.neutral).toBe('#6B7280');
    });

    it('应包含 5 个 surface 色系', () => {
      expect(SEMANTIC_TOKENS.surface).toBeDefined();
      expect(SEMANTIC_TOKENS.surface.bg0).toBe('#000000');
      expect(SEMANTIC_TOKENS.surface.bg1).toBe('#1E1E1E');
      expect(SEMANTIC_TOKENS.surface.bg2).toBe('#1F2937');
      expect(SEMANTIC_TOKENS.surface.bg3).toBe('#2D2D2D');
      expect(SEMANTIC_TOKENS.surface.border).toBe('#2D2D2D');
    });
  });

  describe('UT-A.1.2: derivePalette 返回四件套', () => {
    it('应从单个语义色派生完整样式对象', () => {
      const palette = derivePalette({ primary: 'info' });

      expect(palette.primary).toBeDefined();
      expect(palette.primary).toHaveProperty('bg');
      expect(palette.primary).toHaveProperty('text');
      expect(palette.primary).toHaveProperty('border');
      expect(palette.primary).toHaveProperty('dot');
    });

    it('四件套颜色值应与语义色匹配', () => {
      const palette = derivePalette({ test: 'success' });

      expect(palette.test.bg).toBe('#10B981');
      expect(palette.test.text).toBe('#10B981');
      expect(palette.test.border).toBe('#10B981');
      expect(palette.test.dot).toBe('#10B981');
    });

    it('应支持多个键同时派生', () => {
      const palette = derivePalette({
        low: 'success',
        medium: 'warning',
        high: 'danger',
      });

      expect(palette.low.bg).toBe('#10B981');
      expect(palette.medium.bg).toBe('#F59E0B');
      expect(palette.high.bg).toBe('#EF4444');
    });
  });

  describe('UT-A.1.3: AGENT_PALETTE 正确派生', () => {
    it('应包含 7 个 Agent 类型', () => {
      expect(Object.keys(AGENT_PALETTE)).toHaveLength(7);
      expect(AGENT_PALETTE).toHaveProperty('explore');
      expect(AGENT_PALETTE).toHaveProperty('review');
      expect(AGENT_PALETTE).toHaveProperty('test');
      expect(AGENT_PALETTE).toHaveProperty('doc');
      expect(AGENT_PALETTE).toHaveProperty('refactor');
      expect(AGENT_PALETTE).toHaveProperty('proposal');
      expect(AGENT_PALETTE).toHaveProperty('task');
    });

    it('explore 应使用 info 蓝色', () => {
      expect(AGENT_PALETTE.explore.bg).toBe('#3B82F6');
      expect(AGENT_PALETTE.explore.text).toBe('#3B82F6');
      expect(AGENT_PALETTE.explore.border).toBe('#3B82F6');
      expect(AGENT_PALETTE.explore.dot).toBe('#3B82F6');
    });

    it('review 应使用 warning 橙色', () => {
      expect(AGENT_PALETTE.review.bg).toBe('#F59E0B');
      expect(AGENT_PALETTE.review.text).toBe('#F59E0B');
    });

    it('test 应使用 success 绿色', () => {
      expect(AGENT_PALETTE.test.bg).toBe('#10B981');
      expect(AGENT_PALETTE.test.text).toBe('#10B981');
    });

    it('doc 应使用 info 蓝色', () => {
      expect(AGENT_PALETTE.doc.bg).toBe('#3B82F6');
      expect(AGENT_PALETTE.doc.text).toBe('#3B82F6');
    });

    it('refactor 应使用 warning 橙色', () => {
      expect(AGENT_PALETTE.refactor.bg).toBe('#F59E0B');
      expect(AGENT_PALETTE.refactor.text).toBe('#F59E0B');
    });

    it('proposal 应使用 cyan 青色', () => {
      expect(AGENT_PALETTE.proposal.bg).toBe('#06B6D4');
      expect(AGENT_PALETTE.proposal.text).toBe('#06B6D4');
    });

    it('task 应使用 pink 粉色', () => {
      expect(AGENT_PALETTE.task.bg).toBe('#EC4899');
      expect(AGENT_PALETTE.task.text).toBe('#EC4899');
    });
  });

  describe('UT-A.1.4: RISK_PALETTE 正确派生', () => {
    it('应包含 3 个风险等级', () => {
      expect(Object.keys(RISK_PALETTE)).toHaveLength(3);
      expect(RISK_PALETTE).toHaveProperty('low');
      expect(RISK_PALETTE).toHaveProperty('medium');
      expect(RISK_PALETTE).toHaveProperty('high');
    });

    it('low 风险应使用 success 绿色', () => {
      expect(RISK_PALETTE.low.bg).toBe('#10B981');
      expect(RISK_PALETTE.low.text).toBe('#10B981');
    });

    it('medium 风险应使用 warning 橙色', () => {
      expect(RISK_PALETTE.medium.bg).toBe('#F59E0B');
      expect(RISK_PALETTE.medium.text).toBe('#F59E0B');
    });

    it('high 风险应使用 danger 红色', () => {
      expect(RISK_PALETTE.high.bg).toBe('#EF4444');
      expect(RISK_PALETTE.high.text).toBe('#EF4444');
    });
  });

  describe('UT-A.1.5: STATUS_PALETTE 正确派生', () => {
    it('应包含 3 个状态', () => {
      expect(Object.keys(STATUS_PALETTE)).toHaveLength(3);
      expect(STATUS_PALETTE).toHaveProperty('active');
      expect(STATUS_PALETTE).toHaveProperty('completed');
      expect(STATUS_PALETTE).toHaveProperty('pending');
    });

    it('active 状态应使用 success 绿色', () => {
      expect(STATUS_PALETTE.active.bg).toBe('#10B981');
    });

    it('completed 状态应使用 neutral 灰色', () => {
      expect(STATUS_PALETTE.completed.bg).toBe('#6B7280');
    });

    it('pending 状态应使用 warning 橙色', () => {
      expect(STATUS_PALETTE.pending.bg).toBe('#F59E0B');
    });
  });

  describe('UT-A.1.6: TAG_PALETTE 正确派生', () => {
    it('应包含 5 个标签颜色', () => {
      expect(Object.keys(TAG_PALETTE)).toHaveLength(5);
      expect(TAG_PALETTE).toHaveProperty('brand');
      expect(TAG_PALETTE).toHaveProperty('amber');
      expect(TAG_PALETTE).toHaveProperty('emerald');
      expect(TAG_PALETTE).toHaveProperty('red');
      expect(TAG_PALETTE).toHaveProperty('default');
    });

    it('brand 标签应使用 info 蓝色', () => {
      expect(TAG_PALETTE.brand.bg).toBe('#3B82F6');
      expect(TAG_PALETTE.brand.text).toBe('#3B82F6');
    });

    it('amber 标签应使用 warning 橙色', () => {
      expect(TAG_PALETTE.amber.bg).toBe('#F59E0B');
    });

    it('emerald 标签应使用 success 绿色', () => {
      expect(TAG_PALETTE.emerald.bg).toBe('#10B981');
    });

    it('red 标签应使用 danger 红色', () => {
      expect(TAG_PALETTE.red.bg).toBe('#EF4444');
    });

    it('default 标签应使用 muted 灰色', () => {
      expect(TAG_PALETTE.default.bg).toBe('#9CA3AF');
    });
  });

  describe('UT-A.1.7: 未定义的语义色安全降级', () => {
    it('未知语义色应返回 neutral 灰色', () => {
      const palette = derivePalette({ unknown: 'nonexistent' as any });

      // 安全降级到 neutral 颜色
      expect(palette.unknown.bg).toBe('#6B7280');
      expect(palette.unknown.text).toBe('#6B7280');
      expect(palette.unknown.border).toBe('#6B7280');
      expect(palette.unknown.dot).toBe('#6B7280');
    });
  });

  describe('UT-A.1.8: AGENT_STATUS_PALETTE 正确派生', () => {
    it('应覆盖 7 种 Agent 状态', () => {
      const keys = Object.keys(AGENT_STATUS_PALETTE);
      expect(keys).toHaveLength(7);
      expect(keys).toContain('running');
      expect(keys).toContain('completed');
      expect(keys).toContain('failed');
      expect(keys).toContain('initializing');
      expect(keys).toContain('idle');
      expect(keys).toContain('waitingfortool');
      expect(keys).toContain('stopped');
    });

    it('running 应使用 info 蓝色', () => {
      expect(AGENT_STATUS_PALETTE.running.bg).toBe('#3B82F6');
    });

    it('completed 应使用 success 绿色', () => {
      expect(AGENT_STATUS_PALETTE.completed.bg).toBe('#10B981');
    });

    it('failed 应使用 danger 红色', () => {
      expect(AGENT_STATUS_PALETTE.failed.bg).toBe('#EF4444');
    });

    it('每种状态有完整的 ColorQuad', () => {
      for (const [, quad] of Object.entries(AGENT_STATUS_PALETTE)) {
        expect(quad.bg).toBeTruthy();
        expect(quad.text).toBeTruthy();
        expect(quad.border).toBeTruthy();
        expect(quad.dot).toBeTruthy();
      }
    });
  });
});
