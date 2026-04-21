import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Filter,
  Loader2,
  Puzzle,
  Search,
  ShoppingCart,
  Trash2,
  User,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/fileStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { getSkillStateBadgeClass, getSkillStateFilterOptions, getSkillStateLabel, isInstalledState } from './skillUi';
import type { Skill, SkillState } from '../Settings/Skills/types';

const getDisplayState = (skill: Skill, activeSkillIds: string[]): SkillState['type'] => {
  return activeSkillIds.includes(skill.id) ? 'Active' : skill.state.type;
};

export const SkillsPanel: React.FC = () => {
  const { t } = useTranslation();
  const rootPath = useFileStore(state => state.rootPath);
  const { setSkillMarketOpen } = useLayoutStore();
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [uninstallingSkillId, setUninstallingSkillId] = useState<string | null>(null);
  const [activatingSkillId, setActivatingSkillId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const {
    availableSkills,
    activeSkillIds,
    isLoading,
    ui,
    fetchSkills,
    activateSkill,
    deactivateSkill,
    getFilteredSkills,
    setSearchQuery,
    setStateFilter,
  } = useSkillStore();

  useEffect(() => {
    if (rootPath) {
      fetchSkills();
    }
  }, [fetchSkills, rootPath]);

  useEffect(() => {
    setSearchValue(ui.searchQuery);
  }, [ui.searchQuery]);

  useEffect(() => {
    if (selectedSkillId && !availableSkills.some(skill => skill.id === selectedSkillId)) {
      setSelectedSkillId(null);
    }
  }, [availableSkills, selectedSkillId]);

  const filteredSkills = useMemo(() => getFilteredSkills(), [getFilteredSkills, availableSkills, ui]);
  const selectedSkill = useMemo(
    () => availableSkills.find(skill => skill.id === selectedSkillId) ?? null,
    [availableSkills, selectedSkillId]
  );
  const filterOptions = useMemo(() => getSkillStateFilterOptions(t), [t]);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setSearchQuery(value);
  };

  const handleToggleSkill = async (skill: Skill) => {
    const isActive = activeSkillIds.includes(skill.id);
    setActivatingSkillId(skill.id);

    try {
      if (isActive) {
        toast.loading(t('skillsPanel.toasts.deactivating', { name: skill.name }), {
          id: `skill-toggle-${skill.id}`,
        });
        await deactivateSkill(skill.id);
        toast.success(t('skillsPanel.toasts.deactivated', { name: skill.name }), {
          id: `skill-toggle-${skill.id}`,
        });
      } else {
        toast.loading(t('skillsPanel.toasts.activating', { name: skill.name }), {
          id: `skill-toggle-${skill.id}`,
        });
        await activateSkill(skill.id);
        toast.success(t('skillsPanel.toasts.activated', { name: skill.name }), {
          id: `skill-toggle-${skill.id}`,
        });
      }
    } catch (error) {
      toast.error(
        t('skillsPanel.toasts.actionFailed', {
          error: error instanceof Error ? error.message : t('skillsPanel.toasts.unknownError'),
        }),
        { id: `skill-toggle-${skill.id}` }
      );
    } finally {
      setActivatingSkillId(null);
    }
  };

  const handleUninstall = async (skill: Skill) => {
    if (!rootPath) {
      toast.error(t('skillsPanel.toasts.openProjectFirst'));
      return;
    }

    const confirmed = window.confirm(t('skillsPanel.confirmUninstall', { name: skill.name }));
    if (!confirmed) {
      return;
    }

    setUninstallingSkillId(skill.id);

    try {
      toast.loading(t('skillsPanel.toasts.uninstalling', { name: skill.name }), {
        id: `skill-uninstall-${skill.id}`,
      });
      await invoke('uninstall_skill', {
        projectRoot: rootPath,
        skillId: skill.id,
      });
      await fetchSkills();
      setSelectedSkillId(current => (current === skill.id ? null : current));
      toast.success(t('skillsPanel.toasts.uninstalled', { name: skill.name }), {
        id: `skill-uninstall-${skill.id}`,
      });
    } catch (error) {
      toast.error(
        t('skillsPanel.toasts.uninstallFailed', {
          error:
            error instanceof Error ? error.message : t('skillsPanel.toasts.unknownError'),
        }),
        { id: `skill-uninstall-${skill.id}` }
      );
    } finally {
      setUninstallingSkillId(null);
    }
  };

  return (
    <div className="theme-panel flex h-full w-full overflow-hidden">
      <aside className="theme-panel-muted theme-border flex w-80 shrink-0 flex-col border-r">
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Puzzle size={16} className="theme-text-accent" />
            <div className="min-w-0">
              <div className="theme-text text-xs font-bold uppercase tracking-[0.12em]">
                {t('skillsPanel.title')}
              </div>
              <div className="theme-text-subtle text-[11px]">
                {t('skillsPanel.summary', {
                  active: activeSkillIds.length,
                  total: availableSkills.length,
                })}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSkillMarketOpen(true)}
            className="theme-button-ghost theme-focus-ring-accent rounded-md p-1.5"
            title={t('skillsPanel.openMarket')}
            aria-label={t('skillsPanel.openMarket')}
          >
            <ShoppingCart size={15} />
          </button>
        </div>

        <div className="theme-panel-muted theme-border space-y-3 border-b px-4 py-3">
          <div className="relative">
            <Search className="theme-text-subtle pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={14} />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t('skillsPanel.searchPlaceholder')}
              className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-md border py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(current => !current)}
              className={cn(
                'theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium',
                showFilters ? 'theme-button-primary' : 'theme-button-secondary'
              )}
              title={t('skillsPanel.filter')}
              aria-label={t('skillsPanel.filter')}
            >
              <Filter size={13} />
              {t('skillsPanel.filter')}
            </button>

            {(ui.searchQuery || ui.stateFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setShowFilters(false);
                  setStateFilter('all');
                  handleSearchChange('');
                }}
                className="theme-button-ghost theme-focus-ring-accent rounded-md px-2 py-1 text-xs"
              >
                {t('skillsPanel.clearFilters')}
              </button>
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {filterOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStateFilter(option.value)}
                  className={cn(
                    'theme-focus-ring-accent rounded-md px-2.5 py-1 text-xs font-medium',
                    ui.stateFilter === option.value ? 'theme-button-primary' : 'theme-button-secondary'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading && availableSkills.length === 0 ? (
            <div className="theme-text-subtle flex items-center justify-center gap-2 py-10 text-sm">
              <Loader2 size={16} className="animate-spin" />
              <span>{t('skillsPanel.loading')}</span>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="theme-text-subtle flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Puzzle size={28} className="opacity-50" />
              <div>
                <div className="theme-text-muted text-sm">{t('skillsPanel.emptyTitle')}</div>
                <div className="mt-1 text-xs">{t('skillsPanel.emptyDescription')}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSkills.map(skill => {
                const displayState = getDisplayState(skill, activeSkillIds);
                const isSelected = selectedSkillId === skill.id;
                const isActive = displayState === 'Active';

                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setSelectedSkillId(skill.id)}
                    className={cn(
                      'theme-focus-ring-accent theme-border theme-hoverable flex w-full flex-col rounded-lg border p-3 text-left',
                      isSelected ? 'theme-selection-accent shadow-sm' : 'theme-panel-muted'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          isActive ? 'theme-badge-accent' : 'theme-input-surface'
                        )}
                      >
                        <Puzzle size={16} className={isActive ? undefined : 'theme-text-subtle'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="theme-text truncate text-sm font-medium">{skill.name}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', getSkillStateBadgeClass(displayState))}>
                            {getSkillStateLabel(t, displayState)}
                          </span>
                        </div>
                        <p className="theme-text-subtle mt-1 line-clamp-2 text-xs leading-relaxed">
                          {skill.description}
                        </p>
                        <div className="theme-text-subtle mt-2 flex items-center gap-2 text-[10px]">
                          <span className="font-mono">{skill.id}</span>
                          <span>•</span>
                          <span>v{skill.version}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="theme-panel-muted theme-border theme-text-subtle border-t px-4 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span>{t('skillsPanel.footer.active', { count: activeSkillIds.length })}</span>
            <span>{t('skillsPanel.footer.total', { count: availableSkills.length })}</span>
            <span>{t('skillsPanel.footer.filtered', { count: filteredSkills.length })}</span>
          </div>
        </div>
      </aside>

      <section className="theme-panel flex min-w-0 flex-1 flex-col">
        {selectedSkill ? (
          <>
            <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Puzzle size={18} className="theme-text-accent shrink-0" />
                  <h3 className="theme-text truncate text-base font-semibold">{selectedSkill.name}</h3>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      getSkillStateBadgeClass(getDisplayState(selectedSkill, activeSkillIds))
                    )}
                  >
                    {getSkillStateLabel(t, getDisplayState(selectedSkill, activeSkillIds))}
                  </span>
                </div>
                <div className="theme-text-subtle mt-1 text-xs font-mono">{selectedSkill.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSkill(selectedSkill)}
                  disabled={activatingSkillId !== null}
                  className={cn(
                    'theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50',
                    activeSkillIds.includes(selectedSkill.id) ? 'theme-button-danger' : 'theme-button-primary'
                  )}
                >
                  {activatingSkillId === selectedSkill.id ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t('skillsPanel.processing')}
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      {activeSkillIds.includes(selectedSkill.id)
                        ? t('skillsPanel.deactivate')
                        : t('skillsPanel.activate')}
                    </>
                  )}
                </button>
                {isInstalledState(getDisplayState(selectedSkill, activeSkillIds)) && (
                  <button
                    type="button"
                    onClick={() => handleUninstall(selectedSkill)}
                    disabled={uninstallingSkillId !== null}
                    className="theme-button-secondary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                    title={t('skillsPanel.uninstall')}
                    aria-label={t('skillsPanel.uninstall')}
                  >
                    {uninstallingSkillId === selectedSkill.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-5">
                <section className="theme-panel-muted theme-border rounded-lg border p-4">
                  <p className="theme-text text-sm leading-relaxed">{selectedSkill.description}</p>
                  <div className="theme-text-subtle mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <span>v{selectedSkill.version}</span>
                    {selectedSkill.author && (
                      <span className="inline-flex items-center gap-1.5">
                        <User size={12} />
                        {t('skillsPanel.author', { author: selectedSkill.author })}
                      </span>
                    )}
                  </div>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                      {t('skillsPanel.tags')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedSkill.tags.length > 0 ? (
                        selectedSkill.tags.map(tag => (
                          <span
                            key={tag}
                            className="theme-panel-muted theme-border theme-text-subtle rounded-full border px-2.5 py-1 text-xs"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="theme-text-subtle text-sm">{t('skillsPanel.noTags')}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                      {t('skillsPanel.dependencies')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedSkill.dependencies.length > 0 ? (
                        selectedSkill.dependencies.map(dependency => (
                          <span
                            key={dependency}
                            className="theme-input-surface theme-border theme-text-subtle rounded-md border px-2.5 py-1 text-xs font-mono"
                          >
                            {dependency}
                          </span>
                        ))
                      ) : (
                        <span className="theme-text-subtle text-sm">
                          {t('skillsPanel.noDependencies')}
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {selectedSkill.system_prompt && (
                  <section className="space-y-3">
                    <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                      {t('skillsPanel.systemPrompt')}
                    </h4>
                    <div className="theme-code-surface theme-border overflow-auto rounded-lg border p-4">
                      <pre className="theme-text-muted whitespace-pre-wrap text-xs leading-relaxed">
                        {selectedSkill.system_prompt}
                      </pre>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="theme-text-subtle flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <Puzzle size={42} className="theme-text-accent opacity-50" />
            <div>
              <div className="theme-text text-base font-medium">{t('skillsPanel.emptySelectionTitle')}</div>
              <div className="mt-1 text-sm">{t('skillsPanel.emptySelectionDescription')}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
