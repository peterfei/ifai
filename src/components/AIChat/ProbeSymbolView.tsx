import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, Layers, Code2, Box, Terminal } from 'lucide-react';
import { SymbolProbe } from '../../utils/symbol-extractor';
import { clsx } from 'clsx';

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
        <div className="my-2 rounded-xl overflow-hidden border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm group/probe">
            {/* Header / Pipeline Stage */}
            <div className="px-4 py-3 flex items-center justify-between gap-3 bg-blue-500/10 border-b border-blue-500/10">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={clsx(
                        "p-1.5 rounded-lg bg-blue-600/20 text-blue-400 flex-shrink-0",
                        status === 'pending' && "animate-pulse"
                    )}>
                        <Search size={14} className={status === 'pending' ? "animate-spin" : ""} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-400/80 leading-none mb-1">
                            Symbol Probe Pipeline
                        </span>
                        <span className="text-xs font-medium text-gray-300 truncate">
                            {path.split('/').pop()}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {status === 'completed' && hasData && (
                        <div className="flex gap-1 text-[9px] font-bold">
                            {counts.class > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">C:{counts.class}</span>}
                            {counts.function > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">F:{counts.function}</span>}
                        </div>
                    )}
                    {status === 'completed' && (
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1 hover:bg-white/5 rounded text-gray-500 transition-colors"
                        >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Content / Skeleton View */}
            {isExpanded && hasData && (
                <div className="px-2 py-2 max-h-[300px] overflow-y-auto bg-black/20 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1">
                        {symbols.map((s, i) => (
                            <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 group/item">
                                <div className="text-[9px] font-mono text-gray-600 w-6 text-right tabular-nums italic">
                                    L{s.line}
                                </div>
                                <div className={clsx(
                                    "p-1 rounded text-white/80",
                                    s.kind === 'class' ? "bg-amber-500/20 text-amber-400" :
                                    s.kind === 'function' ? "bg-emerald-500/20 text-emerald-400" :
                                    "bg-blue-500/20 text-blue-400"
                                )}>
                                    {s.kind === 'class' ? <Box size={10} /> : 
                                     s.kind === 'function' ? <Terminal size={10} /> : <Code2 size={10} />}
                                </div>
                                <span className="text-xs font-mono text-gray-300 truncate">
                                    {s.name}
                                </span>
                                <span className="ml-auto opacity-0 group-hover/item:opacity-100 text-[8px] font-black uppercase text-gray-600 tracking-tighter transition-opacity">
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
                    <span className="text-[10px] text-gray-500 italic">No significant symbols detected in this file.</span>
                </div>
            )}
        </div>
    );
};
