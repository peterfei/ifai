import React, { useState, useEffect, useLayoutEffect } from 'react';
import { Check, X, Terminal, FilePlus, Eye, FolderOpen, Search, Trash2, ChevronDown, ChevronUp, Loader2, File, Folder } from 'lucide-react';
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

// Helper to check if result is a file listing (JSON array of file paths)
const isFileListing = (result: string): string[] | null => {
    try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed) && parsed.length > 0) {
            // Check if all items are strings (file paths)
            if (parsed.every(item => typeof item === 'string')) {
                return parsed as string[];
            }
        }
    } catch {
        // Not JSON, return null
    }
    return null;
};

// Component to display file listing nicely
const FileListingResult: React.FC<{ files: string[] }> = ({ files }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const maxPreview = 8;
    const shouldCollapse = files.length > maxPreview;
    const displayFiles = shouldCollapse && !isExpanded ? files.slice(0, maxPreview) : files;

    return (
        <div className="space-y-1">
            {displayFiles.map((file, index) => {
                const fileName = file.split('/').pop() || file;
                const isDir = file.endsWith('/') || (!fileName.includes('.') && !file.includes('/'));
                const Icon = isDir ? Folder : File;

                return (
                    <div key={index} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-gray-900/50 hover:bg-gray-900 transition-colors">
                        <Icon size={12} className={isDir ? "text-yellow-500" : "text-gray-400"} />
                        <span className="flex-1 truncate text-gray-300 font-mono" title={file}>
                            {fileName}
                        </span>
                        {file !== fileName && (
                            <span className="text-gray-600 text-[10px] truncate ml-auto" title={file}>
                                {file.substring(0, 30)}{file.length > 30 ? '...' : ''}
                            </span>
                        )}
                    </div>
                );
            })}
            {shouldCollapse && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full mt-1 py-1 text-xs text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 bg-gray-900 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
                >
                    {isExpanded ? (
                        <><ChevronUp size={12} /> 收起 ({files.length} 个文件)</>
                    ) : (
                        <><ChevronDown size={12} /> 展开全部 ({files.length} 个文件)</>
                    )}
                </button>
            )}
        </div>
    );
};

// PERFORMANCE: Large file thresholds to avoid expensive Monaco Diff rendering
const MAX_DIFF_SIZE = 5000;  // 5000字符阈值 - 超过此大小跳过Monaco Diff
const MAX_LINES_COLLAPSED = 50;  // 50行折叠阈值

