/**
 * IfAI 技能系统 UI - 类型定义
 * Phase 7: 完整 UI 重构
 */

// ==================== 技能基础类型 ====================

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  system_prompt: string;
  author?: string;
  tags: string[];
  dependencies: string[];
  compatibility?: string;
  state: SkillState;
  source?: SkillSource;
}

export type SkillState =
  | { type: 'NotInstalled' }
  | { type: 'Installing'; progress: number }
  | { type: 'Installed'; version: string }
  | { type: 'Active' }
  | { type: 'Inactive' }
  | { type: 'Uninstalling' }
  | { type: 'Error'; message: string };

export type SkillSource = 'json' | 'markdown' | 'yaml';

// ==================== UI 状态类型 ====================

export interface SkillsUIState {
  selectedSkill: string | null;
  searchQuery: string;
  selectedTags: string[];
  stateFilter: SkillStateType | 'all';
  sortBy: SkillSortBy;
  sortOrder: 'asc' | 'desc';
  viewMode: 'grid' | 'list';
  showDetails: boolean;
  isEditorOpen: boolean;
  isInstallerOpen: boolean;
  editingSkill: Skill | null;
}

export type SkillStateType = 'installed' | 'active' | 'inactive' | 'error';

export type SkillSortBy = 'name' | 'version' | 'status' | 'author';

// ==================== 技能操作类型 ====================

export interface SkillOperation {
  type: 'install' | 'uninstall' | 'activate' | 'deactivate' | 'update';
  skillId: string;
  version?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

// ==================== 技能统计类型 ====================

export interface SkillStats {
  total: number;
  active: number;
  installed: number;
  error: number;
  byTag: Record<string, number>;
  recentActivity: SkillActivity[];
}

export interface SkillActivity {
  id: string;
  skillId: string;
  action: string;
  timestamp: number;
  user?: string;
}

// ==================== 技能编辑器类型 ====================

export interface SkillEditorMode {
  type: 'create' | 'edit' | 'view';
  skill?: Skill;
}

export interface SkillValidationError {
  field: keyof Skill;
  message: string;
}

// ==================== 技能依赖类型 ====================

export interface SkillDependencyNode {
  id: string;
  name: string;
  state: SkillState;
  dependencies: string[];
  dependents: string[];
  level: number;
}

// ==================== 技能市场类型 ====================

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  downloads: number;
  rating: number;
  tags: string[];
  source: 'official' | 'community';
}

// ==================== 技能模板类型 ====================

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: Partial<Skill>;
}

// ==================== API 调用类型 ====================

export interface SkillAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface InstalledSkillInfo {
  id: string;
  name: string;
  version: string;
  installedAt: number;
}
