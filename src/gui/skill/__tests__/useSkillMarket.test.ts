/**
 * useSkillMarket 单元测试
 *
 * 测试覆盖：
 * - 默认选中"全部"
 * - 分类切换过滤
 * - 搜索过滤
 * - 分类+搜索交集
 * - 排序切换
 * - 有搜索时隐藏推荐
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSkillMarket } from '../useSkillMarket';

const mockSkills = [
  { id: 'code-check', name: 'Code Review', description: '审查代码质量', downloads: 5000, rating: 4.5, tags: ['code-review'] },
  { id: 'jest-gen', name: 'Jest Generator', description: '生成测试用例', downloads: 8000, rating: 4.8, tags: ['test'] },
  { id: 'doc-gen', name: 'Doc Generator', description: '生成文档', downloads: 3000, rating: 4.2, tags: ['docs'] },
  { id: 'deploy-tool', name: 'Deploy Tool', description: '自动部署', downloads: 10000, rating: 4.9, tags: ['deploy'] },
];

describe('useSkillMarket', () => {
  // #57: 默认选中"全部"
  it('默认 selectedCategory 为 "all"', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    expect(result.current.selectedCategory).toBe('all');
  });

  it('默认 showRecommend 为 true', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    expect(result.current.showRecommend).toBe(true);
  });

  // #58: 分类切换
  it('切换分类后 filteredSkills 按分类过滤', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setCategory('testing');
    });
    expect(result.current.selectedCategory).toBe('testing');
    // testing 分类应该只匹配 jest-gen
    expect(result.current.filteredSkills.length).toBe(1);
    expect(result.current.filteredSkills[0].id).toBe('jest-gen');
  });

  // #59: 搜索过滤
  it('搜索过滤按名称/描述匹配', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setSearch('deploy');
    });
    // 匹配 "deploy-tool" 和 "自动部署"
    expect(result.current.filteredSkills.length).toBe(1);
    expect(result.current.filteredSkills[0].id).toBe('deploy-tool');
  });

  // #60: 分类+搜索交集
  it('分类和搜索联用做交集过滤', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setCategory('testing');
    });
    act(() => {
      result.current.setSearch('jest');
    });
    // 既是 testing 分类又匹配 "jest"
    expect(result.current.filteredSkills.length).toBe(1);
    expect(result.current.filteredSkills[0].id).toBe('jest-gen');
  });

  it('分类+搜索无交集时返回空', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setCategory('testing');
    });
    act(() => {
      result.current.setSearch('deploy');
    });
    expect(result.current.filteredSkills.length).toBe(0);
  });

  // #61: 排序切换
  it('排序切换更新 sortBy 状态', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setSort('rating');
    });
    expect(result.current.sortBy).toBe('rating');
  });

  it('按 popular 排序时按 downloads 降序', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setSort('popular');
    });
    // 不设置分类和搜索，所有技能按 downloads 降序
    const ids = result.current.filteredSkills.map((s) => s.id);
    expect(ids[0]).toBe('deploy-tool'); // 10000 downloads
    expect(ids[ids.length - 1]).toBe('doc-gen'); // 3000 downloads
  });

  // #62: 有搜索时隐藏推荐
  it('有搜索时 showRecommend 为 false', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setSearch('test');
    });
    expect(result.current.showRecommend).toBe(false);
  });

  it('有分类筛选时 showRecommend 为 false', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setCategory('testing');
    });
    expect(result.current.showRecommend).toBe(false);
  });

  it('清空搜索后 showRecommend 恢复为 true', () => {
    const { result } = renderHook(() => useSkillMarket(mockSkills));
    act(() => {
      result.current.setSearch('test');
    });
    expect(result.current.showRecommend).toBe(false);
    act(() => {
      result.current.setSearch('');
    });
    expect(result.current.showRecommend).toBe(true);
  });
});
