import React, { useMemo, useState } from 'react';
import { Download, FolderOpen, Globe, Search, Star, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getBuiltinSkills } from '../../Skills/builtinSkills';
import { formatCompactNumber } from '../../Skills/skillUi';

interface InstallerSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  downloads: number;
  rating: number;
  source: 'official' | 'community';
  tags: string[];
}

interface SkillInstallerProps {
  onClose: () => void;
  onInstall: (id: string, version?: string) => Promise<void>;
  className?: string;
}

export const SkillInstaller: React.FC<SkillInstallerProps> = ({
  onClose,
  onInstall,
  className,
}) => {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'official' | 'community'>('all');
  const [installingIds, setInstallingIds] = useState<string[]>([]);

  const marketplaceSkills = useMemo<InstallerSkill[]>(
    () =>
      getBuiltinSkills(t)
        .slice(0, 6)
        .map((skill, index) => ({
          id: skill.id,
          name: skill.displayName,
          description: skill.description,
          version: skill.version,
          downloads: skill.downloads,
          rating: skill.rating,
          source: index % 2 === 0 ? 'official' : 'community',
          tags: skill.tags,
        })),
    [t, i18n.language]
  );

  const categories = [
    { value: 'all' as const, label: t('skillInstaller.categories.all') },
    { value: 'official' as const, label: t('skillInstaller.categories.official') },
    { value: 'community' as const, label: t('skillInstaller.categories.community') },
  ];

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return marketplaceSkills.filter(skill => {
      const matchesCategory = selectedCategory === 'all' || skill.source === selectedCategory;
      const matchesSearch =
        query.length === 0 ||
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.tags.some(tag => tag.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [marketplaceSkills, searchQuery, selectedCategory]);

  const handleInstall = async (skill: InstallerSkill) => {
    setInstallingIds(current => [...current, skill.id]);
    try {
      await onInstall(skill.id, skill.version);
    } catch (error) {
      toast.error(
        t('skillInstaller.installFailed', {
          name: skill.name,
          error: error instanceof Error ? error.message : t('skillInstaller.unknownError'),
        })
      );
    } finally {
      setInstallingIds(current => current.filter(id => id !== skill.id));
    }
  };

  return (
    <div className={cn('theme-backdrop fixed inset-0 z-50 flex items-center justify-center p-4', className)}>
      <div className="theme-panel-elevated theme-border theme-shadow flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border">
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="theme-surface-accent flex h-10 w-10 items-center justify-center rounded-lg">
              <Download size={18} />
            </div>
            <div>
              <h2 className="theme-text text-lg font-semibold">{t('skillInstaller.title')}</h2>
              <p className="theme-text-subtle mt-1 text-sm">{t('skillInstaller.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-button-ghost theme-focus-ring-accent rounded-md p-2"
            title={t('skillInstaller.close')}
            aria-label={t('skillInstaller.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="theme-panel-muted theme-border space-y-4 border-b px-6 py-5">
          <div className="relative">
            <Search className="theme-text-subtle pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('skillInstaller.searchPlaceholder')}
              className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-md border py-3 pl-10 pr-4 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category.value}
                type="button"
                onClick={() => setSelectedCategory(category.value)}
                className={cn(
                  'theme-focus-ring-accent rounded-md px-4 py-2 text-sm font-medium',
                  selectedCategory === category.value ? 'theme-button-primary' : 'theme-button-secondary'
                )}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {filteredSkills.length === 0 ? (
            <div className="theme-text-subtle flex flex-col items-center justify-center py-16 text-center">
              <Search size={28} className="opacity-50" />
              <div className="theme-text mt-4 text-sm font-medium">{t('skillInstaller.emptyTitle')}</div>
              <div className="mt-1 text-xs">{t('skillInstaller.emptyDescription')}</div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredSkills.map(skill => {
                const isInstalling = installingIds.includes(skill.id);

                return (
                  <div
                    key={skill.id}
                    className="theme-panel-muted theme-border flex flex-col rounded-lg border"
                  >
                    <div className="theme-border border-b p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="theme-text truncate text-base font-semibold">{skill.name}</h3>
                            {skill.source === 'official' && (
                              <span className="theme-badge-accent rounded-full px-2 py-0.5 text-[10px] font-medium">
                                {t('skillInstaller.categories.official')}
                              </span>
                            )}
                          </div>
                          <p className="theme-text-subtle mt-2 text-sm leading-relaxed">
                            {skill.description}
                          </p>
                        </div>
                        <span className="theme-badge-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
                          <Star size={10} />
                          {skill.rating.toFixed(1)}
                        </span>
                      </div>
                      <div className="theme-text-subtle mt-3 flex flex-wrap items-center gap-3 text-xs">
                        <span>{t('skillInstaller.version', { version: skill.version })}</span>
                        <span>{t('skillInstaller.downloads', { value: formatCompactNumber(skill.downloads, i18n.language) })}</span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div className="mb-4 flex flex-wrap gap-2">
                        {skill.tags.map(tag => (
                          <span
                            key={tag}
                            className="theme-panel theme-border theme-text-subtle rounded-full border px-2.5 py-1 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInstall(skill)}
                        disabled={isInstalling}
                        className="theme-button-primary theme-focus-ring-accent inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        {isInstalling ? <Users size={14} className="animate-pulse" /> : <Download size={14} />}
                        {isInstalling ? t('skillInstaller.installing') : t('skillInstaller.install')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="theme-panel-muted theme-border theme-text-subtle flex items-center justify-between border-t px-6 py-4 text-sm">
          <div className="flex items-center gap-4">
            <button type="button" className="theme-button-ghost theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-2 py-1">
              <Globe size={14} />
              {t('skillInstaller.browseAll')}
            </button>
            <button type="button" className="theme-button-ghost theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-2 py-1">
              <FolderOpen size={14} />
              {t('skillInstaller.installFromFile')}
            </button>
          </div>
          <div className="text-xs">
            {t('skillInstaller.availableCount', { count: filteredSkills.length })}
          </div>
        </div>
      </div>
    </div>
  );
};
