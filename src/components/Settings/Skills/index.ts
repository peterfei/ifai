/**
 * 技能系统 UI 组件导出
 * Phase 7: 完整 UI 重构
 */

// 主要组件
export { SkillsManagement } from './SkillsManagement';
export { SkillInstaller } from './SkillInstaller';
export { SkillEditor } from './SkillEditor';

// 子组件
export { SkillDetailPanel } from './SkillDetailPanel';
export { SkillSearchBar, TagCloud } from './SkillSearchBar';
export { SkillStateIndicator, StateStatsCard, StateTransitionDiagram } from './SkillStateIndicator';

// 类型定义
export type {
  Skill,
  SkillState,
  SkillStateType,
  MarketplaceSkill,
  SkillEditorMode,
  SkillValidationError,
  SkillsUIState,
  SkillOperation,
  SkillStats,
  SkillActivity,
  SkillDependencyNode,
} from './types';

// Store
export { useSkillStore } from '@/stores/skillStore';
