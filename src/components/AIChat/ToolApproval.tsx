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

// 文件扩展名到语言的映射
const FILE_EXT_TO_LANG: Record<string, string> = {
    'js': 'JavaScript', 'jsx': 'JavaScript', 'ts': 'TypeScript', 'tsx': 'TypeScript',
    'py': 'Python', 'rb': 'Ruby', 'go': 'Go', 'rs': 'Rust', 'java': 'Java',
    'c': 'C', 'cpp': 'C++', 'cs': 'C#', 'php': 'PHP', 'swift': 'Swift',
    'kt': 'Kotlin', 'scala': 'Scala', 'sh': 'Shell', 'bash': 'Bash',
    'html': 'HTML', 'css': 'CSS', 'scss': 'SCSS', 'less': 'Less',
    'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'yml': 'YAML',
    'md': 'Markdown', 'sql': 'SQL', 'dockerfile': 'Docker', 'vim': 'Vim',
};

// 检测文件语言类型
const detectLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    return FILE_EXT_TO_LANG[ext] || 'Text';
};

// 代码块显示组件
const CodeBlock: React.FC<{
    code: string;
    language: string;
    maxLines?: number;
    fileName?: string;
}> = ({ code, language, maxLines = 20, fileName }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const lines = code.split('\n');
    const lineCount = lines.length;
    const shouldCollapse = lineCount > maxLines;
    const displayLines = shouldCollapse && !isExpanded ? lines.slice(0, maxLines) : lines;

    return (
        <div className="rounded-lg border border-gray-700/50 bg-gray-900/80 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/50 border-b border-gray-700/30">
                <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 text-[10px] font-medium text-blue-400 bg-blue-500/10 rounded border border-blue-500/20">
                        {language}
                    </span>
                    {fileName && (
                        <span className="text-[10px] text-gray-500 font-mono">
                            {fileName}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-500">
                        {lineCount} 行
                    </span>
                    {shouldCollapse && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="px-2.5 py-1 text-[10px] font-medium text-gray-400 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-700/50 rounded border border-gray-700/50 transition-all duration-200"
                        >
                            {isExpanded ? '收起' : `展开全部`}
                        </button>
                    )}
                </div>
            </div>

            {/* Code with line numbers */}
            <div className="overflow-auto max-h-64">
                <div className="flex">
                    {/* Line numbers */}
                    <div className="flex-shrink-0 px-3 py-3 bg-gray-900/30 border-r border-gray-700/30 text-gray-600 text-[11px] font-mono leading-6 select-none">
                        {displayLines.map((_, i) => (
                            <div key={i} className="text-right">
                                {i + 1}
                            </div>
                        ))}
                    </div>
                    {/* Code content */}
                    <pre className="flex-1 px-4 py-3 text-xs text-gray-300 font-mono whitespace-pre break-words leading-6">
                        <code>{displayLines.join('\n')}</code>
                        {!isExpanded && shouldCollapse && (
                            <div className="mt-4 pt-3 border-t border-dashed border-gray-700 text-center">
                                <span className="text-[10px] text-gray-500">
                                    ... 还有 {lineCount - maxLines} 行 ...
                                </span>
                            </div>
                        )}
                    </pre>
                </div>
            </div>
        </div>
    );
};

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

// Helper to organize paths into a tree structure for better visualization (Point 3)
const FileTreeVisualizer: React.FC<{ paths: string[] }> = ({ paths }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    
    // Group paths by directory
    const tree = React.useMemo(() => {
        const root: any = { nodes: {}, files: [] };
        paths.forEach(path => {
            const parts = path.split('/');
            const fileName = parts.pop() || '';
            let current = root;
            parts.forEach(dir => {
                if (!current.nodes[dir]) current.nodes[dir] = { nodes: {}, files: [] };
                current = current.nodes[dir];
            });
            current.files.push(fileName);
        });
        return root;
    }, [paths]);

    const renderNode = (node: any, name: string, depth: number) => (
        <div key={name} style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
            {name && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 py-0.5">
                    <FolderOpen size={10} className="text-yellow-500/70" />
                    <span className="font-medium">{name}</span>
                </div>
            )}
            <div className={name ? "border-l border-gray-700/50 ml-1.5 pl-2" : ""}>
                {Object.keys(node.nodes).map(dir => renderNode(node.nodes[dir], dir, depth + 1))}
                {node.files.map((file: string) => (
                    <div key={file} className="flex items-center gap-1.5 text-[11px] text-gray-300 py-0.5 group">
                        <File size={10} className="text-blue-400/70" />
                        <span className="truncate group-hover:text-blue-300 transition-colors cursor-default">{file}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="bg-gray-900/40 rounded-lg border border-gray-700/30 p-2.5">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">文件结构</span>
                <button onClick={() => setIsExpanded(!isExpanded)} className="text-gray-500 hover:text-gray-300">
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
            </div>
            {isExpanded && renderNode(tree, '', 0)}
        </div>
    );
};

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
        <div className="mt-3 mb-3 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl border border-gray-700/50 overflow-hidden w-full max-w-full shadow-lg">
            {/* Header with gradient background */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-gray-900/80 to-gray-800/80 border-b border-gray-700/50">
                <div className="flex items-center gap-2.5">
                    <span className={`flex items-center justify-center w-7 h-7 rounded-lg ${getToolColor(toolCall.tool)} bg-opacity-20`}>
                        {getIcon()}
                    </span>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-100">
                            {getToolLabel(toolCall.tool)}
                        </span>
                        {filePath && (
                            <span className="text-[10px] text-gray-500 font-mono truncate max-w-[200px]" title={filePath}>
                                {filePath}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isPartial && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 rounded-full">
                            <Loader2 size={10} className="animate-spin text-yellow-400" />
                            <span className="text-[10px] font-medium text-yellow-400">生成中</span>
                        </div>
                    )}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                        toolCall.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                        toolCall.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                        toolCall.status === 'approved' ? 'bg-blue-500/10 text-blue-400' :
                        toolCall.status === 'rejected' ? 'bg-gray-500/10 text-gray-400' :
                        'bg-amber-500/10 text-amber-400'
                    }`}>
                        {getStatusLabel()}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="px-4 pb-3">
                {isWriteFile ? (
                    <div className="space-y-3">
                        {/* File Path - cleaner display */}
                        {filePath && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-700/30">
                                <File size={14} className="text-blue-400" />
                                <code className="text-sm text-gray-300 font-mono break-all">
                                    {filePath}
                                </code>
                            </div>
                        )}

                        {/* Code Preview / Diff - Enhanced styling */}
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
                                                <div className="rounded-lg border border-gray-700/50 bg-gray-900/80 overflow-hidden shadow-inner">
                                                    <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700/50">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                                                            <span className="text-[11px] font-medium text-yellow-400">
                                                                生成中...
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-gray-500">
                                                            {contentLines.length} 行
                                                        </span>
                                                    </div>
                                                    <div className="max-h-80 overflow-auto p-3">
                                                        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                                            <code>
                                                                {displayContent || '正在生成代码...'}
                                                                <span className="inline-block w-1.5 h-3 bg-blue-500 ml-0.5 animate-pulse" />
                                                            </code>
                                                        </pre>
                                                    </div>
                                                </div>
                                                {/* Expand/Collapse during streaming */}
                                                {shouldCollapse && newContent && (
                                                    <button
                                                        onClick={() => setIsExpanded(!isExpanded)}
                                                        className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1.5 bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-700/50 hover:border-gray-600 transition-all duration-200"
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

                            // Special handling for agent_batch_read - show file count and tree view (Point 3)
                            if (toolName.includes('batch_read')) {
                                const paths = args.paths || [];
                                return (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="text-gray-400 text-xs">批量读取:</div>
                                            <div className="text-green-400 bg-green-400/10 px-2 py-0.5 rounded text-[10px] font-bold">
                                                {paths.length} 个文件
                                            </div>
                                        </div>
                                        {paths.length > 0 && <FileTreeVisualizer paths={paths} />}
                                    </div>
                                );
                            }

                            // Special handling for agent_read_file - show file path (Point 3)
                            if (toolName.includes('read_file')) {
                                const relPath = args.rel_path || args.path || '';
                                return (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-700/30">
                                        <Eye size={12} className="text-blue-400" />
                                        <code className="text-xs text-gray-300 font-mono break-all leading-relaxed">
                                            read(<span className="text-blue-300">{relPath}</span>)
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

            {/* Approve/Reject Buttons - Modern styling */}
            {isPending && !isPartial && !settings.agentAutoApprove && (
                <div className="flex border-t border-gray-700/50">
                    <button
                        onClick={() => onApprove(toolCall.id)}
                        className="flex-1 p-3 text-sm font-medium text-green-400 hover:bg-green-500/10 flex items-center justify-center gap-2 border-r border-gray-700/50 transition-all duration-200 hover:shadow-inner"
                    >
                        <Check size={16} />
                        批准执行
                    </button>
                    <button
                        onClick={() => onReject(toolCall.id)}
                        className="flex-1 p-3 text-sm font-medium text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-2 transition-all duration-200 hover:shadow-inner"
                    >
                        <X size={16} />
                        拒绝
                    </button>
                </div>
            )}

            {/* Auto-approve indicator - More polished */}
            {isPending && !isPartial && settings.agentAutoApprove && (
                <div className="border-t border-gray-700/50 px-4 py-3 bg-gradient-to-r from-blue-500/10 to-transparent">
                    <div className="flex items-center gap-2 text-xs text-blue-400">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span className="font-medium">自动批准已启用</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-400">工具将自动执行</span>
                    </div>
                </div>
            )}

            {/* Result - Polished display */}
            {toolCall.status === 'completed' && toolCall.result != null && (() => {
                // Ensure result is a string for display
                const resultStr = typeof toolCall.result === 'string'
                    ? toolCall.result
                    : JSON.stringify(toolCall.result);

                const fileListing = isFileListing(resultStr);
                if (fileListing) {
                    return (
                        <div className="mx-4 mb-3 p-3 rounded-lg border border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <FolderOpen size={14} className="text-green-400" />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-green-400">
                                        找到 {fileListing.length} 个文件
                                    </div>
                                    <div className="text-[10px] text-green-500/70">
                                        目录扫描完成
                                    </div>
                                </div>
                            </div>
                            <FileListingResult files={fileListing} />
                        </div>
                    );
                }

                // Handle file read results (including empty files)
                if (toolCall.tool?.includes('read_file')) {
                    const isEmpty = resultStr.trim() === '';
                    const filePath = toolCall.args?.rel_path || toolCall.args?.path || '';
                    const fileName = filePath.split('/').pop() || '';
                    const language = detectLanguage(fileName);

                    return (
                        <div className="mx-4 mb-3">
                            {isEmpty ? (
                                /* Empty file state */
                                <div className="rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-900/5 overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/5 border-b border-blue-500/20">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20">
                                            <Eye size={16} className="text-blue-400" />
                                        </div>
                                        <div className="text-sm font-semibold text-blue-300">
                                            文件为空
                                        </div>
                                        <span className="px-2 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-800/50 rounded border border-gray-700/50">
                                            {language}
                                        </span>
                                    </div>
                                    <div className="px-4 py-8 text-center">
                                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-3">
                                            <File size={24} className="text-blue-400/50" />
                                        </div>
                                        <div className="text-sm text-gray-400">
                                            该文件没有任何内容
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Use CodeBlock for non-empty files */
                                <CodeBlock
                                    code={resultStr}
                                    language={language}
                                    fileName={fileName}
                                    maxLines={15}
                                />
                            )}
                        </div>
                    );
                }

                // Handle long text results (non-file operations)
                if (resultStr.length > 100) {
                    const isEmpty = resultStr.trim() === '';
                    const lines = resultStr.split('\n');
                    const lineCount = lines.length;
                    const previewLines = 20;

                    return (
                        <div className="mx-4 mb-3 rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-900/5 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 bg-blue-500/5 border-b border-blue-500/20">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20">
                                        <Eye size={16} className="text-blue-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-blue-300">
                                            执行完成
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-[10px] text-blue-400/70">
                                                {resultStr.length} 字符
                                            </span>
                                            {lineCount > 1 && (
                                                <>
                                                    <span className="text-blue-500/30">·</span>
                                                    <span className="text-[10px] text-blue-400/70">
                                                        {lineCount} 行
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {!isEmpty && lineCount > previewLines && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="px-3 py-1.5 text-[10px] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg border border-blue-500/20 transition-all duration-200"
                                    >
                                        {isExpanded ? '收起内容' : `展开全部 (${lineCount} 行)`}
                                    </button>
                                )}
                            </div>

                            {/* Content */}
                            <div className="p-4">
                                <div className={`overflow-auto rounded-lg border border-gray-700/50 bg-gray-900/80 ${isExpanded ? 'max-h-96' : 'max-h-48'}`}>
                                    <div className="flex items-center justify-between px-3 py-2 bg-gray-900/50 border-b border-gray-700/30">
                                        <span className="text-[10px] text-gray-500 font-mono">
                                            {isExpanded ? `显示全部 ${lineCount} 行` : `显示前 ${Math.min(previewLines, lineCount)} 行`}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
                                        </div>
                                    </div>
                                    <pre className="p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                                        {isExpanded ? resultStr : lines.slice(0, previewLines).join('\n')}
                                        {!isExpanded && lineCount > previewLines && (
                                            <div className="mt-4 pt-4 border-t border-dashed border-gray-700 text-center">
                                                <span className="text-[10px] text-gray-500">
                                                    ... 还有 {lineCount - previewLines} 行内容 ...
                                                </span>
                                            </div>
                                        )}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    );
                }

                // Short simple result
                return (
                    <div className="mx-4 mb-3 p-3 rounded-lg border border-gray-600/30 bg-gray-800/50">
                        <div className="flex items-center gap-2">
                            <Check size={14} className="text-green-400" />
                            <span className="text-xs font-semibold text-green-400">
                                执行成功
                            </span>
                        </div>
                        {resultStr && (
                            <div className="mt-2 text-xs text-gray-300 break-all whitespace-pre-wrap pl-6">
                                {resultStr}
                            </div>
                        )}
                    </div>
                );
            })()}
            {toolCall.status === 'failed' && toolCall.result && (
                <div className="mx-4 mb-3 p-3 rounded-lg border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                            <X size={14} className="text-red-400" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-red-400">
                                执行失败
                            </div>
                            <div className="text-xs text-red-300/70 break-all font-mono mt-1">
                                {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
