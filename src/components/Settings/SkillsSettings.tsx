import React, { useEffect, useState } from 'react';
import { RefreshCw, Puzzle, ShieldCheck, Download, AlertCircle } from 'lucide-react';
import { useSkillStore } from '../../stores/skillStore';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

export const SkillsSettings: React.FC = () => {
    const { t } = useTranslation();
    const rootPath = useFileStore(state => state.rootPath);
    const { 
        availableSkills, 
        activeSkillIds, 
        isLoading, 
        error,
        fetchSkills, 
        toggleSkill 
    } = useSkillStore();

    const [isInstalling, setIsInstalling] = useState(false);

    // 初始加载
    useEffect(() => {
        if (availableSkills.length === 0) {
            fetchSkills();
        }
    }, [availableSkills.length, fetchSkills]);

    const installDemo = async () => {
        if (!rootPath) return;
        
        setIsInstalling(true);
        try {
            await invoke('init_skills_dir', { projectRoot: rootPath });
            await fetchSkills();
        } catch (e) {
            console.error('Failed to install demo skills:', e);
        } finally {
            setIsInstalling(false);
        }
    };

    return (
        <div className="theme-panel theme-text-muted flex h-full flex-col overflow-hidden p-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <Puzzle size={20} className="theme-text-accent" />
                    <h3 className="theme-text text-lg font-medium">{t('settings.skills')}</h3>
                </div>
                <button 
                    type="button"
                    onClick={() => fetchSkills()}
                    disabled={isLoading}
                    className="theme-button-secondary theme-focus-ring-accent flex items-center gap-2 rounded px-3 py-1.5 text-sm disabled:opacity-50"
                    aria-label={t('skillsSettings.refresh')}
                >
                    <RefreshCw size={14} className={clsx(isLoading && "animate-spin")} />
                    <span>{t('skillsSettings.refresh')}</span>
                </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {error && (
                    <div className="theme-surface-danger flex items-start justify-between gap-3 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                            <AlertCircle size={16} className="theme-text-danger mt-0.5 flex-shrink-0" />
                            <p className="theme-text text-sm">
                                {t('skillsSettings.loadFailed', { error })}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => fetchSkills()}
                            className="theme-button-secondary theme-focus-ring-accent rounded px-3 py-1 text-xs"
                        >
                            {t('skillsSettings.retry')}
                        </button>
                    </div>
                )}

                {isLoading && (
                    <div className="theme-text-subtle flex flex-col items-center justify-center py-12">
                        <RefreshCw size={32} className="animate-spin mb-4" />
                        <p>{t('skillsSettings.scanning')}</p>
                    </div>
                )}

                {!isLoading && availableSkills.length === 0 && (
                    <div className="theme-panel-muted theme-border flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
                        <ShieldCheck size={48} className="theme-text-subtle mb-4 opacity-70" />
                        <p className="theme-text-muted">{t('skillsSettings.emptyTitle')}</p>
                        <p className="theme-text-subtle mt-2 mb-6 px-8 text-center text-xs">
                            {t('skillsSettings.emptyDescription')}
                        </p>
                        {!rootPath && (
                            <p className="theme-text-warning mb-4 px-8 text-center text-xs">
                                {t('skillsSettings.openProjectFirst')}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={installDemo}
                            disabled={isInstalling || !rootPath}
                            className="theme-button-primary theme-shadow flex items-center gap-2 rounded-md px-4 py-2 text-sm disabled:opacity-50"
                        >
                            {isInstalling ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                            <span>{t('skillsSettings.installDemo')}</span>
                        </button>
                    </div>
                )}

                {!isLoading && availableSkills.map(skill => {
                    const isActive = activeSkillIds.includes(skill.id);
                    return (
                        <div 
                            key={skill.id}
                            className={clsx(
                                "flex items-start gap-4 p-4 rounded-lg border transition-all",
                                isActive 
                                    ? "theme-selection-accent shadow-sm"
                                    : "theme-panel-muted theme-border theme-soft-hover"
                            )}
                        >
                            <div className={clsx(
                                "p-2 rounded-md",
                                isActive ? "theme-badge-accent" : "theme-input-surface theme-text-subtle"
                            )}>
                                <Puzzle size={24} />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="theme-text font-medium truncate">{skill.name}</h4>
                                    <span className="theme-input-surface theme-border theme-text-subtle rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase">
                                        v{skill.version}
                                    </span>
                                </div>
                                <p className="theme-text-subtle line-clamp-2 text-sm leading-relaxed">
                                    {skill.description}
                                </p>
                            </div>

                            <div className="flex flex-col items-end gap-4">
                                <span
                                    className={clsx(
                                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                        isActive ? 'theme-badge-accent' : 'theme-panel-muted theme-border theme-text-subtle border'
                                    )}
                                >
                                    {isActive ? t('skillsSettings.enabled') : t('skillsSettings.disabled')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => toggleSkill(skill.id)}
                                    className="theme-toggle-track theme-focus-ring-accent relative inline-flex h-5 w-10 items-center rounded-full"
                                    data-active={isActive}
                                    role="switch"
                                    aria-checked={isActive}
                                    aria-label={t('skillsSettings.toggleSkill', { name: skill.name })}
                                >
                                    <span
                                        className={clsx(
                                            "theme-toggle-thumb inline-block h-3 w-3 transform rounded-full",
                                            isActive ? "translate-x-6" : "translate-x-1"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer Tip */}
            <div className="theme-border theme-text-subtle mt-4 border-t pt-4 text-[11px] italic">
                {t('skillsSettings.footerTip')}
            </div>
        </div>
    );
};
