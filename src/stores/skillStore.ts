/**
 * IfAI 技能系统 - 增强状态管理
 * Phase 7: 完整 UI 重构
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from './fileStore';
import type {
  Skill,
  SkillState,
  SkillsUIState,
  SkillOperation,
  SkillStats,
  SkillDependencyNode,
  SkillEditorMode,
} from '../components/Settings/Skills/types';

// ==================== 全局同步 ====================

const syncToGlobal = (ids: string[]) => {
  if (typeof window !== 'undefined') {
    (window as any).__IFAI_ACTIVE_SKILLS__ = ids;
    console.log('[SkillStore] Persistent Global Sync:', ids);
  }
};

// ==================== 增强的 Store ====================

interface EnhancedSkillStore {
  // 数据
  availableSkills: Skill[];
  activeSkillIds: string[];
  operations: SkillOperation[];

  // UI 状态
  ui: SkillsUIState;

  // 加载状态
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // 统计
  stats: SkillStats | null;

  // ==================== 数据获取 ====================

  fetchSkills: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  getSkillById: (id: string) => Skill | undefined;
  getSkillsByState: (state: SkillState['type']) => Skill[];

  // ==================== 技能操作 ====================

  toggleSkill: (id: string) => void;
  activateSkill: (id: string) => Promise<void>;
  deactivateSkill: (id: string) => Promise<void>;
  installSkill: (id: string, version?: string, skillData?: Record<string, unknown>) => Promise<void>;
  uninstallSkill: (id: string) => Promise<void>;

  // ==================== 批量操作 ====================

  activateMultiple: (ids: string[]) => Promise<void>;
  deactivateMultiple: (ids: string[]) => Promise<void>;
  installMultiple: (specs: Array<{ id: string; version?: string }>) => Promise<void>;

  // ==================== 单个技能操作 ====================

  toggleActive: (id: string) => Promise<void>;

  // ==================== UI 操作 ====================

  setSelectedSkill: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTags: (tags: string[]) => void;
  setStateFilter: (filter: SkillsUIState['stateFilter']) => void;
  setSortBy: (sortBy: SkillsUIState['sortBy']) => void;
  setViewMode: (mode: SkillsUIState['viewMode']) => void;
  toggleDetails: () => void;
  openEditor: (skill?: Skill) => void;
  closeEditor: () => void;
  openInstaller: () => void;
  closeInstaller: () => void;

  // ==================== 搜索和筛选 ====================

  getFilteredSkills: () => Skill[];
  getSortedSkills: (skills: Skill[]) => Skill[];

  // ==================== 技能统计 ====================

  updateStats: () => Promise<void>;
  getInstalledCount: () => number;
  getSkillsByCategory: () => Record<string, Skill[]>;

  // ==================== 依赖关系 ====================

  getDependencyGraph: () => SkillDependencyNode[];
  checkDependencies: (id: string) => {
    satisfied: boolean;
    missing: string[];
    circular: string[];
  };

  // ==================== 编辑操作 ====================

  createSkill: (skill: Omit<Skill, 'state'>) => Promise<void>;
  updateSkill: (id: string, updates: Partial<Skill>) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;

  // ==================== 重置 ====================

  reset: () => void;
}

// ==================== localStorage 迁移 ====================

const LEGACY_KEY = 'ifai-skill-storage';
const CURRENT_KEY = 'ifai-skill-storage-enhanced';

function migrateLegacyStorage() {
  if (typeof window === 'undefined') return;
  const currentData = localStorage.getItem(CURRENT_KEY);
  if (currentData) return;

  const legacyData = localStorage.getItem(LEGACY_KEY);
  if (!legacyData) return;

  try {
    const parsed = JSON.parse(legacyData);
    if (parsed?.state?.activeSkillIds) {
      const newData = {
        state: {
          activeSkillIds: parsed.state.activeSkillIds,
          ui: {
            selectedSkill: null,
            searchQuery: '',
            selectedTags: [],
            stateFilter: 'all',
            sortBy: 'name',
            sortOrder: 'asc',
            viewMode: 'grid',
          },
        },
        version: 0,
      };
      localStorage.setItem(CURRENT_KEY, JSON.stringify(newData));
      console.log('[SkillStore] localStorage migrated from', LEGACY_KEY, 'to', CURRENT_KEY);
    }
  } catch (e) {
    console.warn('[SkillStore] localStorage migration failed:', e);
  }
}

migrateLegacyStorage();

// ==================== Store 定义 ====================

export const useSkillStore = create<EnhancedSkillStore>()(
  persist(
    (set, get) => ({
      // ==================== 初始状态 ====================

      availableSkills: [],
      activeSkillIds: [],
      operations: [],

      ui: {
        selectedSkill: null,
        searchQuery: '',
        selectedTags: [],
        stateFilter: 'all',
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        showDetails: false,
        isEditorOpen: false,
        isInstallerOpen: false,
        editingSkill: null,
      },

      isLoading: false,
      isRefreshing: false,
      error: null,
      stats: null,

      // ==================== 数据获取 ====================

      fetchSkills: async () => {
        const rootPath = useFileStore.getState().rootPath;
        if (!rootPath) return;

        set({ isLoading: true, error: null });
        try {
          const skills = await invoke<Skill[]>('get_available_skills', {
            projectRoot: rootPath,
          });

          // 为每个技能设置默认状态
          const skillsWithState: Skill[] = skills.map(skill => ({
            ...skill,
            state: get().activeSkillIds.includes(skill.id)
              ? { type: 'Active' }
              : { type: 'NotInstalled' },
          }));

          set({
            availableSkills: skillsWithState,
            isLoading: false,
          });

          await get().updateStats();
        } catch (e) {
          set({ error: String(e), isLoading: false });
        }
      },

      refreshSkills: async () => {
        set({ isRefreshing: true });
        try {
          await get().fetchSkills();
        } finally {
          set({ isRefreshing: false });
        }
      },

      getSkillById: (id: string) => {
        return get().availableSkills.find(s => s.id === id);
      },

      getSkillsByState: (state: SkillState['type']) => {
        return get().availableSkills.filter(s => s.state.type === state);
      },

      // ==================== 技能操作 ====================

      toggleSkill: (id: string) => {
        const { activeSkillIds } = get();
        const next = activeSkillIds.includes(id)
          ? activeSkillIds.filter(sid => sid !== id)
          : [...activeSkillIds, id];
        set({ activeSkillIds: next });
        syncToGlobal(next);
      },

      activateSkill: async (id: string) => {
        const rootPath = useFileStore.getState().rootPath;
        if (!rootPath) return;

        // 🔥 设置loading状态
        set({ isLoading: true });

        try {
          await invoke('activate_skill', { projectRoot: rootPath, skillId: id });
          // 更新本地状态：添加到激活列表
          const { activeSkillIds } = get();
          if (!activeSkillIds.includes(id)) {
            const next = [...activeSkillIds, id];
            set({ activeSkillIds: next });
            syncToGlobal(next);
          }
        } catch (e) {
          set({ error: String(e) });
        } finally {
          // 🔥 清除loading状态
          set({ isLoading: false });
        }
      },

      deactivateSkill: async (id: string) => {
        const rootPath = useFileStore.getState().rootPath;
        if (!rootPath) return;

        // 🔥 设置loading状态
        set({ isLoading: true });

        try {
          await invoke('deactivate_skill', { projectRoot: rootPath, skillId: id });
          // 更新本地状态：从激活列表中移除
          const { activeSkillIds } = get();
          const next = activeSkillIds.filter(sid => sid !== id);
          set({ activeSkillIds: next });
          syncToGlobal(next);
        } catch (e) {
          set({ error: String(e) });
        } finally {
          // 🔥 清除loading状态
          set({ isLoading: false });
        }
      },

      installSkill: async (id: string, version?: string, skillData?: Record<string, unknown>) => {
        const operation: SkillOperation = {
          type: 'install',
          skillId: id,
          version,
          status: 'in-progress',
          progress: 0,
        };

        set({ operations: [...get().operations, operation] });

        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) throw new Error('No project root');

          // 传递完整技能数据，让 Rust 后端写入 skill.md / skill.json 到磁盘
          await invoke('install_skill', {
            projectRoot: rootPath,
            skillId: id,
            version,
            source: 'local',
            skillData,
          });

          // 更新操作状态
          set({
            operations: get().operations.map(op =>
            op.skillId === id ? { ...op, status: 'completed', progress: 100 } : op
            ),
          });

          // 将技能 ID 加入 activeSkillIds，确保 UI 反应式更新
          const { activeSkillIds } = get();
          if (!activeSkillIds.includes(id)) {
            const next = [...activeSkillIds, id];
            set({ activeSkillIds: next });
            syncToGlobal(next);
          }

          await get().refreshSkills();
        } catch (e) {
          set({
            operations: get().operations.map(op =>
              op.skillId === id ? { ...op, status: 'failed', error: String(e) } : op
            ),
            error: String(e),
          });
        }
      },

      uninstallSkill: async (id: string) => {
        const operation: SkillOperation = {
          type: 'uninstall',
          skillId: id,
          status: 'in-progress',
        };

        set({ operations: [...get().operations, operation] });

        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) throw new Error('No project root');

          await invoke('uninstall_skill', {
            projectRoot: rootPath,
            skillId: id,
          });

          set({
            operations: get().operations.map(op =>
              op.skillId === id ? { ...op, status: 'completed' } : op
            ),
          });

          // 从 activeSkillIds 中移除，确保 UI 反应式更新
          const { activeSkillIds } = get();
          const next = activeSkillIds.filter((sid) => sid !== id);
          set({ activeSkillIds: next });
          syncToGlobal(next);

          await get().refreshSkills();
        } catch (e) {
          set({
            operations: get().operations.map(op =>
              op.skillId === id ? { ...op, status: 'failed', error: String(e) } : op
            ),
            error: String(e),
          });
        }
      },

      // ==================== 批量操作 ====================

      activateMultiple: async (ids: string[]) => {
        for (const id of ids) {
          await get().activateSkill(id);
        }
      },

      deactivateMultiple: async (ids: string[]) => {
        for (const id of ids) {
          await get().deactivateSkill(id);
        }
      },

      // ==================== 单个技能操作 ====================

      toggleActive: async (id: string) => {
        const isActive = get().activeSkillIds.includes(id);
        if (isActive) {
          await get().deactivateSkill(id);
        } else {
          await get().activateSkill(id);
        }
      },

      installMultiple: async (specs) => {
        for (const spec of specs) {
          await get().installSkill(spec.id, spec.version);
        }
      },

      // ==================== UI 操作 ====================

      setSelectedSkill: (id: string | null) => {
        set({ ui: { ...get().ui, selectedSkill: id } });
      },

      setSearchQuery: (query: string) => {
        set({ ui: { ...get().ui, searchQuery: query } });
      },

      setSelectedTags: (tags: string[]) => {
        set({ ui: { ...get().ui, selectedTags: tags } });
      },

      setStateFilter: (filter) => {
        set({ ui: { ...get().ui, stateFilter: filter } });
      },

      setSortBy: (sortBy) => {
        set({ ui: { ...get().ui, sortBy } });
      },

      setViewMode: (mode) => {
        set({ ui: { ...get().ui, viewMode: mode } });
      },

      toggleDetails: () => {
        set({ ui: { ...get().ui, showDetails: !get().ui.showDetails } });
      },

      openEditor: (skill?: Skill) => {
        set({
          ui: {
            ...get().ui,
            isEditorOpen: true,
            editingSkill: skill || null,
          },
        });
      },

      closeEditor: () => {
        set({
          ui: {
            ...get().ui,
            isEditorOpen: false,
            editingSkill: null,
          },
        });
      },

      openInstaller: () => {
        set({ ui: { ...get().ui, isInstallerOpen: true } });
      },

      closeInstaller: () => {
        set({ ui: { ...get().ui, isInstallerOpen: false } });
      },

      // ==================== 搜索和筛选 ====================

      getFilteredSkills: () => {
        const { availableSkills, ui } = get();
        let filtered = [...availableSkills];

        // 搜索过滤
        if (ui.searchQuery) {
          const query = ui.searchQuery.toLowerCase();
          filtered = filtered.filter(skill =>
            skill.name.toLowerCase().includes(query) ||
            skill.id.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query)
          );
        }

        // 标签过滤
        if (ui.selectedTags.length > 0) {
          filtered = filtered.filter(skill =>
            ui.selectedTags.some(tag => skill.tags.includes(tag))
          );
        }

        // 状态过滤
        if (ui.stateFilter !== 'all') {
          filtered = filtered.filter(skill => {
            switch (ui.stateFilter) {
              case 'active':
                return skill.state.type === 'Active';
              case 'installed':
                return skill.state.type === 'Installed' || skill.state.type === 'Active';
              case 'inactive':
                return skill.state.type === 'Inactive' || skill.state.type === 'NotInstalled';
              case 'error':
                return skill.state.type === 'Error';
              default:
                return true;
            }
          });
        }

        return get().getSortedSkills(filtered);
      },

      getSortedSkills: (skills: Skill[]) => {
        const { ui } = get();
        const sorted = [...skills];

        sorted.sort((a, b) => {
          let comparison = 0;

          switch (ui.sortBy) {
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
            case 'version':
              comparison = a.version.localeCompare(b.version);
              break;
            case 'status':
              const stateOrder = ['Active', 'Inactive', 'Installed', 'NotInstalled', 'Error'];
              comparison =
                stateOrder.indexOf(a.state.type) - stateOrder.indexOf(b.state.type);
              break;
            case 'author':
              comparison = (a.author || '').localeCompare(b.author || '');
              break;
          }

          return ui.sortOrder === 'asc' ? comparison : -comparison;
        });

        return sorted;
      },

      // ==================== 技能统计 ====================

      updateStats: async () => {
        const { availableSkills, activeSkillIds } = get();

        // 计算标签统计
        const byTag: Record<string, number> = {};
        availableSkills.forEach(skill => {
          skill.tags.forEach(tag => {
            byTag[tag] = (byTag[tag] || 0) + 1;
          });
        });

        const stats: SkillStats = {
          total: availableSkills.length,
          active: activeSkillIds.length,
          installed: availableSkills.filter(s =>
            s.state.type === 'Installed' || s.state.type === 'Active'
          ).length,
          error: availableSkills.filter(s => s.state.type === 'Error').length,
          byTag,
          recentActivity: [],
        };

        set({ stats });
      },

      getInstalledCount: () => {
        return get().stats?.installed ?? 0;
      },

      getSkillsByCategory: () => {
        const { availableSkills } = get();
        const result: Record<string, Skill[]> = {};
        availableSkills.forEach(skill => {
          skill.tags.forEach(tag => {
            if (!result[tag]) result[tag] = [];
            result[tag].push(skill);
          });
        });
        return result;
      },

      // ==================== 依赖关系 ====================

      getDependencyGraph: () => {
        const { availableSkills } = get();
        const nodes: SkillDependencyNode[] = [];

        availableSkills.forEach(skill => {
          const dependents = availableSkills
            .filter(s => s.dependencies.includes(skill.id))
            .map(s => s.id);

          nodes.push({
            id: skill.id,
            name: skill.name,
            state: skill.state,
            dependencies: skill.dependencies,
            dependents,
            level: 0, // TODO: 计算层级
          });
        });

        return nodes;
      },

      checkDependencies: (id: string) => {
        const { availableSkills } = get();
        const skill = availableSkills.find(s => s.id === id);

        if (!skill) {
          return { satisfied: false, missing: [], circular: [] };
        }

        const missing = skill.dependencies.filter(depId =>
          !availableSkills.some(s => s.id === depId)
        );

        // TODO: 实现循环检测
        const circular: string[] = [];

        return {
          satisfied: missing.length === 0,
          missing,
          circular,
        };
      },

      // ==================== 编辑操作 ====================

      createSkill: async (skill: Omit<Skill, 'state'>) => {
        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) throw new Error('No project root');

          await invoke('create_skill', {
            projectRoot: rootPath,
            skill: skill,
          });

          await get().refreshSkills();
        } catch (e) {
          set({ error: String(e) });
          throw e;
        }
      },

      updateSkill: async (id: string, updates: Partial<Skill>) => {
        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) throw new Error('No project root');

          await invoke('update_skill', {
            projectRoot: rootPath,
            skillId: id,
            updates: updates,
          });

          await get().refreshSkills();
        } catch (e) {
          set({ error: String(e) });
          throw e;
        }
      },

      deleteSkill: async (id: string) => {
        // TODO: 实现技能删除
        console.log('Deleting skill:', id);
      },

      // ==================== 重置 ====================

      reset: () => {
        set({
          availableSkills: [],
          activeSkillIds: [],
          operations: [],
          error: null,
        });
        syncToGlobal([]);
      },
    }),
    {
      name: 'ifai-skill-storage-enhanced',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSkillIds: state.activeSkillIds,
        ui: {
          selectedSkill: state.ui.selectedSkill,
          searchQuery: state.ui.searchQuery,
          selectedTags: state.ui.selectedTags,
          stateFilter: state.ui.stateFilter,
          sortBy: state.ui.sortBy,
          sortOrder: state.ui.sortOrder,
          viewMode: state.ui.viewMode,
        },
      }),
    }
  )
);
