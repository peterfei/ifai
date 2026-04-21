import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Grid3X3,
  List,
  Puzzle,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { getSkillStateBadgeClass, getSkillStateLabel, isInstalledState } from '../../Skills/skillUi';
import { SkillDetailPanel } from './SkillDetailPanel';
import { SkillEditor } from './SkillEditor';
import { SkillInstaller } from './SkillInstaller';
import { SkillSearchBar, TagCloud } from './SkillSearchBar';
import { StateStatsCard } from './SkillStateIndicator';
import type { Skill } from './types';

interface SkillsManagementProps {
  className?: string;
}

export const SkillsManagement: React.FC<SkillsManagementProps> = ({ className }) => {
  const { t } = useTranslation();
  const {
    availableSkills,
    activeSkillIds,
    isLoading,
    isRefreshing,
    error,
    stats,
    ui,
    fetchSkills,
    refreshSkills,
    getFilteredSkills,
    activateSkill,
    deactivateSkill,
    installSkill,
    openInstaller,
    closeInstaller,
    closeEditor,
    setSearchQuery,
    setSelectedTags,
    setSelectedSkill,
    setSortBy,
    setStateFilter,
    setViewMode,
    setSortOrder,
  } = useSkillStore();

  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (availableSkills.length === 0) {
      fetchSkills();
    }
  }, [availableSkills.length, fetchSkills]);

  const filteredSkills = useMemo(() => getFilteredSkills(), [getFilteredSkills, availableSkills, ui]);
  const selectedSkill = useMemo(
    () => availableSkills.find(skill => skill.id === ui.selectedSkill) ?? null,
    [availableSkills, ui.selectedSkill]
  );
  const allTags = useMemo(
    () => Array.from(new Set(availableSkills.flatMap(skill => skill.tags))).sort(),
    [availableSkills]
  );
  const hasBatchSelection = selectedForBatch.size > 0;

  const toggleSelection = (id: string) => {
    setSelectedForBatch(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedForBatch(new Set());

  const activateSelected = async () => {
    for (const id of selectedForBatch) {
      if (!activeSkillIds.includes(id)) {
        await activateSkill(id);
      }
    }
    clearSelection();
  };

  const handleToggleSkill = async (skill: Skill) => {
    if (activeSkillIds.includes(skill.id)) {
      await deactivateSkill(skill.id);
      return;
    }

    if (isInstalledState(skill.state.type)) {
      await activateSkill(skill.id);
      return;
    }

    await installSkill(skill.id);
  };

  return (
    <div className={cn('theme-panel flex h-full min-h-0 flex-col overflow-hidden', className)}>
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Puzzle size={20} className="theme-text-accent" />
          <div>
            <h1 className="theme-text text-lg font-semibold">{t('skillsManagement.title')}</h1>
            <p className="theme-text-subtle mt-1 text-xs">{t('skillsManagement.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshSkills()}
            disabled={isRefreshing}
            className="theme-button-secondary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
            {t('skillsManagement.refresh')}
          </button>

          <div className="theme-panel theme-border flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label={t('skillsManagement.gridAria')}
              className={cn(
                'theme-focus-ring-accent inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium',
                ui.viewMode === 'grid' ? 'theme-button-primary' : 'theme-button-ghost'
              )}
            >
              <Grid3X3 size={14} />
              {t('skillsManagement.grid')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label={t('skillsManagement.listAria')}
              className={cn(
                'theme-focus-ring-accent inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium',
                ui.viewMode === 'list' ? 'theme-button-primary' : 'theme-button-ghost'
              )}
            >
              <List size={14} />
              {t('skillsManagement.list')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => openInstaller()}
            className="theme-button-secondary theme-focus-ring-accent rounded-md p-2"
            title={t('skillsManagement.openInstaller')}
            aria-label={t('skillsManagement.openInstaller')}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {stats && (
        <div className="px-6 py-4">
          <StateStatsCard
            stats={{
              total: stats.total,
              active: stats.active,
              installed: stats.installed,
              error: stats.error,
            }}
          />
        </div>
      )}

      <div className="px-6 pb-4">
        <SkillSearchBar
          searchQuery={ui.searchQuery}
          onSearchChange={setSearchQuery}
          selectedTags={ui.selectedTags}
          onTagsChange={setSelectedTags}
          availableTags={allTags}
          stateFilter={ui.stateFilter}
          onStateFilterChange={setStateFilter}
          sortBy={ui.sortBy}
          onSortChange={setSortBy}
          sortOrder={ui.sortOrder}
          onSortOrderChange={() => setSortOrder(ui.sortOrder === 'asc' ? 'desc' : 'asc')}
          resultCount={filteredSkills.length}
          totalCount={availableSkills.length}
        />
      </div>

      {!ui.searchQuery && ui.selectedTags.length === 0 && allTags.length > 0 && (
        <div className="px-6 pb-4">
          <div className="theme-text-muted mb-3 text-sm font-medium">
            {t('skillsManagement.popularTags')}
          </div>
          <TagCloud
            tags={allTags}
            selectedTags={ui.selectedTags}
            onTagClick={(tag) =>
              setSelectedTags(
                ui.selectedTags.includes(tag)
                  ? ui.selectedTags.filter(item => item !== tag)
                  : [...ui.selectedTags, tag]
              )
            }
          />
        </div>
      )}

      {hasBatchSelection && (
        <div className="theme-surface-info mx-6 mb-4 flex items-center justify-between rounded-lg p-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedForBatch.size > 0 && selectedForBatch.size === filteredSkills.length}
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedForBatch(new Set(filteredSkills.map(skill => skill.id)));
                } else {
                  clearSelection();
                }
              }}
              className="theme-checkbox-input theme-focus-ring-accent h-4 w-4 rounded"
            />
            <span className="text-sm font-medium">
              {t('skillsManagement.batchSelected', { count: selectedForBatch.size })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={activateSelected}
              className="theme-button-primary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
            >
              <Check size={14} />
              {t('skillsManagement.batchActivate')}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="theme-button-secondary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
            >
              <X size={14} />
              {t('skillsManagement.clearSelection')}
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden px-6 pb-6">
        <div className={cn('flex min-h-0 flex-1 flex-col', selectedSkill && 'pr-5')}>
          {isLoading && availableSkills.length === 0 ? (
            <div className="theme-text-subtle flex flex-1 flex-col items-center justify-center gap-3 rounded-lg text-center">
              <RefreshCw size={28} className="animate-spin" />
              <p className="text-sm">{t('skillsManagement.loading')}</p>
            </div>
          ) : error ? (
            <div className="theme-surface-danger flex flex-1 flex-col items-center justify-center rounded-lg p-6 text-center">
              <AlertCircle size={28} className="theme-text-danger" />
              <p className="theme-text-danger mt-3 text-sm font-medium">
                {t('skillsManagement.loadFailedTitle')}
              </p>
              <p className="theme-text-muted mt-1 text-sm">{error}</p>
              <button
                type="button"
                onClick={() => fetchSkills()}
                className="theme-button-primary theme-focus-ring-accent mt-4 rounded-md px-4 py-2 text-sm font-medium"
              >
                {t('skillsManagement.retry')}
              </button>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="theme-panel-muted theme-border flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Puzzle size={36} className="theme-text-subtle opacity-60" />
              <p className="theme-text mt-4 text-sm font-medium">{t('skillsManagement.emptyTitle')}</p>
              <p className="theme-text-subtle mt-2 max-w-sm text-xs">
                {ui.searchQuery || ui.selectedTags.length > 0 || ui.stateFilter !== 'all'
                  ? t('skillsManagement.emptyFilteredDescription')
                  : t('skillsManagement.emptyDescription')}
              </p>
              {!ui.searchQuery && ui.selectedTags.length === 0 && ui.stateFilter === 'all' && (
                <button
                  type="button"
                  onClick={() => openInstaller()}
                  className="theme-button-primary theme-focus-ring-accent mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
                >
                  <Download size={14} />
                  {t('skillsManagement.installExamples')}
                </button>
              )}
            </div>
          ) : (
            <div
              className={cn(
                'grid min-h-0 gap-4 overflow-y-auto',
                ui.viewMode === 'grid' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
              )}
            >
              {filteredSkills.map(skill => {
                const displayState = activeSkillIds.includes(skill.id) ? 'Active' : skill.state.type;
                const isSelected = ui.selectedSkill === skill.id;
                const isChecked = selectedForBatch.has(skill.id);

                return (
                  <div
                    key={skill.id}
                    className={cn(
                      'theme-border rounded-lg border p-4 transition-all',
                      isSelected ? 'theme-selection-accent shadow-sm' : 'theme-panel-muted'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelection(skill.id)}
                        className="theme-checkbox-input theme-focus-ring-accent mt-1 h-4 w-4 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedSkill(isSelected ? null : skill.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-10 w-10 items-center justify-center rounded-lg',
                              displayState === 'Active' ? 'theme-badge-accent' : 'theme-input-surface'
                            )}
                          >
                            <Puzzle size={16} className={displayState === 'Active' ? undefined : 'theme-text-subtle'} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="theme-text truncate text-sm font-semibold">{skill.name}</h3>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                  getSkillStateBadgeClass(displayState)
                                )}
                              >
                                {getSkillStateLabel(t, displayState)}
                              </span>
                            </div>
                            <p className="theme-text-subtle mt-1 line-clamp-2 text-sm leading-relaxed">
                              {skill.description}
                            </p>
                            <div className="theme-text-subtle mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono">{skill.id}</span>
                              <span>•</span>
                              <span>v{skill.version}</span>
                            </div>
                          </div>
                        </div>

                        {skill.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {skill.tags.slice(0, 4).map(tag => (
                              <span
                                key={tag}
                                className="theme-panel theme-border theme-text-subtle rounded-full border px-2.5 py-1 text-[11px]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleSkill(skill)}
                          className={cn(
                            'theme-focus-ring-accent rounded-md px-3 py-2 text-sm font-medium',
                            activeSkillIds.includes(skill.id)
                              ? 'theme-button-secondary'
                              : 'theme-button-primary'
                          )}
                        >
                          {activeSkillIds.includes(skill.id)
                            ? t('skillsManagement.deactivate')
                            : isInstalledState(skill.state.type)
                              ? t('skillsManagement.activate')
                              : t('skillsManagement.install')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedSkill && (
          <div className="w-[420px] shrink-0 overflow-y-auto">
            <SkillDetailPanel skill={selectedSkill} />
          </div>
        )}
      </div>

      {ui.isInstallerOpen && (
        <SkillInstaller
          onClose={closeInstaller}
          onInstall={async (id, version) => {
            await installSkill(id, version);
            closeInstaller();
          }}
        />
      )}

      {ui.isEditorOpen && (
        <SkillEditor
          mode={ui.editingSkill ? { type: 'edit', skill: ui.editingSkill } : { type: 'create' }}
          skill={ui.editingSkill || undefined}
          onSave={async (_skill) => {
            closeEditor();
          }}
          onCancel={closeEditor}
        />
      )}
    </div>
  );
};
