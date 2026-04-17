import React, { useEffect, useState } from 'react';
import { RefreshCw, Puzzle, ExternalLink, ShieldCheck, Download } from 'lucide-react';
import { useSkillStore } from '../../stores/skillStore';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import clsx from 'clsx';

export const SkillsSettings: React.FC = () => {
    const { 
        availableSkills, 
        activeSkillIds, 
        isLoading, 
        fetchSkills, 
        toggleSkill 
    } = useSkillStore();

    const [isInstalling, setIsInstalling] = useState(false);

    // 初始加载
    useEffect(() => {
        if (availableSkills.length === 0) {
            fetchSkills();
        }
    }, []);

    const installDemo = async () => {
        const rootPath = useFileStore.getState().rootPath;
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
                    <Puzzle size={20} className="text-blue-400" />
                    <h3 className="theme-text text-lg font-medium">技能中心 (Skills Center)</h3>
                </div>
                <button 
                    onClick={() => fetchSkills()}
                    disabled={isLoading}
                    className="theme-input-surface theme-border flex items-center gap-2 rounded px-3 py-1.5 text-sm theme-text transition-colors disabled:opacity-50 hover:border-[var(--border-strong)]"
                    aria-label="刷新"
                >
                    <RefreshCw size={14} className={clsx(isLoading && "animate-spin")} />
                    <span>刷新</span>
                </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {isLoading && (
                    <div className="theme-text-subtle flex flex-col items-center justify-center py-12">
                        <RefreshCw size={32} className="animate-spin mb-4" />
                        <p>正在扫描技能目录...</p>
                    </div>
                )}

                {!isLoading && availableSkills.length === 0 && (
                    <div className="theme-panel-muted theme-border flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
                        <ShieldCheck size={48} className="theme-text-subtle mb-4 opacity-70" />
                        <p className="theme-text-muted">未发现可用技能</p>
                        <p className="theme-text-subtle mt-2 mb-6 px-8 text-center text-xs">
                            IfAI 会自动扫描项目根目录下 .ifai/skills 中的技能插件。<br/>
                            您可以安装内置示例来快速开始体验。
                        </p>
                        <button
                            onClick={installDemo}
                            disabled={isInstalling}
                            className="theme-button-primary theme-shadow flex items-center gap-2 rounded-md px-4 py-2 text-sm disabled:opacity-50"
                        >
                            {isInstalling ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                            <span>安装内置示例技能</span>
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
                                    ? "theme-panel-elevated border-blue-500/50 shadow-lg shadow-blue-500/5" 
                                    : "theme-panel-muted theme-border hover:border-[var(--border-strong)]"
                            )}
                        >
                            <div className={clsx(
                                "p-2 rounded-md",
                                isActive ? "bg-blue-500/20 text-blue-400" : "theme-input-surface theme-text-subtle"
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
                                {/* Toggle Switch */}
                                <button
                                    onClick={() => toggleSkill(skill.id)}
                                    className="theme-toggle-track relative inline-flex h-5 w-10 items-center rounded-full focus:outline-none"
                                    data-active={isActive}
                                >
                                    <span
                                        className={clsx(
                                            "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                                            isActive ? "translate-x-6" : "translate-x-1"
                                        )}
                                    />
                                </button>
                                
                                <button className="theme-hoverable theme-text-subtle rounded p-1 transition-colors" title="查看源码">
                                    <ExternalLink size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer Tip */}
            <div className="theme-border theme-text-subtle mt-4 border-t pt-4 text-[11px] italic">
                提示：激活技能后，AI 将自动获得该领域的增强指令。
            </div>
        </div>
    );
};
