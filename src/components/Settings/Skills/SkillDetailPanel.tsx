import React, { useMemo, useState } from 'react';
import {
  Check,
  Code,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Loader2,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { getSkillStateBadgeClass, getSkillStateLabel, isInstalledState } from '../../Skills/skillUi';
import { SkillStateIndicator } from './SkillStateIndicator';
import type { Skill, SkillState } from './types';

interface SkillDetailPanelProps {
  skill: Skill;
  className?: string;
}

export const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({ skill, className }) => {
  const { t } = useTranslation();
  const { activeSkillIds, activateSkill, deactivateSkill, installSkill, uninstallSkill } = useSkillStore();
  const [showSource, setShowSource] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const displayState = useMemo<SkillState['type']>(() => {
    return activeSkillIds.includes(skill.id) ? 'Active' : skill.state.type;
  }, [activeSkillIds, skill.id, skill.state.type]);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await installSkill(skill.id);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleToggleActive = async () => {
    setIsToggling(true);
    try {
      if (displayState === 'Active') {
        await deactivateSkill(skill.id);
      } else {
        await activateSkill(skill.id);
      }
    } finally {
      setIsToggling(false);
    }
  };

  const handleUninstall = async () => {
    setIsUninstalling(true);
    try {
      await uninstallSkill(skill.id);
    } finally {
      setIsUninstalling(false);
    }
  };

  const canInstall = displayState === 'NotInstalled';
  const canToggle = isInstalledState(displayState);

  return (
    <div className={cn('theme-panel-muted theme-border overflow-hidden rounded-lg border', className)}>
      <div className="theme-panel-muted theme-border flex items-start justify-between gap-4 border-b p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="theme-text min-w-0 truncate text-lg font-semibold">{skill.name}</h2>
            <span className="theme-input-surface theme-border theme-text-subtle rounded-md border px-2 py-0.5 text-xs font-mono">
              v{skill.version}
            </span>
            <SkillStateIndicator state={{ type: displayState } as SkillState} showLabel />
          </div>
          <p className="theme-text-subtle mt-2 text-sm leading-relaxed">{skill.description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canInstall && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={isInstalling}
              className="theme-button-primary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {isInstalling ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {isInstalling ? t('skillDetail.installing') : t('skillDetail.install')}
            </button>
          )}

          {canToggle && (
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={isToggling}
              className={cn(
                'theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50',
                displayState === 'Active' ? 'theme-button-danger' : 'theme-button-primary'
              )}
            >
              {isToggling ? (
                <Loader2 size={14} className="animate-spin" />
              ) : displayState === 'Active' ? (
                <X size={14} />
              ) : (
                <Check size={14} />
              )}
              {displayState === 'Active' ? t('skillDetail.deactivate') : t('skillDetail.activate')}
            </button>
          )}

          {isInstalledState(displayState) && (
            <button
              type="button"
              onClick={handleUninstall}
              disabled={isUninstalling}
              className="theme-button-secondary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {isUninstalling ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('skillDetail.uninstall')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSource(current => !current)}
            className={cn(
              'theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
              showSource ? 'theme-button-primary' : 'theme-button-secondary'
            )}
          >
            <Code size={14} />
            {t('skillDetail.source')}
          </button>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
              {t('skillDetail.basicInfo')}
            </h3>
            <MetaItem icon={FileText} label={t('skillDetail.skillId')} value={skill.id} />
            <MetaItem icon={User} label={t('skillDetail.author')} value={skill.author || t('skillDetail.unknownAuthor')} />
            <MetaItem icon={GitBranch} label={t('skillDetail.compatibility')} value={skill.compatibility || '-'} />
          </div>

          <div className="space-y-3">
            <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
              {t('skillDetail.systemPrompt')}
            </h3>
            <div className="theme-code-surface theme-border overflow-auto rounded-lg border p-4">
              <pre className="theme-text-muted whitespace-pre-wrap text-xs leading-relaxed">
                {skill.system_prompt}
              </pre>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
              {t('skillDetail.tags')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {skill.tags.length > 0 ? (
                skill.tags.map(tag => (
                  <span
                    key={tag}
                    className="theme-panel-muted theme-border theme-text-subtle rounded-full border px-2.5 py-1 text-xs"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="theme-text-subtle text-sm">{t('skillDetail.noTags')}</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
              {t('skillDetail.dependencies')}
            </h3>
            <div className="space-y-2">
              {skill.dependencies.length > 0 ? (
                skill.dependencies.map(dependency => (
                  <div
                    key={dependency}
                    className="theme-panel theme-border flex items-center justify-between rounded-lg border p-3"
                  >
                    <span className="theme-text text-sm font-mono">{dependency}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', getSkillStateBadgeClass(displayState))}>
                      {getSkillStateLabel(t, displayState)}
                    </span>
                  </div>
                ))
              ) : (
                <span className="theme-text-subtle text-sm">{t('skillDetail.noDependencies')}</span>
              )}
            </div>
          </div>
        </section>

        {showSource && (
          <section className="space-y-3">
            <h3 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.1em]">
              {t('skillDetail.sourceFiles')}
            </h3>
            <SourceLink path={`.ifai/skills/${skill.id}/skill.json`} />
            <SourceLink path={`.ifai/skills/${skill.id}/skill.md`} />
            <SourceLink path={`.ifai/skills/${skill.id}/skill.yaml`} />
          </section>
        )}
      </div>
    </div>
  );
};

interface MetaItemProps {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  value: string;
}

const MetaItem: React.FC<MetaItemProps> = ({ icon: Icon, label, value }) => {
  return (
    <div className="theme-panel theme-border flex items-start gap-3 rounded-lg border p-3">
      <Icon size={15} className="theme-text-subtle mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="theme-text-subtle text-[11px] font-medium uppercase tracking-[0.08em]">
          {label}
        </div>
        <div className="theme-text mt-1 break-all text-sm">{value}</div>
      </div>
    </div>
  );
};

const SourceLink: React.FC<{ path: string }> = ({ path }) => {
  const { t } = useTranslation();

  return (
    <div className="theme-panel theme-border flex items-center justify-between rounded-lg border p-3">
      <div className="min-w-0">
        <div className="theme-text break-all text-sm font-mono">{path}</div>
      </div>
      <button
        type="button"
        className="theme-button-ghost theme-focus-ring-accent inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
      >
        <ExternalLink size={12} />
        {t('skillDetail.open')}
      </button>
    </div>
  );
};
