import React, { useState, useLayoutEffect, useMemo } from 'react';
import { Check, X, Terminal, FilePlus, Eye, FolderOpen, Search, Trash2, ChevronDown, ChevronUp, File, Folder, FileCheck, CheckCircle, XCircle, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { ToolCall, useChatStore } from '../../stores/useChatStore';
import { useTranslation } from 'react-i18next';
import { readFileContent } from '../../utils/fileSystem';
import { MonacoDiffView } from '../Editor/MonacoDiffView';
import { getToolLabel, getToolColor } from 'ifainew-core';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatToolResultToMarkdown, FormattedToolResult, extractToolSummary } from '../../utils/toolResultFormatter';
import { ToolArgsViewer, CompactToolArgsViewer } from './ToolArgsViewer';
import { StreamingToolArgsViewer } from './StreamingToolArgsViewer';
import { ToolExecutionIndicator, StreamingContentLoader } from './ToolExecutionIndicator';
import ReactMarkdown from 'react-markdown';
import { BashConsoleOutput } from './BashConsoleOutput';
import { toast } from 'sonner';

interface ToolApprovalProps {
    toolCall: ToolCall;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    isLatestBashTool?: boolean; // 是否是message中最新的bash命令
    message?: any; // 添加 message prop 以访问父消息
}

// 工具图标映射
const TOOL_ICONS: Record<string, React.ReactNode> = {
    'agent_write_file': <FilePlus size={14} />,
    'agent_read_file': <Eye size={14} />,
    'agent_list_dir': <FolderOpen size={14} />,
    'agent_execute_command': <Terminal size={14} />,
    'agent_run_shell_command': <Terminal size={14} />,
    'bash': <Terminal size={14} />,
    'agent_search': <Search size={14} />,
    'agent_delete_file': <Trash2 size={14} />,
};

// 代码预览行数
const PREVIEW_LINES = 8;

// 检测文件语言类型
const detectLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
        'js': 'javascript', 'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx',
        'html': 'html', 'css': 'css', 'scss': 'scss', 'json': 'json',
        'rs': 'rust', 'py': 'python', 'go': 'go', 'md': 'markdown',
        'sh': 'bash', 'yaml': 'yaml', 'yml': 'yaml'
    };
    return langMap[ext] || 'plaintext';
};

// Advanced Typewriter Effect for Streaming Code (Point 1)
const TypewriterCodeBlock: React.FC <{
    code: string;
    isPartial: boolean;
    language: string;
    fileName: string;
    isExpanded: boolean;
    onToggleExpand: () => void;
}> = ({ code, isPartial, language, fileName, isExpanded, onToggleExpand }) => {
    const lines = code.split('\n');
    const displayLines = isExpanded ? lines : lines.slice(0, PREVIEW_LINES);
    const shouldCollapse = lines.length > PREVIEW_LINES;

    return (
        <div className="group/typewriter relative rounded-xl border border-gray-700/40 bg-[#0d1117] shadow-2xl overflow-hidden transition-all duration-300 hover:border-blue-500/30">
            {/* Glossy Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700/30">
                <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5 mr-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] shadow-inner" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] shadow-inner" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] shadow-inner" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 py-0.5 bg-gray-800 rounded border border-gray-700/50">
                        {language}
                    </span>
                    <span className="text-[11px] text-gray-400 font-mono truncate max-w-[150px]">
                        {fileName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {isPartial && (
                        <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            <span className="text-[10px] font-bold text-blue-400 animate-pulse uppercase">Streaming</span>
                        </div>
                    )}
                    <span className="text-[10px] text-gray-500 font-mono">{lines.length} lines</span>
                </div>
            </div>

            {/* Code Content with Dynamic Typewriter Cursor */}
            <div className="relative max-h-80 overflow-auto scrollbar-thin scrollbar-thumb-gray-700">
                <pre className="p-4 text-[12px] leading-6 text-gray-300 font-mono whitespace-pre-wrap break-all">
                    <code>
                        {displayLines.join('\n')}
                        {isPartial && (
                            <span className="inline-block w-2 h-4 bg-blue-500 ml-1 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-bounce" />
                        )}
                    </code>
                </pre>
                
                {/* Streaming Overlay Gradient */}
                {isPartial && (
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-blue-500/5 animate-pulse" />
                )}
            </div>

            {/* Footer Actions */}
            {shouldCollapse && (
                <button
                    onClick={onToggleExpand}
                    className="w-full py-1.5 bg-gray-800/30 hover:bg-gray-800/60 border-t border-gray-700/30 text-[10px] font-bold text-gray-500 hover:text-blue-400 uppercase tracking-widest transition-all"
                >
                    {isExpanded ? 'Collapse View' : `Show All Lines (${lines.length})`}
                </button>
            )}
        </div>
    );
};