export const ToolApproval = ({ toolCall, onApprove, onReject }: ToolApprovalProps) => {
    const { t } = useTranslation();
    const settings = useSettingsStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [oldContent, setOldContent] = useState<string | null>(null);

    const isPending = toolCall.status === 'pending';
    const isPartial = toolCall.isPartial;

    const getIcon = () => {
        if (!toolCall.tool) return <Terminal size={14} />;
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
    const isWriteFile = toolCall.tool?.includes('write_file') || false;
    const filePath = toolCall.args?.rel_path || toolCall.args?.path || '';
    const newContent = toolCall.args?.content || '';

    // Load original content for diff (only when NOT streaming)
    // CRITICAL FIXES for flicker-free rendering:
    // 1. Use useLayoutEffect instead of useEffect - runs BEFORE browser paints
    // 2. Remove isLoadingOld intermediate state - no loading indicator means no visual flicker
    // 3. Load old content asynchronously and update when ready
    useLayoutEffect(() => {
        // Only load when:
        // 1. It's a write file operation
        // 2. Generation is complete (!isPartial)
        // 3. Haven't loaded yet
        if (isWriteFile && filePath && !isPartial && oldContent === null) {
            const loadOld = async () => {
                try {
                    const content = await readFileContent(filePath);
                    setOldContent(content || '');
                } catch (e) {
                    console.warn("[ToolApproval] Failed to load old content:", e);
                    setOldContent(''); // Assume new file if not found or load failed
                }
            };
            loadOld();
        }
    }, [isWriteFile, filePath, isPartial, oldContent]);

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
                                ) : oldContent !== null && newContent ? (
                                    // Show diff when generation complete and old content loaded
                                    (() => {
                                        // PERFORMANCE: Check content size before creating expensive Monaco Diff
                                        const contentLength = newContent.length;
                                        const contentLines = newContent.split('\n').length;

                                        // Skip Monaco Diff for large files to avoid 700-1400ms initialization
                                        if (contentLength > MAX_DIFF_SIZE) {
                                            const shouldCollapse = contentLines > MAX_LINES_COLLAPSED;
                                            const displayContent = isExpanded
                                                ? newContent
                                                : newContent.split('\n').slice(0, MAX_LINES_COLLAPSED).join('\n');

                                            return (
                                                <div>
                                                    <div className="mb-2 p-2 bg-yellow-900/20 rounded border border-yellow-700/50 text-xs text-yellow-300">
                                                        ⚠️ 文件较大 ({(contentLength / 1024).toFixed(1)}KB, {contentLines}行)，跳过差异显示以提升性能
                                                    </div>
                                                    <div className="max-h-80 overflow-auto rounded border border-gray-700 bg-gray-900">
                                                        <pre className="p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                                            {displayContent}
                                                        </pre>
                                                    </div>
                                                    {shouldCollapse && (
                                                        <button
                                                            onClick={() => setIsExpanded(!isExpanded)}
                                                            className="w-full mt-1 py-1 text-xs text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1 bg-gray-900 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
                                                        >
                                                            {isExpanded ? (
                                                                <>
                                                                    <ChevronUp size={12} />
                                                                    收起 ({contentLines} 行)
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <ChevronDown size={12} />
                                                                    展开全部 ({contentLines} 行)
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        }

                                        // Small to medium files: Use Monaco Diff
                                        return (
                                            <div className="rounded border border-gray-700 overflow-hidden">
                                                <MonacoDiffView
                                                    oldValue={oldContent}
                                                    newValue={newContent}
                                                    language={detectLanguage(filePath)}
                                                    height={isExpanded ? 500 : 250}
                                                />
                                            </div>
                                        );
                                    })()
                                ) : (
                                    // Fallback: Show new content without diff when old content hasn't loaded yet
                                    // This prevents flicker by immediately showing content instead of a loading message
                                    newContent ? (
                                        <div className="max-h-80 overflow-auto rounded border border-gray-700 bg-gray-900">
                                            <pre className="p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                                <code>{newContent}</code>
                                            </pre>
                                        </div>
                                    ) : (
                                        // Edge case: no content available (shouldn't happen in normal flow)
                                        <div className="p-3 bg-gray-800 rounded border border-gray-600">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm text-gray-400">
                                                    {toolCall.status === 'completed' ? '文件内容加载失败' : '等待文件内容...'}
                                                </span>
                                                {toolCall.status === 'completed' && (
                                                    <button
                                                        onClick={() => {
                                                            setOldContent(null);  // 触发重新加载
                                                        }}
                                                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                                                    >
                                                        重试加载
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
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
                    // 其他工具类型：显示参数或摘要
                    <div className="space-y-2">
                        {(() => {
                            const toolName = toolCall.tool || '';
                            const args = toolCall.args || {};

                            // Special handling for agent_scan_directory - show clean summary
                            if (toolName.includes('scan_directory')) {
                                const relPath = args.rel_path || args.path || '.';
                                const pattern = args.pattern;
                                const maxDepth = args.max_depth;
                                const maxFiles = args.max_files;

                                return (
                                    <div className="space-y-1">
                                        <div className="text-gray-400">扫描目录:</div>
                                        <code className="text-green-400 bg-gray-900 px-2 py-1 rounded text-sm font-mono">
                                            {relPath}
                                        </code>
                                        {(pattern || maxDepth !== undefined || maxFiles !== undefined) && (
                                            <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-gray-500">
                                                {pattern && <span className="bg-gray-800 px-1.5 py-0.5 rounded">模式: {pattern}</span>}
                                                {maxDepth !== undefined && <span className="bg-gray-800 px-1.5 py-0.5 rounded">深度: {maxDepth}</span>}
                                                {maxFiles !== undefined && <span className="bg-gray-800 px-1.5 py-0.5 rounded">最大文件: {maxFiles}</span>}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // Special handling for agent_batch_read - show file count
                            if (toolName.includes('batch_read')) {
                                const paths = args.paths || [];
                                return (
                                    <div className="space-y-1">
                                        <div className="text-gray-400">批量读取文件:</div>
                                        <div className="text-green-400 bg-gray-900 px-2 py-1 rounded text-sm">
                                            {paths.length} 个文件
                                        </div>
                                        {paths.length > 0 && paths.length <= 5 && (
                                            <div className="mt-1 space-y-0.5">
                                                {paths.map((p: string, i: number) => (
                                                    <div key={i} className="text-[10px] text-gray-500 truncate font-mono" title={p}>
                                                        • {p.split('/').pop() || p}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // Special handling for agent_read_file - show file path
                            if (toolName.includes('read_file')) {
                                const relPath = args.rel_path || args.path || '';
                                return (
                                    <div className="space-y-1">
                                        <div className="text-gray-400">读取文件:</div>
                                        <code className="text-green-400 bg-gray-900 px-2 py-1 rounded text-sm font-mono break-all">
                                            {relPath}
                                        </code>
                                    </div>
                                );
                            }

                            // Default: show JSON parameters
                            return (
                                <>
                                    <div className="text-gray-400">参数:</div>
                                    <pre className="bg-gray-900 p-2 rounded border border-gray-700 overflow-x-auto whitespace-pre-wrap break-words text-gray-300">
                                        {Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : (isPartial ? '...' : '{}')}
                                    </pre>
                                </>
                            );
                        })()}
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
            {toolCall.status === 'completed' && toolCall.result && (() => {
                const fileListing = isFileListing(toolCall.result);
                if (fileListing) {
                    return (
                        <div className="p-2 border-t border-gray-700 bg-green-900/10">
                            <div className="text-xs text-green-300 font-medium mb-2">
                                📁 找到 {fileListing.length} 个文件/目录:
                            </div>
                            <FileListingResult files={fileListing} />
                        </div>
                    );
                }
                return (
                    <div className="p-2 border-t border-gray-700 bg-green-900/10 text-xs text-green-300">
                        <span className="font-medium">结果: </span>
                        <span className="break-all">{toolCall.result}</span>
                    </div>
                );
            })()}
            {toolCall.status === 'failed' && toolCall.result && (
                <div className="p-2 border-t border-gray-700 bg-red-900/10 text-xs text-red-300">
                    <span className="font-medium">错误: </span>
                    <span className="break-all">{toolCall.result}</span>
                </div>
            )}
        </div>
    );
};
