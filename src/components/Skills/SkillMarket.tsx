import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  Code,
  Download,
  Loader2,
  Puzzle,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/fileStore';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { getBuiltinSkills, type BuiltinSkill, type BuiltinSkillCategory } from './builtinSkills';
import { formatCompactNumber, formatLocalizedNumber } from './skillUi';

interface SkillMarketProps {
  onClose: () => void;
}

type SkillMarketCategory = 'all' | 'featured' | BuiltinSkillCategory;

export const SkillMarket: React.FC<SkillMarketProps> = ({ onClose }) => {
  const { t, i18n } = useTranslation();
  const rootPath = useFileStore(state => state.rootPath);
  const { availableSkills } = useSkillStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SkillMarketCategory>('all');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const [uninstallingSkillId, setUninstallingSkillId] = useState<string | null>(null);

  const builtinSkills = useMemo(() => getBuiltinSkills(t), [t, i18n.language]);
  const installedSkillIds = useMemo(
    () => new Set(availableSkills.map(skill => skill.id)),
    [availableSkills]
  );

  const categories = useMemo(
    () => [
      { id: 'all' as const, label: t('skillMarket.categories.all'), icon: Puzzle },
      { id: 'featured' as const, label: t('skillMarket.categories.featured'), icon: Award },
      { id: 'development' as const, label: t('skillMarket.categories.development'), icon: Code },
      { id: 'testing' as const, label: t('skillMarket.categories.testing'), icon: BookOpen },
      { id: 'documentation' as const, label: t('skillMarket.categories.documentation'), icon: BookOpen },
      { id: 'pivo' as const, label: t('skillMarket.categories.pivo'), icon: Users },
    ],
    [t]
  );

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return builtinSkills.filter(skill => {
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'featured' ? skill.featured : skill.category === selectedCategory);
      const matchesSearch =
        query.length === 0 ||
        skill.displayName.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.longDescription.toLowerCase().includes(query) ||
        skill.tags.some(tag => tag.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [builtinSkills, searchQuery, selectedCategory]);

  useEffect(() => {
    if (selectedSkillId && !builtinSkills.some(skill => skill.id === selectedSkillId)) {
      setSelectedSkillId(null);
    }
  }, [builtinSkills, selectedSkillId]);

  const selectedSkill = useMemo(
    () => builtinSkills.find(skill => skill.id === selectedSkillId) ?? null,
    [builtinSkills, selectedSkillId]
  );

  const handleInstall = async (skill: BuiltinSkill) => {
    if (!rootPath) {
      toast.error(t('skillMarket.toasts.openProjectFirst'));
      return;
    }

    setInstallingSkillId(skill.id);
    try {
      toast.loading(t('skillMarket.toasts.installing', { name: skill.displayName }), {
        id: `skill-market-install-${skill.id}`,
      });
      await invoke('install_skill', {
        projectRoot: rootPath,
        skillId: skill.id,
        source: 'marketplace',
        skillData: skill,
      });

      const { fetchSkills } = useSkillStore.getState();
      await fetchSkills();

      toast.success(t('skillMarket.toasts.installed', { name: skill.displayName }), {
        id: `skill-market-install-${skill.id}`,
      });
    } catch (error) {
      toast.error(
        t('skillMarket.toasts.installFailed', {
          error:
            error instanceof Error ? error.message : t('skillMarket.toasts.unknownError'),
        }),
        { id: `skill-market-install-${skill.id}` }
      );
    } finally {
      setInstallingSkillId(null);
    }
  };

  const handleUninstall = async (skill: BuiltinSkill) => {
    if (!rootPath) {
      toast.error(t('skillMarket.toasts.openProjectFirst'));
      return;
    }

    const confirmed = window.confirm(t('skillMarket.confirmUninstall', { name: skill.displayName }));
    if (!confirmed) {
      return;
    }

    setUninstallingSkillId(skill.id);
    try {
      toast.loading(t('skillMarket.toasts.uninstalling', { name: skill.displayName }), {
        id: `skill-market-uninstall-${skill.id}`,
      });
      await invoke('uninstall_skill', {
        projectRoot: rootPath,
        skillId: skill.id,
      });

      const { fetchSkills } = useSkillStore.getState();
      await fetchSkills();

      toast.success(t('skillMarket.toasts.uninstalled', { name: skill.displayName }), {
        id: `skill-market-uninstall-${skill.id}`,
      });
    } catch (error) {
      toast.error(
        t('skillMarket.toasts.uninstallFailed', {
          error:
            error instanceof Error ? error.message : t('skillMarket.toasts.unknownError'),
        }),
        { id: `skill-market-uninstall-${skill.id}` }
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
                {t('skillMarket.title')}
              </div>
              <div className="theme-text-subtle text-[11px]">
                {t('skillMarket.countSummary', { count: builtinSkills.length })}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-button-ghost theme-focus-ring-accent rounded-md p-1.5"
            title={t('skillMarket.close')}
            aria-label={t('skillMarket.close')}
          >
            <X size={15} />
          </button>
        </div>

        <div className="theme-panel-muted theme-border space-y-3 border-b px-4 py-3">
          <div className="relative">
            <Search className="theme-text-subtle pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('skillMarket.searchPlaceholder')}
              className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-md border py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'theme-focus-ring-accent inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
                  selectedCategory === category.id ? 'theme-button-primary' : 'theme-button-secondary'
                )}
              >
                <category.icon size={12} />
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filteredSkills.length === 0 ? (
            <div className="theme-text-subtle flex h-full flex-col items-center justify-center gap-3 text-center">
              <Search size={28} className="opacity-50" />
              <div>
                <div className="theme-text-muted text-sm">{t('skillMarket.emptyTitle')}</div>
                <div className="mt-1 text-xs">{t('skillMarket.emptyDescription')}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSkills.map(skill => {
                const isInstalled = installedSkillIds.has(skill.id);
                const isSelected = selectedSkillId === skill.id;

                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setSelectedSkillId(skill.id)}
                    className={cn(
                      'theme-focus-ring-accent theme-border theme-hoverable flex w-full rounded-lg border p-3 text-left',
                      isSelected ? 'theme-selection-accent shadow-sm' : 'theme-panel-muted'
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          skill.featured ? 'theme-badge-warning' : 'theme-input-surface'
                        )}
                      >
                        <Puzzle size={16} className={skill.featured ? undefined : 'theme-text-subtle'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="theme-text truncate text-sm font-medium">{skill.displayName}</span>
                          {skill.featured && (
                            <span className="theme-badge-warning rounded-full px-2 py-0.5 text-[10px] font-medium">
                              {t('skillMarket.featuredBadge')}
                            </span>
                          )}
                          {isInstalled && (
                            <span className="theme-badge-success rounded-full px-2 py-0.5 text-[10px] font-medium">
                              {t('skillMarket.installed')}
                            </span>
                          )}
                        </div>
                        <p className="theme-text-subtle mt-1 line-clamp-2 text-xs leading-relaxed">
                          {skill.description}
                        </p>
                        <div className="theme-text-subtle mt-2 flex items-center gap-2 text-[10px]">
                          <span>v{skill.version}</span>
                          <span>•</span>
                          <span>{formatCompactNumber(skill.downloads, i18n.language)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <section className="theme-panel flex min-w-0 flex-1 flex-col">
        {selectedSkill ? (
          <>
            <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedSkillId(null)}
                    className="theme-button-ghost theme-focus-ring-accent rounded-md p-1.5"
                    title={t('skillMarket.back')}
                    aria-label={t('skillMarket.back')}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <div className="min-w-0">
                    <h3 className="theme-text truncate text-base font-semibold">
                      {selectedSkill.displayName}
                    </h3>
                    <div className="theme-text-subtle mt-1 text-xs font-mono">{selectedSkill.id}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {installedSkillIds.has(selectedSkill.id) ? (
                  <>
                    <span className="theme-badge-success rounded-full px-3 py-1 text-xs font-medium">
                      {t('skillMarket.installed')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUninstall(selectedSkill)}
                      disabled={uninstallingSkillId !== null}
                      className="theme-button-secondary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                      title={t('skillMarket.uninstall')}
                      aria-label={t('skillMarket.uninstall')}
                    >
                      {uninstallingSkillId === selectedSkill.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleInstall(selectedSkill)}
                    disabled={installingSkillId !== null}
                    className="theme-button-primary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {installingSkillId === selectedSkill.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {t('skillMarket.installing')}
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        {t('skillMarket.installToProject')}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-5">
                <section className="theme-panel-muted theme-border rounded-lg border p-4">
                  <p className="theme-text text-sm leading-relaxed">{selectedSkill.longDescription}</p>
                  <div className="theme-text-subtle mt-3 flex flex-wrap items-center gap-4 text-xs">
                    <span>{t('skillMarket.version', { version: selectedSkill.version })}</span>
                    <span>{t('skillMarket.author', { author: selectedSkill.author })}</span>
                    <span>{t('skillMarket.downloads', { value: formatLocalizedNumber(selectedSkill.downloads, i18n.language) })}</span>
                    <span>{t('skillMarket.rating', { value: selectedSkill.rating.toFixed(1) })}</span>
                    <span>{t('skillMarket.size', { value: selectedSkill.size })}</span>
                  </div>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                      {t('skillMarket.tags')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedSkill.tags.map(tag => (
                        <span
                          key={tag}
                          className="theme-panel-muted theme-border theme-text-subtle rounded-full border px-2.5 py-1 text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                      {t('skillMarket.dependencies')}
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
                          {t('skillMarket.noDependencies')}
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {selectedSkill.requirements && selectedSkill.requirements.length > 0 && (
                  <section className="space-y-3">
                    <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                      {t('skillMarket.requirements')}
                    </h4>
                    <ul className="space-y-2">
                      {selectedSkill.requirements.map(requirement => (
                        <li key={requirement} className="theme-panel-muted theme-border flex items-start gap-3 rounded-lg border p-3 text-sm">
                          <Award size={14} className="theme-text-warning mt-0.5 shrink-0" />
                          <span className="theme-text-muted">{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="space-y-3">
                  <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                    {t('skillMarket.examples')}
                  </h4>
                  <div className="space-y-2">
                    {selectedSkill.examples.map((example, index) => (
                      <div
                        key={example}
                        className="theme-panel-muted theme-border flex items-start gap-3 rounded-lg border p-3 text-sm"
                      >
                        <span className="theme-badge-accent rounded-full px-2 py-0.5 text-xs font-medium">
                          {index + 1}
                        </span>
                        <span className="theme-text-muted">{example}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
                    {t('skillMarket.systemPromptPreview')}
                  </h4>
                  <div className="theme-code-surface theme-border overflow-auto rounded-lg border p-4">
                    <pre className="theme-text-muted whitespace-pre-wrap text-xs leading-relaxed">
                      {selectedSkill.systemPrompt}
                    </pre>
                  </div>
                  <div className="theme-text-subtle text-xs">{t('skillMarket.previewHint')}</div>
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="theme-text-subtle flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
            <div className="theme-surface-accent flex h-20 w-20 items-center justify-center rounded-full">
              <Puzzle size={36} />
            </div>
            <div>
              <div className="theme-text text-2xl font-semibold">{t('skillMarket.welcomeTitle')}</div>
              <div className="theme-text-subtle mt-2 max-w-xl text-sm leading-relaxed">
                {t('skillMarket.welcomeDescription')}
              </div>
            </div>
            <div className="theme-text-subtle flex flex-wrap items-center justify-center gap-6 text-sm">
              <span className="inline-flex items-center gap-2">
                <Award size={14} className="theme-text-warning" />
                {t('skillMarket.featuredCount', {
                  count: builtinSkills.filter(skill => skill.featured).length,
                })}
              </span>
              <span className="inline-flex items-center gap-2">
                <Download size={14} className="theme-text-accent" />
                {t('skillMarket.totalCount', { count: builtinSkills.length })}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