// Helper to organize paths into a tree structure for better visualization (Point 3)
const FileTreeVisualizer: React.FC<{ paths: string[] }> = ({ paths }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    
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

// PERFORMANCE: Large file thresholds
const MAX_DIFF_SIZE = 5000;

export const ToolApproval = ({ toolCall, onApprove, onReject, isLatestBashTool = false, message }: ToolApprovalProps) => {
    const { t } = useTranslation();
    const settings = useSettingsStore();
    const chatStore = useChatStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [oldContent, setOldContent] = useState<string | null>(null);

    // 🔥 回滚功能状态
    const [isRollingBack, setIsRollingBack] = useState(false);
    const [showConflictDialog, setShowConflictDialog] = useState(false);

    // 🔥 检测回滚功能是否可用（商业版 vs 社区版）
    const hasRollbackFeature = useMemo(() => {
      return typeof chatStore.rollbackToolCall === 'function';
    }, []);

    // 🔥 检查是否有回滚数据
    // 🔥 使用稳定的依赖，避免初始化顺序问题
    // 🔥 FIX: 同时支持 Rust 后端的 snake_case (original_content) 和 camelCase (originalContent)
    const resultForRollback = toolCall?.result;
    const hasRollbackData = useMemo(() => {
      if (!resultForRollback) return false;
      try {
        const data = JSON.parse(resultForRollback);
        // 检查 snake_case（Rust 后端返回）或 camelCase（向后兼容）
        return data && (data.originalContent !== undefined || data.original_content !== undefined);
      } catch {
        return false;
      }
    }, [resultForRollback]);

    // 🔥 撤销处理函数
    const handleUndo = async () => {
      if (!message || !hasRollbackFeature) return;

      setIsRollingBack(true);

      try {
        const result = await chatStore.rollbackToolCall?.(
          message.id,
          toolCall.id,
          false  // 检测冲突
        );

        if (result?.conflict) {
          setShowConflictDialog(true);
          setIsRollingBack(false);
          return;
        }

        if (result?.success) {
          toast.success('文件已恢复');
        } else {
          toast.error(result?.error || '回滚失败');
        }
      } catch (e) {
        console.error('[Rollback] Error:', e);
        toast.error('回滚失败: ' + String(e));
      } finally {
        setIsRollingBack(false);
      }
    };

    // 🔥 确认强制回滚
    const handleConfirmRollback = async () => {
      if (!message || !hasRollbackFeature) return;

      try {
        const result = await chatStore.rollbackToolCall?.(
          message.id,
          toolCall.id,
          true  // 强制回滚
        );

        setShowConflictDialog(false);

        if (result?.success) {
          toast.success('文件已强制恢复');
        } else {
          toast.error(result?.error || '回滚失败');
        }
      } catch (e) {
        console.error('[Rollback] Error:', e);
        toast.error('回滚失败: ' + String(e));
      }
    };

    const isPending = toolCall.status === 'pending';
    const isPartial = toolCall.isPartial;

    // ⚡️ FIX: 所有 bash 命令都使用工业级控制台样式
    // 修改前：只有 isLatestBashTool 时才显示
    // 修改后：所有 bash 命令输出都使用 BashConsoleOutput 组件
    const shouldShowConsole = () => {
        const toolName = toolCall.tool?.toLowerCase() || '';
        return toolName.includes('bash') ||
               toolName.includes('execute_command') ||
               toolName.includes('shell') ||
               toolName === 'execute_bash_command';
    };

    // 解析bash命令输出
    const parseBashOutput = () => {
        const result = toolCall.result;
        if (!result) return null;

        // 如果是字符串，直接返回
        if (typeof result === 'string') {
            return {
                output: result,
                command: toolCall.args?.command || toolCall.args?.cmd || undefined,
                exitCode: toolCall.args?.exit_code || toolCall.args?.exitCode || 0,
                success: toolCall.status === 'completed'
            };
        }

        // 如果是对象，尝试解析
        if (typeof result === 'object') {
            const res = result as any;
            return {
                output: res.stdout || res.stderr || res.output || JSON.stringify(res),
                command: res.command || toolCall.args?.command || undefined,
                exitCode: res.exit_code || res.exitCode || 0,
                success: res.success !== undefined ? res.success : toolCall.status === 'completed'
            };
        }

        return null;
    };

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

    const getStatusLabel = () => {
        // Terminal states should always take priority over isPartial
        const TERMINAL_STATES = ['completed', 'failed', 'rejected'];
        if (TERMINAL_STATES.includes(toolCall.status)) {
            switch (toolCall.status) {
                case 'completed': return '已完成';
                case 'failed': return '失败';
                case 'rejected': return '已拒绝';
                default: return toolCall.status;
            }
        }
        if (isPartial) return '生成中...';
        switch (toolCall.status) {
            case 'approved': return '已批准';
            default: return '待审批';
        }
    };

    const isWriteFile = toolCall.tool?.includes('write_file') || false;
    const filePath = toolCall.args?.rel_path || toolCall.args?.path || '';
    const newContent = toolCall.args?.content || '';

    useLayoutEffect(() => {
        if (isWriteFile && filePath && !isPartial && oldContent === null) {
            const loadOld = async () => {
                try {
                    // 🔥 FIX v0.3.9.2: 优先使用 toolCall.result 中的 originalContent
                    // 因为文件写入后，文件系统中的内容已经是新内容了
                    if (toolCall.result) {
                        try {
                            const resultData = JSON.parse(toolCall.result);
                            if (resultData.originalContent !== undefined) {
                                console.log('[ToolApproval] Using originalContent from toolCall.result');
                                setOldContent(resultData.originalContent);
                                return;
                            }
                        } catch (e) {
                            console.warn('[ToolApproval] Failed to parse toolCall.result:', e);
                        }
                    }

                    // Fallback: 从文件系统读取
                    const content = await readFileContent(filePath);
                    setOldContent(content || '');
                } catch (e) {
                    console.warn("[ToolApproval] Failed to load old content:", e);
                    setOldContent('');
                }
            };
            loadOld();
        }
    }, [isWriteFile, filePath, isPartial, oldContent, toolCall.result]);

    return (
        <div data-testid="file-approval-dialog" data-test-id="tool-approval-card" className="group/tool mt-4 mb-4 rounded-2xl border border-gray-700/40 bg-[#1e1e1e]/80 backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden w-full transition-all duration-300 hover:shadow-blue-500/5">
                        {/* Elegant Header (Point 2) */}
                        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-gray-900/40 to-transparent border-b border-gray-700/30">
                            <div className="flex items-center gap-3 pr-12"> {/* Added pr-12 to avoid copy button overlap */}
                                <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${getToolColor(toolCall.tool)} bg-opacity-10 border border-current opacity-80 shadow-lg shadow-black/20`}>
                                    {getIcon()}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-bold text-gray-100 tracking-tight leading-tight">
                                        {getToolLabel(toolCall.tool)}
                                    </span>
                                    {filePath ? (
                                        <span data-testid="file-path" className="text-[10px] text-gray-500 font-mono font-medium truncate max-w-[220px]" title={filePath}>
                                            {toolCall.tool?.includes('write') ? 'Writing to' : 'Accessing'} {filePath}
                                        </span>
                                    ) : (
                                        toolCall.args?.command && (
                                            <span className="text-[10px] text-gray-500 font-mono truncate max-w-[220px]">
                                                exec: {toolCall.args.command}
                                            </span>
                                        )
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                    isPartial ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]' :
                                    toolCall.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                    toolCall.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                    toolCall.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                    toolCall.status === 'rejected' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
                                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                    {getStatusLabel()}
                                </div>
                            </div>
                        </div>

            {/* Content Area */}
            <div className="px-5 pb-4 pt-4">
                {isWriteFile ? (
                    <div className="space-y-4 overflow-hidden">
                        {/* ✅ 流式参数显示 - write_file 也显示参数 */}
                        {isPartial && (
                            <div className="bg-gradient-to-br from-gray-900/60 to-gray-900/40 p-4 rounded-xl border border-gray-700/30 shadow-inner">
                                <StreamingToolArgsViewer
                                    args={toolCall.args || {}}
                                    isStreaming={isPartial}
                                    streamingKeys={isPartial ? Object.keys(toolCall.args || {}) : []}
                                />
                            </div>
                        )}

                        {/* Improved Typewriter Streaming Preview (Point 1) */}
                        {(newContent || isPartial) && (
                            <div className="animate-in fade-in zoom-in-95 duration-200">
                                <TypewriterCodeBlock
                                    code={newContent}
                                    isPartial={isPartial}
                                    language={detectLanguage(filePath)}
                                    fileName={filePath.split('/').pop() || ''}
                                    isExpanded={isExpanded}
                                    onToggleExpand={() => setIsExpanded(!isExpanded)}
                                />
                            </div>
                        )}

                        {/* Full Diff View (Only when completed) */}
                        {!isPartial && oldContent !== null && newContent && (
                            <div className="relative mt-4 group/diff">
                                <div className="flex items-center gap-2 mb-2 ml-1">
                                    <div className="w-1 h-3 bg-blue-500 rounded-full" />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Changes Analysis</span>
                                </div>
                                {(() => {
                                    const contentLength = newContent.length;
                                    if (contentLength > MAX_DIFF_SIZE) {
                                        return (
                                            <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 text-[11px] text-yellow-200/80 leading-relaxed italic">
                                                Diff view skipped due to large file size ({ (contentLength/1024).toFixed(1) } KB). Content preserved in editor.
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="rounded-xl border border-gray-700/40 overflow-hidden shadow-inner">
                                            <MonacoDiffView
                                                oldValue={oldContent}
                                                newValue={newContent}
                                                language={detectLanguage(filePath)}
                                                height={isExpanded ? 500 : 250}
                                            />
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ✅ 其他工具类型：统一使用 ToolArgsViewer 工业级UI */
                    <div className="space-y-3">
                        {/* 工具类型标题 */}
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">操作参数</span>
                            {isPartial && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                    </span>
                                    <span className="text-[10px] font-bold text-blue-400 animate-pulse uppercase">生成中</span>
                                </div>
                            )}
                        </div>

                        {/* 工具参数可视化 */}
                        <div className="bg-gradient-to-br from-gray-900/60 to-gray-900/40 p-4 rounded-xl border border-gray-700/30 shadow-inner">
                            <StreamingToolArgsViewer
                                args={toolCall.args || {}}
                                isStreaming={isPartial}
                                streamingKeys={isPartial ? Object.keys(toolCall.args || {}) : []}
                            />
                        </div>

                    </div>
                )}
            </div>

            {/* Actions (Approve/Reject) */}
            {isPending && !isPartial && (
                <div className="flex border-t border-gray-700/30">
                    {!settings.agentAutoApprove ? (
                        <>
                            <button
                                data-testid="approve-button"
                                onClick={() => onApprove(toolCall.id)}
                                className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest text-green-400 hover:bg-green-500/10 flex items-center justify-center gap-2 border-r border-gray-700/30 transition-all duration-200"
                            >
                                <Check size={14} /> 批准执行
                            </button>
                            <button
                                data-testid="reject-button"
                                onClick={() => onReject(toolCall.id)}
                                className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-2 transition-all duration-200"
                            >
                                <X size={14} /> 拒绝
                            </button>
                        </>
                    ) : (
                        <div className="w-full px-5 py-3 bg-blue-500/5 flex items-center gap-2 text-[10px] font-bold text-blue-400/80 uppercase tracking-widest">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            自动批准已开启 · 工具执行中
                        </div>
                    )}
                </div>
            )}

            {/* 🔥 撤销按钮 - 仅在已完成的文件写入操作且有回滚数据时显示 */}
            {toolCall.status === 'completed' &&
             toolCall.tool === 'agent_write_file' &&
             hasRollbackData &&
             hasRollbackFeature && (
                <div className="flex border-t border-gray-700/30">
                    <button
                        onClick={handleUndo}
                        disabled={isRollingBack}
                        className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest
                                   text-amber-400 hover:bg-amber-500/10
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   flex items-center justify-center gap-2 transition-all duration-200"
                    >
                        {isRollingBack ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                撤销中...
                            </>
                        ) : (
                            <>
                                <RotateCcw size={14} />
                                撤销
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* 🔥 冲突确认对话框 */}
            {showConflictDialog && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
                    <div className="bg-[#252526] w-[400px] rounded-lg border border-gray-700 shadow-xl">
                        <div className="p-4 border-b border-gray-700">
                            <h2 className="text-lg font-medium flex items-center gap-2">
                                <AlertTriangle className="text-amber-400" size={18} />
                                检测到手动修改
                            </h2>
                        </div>
                        <div className="p-6 text-sm text-gray-300">
                            文件在 AI 修改后又被手动编辑过。确认回滚将覆盖手动修改，此操作无法撤销。
                        </div>
                        <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={() => setShowConflictDialog(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmRollback}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded font-bold transition-colors"
                            >
                                确认回滚
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ 执行状态指示器 - 批准后显示，但有结果时隐藏 */}
            {toolCall.status === 'approved' && !toolCall.result && (
                <div className="px-5 pb-4">
                    <ToolExecutionIndicator
                        status="running"
                        message={isWriteFile ? `正在写入文件: ${filePath}` : '正在执行操作...'}
                    />
                </div>
            )}

            {/* ✅ 执行结果展示 - 工业级UI，无JSON显示 */}
            {/* 🔥 FIX: 显示所有工具的执行结果，包括 agent_write_file */}
            {(toolCall.status === 'completed' || toolCall.status === 'failed' || toolCall.result) && !isPartial && (
                <div className="px-5 pb-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    {/* 结果标题 */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {/* ⚡️ FIX: 根据result判断是否成功，而不是只看status */}
                            <div className={`w-1 h-4 rounded-full ${
                                toolCall.status === 'failed' ? 'bg-red-500' :
                                toolCall.result || toolCall.status === 'completed' ? 'bg-green-500' : 'bg-gray-500'
                            }`} />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                {toolCall.status === 'failed' ? '执行失败' : '执行结果'}
                            </span>
                        </div>
                        {/* 状态徽章 */}
                        {/* ⚡️ FIX: 根据result存在与否和status判断显示 */}
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                            toolCall.status === 'failed'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : toolCall.result || toolCall.status === 'completed'
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                        }`}>
                            {toolCall.status === 'failed' ? '失败' : toolCall.result || toolCall.status === 'completed' ? '成功' : '运行中'}
                        </div>
                    </div>

                    {/* 结果内容卡片 */}
                    {/* ⚡️ FIX: 根据result和status判断背景色 */}
                    <div className={`p-4 rounded-xl border overflow-hidden ${
                        toolCall.status === 'failed'
                            ? 'bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-500/20'
                            : toolCall.result || toolCall.status === 'completed'
                            ? 'bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20'
                            : 'bg-gradient-to-br from-gray-500/5 to-gray-500/10 border-gray-500/20'
                    }`}>
                        {/* 成功图标动画 */}
                        {/* ⚡️ FIX: 有result或status=completed时显示成功图标 */}
                        {(toolCall.result || toolCall.status === 'completed') && toolCall.status !== 'failed' && (
                            <div className="flex items-center justify-center mb-3">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <CheckCircle className="w-6 h-6 text-green-400" />
                                    </div>
                                    <div className="absolute inset-0 w-12 h-12 rounded-full bg-green-400/20 animate-ping" />
                                </div>
                            </div>
                        )}

                        {/* 失败图标动画 */}
                        {toolCall.status === 'failed' && (
                            <div className="flex items-center justify-center mb-3">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <XCircle className="w-6 h-6 text-red-400" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 格式化的结果内容 */}
                        <div className="overflow-auto leading-relaxed">
                            {/* ⚡️ FIX: Bash命令使用工业级控制台样式（只有最新的bash命令显示） */}
                            {shouldShowConsole() ? (() => {
                                const bashOutput = parseBashOutput();
                                return bashOutput ? (
                                    <BashConsoleOutput
                                        output={bashOutput.output}
                                        command={bashOutput.command}
                                        exitCode={bashOutput.exitCode}
                                        success={bashOutput.success}
                                    />
                                ) : (
                                    <ReactMarkdown
                                        components={{
                                            h1: ({node, ...props}) => <h1 {...props} className="text-base font-bold text-gray-200 mb-2" />,
                                            h2: ({node, ...props}) => <h2 {...props} className="text-sm font-bold text-gray-300 mb-2 mt-3" />,
                                            h3: ({node, ...props}) => <h3 {...props} className="text-xs font-bold text-gray-400 mb-1" />,
                                            p: ({node, ...props}) => <p {...props} className="text-xs text-gray-300 mb-2 last:mb-0" />,
                                            ul: ({node, ...props}) => <ul {...props} className="list-disc list-inside mb-2 text-gray-300 space-y-1" />,
                                            ol: ({node, ...props}) => <ol {...props} className="list-decimal list-inside mb-2 text-gray-300 space-y-1" />,
                                            li: ({node, ...props}) => <li {...props} className="ml-2 text-gray-300" />,
                                            strong: ({node, ...props}) => <strong {...props} className="font-bold text-gray-200" />,
                                            em: ({node, ...props}) => <em {...props} className="italic text-gray-300" />,
                                            code({ node, inline, ...rest }: any) {
                                                if (inline) {
                                                    return (
                                                        <code {...rest} className="px-1.5 py-0.5 bg-gray-800 text-green-400 rounded text-[10px] font-mono" />
                                                    );
                                                }
                                                return (
                                                    <code {...rest} className="block bg-gray-900 p-2 rounded text-[10px] text-gray-300 font-mono overflow-x-auto" />
                                                );
                                            },
                                            pre({node, ...props}) {
                                                return (
                                                    <pre {...props} className="bg-gray-900 p-3 rounded-lg overflow-x-auto mb-2 border border-gray-700" />
                                                );
                                            },
                                        }}
                                    >
                                        {formatToolResultToMarkdown(toolCall.result, toolCall)}
                                    </ReactMarkdown>
                                );
                            })() : (
                                <ReactMarkdown
                                    components={{
                                        h1: ({node, ...props}) => <h1 {...props} className="text-base font-bold text-gray-200 mb-2" />,
                                        h2: ({node, ...props}) => <h2 {...props} className="text-sm font-bold text-gray-300 mb-2 mt-3" />,
                                        h3: ({node, ...props}) => <h3 {...props} className="text-xs font-bold text-gray-400 mb-1" />,
                                        p: ({node, ...props}) => <p {...props} className="text-xs text-gray-300 mb-2 last:mb-0" />,
                                        ul: ({node, ...props}) => <ul {...props} className="list-disc list-inside mb-2 text-gray-300 space-y-1" />,
                                        ol: ({node, ...props}) => <ol {...props} className="list-decimal list-inside mb-2 text-gray-300 space-y-1" />,
                                        li: ({node, ...props}) => <li {...props} className="ml-2 text-gray-300" />,
                                        strong: ({node, ...props}) => <strong {...props} className="font-bold text-gray-200" />,
                                        em: ({node, ...props}) => <em {...props} className="italic text-gray-300" />,
                                        code({ node, inline, ...rest }: any) {
                                            if (inline) {
                                                return (
                                                    <code {...rest} className="px-1.5 py-0.5 bg-gray-800 text-green-400 rounded text-[10px] font-mono" />
                                                );
                                            }
                                            return (
                                                <code {...rest} className="block bg-gray-900 p-2 rounded text-[10px] text-gray-300 font-mono overflow-x-auto" />
                                            );
                                        },
                                        pre({node, ...props}) {
                                            return (
                                                <pre {...props} className="bg-gray-900 p-3 rounded-lg overflow-x-auto mb-2 border border-gray-700" />
                                            );
                                        },
                                    }}
                                >
                                    {formatToolResultToMarkdown(toolCall.result, toolCall)}
                                </ReactMarkdown>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};