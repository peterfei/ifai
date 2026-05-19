import React, { useState, useMemo } from 'react';
import { FolderOpen, File, Loader2, CheckCircle2, XCircle, Terminal, Layers, Search, Activity } from 'lucide-react';
import { ToolCall } from '../../stores/useChatStore';
import { ToolApproval } from './ToolApproval';
import { useTranslation } from 'react-i18next';

interface ToolBatchApprovalProps {
    batchId: string;
    toolCalls: ToolCall[];
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    message: any;
}

/**
 * 🏆 v0.3.12 分组版本 - 按工具类型分组显示
 *
 * 架构要点：
 * - 依赖父组件稳定的 useCallback 回调（已在 MessageItem 中实现）
 * - 只在必要的地方使用 useMemo（分组是昂贵操作）
 * - 不使用 React.memo，因为 props 现在已经稳定
 */
export const ToolBatchApproval: React.FC<ToolBatchApprovalProps> = ({
    batchId,
    toolCalls,
    onApprove,
    onReject,
    message
}) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);

    // 1. 统计信息
    const stats = useMemo(() => {
        const total = toolCalls.length;
        const completed = toolCalls.filter(tc => tc.status === 'completed').length;
        const pending = toolCalls.filter(tc => tc.status === 'pending').length;
        const failed = toolCalls.filter(tc => tc.status === 'failed').length;
        const isRunning = toolCalls.some(tc => tc.isPartial || tc.status === 'approved' || (tc.status === 'pending' && total === 1));

        let charCount = 0;
        toolCalls.forEach(tc => {
            const res = tc.result || (tc as any).output || "";
            charCount += typeof res === 'string' ? res.length : JSON.stringify(res).length;
        });
        const estimatedTokens = Math.ceil(charCount / 4) + 1000;
        const tokenLabel = estimatedTokens >= 1000 ? (estimatedTokens / 1000).toFixed(1) + 'k' : estimatedTokens;

        return { total, completed, pending, failed, isRunning, tokens: tokenLabel };
    }, [toolCalls]);

    // 2. 按类型分组（这是昂贵的操作，使用 useMemo）
    const groupedToolCalls = useMemo(() => {
        const groups: Array<{ key: string; label: string; icon: any; color: string; calls: ToolCall[] }> = [];

        // 定义分组
        const definitions = [
            { key: 'read', label: t('aiChat.toolBatchApproval.groups.read'), icon: File, color: 'text-[var(--accent-color)]', test: (toolName: string) => toolName.includes('read') },
            { key: 'list', label: t('aiChat.toolBatchApproval.groups.list'), icon: FolderOpen, color: 'text-[var(--success-color)]', test: (toolName: string) => toolName.includes('list') || toolName.includes('dir') },
            { key: 'search', label: t('aiChat.toolBatchApproval.groups.search'), icon: Search, color: 'text-[var(--warning-color)]', test: (toolName: string) => toolName.includes('search') || toolName.includes('grep') },
            { key: 'write', label: t('aiChat.toolBatchApproval.groups.write'), icon: Terminal, color: 'text-[var(--accent-color)]', test: (toolName: string) => toolName.includes('write') || toolName.includes('create') || toolName.includes('edit') },
            { key: 'analyze', label: t('aiChat.toolBatchApproval.groups.analyze'), icon: Activity, color: 'text-[var(--info-color)]', test: (toolName: string) => toolName.includes('scan') || toolName.includes('analyze') },
            { key: 'other', label: t('aiChat.toolBatchApproval.groups.other'), icon: Layers, color: 'theme-text-subtle', test: () => true }
        ];

        // 分配 toolCalls 到分组
        const buckets = new Map<string, ToolCall[]>();
        definitions.forEach(def => buckets.set(def.key, []));

        toolCalls.forEach(tc => {
            const tool = tc.tool.toLowerCase();
            console.log('[ToolBatchApproval] Grouping tool:', tool, 'id:', tc.id);
            for (const def of definitions) {
                if (def.test(tool)) {
                    buckets.get(def.key)!.push(tc);
                    console.log('[ToolBatchApproval]   → Assigned to group:', def.key);
                    break;
                }
            }
        });

        // 转换为数组（只包含非空分组）
        definitions.forEach(def => {
            const calls = buckets.get(def.key)!;
            if (calls.length > 0) {
                groups.push({ key: def.key, label: def.label, icon: def.icon, color: def.color, calls });
                console.log('[ToolBatchApproval] Group:', def.key, 'has', calls.length, 'tools');
            }
        });

        console.log('[ToolBatchApproval] Total groups:', groups.length);
        return groups;
    }, [toolCalls, t]);

    // 3. 最新动作（用于折叠状态显示）
    const latestAction = useMemo(() => {
        for (const group of groupedToolCalls) {
            const running = group.calls.find(tc => tc.isPartial || tc.status === 'approved' || tc.status === 'pending');
            if (running) {
                const tool = running.tool.toLowerCase();
                const args = running.args as any;
                const path = args?.rel_path || args?.path || '.';
                const action = tool.includes('write')
                    ? t('aiChat.toolBatchApproval.actions.write')
                    : (tool.includes('read')
                        ? t('aiChat.toolBatchApproval.actions.read')
                        : (tool.includes('list') || tool.includes('dir')
                            ? t('aiChat.toolBatchApproval.actions.list')
                            : t('aiChat.toolBatchApproval.actions.search')));
                // 折叠路径：保留首目录和文件名
                const shortPath = path.length > 50
                    ? path.split('/').length > 3
                        ? path.split('/')[0] + '/.../' + path.split('/').pop()
                        : path
                    : path;
                return { action, path: shortPath };
            }
        }
        return null;
    }, [groupedToolCalls, t]);

    // 4. 任务描述
    const taskTitle = useMemo(() => {
        const paths = toolCalls.map(tc => {
            const args = tc.args as any;
            return args?.rel_path || args?.path || '';
        });
        if (paths.some(p => p.includes('core') || p.includes('private'))) return t('aiChat.toolBatchApproval.taskTitle.privateRepo');
        if (toolCalls.length > 5) return t('aiChat.toolBatchApproval.taskTitle.exploreProject');
        return t('aiChat.toolBatchApproval.taskTitle.analyzeKeyFiles');
    }, [toolCalls, t]);

    const getStatusIcon = () => {
        if (stats.isRunning) return <Loader2 size={14} className="animate-spin text-[var(--accent-color)]" />;
        if (stats.failed > 0) return <XCircle size={14} className="text-[var(--danger-color)]" />;
        return <CheckCircle2 size={14} className="text-[var(--success-color)]" />;
    };

    return (
        <div data-testid="tool-batch-card" className="my-4 group/batch animate-in fade-in slide-in-from-left-2 duration-500">
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-3 cursor-pointer select-none group"
            >
                <div className="flex items-center justify-center w-5 h-5">
                    {getStatusIcon()}
                </div>
                <div className="flex items-center gap-2 text-[12px] font-bold theme-text-muted">
                    <span>{t('aiChat.toolBatchApproval.headerSummary', {
                        status: stats.isRunning ? t('aiChat.toolBatchApproval.status.running') : t('aiChat.toolBatchApproval.status.completed'),
                        groupCount: groupedToolCalls.length,
                        toolCount: stats.total
                    })}</span>
                    <span className="text-[10px] theme-text-subtle font-normal">({t('aiChat.toolBatchApproval.expandHint')})</span>
                </div>
            </div>

            {/* Body */}
            <div className="ml-2.5 mt-1 border-l theme-border pl-4 py-1 space-y-2">
                {/* 任务主行 */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold theme-text">{taskTitle}</span>
                        <span className="text-[10px] theme-text-subtle font-mono">
                            · {t('aiChat.toolBatchApproval.toolUses', { count: stats.total })} · {stats.tokens} {t('aiChat.toolBatchApproval.tokens')}
                        </span>
                    </div>

                    {/* 子动态行 */}
                    <div className="flex items-center gap-2 mt-1 animate-in slide-in-from-left-1">
                        <div className="w-3 h-3 border-l border-b theme-border rounded-bl-sm" />
                        {!isExpanded ? (
                            <div className="flex items-center gap-2 text-[11px] font-mono">
                                {stats.isRunning ? (
                                    <>
                                        <span className="text-[var(--accent-color)] font-bold">{latestAction?.action}:</span>
                                        <span className="theme-text-muted max-w-full break-all">{latestAction?.path}</span>
                                    </>
                                ) : (
                                    <span className="text-[var(--success-color)] font-bold italic">{t('aiChat.toolBatchApproval.done')}</span>
                                )}
                            </div>
                        ) : (
                            <span className="text-[10px] theme-text-subtle italic">{t('aiChat.toolBatchApproval.showingDetails')}</span>
                        )}
                    </div>
                </div>

                {/* 分组详情 */}
                {isExpanded && (
                    <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                        {groupedToolCalls.map((group) => {
                            const Icon = group.icon;
                            return (
                                <div key={group.key} className="rounded-lg theme-panel-muted border theme-border overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 theme-panel border-b theme-border">
                                        <Icon size={14} className={group.color} />
                                        <span className="text-sm font-semibold theme-text">
                                            {group.label} ({group.calls.length})
                                        </span>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        {group.calls.map((tc) => (
                                            <div key={tc.id} className="relative transition-transform active:scale-[0.99]">
                                                <ToolApproval
                                                    toolCall={tc}
                                                    onApprove={() => onApprove(tc.id)}
                                                    onReject={() => onReject(tc.id)}
                                                    message={message}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 批量批准按钮 */}
            {!isExpanded && stats.pending > 0 && (
                <div className="ml-7 mt-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toolCalls.forEach(tc => tc.status === 'pending' && !tc.isPartial && onApprove(tc.id));
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent-color)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-soft-border)] transition-all shadow-lg"
                    >
                        <Terminal size={12} /> {t('aiChat.toolBatchApproval.approveAll', { count: stats.pending })}
                    </button>
                </div>
            )}
        </div>
    );
};
