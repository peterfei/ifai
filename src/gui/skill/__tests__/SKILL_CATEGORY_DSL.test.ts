/**
 * SKILL_CATEGORY_DSL 单元测试
 *
 * 测试覆盖 Phase A 全部 13 个用例：
 * - DSL 8 分类定义
 * - 查询函数
 * - inferCategory 推断（标签/ID/旧分类/fallback）
 * - getSkillsByCategory 过滤
 */

import { describe, it, expect } from 'vitest';
import {
  getAllCategories,
  getCategory,
  getCategoryPills,
  inferCategory,
  getSkillsByCategory,
} from '../SKILL_CATEGORY_DSL';

describe('SKILL_CATEGORY_DSL', () => {
  // ─── 1: DSL 定义 8 个分类 ───
  describe('分类定义', () => {
    it('getAllCategories 返回 7 个分类（不含 all）', () => {
      const cats = getAllCategories();
      expect(cats.length).toBe(7);
    });

    // ─── 2: each 分类有完整字段 ───
    it('每个分类有完整字段：id/label/icon/color/order', () => {
      const cats = getAllCategories();
      cats.forEach((cat) => {
        expect(cat).toHaveProperty('id');
        expect(cat).toHaveProperty('label');
        expect(cat).toHaveProperty('icon');
        expect(cat).toHaveProperty('color');
        expect(cat).toHaveProperty('order');
        expect(typeof cat.id).toBe('string');
        expect(typeof cat.label).toBe('string');
        expect(typeof cat.order).toBe('number');
      });
    });

    // ─── 3: getCategory 查询 ───
    it('getCategory 通过 ID 查询到正确分类', () => {
      const cat = getCategory('testing');
      expect(cat).toBeDefined();
      expect(cat?.label).toBe('测试');
    });

    // ─── 4: 查询不存在返回 undefined ───
    it('查询不存在的 ID 返回 undefined', () => {
      expect(getCategory('invalid')).toBeUndefined();
    });

    // ─── 5: order 排序正确 ───
    it('getAllCategories 按 order 升序排列', () => {
      const cats = getAllCategories();
      for (let i = 1; i < cats.length; i++) {
        expect(cats[i].order).toBeGreaterThan(cats[i - 1].order);
      }
    });

    // ─── 6: 8 色互不相同 ───
    it('所有分类 color 值唯一（不含 all）', () => {
      const cats = getAllCategories();
      const colors = cats.map((c) => c.color);
      expect(new Set(colors).size).toBe(colors.length);
    });

    // ─── 7: getCategoryPills 含"全部" ───
    it('getCategoryPills 返回数组第一项 label 为"全部"', () => {
      const pills = getCategoryPills();
      expect(pills[0].label).toBe('全部');
    });
  });

  // ─── inferCategory 推断 ───
  describe('inferCategory', () => {
    // ─── 8: 通过标签推断 ───
    it('通过 tags 推断分类', () => {
      const result = inferCategory({ tags: ['test', 'e2e', 'jest'] });
      expect(result).toBe('testing');
    });

    // ─── 9: 通过 ID 推断 ───
    it('通过 id 推断分类', () => {
      const result = inferCategory({ id: 'deploy-tool', tags: [] });
      expect(result).toBe('deployment');
    });

    it('通过 id 中的关键词推断', () => {
      const result = inferCategory({ id: 'security-scanner', tags: [] });
      expect(result).toBe('security');
    });

    // ─── 10: 映射旧分类 ───
    it('映射 builtinSkills 旧分类 development → development', () => {
      const result = inferCategory({ category: 'development', tags: [] });
      expect(result).toBe('development');
    });

    it('映射旧分类 pivo → codeReview', () => {
      const result = inferCategory({ category: 'pivo', tags: [] });
      expect(result).toBe('codeReview');
    });

    it('映射旧分类 ai → development', () => {
      const result = inferCategory({ category: 'ai', tags: [] });
      expect(result).toBe('development');
    });

    it('映射旧分类 automation → deployment', () => {
      const result = inferCategory({ category: 'automation', tags: [] });
      expect(result).toBe('deployment');
    });

    // ─── 11: fallback ───
    it('无法推断时返回 development 作为 fallback', () => {
      const result = inferCategory({ id: 'zzz-unknown', tags: [] });
      expect(result).toBe('development');
    });
  });

  // ─── getSkillsByCategory 过滤 ───
  describe('getSkillsByCategory', () => {
    const mockSkills = [
      { id: 'code-check', name: 'Code Check', tags: ['code-review'], category: 'development' },
      { id: 'jest-gen', name: 'Jest Gen', tags: ['test'], category: 'testing' },
      { id: 'doc-gen', name: 'Doc Gen', tags: ['documentation'], category: 'documentation' },
    ];

    // ─── 12: 过滤匹配 ───
    it('按分类过滤返回匹配的技能', () => {
      const result = getSkillsByCategory(mockSkills, 'testing');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('jest-gen');
    });

    // ─── 13: 空结果 ───
    it('不匹配的分类返回空数组', () => {
      const result = getSkillsByCategory(mockSkills, 'security');
      expect(result).toEqual([]);
    });
  });

  // ─── getCategoryPills 返回 8 项 ───
  it('getCategoryPills 返回 8 项（全部 + 7 分类）', () => {
    const pills = getCategoryPills();
    expect(pills.length).toBe(8);
  });
});
