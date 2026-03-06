import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, File, Loader2, CheckCircle2, XCircle, Terminal, Database, Layers, Search, Eye, Activity } from 'lucide-react';
import { ToolCall } from '../../stores/useChatStore';
import { ToolApproval } from './ToolApproval';

interface ToolBatchApprovalProps {
    batchId: string;
    toolCalls: ToolCall[];
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    message: any;
}

/**
 * 🏆 v0.3.6 全局单例聚合组件 (Global Singleton Batch)
 * 
 * 实现“单卡片多任务”逻辑，模拟工业级终端动作流。
 */
export const ToolBatchApproval: React.FC<ToolBatchApprovalProps> = ({
    batchId,
    toolCalls,
    onApprove,
    onReject,
    message
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // 1. 统计信息
    const stats = useMemo(() => {
        const total = toolCalls.length;
        const completed = toolCalls.filter(tc => tc.status === 'completed').length;
        const pending = toolCalls.filter(tc => tc.status === 'pending').length;
        const failed = toolCalls.filter(tc => tc.status === 'failed').length;
        const isRunning = toolCalls.some(tc => tc.isPartial || tc.status === 'approved' || (tc.status === 'pending' && total === 1));
        
        // 🏆 PIVO 3.0: 物理级 Token 动态统计
        let charCount = 0;
        toolCalls.forEach(tc => {
            const res = tc.result || tc.output || "";
            charCount += typeof res === 'string' ? res.length : JSON.stringify(res).length;
        });
        // 换算公式：1 Token ≈ 4 字符，并加上 1k 的基础上下文消耗
        const estimatedTokens = Math.ceil(charCount / 4) + 1000;
        const tokenLabel = estimatedTokens >= 1000 ? (estimatedTokens / 1000).toFixed(1) + 'k' : estimatedTokens;

        return { total, completed, pending, failed, isRunning, tokens: tokenLabel };
    }, [toolCalls]);

    // 2. 动作流日志 (High Density)
    const latestAction = useMemo(() => {
        const last = toolCalls[toolCalls.length - 1];
        if (!last) return null;
        const tool = last.tool.toLowerCase();
        const path = last.args?.rel_path || last.args?.path || '.';
        const action = tool.includes('read') ? 'Read' : (tool.includes('list') || tool.includes('dir') ? 'List' : 'Search');
        return { action, path, status: last.status };
    }, [toolCalls]);

    // 3. 任务描述 (基于工具类型和路径猜测)
    const taskTitle = useMemo(() => {
        const paths = toolCalls.map(tc => tc.args?.rel_path || tc.args?.path || '');
        if (paths.some(p => p.includes('core') || p.includes('private'))) return '访问 ifainew-core 私有库';
        if (toolCalls.length > 5) return '探索项目整体结构';
        return '分析项目关键文件';
    }, [toolCalls]);

    const getStatusIcon = () => {
        if (stats.isRunning) return <Loader2 size={14} className="animate-spin text-blue-400" />;
        if (stats.failed > 0) return <XCircle size={14} className="text-red-400" />;
        return <CheckCircle2 size={14} className="text-green-500" />;
    };

    return (
        <div data-testid="tool-batch-card" className="my-4 group/batch animate-in fade-in slide-in-from-left-2 duration-500">
            {/* 🏆 Header: 紧凑状态行 (模仿截图) */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-3 cursor-pointer select-none group"
            >
                <div className="flex items-center justify-center w-5 h-5">
                    {getStatusIcon()}
                </div>
                <div className="flex items-center gap-2 text-[12px] font-bold text-gray-300">
                    <span>{stats.isRunning ? 'Running' : 'Completed'} {stats.total} Explore actions...</span>
                    <span className="text-[10px] text-gray-500 font-normal">(ctrl+o to expand)</span>
                </div>
            </div>

            {/* 🏆 Body: 终端风格动作流 */}
            <div className="ml-2.5 mt-1 border-l border-gray-800 pl-4 py-1 space-y-2">
                {/* 任务主行 */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-gray-100">{taskTitle}</span>
                        <span className="text-[10px] text-gray-500 font-mono">· {stats.total} tool uses · {stats.tokens} tokens</span>
                    </div>
                    
                    {/* 子动态行 (始终显示最新动作) */}
                    <div className="flex items-center gap-2 mt-1 animate-in slide-in-from-left-1">
                        <div className="w-3 h-3 border-l border-b border-gray-700 rounded-bl-sm" />
                        {!isExpanded ? (
                            <div className="flex items-center gap-2 text-[11px] font-mono">
                                {stats.isRunning ? (
                                    <>
                                        <span className="text-blue-400 font-bold">{latestAction?.action}:</span>
                                        <span className="text-gray-400 truncate max-w-[280px]">{latestAction?.path}</span>
                                    </>
                                ) : (
                                    <span className="text-green-500 font-bold italic">Done</span>
                                )}
                            </div>
                        ) : (
                            <span className="text-[10px] text-gray-500 italic">Showing all details below</span>
                        )}
                    </div>
                </div>

                {/* 🏆 详细卡片区 (仅在展开时显示) */}
                {isExpanded && (
                    <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                        {toolCalls.map((tc) => (
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
                )}
            </div>

            {/* 🏆 底部批量批准 (仅在折叠且有待审批时显示) */}
            {!isExpanded && stats.pending > 0 && (
                <div className="ml-7 mt-2">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            toolCalls.forEach(tc => tc.status === 'pending' && !tc.isPartial && onApprove(tc.id));
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/20 transition-all shadow-lg shadow-blue-500/5"
                    >
                        <Terminal size={12} /> 批准全部执行 ({stats.pending})
                    </button>
                </div>
            )}
        </div>
    );
};
