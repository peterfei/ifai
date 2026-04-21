import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, Layers, Code2, Box, Terminal } from 'lucide-react';
import { SymbolProbe } from '../../utils/symbol-extractor';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

interface ProbeSymbolViewProps {
    path: string;
    result?: string; // 后端返回的 JSON 字符串
    status: 'pending' | 'completed' | 'failed';
}

/**
 * 🏆 PIVO 3.0 Symbol Probe Visualization
 * 提供高保真的物理骨架探测反馈。
 */
export const ProbeSymbolView: React.FC<ProbeSymbolViewProps> = ({ path, result, status }) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);

    let symbols: SymbolProbe[] = [];
    if (result) {
        try {
            symbols = JSON.parse(result);
        } catch (e) {
            console.error('[ProbeSymbolView] Parse error:', e);
        }
    }

    const counts = {
        class: symbols.filter(s => s.kind === 'class').length,
        function: symbols.filter(s => s.kind === 'function').length,
        interface: symbols.filter(s => s.kind === 'interface').length,
        variable: symbols.filter(s => s.kind === 'variable').length,
    };

    const hasData = symbols.length > 0;

    return (
        <div className="my-2 rounded-xl overflow-hidden border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] backdrop-blur-sm group/probe">
            {/* Header / Pipeline Stage */}
            <div className="px-4 py-3 flex items-center justify-between gap-3 bg-[var(--accent-soft-bg)] border-b border-[var(--accent-soft-border)]">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={clsx(
                        "p-1.5 rounded-lg bg-[var(--accent-soft-bg)] text-[var(--accent-color)] border border-[var(--accent-soft-border)] flex-shrink-0",
                        status === 'pending' && "animate-pulse"
                    )}>
                        <Search size={14} className={status === 'pending' ? "animate-spin" : ""} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-[0.1em] theme-text-accent opacity-80 leading-none mb-1">
                            {t('aiChat.probeSymbol.pipeline')}
                        </span>
                        <span className="text-xs font-medium theme-text truncate">
                            {path.split('/').pop()}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {status === 'completed' && hasData && (
                        <div className="flex gap-1 text-[9px] font-bold">
                            {counts.class > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--warning-soft-bg)] text-[var(--warning-color)] border border-[var(--warning-soft-border)]">C:{counts.class}</span>}
                            {counts.function > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--success-soft-bg)] text-[var(--success-color)] border border-[var(--success-soft-border)]">F:{counts.function}</span>}
                        </div>
                    )}
                    {status === 'completed' && (
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1 theme-button-ghost rounded transition-colors"
                        >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Content / Skeleton View */}
            {isExpanded && hasData && (
                <div className="px-2 py-2 max-h-[300px] overflow-y-auto theme-code-surface animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1">
                        {symbols.map((s, i) => (
                            <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg theme-soft-hover transition-colors border border-transparent hover:border-[var(--accent-soft-border)] group/item">
                                <div className="text-[9px] font-mono theme-text-subtle w-6 text-right tabular-nums italic">
                                    L{s.line}
                                </div>
                                <div className={clsx(
                                    "p-1 rounded",
                                    s.kind === 'class' ? "bg-[var(--warning-soft-bg)] text-[var(--warning-color)]" :
                                    s.kind === 'function' ? "bg-[var(--success-soft-bg)] text-[var(--success-color)]" :
                                    "bg-[var(--accent-soft-bg)] text-[var(--accent-color)]"
                                )}>
                                    {s.kind === 'class' ? <Box size={10} /> : 
                                     s.kind === 'function' ? <Terminal size={10} /> : <Code2 size={10} />}
                                </div>
                                <span className="text-xs font-mono theme-text-muted truncate">
                                    {s.name}
                                </span>
                                <span className="ml-auto opacity-0 group-hover/item:opacity-100 text-[8px] font-black uppercase theme-text-subtle tracking-tighter transition-opacity">
                                    {s.kind}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty / Loading State */}
            {status === 'completed' && !hasData && (
                <div className="p-4 text-center">
                    <span className="text-[10px] theme-text-subtle italic">{t('aiChat.probeSymbol.empty')}</span>
                </div>
            )}
        </div>
    );
};
