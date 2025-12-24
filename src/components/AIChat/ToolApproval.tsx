import React, { useState, useEffect } from 'react';
import { Check, X, Terminal, FilePlus, Eye, FolderOpen, Search, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { ToolCall } from '../../stores/useChatStore';
import { useTranslation } from 'react-i18next';
import { readFileContent } from '../../utils/fileSystem';
import { MonacoDiffView } from '../Editor/MonacoDiffView';
import { getToolLabel, getToolColor } from 'ifainew-core';
import { useSettingsStore } from '../../stores/settingsStore';

interface ToolApprovalProps {
    toolCall: ToolCall;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

// 工具图标映射
const TOOL_ICONS: Record<string, React.ReactNode> = {
    'agent_write_file': <FilePlus size={14} />,
    'agent_read_file': <Eye size={14} />,
    'agent_list_dir': <FolderOpen size={14} />,
    'agent_execute_command': <Terminal size={14} />,
    'agent_search': <Search size={14} />,
    'agent_delete_file': <Trash2 size={14} />,
};

// 代码预览行数
const PREVIEW_LINES = 8;

export const ToolApproval = ({ toolCall, onApprove, onReject }: ToolApprovalProps) => {
    const { t } = useTranslation();
    const settings = useSettingsStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [oldContent, setOldContent] = useState<string | null>(null);
    const [isLoadingOld, setIsLoadingOld] = useState(false);

    const isPending = toolCall.status === 'pending';
    const isPartial = toolCall.isPartial;

    const getIcon = () => {
        const toolName = toolCall.tool.trim();
        for (const [key, icon] of Object.entries(TOOL_ICONS)) {
            if (toolName.includes(key.replace('agent_', ''))) {
                return icon;
            }
        }
        return <Terminal size={14} />;
    };

    const detectLanguage = (path: string): string => {
        if (!path) return 'plaintext';
        const ext = path.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            'js': 'javascript',
            'jsx': 'jsx',
            'ts': 'typescript',
            'tsx': 'tsx',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'json': 'json',
            'rs': 'rust',
            'py': 'python',
            'go': 'go',
            'md': 'markdown',
            'yaml': 'yaml',
            'yml': 'yaml',
            'toml': 'toml',
            'sh': 'bash',
            'bash': 'bash',
        };
        return langMap[ext || ''] || 'plaintext';
    };

    const getStatusColor = () => {
        switch (toolCall.status) {
            case 'completed': return 'text-green-400';
            case 'failed': return 'text-red-400';
            case 'rejected': return 'text-red-300';
            case 'approved': return 'text-blue-400';
            default: return 'text-yellow-400';
        }
    };

    const getStatusLabel = () => {
        if (isPartial) return '生成中...';
        switch (toolCall.status) {
            case 'completed': return '已完成';
            case 'failed': return '失败';
            case 'rejected': return '已拒绝';
            case 'approved': return '已批准';
            default: return '待审批';
        }
    };

    // 处理文件写入类工具
    const isWriteFile = toolCall.tool.includes('write_file');
    const filePath = toolCall.args?.rel_path || toolCall.args?.path || '';
    const newContent = toolCall.args?.content || '';

    // Load original content for diff (only when NOT streaming)
    useEffect(() => {
        // Only load when:
        // 1. It's a write file operation
        // 2. Generation is complete (!isPartial)
        // 3. Still pending approval
        // 4. Haven't loaded yet
        if (isWriteFile && filePath && !isPartial && isPending && !oldContent && !isLoadingOld) {
            const loadOld = async () => {
                setIsLoadingOld(true);
                try {
                    const content = await readFileContent(filePath);
                    setOldContent(content || '');
                } catch (e) {
                    console.log("[Diff] Original file not found, likely new file.");
                    setOldContent(''); // Assume new file if not found
                } finally {
                    setIsLoadingOld(false);
                }
            };
            loadOld();
        }
    }, [isWriteFile, filePath, isPartial, isPending]);

    return (
        <div className="mt-2 mb-2 bg-gray-800 rounded-lg border border-gray-600 overflow-hidden w-full max-w-full">
            <div className="flex items-center justify-between p-2 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-200 min-w-0">
                    <span className={`flex-shrink-0 ${getToolColor(toolCall.tool)}`}>
                        {getIcon()}
                    </span>
                    <span className="truncate">{getToolLabel(toolCall.tool)}</span>
                </div>
                <div className="flex items-center gap-2">
                    {isPartial && <Loader2 size={12} className="animate-spin text-yellow-400" />}
                    <span className={`text-xs font-medium flex-shrink-0 ${getStatusColor()}`}>
                        {getStatusLabel()}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-3 text-xs">
                {isWriteFile ? (
                    <div className="space-y-2">
                        {/* File Path */}
                        <div className="flex items-center gap-2 text-gray-400">
                            <span>路径:</span>
                            <code className="text-green-400 bg-gray-900 px-1.5 py-0.5 rounded break-all">
                                {filePath || (isPartial ? '...' : '')}
                            </code>
                        </div>

                        {/* Code Preview / Diff */}
                        {(newContent || isPartial) && (
                            <div className="relative">
                                {isPartial ? (
                                    // During streaming: show simple preview with streaming effect and collapse
                                    (() => {
                                        const contentLines = newContent.split('\n');
                                        const shouldCollapse = contentLines.length > PREVIEW_LINES;
                                        const displayContent = isExpanded
                                            ? newContent
                                            : contentLines.slice(0, PREVIEW_LINES).join('\n');

                                        return (
                                            <>
                                                <div className="max-h-80 overflow-auto rounded border border-gray-700 bg-gray-900">
                                                    <pre className="p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                                        <code>
                                                            {displayContent || '正在生成代码...'}
                                                            <span className="inline-block w-1.5 h-3 bg-blue-500 ml-0.5 animate-pulse" />
                                                        </code>
                                                    </pre>
                                                </div>
                                                {/* Expand/Collapse during streaming */}
                                                {shouldCollapse && newContent && (
                                                    <button
                                                        onClick={() => setIsExpanded(!isExpanded)}
                                                        className="w-full mt-1 py-1 text-xs text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1 bg-gray-900 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
                                                    >
                                                        {isExpanded ? (
                                                            <>
                                                                <ChevronUp size={12} />
                                                                收起 ({contentLines.length} 行)
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ChevronDown size={12} />
                                                                展开全部 ({contentLines.length} 行)
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </>
                                        );
                                    })()
                                ) : isLoadingOld ? (
                                    // Loading original file for diff
                                    <div className="h-16 bg-gray-900 rounded border border-gray-700 flex items-center justify-center text-gray-500 italic">
                                        加载当前内容以显示差异...
                                    </div>
                                ) : oldContent !== null && newContent ? (
                                    // Show diff when generation complete and old content loaded
                                    <div className="rounded border border-gray-700 overflow-hidden">
                                        <MonacoDiffView
                                            oldValue={oldContent}
                                            newValue={newContent}
                                            language={detectLanguage(filePath)}
                                            height={isExpanded ? 500 : 250}
                                        />
                                    </div>
                                ) : (
                                    // Fallback
                                    <div className="h-16 bg-gray-900 rounded border border-gray-700 flex items-center justify-center text-gray-600 italic">
                                        等待文件内容...
                                    </div>
                                )}

                                {/* Expand Button (only for diff view) */}
                                {newContent && !isPartial && oldContent !== null && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="w-full mt-1 py-1 text-xs text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1 bg-gray-900 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
                                    >
                                        {isExpanded ? <><ChevronUp size={12} /> 收起</> : <><ChevronDown size={12} /> 展开全屏预览</>}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    // 其他工具类型：显示 JSON 参数
                    <div className="space-y-2">
                        <div className="text-gray-400">参数:</div>
                        <pre className="bg-gray-900 p-2 rounded border border-gray-700 overflow-x-auto whitespace-pre-wrap break-words text-gray-300">
                            {Object.keys(toolCall.args || {}).length > 0 ? JSON.stringify(toolCall.args, null, 2) : (isPartial ? '...' : '{}')}
                        </pre>
                    </div>
                )}
            </div>

            {/* Approve/Reject Buttons - Hide when partial or auto-approve is enabled */}
            {isPending && !isPartial && !settings.agentAutoApprove && (
                <div className="flex border-t border-gray-700">
                    <button
                        onClick={() => onApprove(toolCall.id)}
                        className="flex-1 p-2 text-xs font-medium text-green-400 hover:bg-green-900/30 flex items-center justify-center gap-1 border-r border-gray-700 transition-colors"
                    >
                        <Check size={14} />
                        批准
                    </button>
                    <button
                        onClick={() => onReject(toolCall.id)}
                        className="flex-1 p-2 text-xs font-medium text-red-400 hover:bg-red-900/30 flex items-center justify-center gap-1 transition-colors"
                    >
                        <X size={14} />
                        拒绝
                    </button>
                </div>
            )}

            {/* Auto-approve indicator */}
            {isPending && !isPartial && settings.agentAutoApprove && (
                <div className="border-t border-gray-700 px-4 py-2 bg-blue-600/10">
                    <p className="text-xs text-blue-400">
                        ⚡ 自动批准已启用，工具调用将自动执行
                    </p>
                </div>
            )}

            {/* Result */}
            {toolCall.status === 'completed' && toolCall.result && (
                <div className="p-2 border-t border-gray-700 bg-green-900/10 text-xs text-green-300">
                    <span className="font-medium">结果: </span>
                    <span className="break-all">{toolCall.result}</span>
                </div>
            )}
            {toolCall.status === 'failed' && toolCall.result && (
                <div className="p-2 border-t border-gray-700 bg-red-900/10 text-xs text-red-300">
                    <span className="font-medium">错误: </span>
                    <span className="break-all">{toolCall.result}</span>
                </div>
            )}
        </div>
    );
};
