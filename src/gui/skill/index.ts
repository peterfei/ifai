/**
 * skill — 技能广场组件库
 *
 * 统一导出入口
 */

// SKILL_CATEGORY_DSL
export {
  getCategory,
  getAllCategories,
  getCategoryPills,
  inferCategory,
  getSkillsByCategory,
} from './SKILL_CATEGORY_DSL';
export type { SkillCategory, Categorizable } from './SKILL_CATEGORY_DSL';

// utils
export { highlightText } from './utils';
export type { TextSegment } from './utils';

// Phase B: 原子组件
export { CompactSkillCard } from './CompactSkillCard';
export type { CompactSkillCardProps, DisplaySkill } from './CompactSkillCard';

export { RecommendCard } from './RecommendCard';
export type { RecommendCardProps, RecommendSkill } from './RecommendCard';

export { CategoryPills } from './CategoryPills';
export type { CategoryPillsProps } from './CategoryPills';

export { HeaderSearchBar } from './HeaderSearchBar';
export type { HeaderSearchBarProps } from './HeaderSearchBar';

export { SortSelector } from './SortSelector';
export type { SortSelectorProps, SortOption } from './SortSelector';

export { SkillMarketFooter } from './SkillMarketFooter';
export type { SkillMarketFooterProps } from './SkillMarketFooter';
