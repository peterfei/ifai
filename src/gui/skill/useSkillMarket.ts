/**
 * useSkillMarket — 技能市场筛选管线 hook
 *
 * 声明式 SKILL_PIPELINE 组合：byCategory → bySearch → bySort
 * 零过程式过滤链。
 */

import { useState, useMemo, useCallback } from 'react';
import { inferCategory } from './SKILL_CATEGORY_DSL';
import type { Categorizable } from './SKILL_CATEGORY_DSL';

// ==================== 类型定义 ====================

export type SortMode = 'popular' | 'newest' | 'rating';

export interface SkillMarketState {
  selectedCategory: string;
  searchQuery: string;
  sortBy: SortMode;
  selectedSkillId: string | null;
}

export interface UseSkillMarketReturn<T extends Categorizable> {
  selectedCategory: string;
  searchQuery: string;
  sortBy: SortMode;
  selectedSkillId: string | null;
  filteredSkills: T[];
  showRecommend: boolean;
  setCategory: (category: string) => void;
  setSearch: (query: string) => void;
  setSort: (sort: SortMode) => void;
  selectSkill: (id: string | null) => void;
}

// ==================== 声明式过滤器 ====================

type SkillFilter<T> = (skills: T[]) => T[];

function byCategory<T extends Categorizable>(categoryId: string): SkillFilter<T> {
  return (skills) =>
    categoryId === 'all'
      ? skills
      : skills.filter((s) => inferCategory(s) === categoryId);
}

function bySearch<T extends Categorizable>(query: string): SkillFilter<T> {
  return (skills) => {
    if (!query) return skills;
    const q = query.toLowerCase();
    return skills.filter(
      (s) =>
        (s.id && s.id.toLowerCase().includes(q)) ||
        (s.name as string)?.toLowerCase().includes(q) ||
        (s.description as string)?.toLowerCase().includes(q)
    );
  };
}

function bySort<T extends Categorizable>(sortBy: SortMode): SkillFilter<T> {
  return (skills) => {
    const sorted = [...skills];
    const sortMap: Record<string, (a: T, b: T) => number> = {
      popular: (a, b) => ((b as any).downloads ?? 0) - ((a as any).downloads ?? 0),
      newest:  (a, b) => ((b as any).createdAt ?? 0) - ((a as any).createdAt ?? 0),
      rating:  (a, b) => ((b as any).rating ?? 0) - ((a as any).rating ?? 0),
    };
    sorted.sort(sortMap[sortBy] ?? sortMap.popular);
    return sorted;
  };
}

// SKILL_PIPELINE 管线组合
function SKILL_PIPELINE<T extends Categorizable>(
  skills: T[],
  filters: SkillFilter<T>[]
): T[] {
  return filters.reduce((acc, fn) => fn(acc), skills);
}

// ==================== Hook ====================

export function useSkillMarket<T extends Categorizable>(
  availableSkills: T[]
): UseSkillMarketReturn<T> {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('popular');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const filteredSkills = useMemo(
    () =>
      SKILL_PIPELINE(availableSkills, [
        byCategory(selectedCategory),
        bySearch(searchQuery),
        bySort(sortBy),
      ]),
    [availableSkills, selectedCategory, searchQuery, sortBy]
  );

  const showRecommend =
    selectedCategory === 'all' && searchQuery.trim() === '';

  const setCategory = useCallback((category: string) => {
    setSelectedCategory(category);
  }, []);

  const setSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const setSort = useCallback((sort: SortMode) => {
    setSortBy(sort);
  }, []);

  const selectSkill = useCallback((id: string | null) => {
    setSelectedSkillId(id);
  }, []);

  return {
    selectedCategory,
    searchQuery,
    sortBy,
    selectedSkillId,
    filteredSkills,
    showRecommend,
    setCategory,
    setSearch,
    setSort,
    selectSkill,
  };
}
