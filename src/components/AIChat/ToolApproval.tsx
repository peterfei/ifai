import { PivoProjectTree } from "./PivoProjectTree";
import { useApprovalStore } from '../../core/approval/store/useApprovalStore';
import { DiffPreview } from './DiffPreview';
import React, { useState, useLayoutEffect, useMemo } from 'react';
import { Check, X, Terminal, FilePlus, Eye, FolderOpen, Search, Trash2, ChevronDown, ChevronUp, File, Folder, FileCheck, CheckCircle, XCircle, RotateCcw, Loader2, AlertTriangle, Shield, ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react';
import { ToolCall, useChatStore } from '../../stores/useChatStore';
import { useFileStore } from '../../stores/fileStore';
import { useTranslation } from 'react-i18next';
import { readFileContent } from '../../utils/fileSystem';
import { MonacoDiffView } from '../Editor/MonacoDiffView';
import { getToolLabel, getToolColor } from 'ifainew-core';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { formatToolResultToMarkdown, FormattedToolResult, extractToolSummary } from '../../utils/toolResultFormatter';
import { ToolArgsViewer, CompactToolArgsViewer } from './ToolArgsViewer';
import { StreamingToolArgsViewer } from './StreamingToolArgsViewer';
import { ToolExecutionIndicator, StreamingContentLoader } from './ToolExecutionIndicator';
import ReactMarkdown from 'react-markdown';
import { BashConsoleOutput } from './BashConsoleOutput';
import { ProbeSymbolView } from './ProbeSymbolView';
import { toast } from 'sonner';
import { RiskPolicy, RiskLevel } from '../../core/approval/policies/RiskPolicy';

const riskPolicy = new RiskPolicy();

/**
 * 🏆 将 agent_scan_project 的结构转换为 PivoProjectTree 所需的嵌套结构
 * 支持混合格式：既有扁平路径（"src/file.js": "file"）又有嵌套对象（"src": { "file.js": "file" }）
 */
function flatStructureToNested(flatStructure: Record<string, any>): any {
  const nested: any = {};

  // 首先收集所有路径
  const paths = Object.keys(flatStructure).sort();

  paths.forEach(fullPath => {
    const type = flatStructure[fullPath];

    // 🏆 FIX: 如果值已经是嵌套对象，直接递归合并
    if (typeof type === 'object' && type !== null && !Array.isArray(type)) {
      nested[fullPath] = flatStructureToNested(type);
      return;
    }

    // 如果是目录（以 / 结尾或标记为 dir），创建目录节点
    if (fullPath.endsWith('/') || type === 'dir') {
      const dirName = fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath;
      const parts = dirName.split('/').filter(p => p.length > 0);

      let current = nested;
      for (const part of parts) {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
    // 如果是文件，创建文件节点
    else if (type === 'file' || !type) {
      const parts = fullPath.split('/').filter(p => p.length > 0);

      let current = nested;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      // 最后一个部分是文件名
      const fileName = parts[parts.length - 1];
      current[fileName] = "file";
    }
  });

  return nested;
}

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
    'agent_probe_symbols': <Search size={14} />,
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
    // 🔥 PIVO 2.0: 获取新引擎的审批状态与预览数据
    const approvalItem = useApprovalStore(state => state.items[toolCall.id]);
    const previewData = approvalItem?.previewData;

    const { t } = useTranslation();
    const settings = useSettingsStore();
    const { editorMode } = useLayoutStore();
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
      if (!message) return;

      // 🔥 PIVO 2.0: 优先使用新引擎的回滚逻辑
      const useNewEngine = (settings as any).enableNewApprovalEngine === true;
      if (useNewEngine && approvalItem) {
        setIsRollingBack(true);
        try {
          const { getApprovalCoordinator } = await import('../../core/approval');
          const coordinator = getApprovalCoordinator();
          const executor = coordinator['executors'].get(toolCall.tool);
          
          if (executor && executor.undo) {
            const success = await executor.undo();
            if (success) {
              useApprovalStore.getState().updateStatus(toolCall.id, 'undone');
              toast.success('PIVO: 文件已通过物理快照恢复');
              return;
            }
          }
        } catch (e) {
          console.error('[ApprovalEngine] Undo failed:', e);
        } finally {
          setIsRollingBack(false);
        }
      }

      if (!hasRollbackFeature) return;
      setIsRollingBack(true);

      try {
        const result = await chatStore.rollbackToolCall?.(
          message.id,
          toolCall.id,
          false  // 检测冲突
        );

        // 🔥 FIX: 处理 result 可能为 undefined 的情况
        if (!result) {
          setIsRollingBack(false);
          return;
        }

        if (result.conflict) {
          setShowConflictDialog(true);
          setIsRollingBack(false);
          return;
        }

        if (result.success) {
          toast.success('文件已恢复');
        } else {
          toast.error(result.error || '回滚失败');
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

        // 🔥 FIX: 处理 result 可能为 undefined 的情况
        if (!result) {
          return;
        }

        if (result.success) {
          toast.success('文件已强制恢复');
        } else {
          toast.error(result.error || '回滚失败');
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
        let result = toolCall.result;
        if (!result) return null;

        // 🔥 FIX: 如果是字符串，尝试解析为 JSON（因为 useChatStore 会将其序列化）
        if (typeof result === 'string') {
            try {
                const parsed = JSON.parse(result);
                if (parsed && typeof parsed === 'object') {
                    // 如果解析成功且是对象，则使用解析后的结果
                    result = parsed;
                }
            } catch (e) {
                // 不是有效的 JSON，保持原样作为字符串处理
            }
        }

        // 🔥 FIX: 安全地从 args 中提取值（处理 string | Record<string, any>）
        const getArgValue = (key: string, defaultValue?: any): any => {
            if (!toolCall.args) return defaultValue;
            if (typeof toolCall.args === 'string') {
                try {
                    const parsed = JSON.parse(toolCall.args);
                    return parsed?.[key] ?? defaultValue;
                } catch {
                    return defaultValue;
                }
            }
            return toolCall.args[key] ?? defaultValue;
        };

        // 如果结果是字符串，直接返回
        if (typeof result === 'string') {
            return {
                output: result,
                command: getArgValue('command') || getArgValue('cmd') || undefined,
                exitCode: getArgValue('exit_code') || getArgValue('exitCode') || 0,
                success: toolCall.status === 'completed'
            };
        }

        // 如果是对象，处理标准结构
        if (typeof result === 'object') {
            const res = result as any;
            return {
                output: res.stdout || res.stderr || res.output || JSON.stringify(res),
                command: res.command || getArgValue('command') || undefined,
                exitCode: res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0),
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

    // 🔥 FIX: 安全地从 args 中提取值（处理 string | Record<string, any>）
    const getToolArg = (key: string, defaultValue: string = ''): string => {
      if (!toolCall.args) return defaultValue;
      if (typeof toolCall.args === 'string') {
        try {
          const parsed = JSON.parse(toolCall.args);
          return parsed?.[key] ?? defaultValue;
        } catch {
          return defaultValue;
        }
      }
      return (toolCall.args as Record<string, any>)[key] ?? defaultValue;
    };

    const filePath = getToolArg('rel_path') || getToolArg('path', '');
    const newContent = getToolArg('content', '');

    // 🔥 风险评估逻辑
    const riskLevel = useMemo(() => {
        // 🔥 FIX: 将 args 转换为 Record<string, any> 类型
        let argsObj: Record<string, any> = {};
        if (toolCall.args) {
            if (typeof toolCall.args === 'string') {
                try {
                    argsObj = JSON.parse(toolCall.args);
                } catch {
                    argsObj = {};
                }
            } else {
                argsObj = toolCall.args;
            }
        }

        return riskPolicy.calculateRisk({
            toolName: toolCall.tool || '',
            args: argsObj,
            editorMode: editorMode as any || 'standard'
        });
    }, [toolCall.tool, toolCall.args, editorMode]);

    // 获取风险图标与颜色
    const getRiskVisuals = (level: RiskLevel) => {
        switch (level) {
            case 'high':
                return {
                    icon: <ShieldAlert size={14} className="text-red-400" />,
                    bg: 'from-red-950/40 to-transparent',
                    border: 'border-red-500/30',
                    label: '高风险操作',
                    textColor: 'text-red-400'
                };
            case 'low':
                return {
                    icon: <ShieldCheck size={14} className="text-green-400" />,
                    bg: 'from-green-950/20 to-transparent',
                    border: 'border-green-500/20',
                    label: '低风险操作',
                    textColor: 'text-green-400'
                };
            default:
                return {
                    icon: <Shield size={14} className="text-amber-400" />,
                    bg: 'from-amber-950/20 to-transparent',
                    border: 'border-amber-500/20',
                    label: '中等风险',
                    textColor: 'text-amber-400'
                };
        }
    };

    const riskVisuals = getRiskVisuals(riskLevel);

    // 路径摘要逻辑
    const formatFilePath = (path: string) => {
        if (!path) return '';
        const parts = path.split('/');
        if (parts.length <= 2) return path;
        const fileName = parts.pop();
        const parent = parts.pop();
        return `.../${parent}/${fileName}`;
    };

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
        <div data-testid="file-approval-dialog" data-test-id="tool-approval-card" className={`group/tool mt-4 mb-4 rounded-2xl border ${riskVisuals.border} bg-[#1e1e1e]/80 backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden w-full transition-all duration-300 hover:shadow-blue-500/5`}>
                        {/* Elegant Header (Point 2) */}
                        <div className={`flex items-center justify-between px-5 py-3 bg-gradient-to-r ${riskVisuals.bg} border-b border-gray-700/30`}>
                            <div className="flex items-center gap-3 pr-12"> {/* Added pr-12 to avoid copy button overlap */}
                                <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${getToolColor(toolCall.tool)} bg-opacity-10 border border-current opacity-80 shadow-lg shadow-black/20`}>
                                    {getIcon()}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span data-testid="tool-name" className="text-[13px] font-bold text-gray-100 tracking-tight leading-tight">
                                            {getToolLabel(toolCall.tool)}
                                        </span>
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-800/30 border border-gray-700/50">
                                            {riskVisuals.icon}
                                            <span className={`text-[9px] font-bold uppercase tracking-tighter ${riskVisuals.textColor}`}>
                                                {riskVisuals.label}
                                            </span>
                                        </div>
                                    </div>
                                    {filePath ? (
                                        <div className="flex items-center gap-2 group/path">
                                            <span data-testid="file-path" className="text-[10px] text-gray-500 font-mono font-medium truncate max-w-[220px]" title={filePath}>
                                                {toolCall.tool?.includes('write') ? '写入' : '访问'} <span className="text-gray-300 font-bold">{formatFilePath(filePath)}</span>
                                            </span>
                                            {isWriteFile && !isPartial && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        useFileStore.getState().openFile({
                                                            id: filePath,
                                                            path: filePath,
                                                            name: filePath.split('/').pop() || '',
                                                            content: newContent,
                                                            isDirty: false,
                                                            language: detectLanguage(filePath),
                                                            previewDiff: {
                                                                oldContent: oldContent || '',
                                                                newContent: newContent,
                                                                toolCallId: toolCall.id
                                                            }
                                                        });
                                                        toast.info('已开启编辑器内联预览');
                                                    }}
                                                    className="p-1 rounded bg-gray-800 hover:bg-blue-500/20 text-gray-500 hover:text-blue-400 transition-all opacity-0 group-hover/path:opacity-100"
                                                    title="在主编辑器中预览变更"
                                                >
                                                    <ExternalLink size={10} />
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        getToolArg('command') && (
                                            <span className="text-[10px] text-gray-500 font-mono truncate max-w-[220px]">
                                                exec: {getToolArg('command')}
                                            </span>
                                        )
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div data-testid="status-badge" className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
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
                            <div data-testid="tool-params" className="bg-gradient-to-br from-gray-900/60 to-gray-900/40 p-4 rounded-xl border border-gray-700/30 shadow-inner">
                                <StreamingToolArgsViewer
                                    args={typeof toolCall.args === 'string' ? {} : (toolCall.args || {})}
                                    isStreaming={isPartial}
                                    streamingKeys={isPartial ? Object.keys(typeof toolCall.args === 'string' ? {} : (toolCall.args || {})) : []}
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
                        {!isPartial && newContent && (
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
                                    
                                    // 🏆 FIX: 即使没有 oldContent，也允许显示新内容（作为回退）
                                    // 或者显示一个清晰的占位符，防止整个组件崩溃
                                    const lang = filePath ? detectLanguage(filePath) : 'typescript';
                                    
                                    // 只有当 oldContent 和 newContent 都准备好了才渲染 MonacoDiffView
                                    const canShowDiff = oldContent !== null && newContent && typeof oldContent === 'string' && typeof newContent === 'string';

                                    return (
                                        <div className="rounded-xl border border-gray-700/40 overflow-hidden shadow-inner bg-[#0d1117]">
                                            {canShowDiff ? (
                                                <MonacoDiffView
                                                    oldValue={oldContent}
                                                    newValue={newContent}
                                                    language={lang}
                                                    height="300px"
                                                />
                                            ) : (
                                                <div className="p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
                                                    <div className="text-[11px] text-gray-500 font-mono mb-3 uppercase tracking-widest animate-pulse">
                                                        {isWriteFile ? 'Preparing Diff Analysis...' : 'Loading Content...'}
                                                    </div>
                                                    {newContent && typeof newContent === 'string' && (
                                                        <div className="w-full max-w-md">
                                                            <pre className="text-[10px] text-gray-400 text-left bg-black/20 p-4 rounded border border-gray-800/50 max-h-40 overflow-auto scrollbar-hide">
                                                                {newContent.substring(0, 500)}{newContent.length > 500 ? '...' : ''}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
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

                        {/* 🏆 PIVO 3.0: 符号探测管线专用渲染 */}
                        {toolCall.tool === 'agent_probe_symbols' && (
                            <ProbeSymbolView
                                path={getToolArg('rel_path') || getToolArg('path', 'unknown')}
                                result={toolCall.result}
                                status={toolCall.status === 'pending' || toolCall.status === 'approved' ? 'pending' : (toolCall.status as any)}
                            />
                        )}

                        {/* 工具参数可视化 */}
                        <div data-testid="tool-params" className="bg-gradient-to-br from-gray-900/60 to-gray-900/40 p-4 rounded-xl border border-gray-700/30 shadow-inner">
                            <StreamingToolArgsViewer
                                args={typeof toolCall.args === 'string' ? {} : (toolCall.args || {})}
                                isStreaming={isPartial}
                                streamingKeys={isPartial ? Object.keys(typeof toolCall.args === 'string' ? {} : (toolCall.args || {})) : []}
                            />
                        </div>

                        {/* 🔥 PIVO 2.0: Diff 预览注入 - 仅针对文件写入 */}
                        {previewData && toolCall.tool === 'agent_write_file' ? (
                            <DiffPreview
                                oldContent={previewData.oldContent}
                                newContent={previewData.newContent}
                                fileName={getToolArg('rel_path') || getToolArg('path', 'unknown')}
                            />
                        ) : toolCall.tool === 'agent_write_file' && !isPartial && (
                            // 🏆 降级保护：如果预览没出来，显示个占位或提示
                            <div className="mt-3 p-3 bg-gray-800/50 border border-gray-700/30 rounded-xl">
                                <div className="text-[10px] text-gray-500 italic">正在准备变更预览...</div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 目录列表预览 */}
                        {toolCall.tool === 'agent_list_dir' && (
                            <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-center gap-3">
                                <FolderOpen className="text-blue-400" size={16} />
                                <div className="text-[11px] text-blue-300/80 italic">正在扫描目录结构...</div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 搜索意图预览 */}
                        {previewData && (toolCall.tool === 'agent_search' || toolCall.tool === 'search_semantic') && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/5">
                                <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/10">
                                    <Search size={14} className="text-blue-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
                                        {previewData.toolType}预览
                                    </span>
                                </div>
                                <div className="p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[10px] text-gray-500 uppercase">关键词:</span>
                                        <code className="text-[11px] text-blue-300 font-mono bg-blue-900/30 px-1.5 py-0.5 rounded">
                                            {previewData.query}
                                        </code>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-500 uppercase">范围:</span>
                                        <span className="text-[11px] text-gray-300 font-mono">{previewData.scope}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 符号分析预览 */}
                        {previewData && (toolCall.tool === 'get_file_symbols' || toolCall.tool === 'agent_list_functions') && (
                            <div className="mt-3 p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex items-start gap-3">
                                <Search className="text-indigo-400 shrink-0" size={16} />
                                <div>
                                    <div className="text-[10px] font-bold text-indigo-300 uppercase">{previewData.toolType}预览</div>
                                    <div className="text-[11px] text-indigo-400/80 mt-0.5 italic">正在深度解析代码语义: {previewData.fileName}</div>
                                </div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: Bash 风险预警 */}
                        {previewData && toolCall.tool === 'bash' && previewData.isDestructive && (
                            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="text-red-400 shrink-0" size={16} />
                                <div>
                                    <div className="text-[10px] font-bold text-red-300 uppercase">高风险操作警示</div>
                                    <div className="text-[11px] text-red-400/80 mt-0.5">该命令包含敏感操作（如删除或权限修改），执行前请仔细检查。</div>
                                </div>
                            </div>
                        )}

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
            {(toolCall.status === "completed" || toolCall.status === "failed" || toolCall.result) && !isPartial && (
                <div className="px-5 pb-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className={`w-1 h-4 rounded-full ${
                                toolCall.status === "failed" ? "bg-red-500" :
                                toolCall.result || toolCall.status === "completed" ? "bg-green-500" : "bg-gray-500"
                            }`} />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                {toolCall.status === "failed" ? "执行失败" : "执行结果"}
                            </span>
                        </div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                            toolCall.status === "failed"
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : toolCall.result || toolCall.status === "completed"
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        }`}>
                            {toolCall.status === "failed" ? "失败" : toolCall.result || toolCall.status === "completed" ? "成功" : "运行中"}
                        </div>
                    </div>

                    <div className={`p-4 rounded-xl border overflow-hidden ${
                        toolCall.status === "failed"
                            ? "bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-500/20"
                            : toolCall.result || toolCall.status === "completed"
                            ? "bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20"
                            : "bg-gradient-to-br from-gray-500/5 to-gray-500/10 border-gray-500/20"
                    }`}>
                        {(toolCall.result || toolCall.status === "completed") && toolCall.status !== "failed" && (
                            <div className="flex items-center justify-center mb-3">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <CheckCircle className="w-6 h-6 text-green-400" />
                                    </div>
                                    <div className="absolute inset-0 w-12 h-12 rounded-full bg-green-400/20 animate-ping" />
                                </div>
                            </div>
                        )}

                        {toolCall.status === "failed" && (
                            <div className="flex items-center justify-center mb-3">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <XCircle className="w-6 h-6 text-red-400" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="overflow-auto leading-relaxed">
                            {(() => {
                                // 1. 检测 PIVO (健壮性增强)
                                try {
                                    const resultData = toolCall.result;
                                    const parsed = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;

                                    // 🏆 FIX: 处理双重包装格式 { output: "{...}", status: "success" }
                                    let scanData = null;
                                    if (parsed && typeof parsed === 'object') {
                                        // 情况 1: 直接包含 structure/key_files
                                        if (parsed.structure || parsed.key_files) {
                                            scanData = parsed;
                                        }
                                        // 情况 2: 包装在 output 字段中（JSON 字符串）
                                        // 🔥 FIX: 检查是否是有效的 JSON 字符串（以 { 或 [ 开头）
                                        else if (parsed.output && typeof parsed.output === 'string') {
                                            const trimmed = parsed.output.trim();
                                            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                                                try {
                                                    const outputParsed = JSON.parse(parsed.output);
                                                    if (outputParsed.structure || outputParsed.key_files) {
                                                        scanData = outputParsed;
                                                    }
                                                } catch (e) {
                                                    console.log('[ToolApproval] ❌ Failed to parse output:', e);
                                                }
                                            }
                                        }
                                        // 情况 3: output 是对象
                                        else if (parsed.output && typeof parsed.output === 'object') {
                                            if (parsed.output.structure || parsed.output.key_files) {
                                                scanData = parsed.output;
                                            }
                                        }
                                    }

                                    if (scanData && (scanData.structure || scanData.key_files)) {
                                        // 🏆 FIX: 应用 flatStructureToNested 转换，确保正确解析混合格式
                                        const nestedStructure = flatStructureToNested(scanData.structure);
                                        console.log('[ToolApproval] ✅ Rendering PivoProjectTree for agent_scan_project');
                                        return <PivoProjectTree structure={nestedStructure} keyFiles={scanData.key_files} />;
                                    }
                                } catch (e) {
                                    console.log('[ToolApproval] ❌ Failed to parse agent_scan_project result:', e);
                                    // 解析失败或不是 JSON 格式，忽略并继续
                                }

                                // 2. 检测 Bash 控制台
                                if (shouldShowConsole()) {
                                    const bashOutput = parseBashOutput();
                                    if (bashOutput) {
                                        return (
                                            <BashConsoleOutput
                                                output={bashOutput.output}
                                                command={bashOutput.command}
                                                exitCode={bashOutput.exitCode}
                                                success={bashOutput.success}
                                            />
                                        );
                                    }
                                }

                                // 3. 默认 Markdown
                                return (
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
                                                if (inline) return <code {...rest} className="px-1.5 py-0.5 bg-gray-800 text-green-400 rounded text-[10px] font-mono" />;
                                                return <code {...rest} className="block bg-gray-900 p-2 rounded text-[10px] text-gray-300 font-mono overflow-x-auto" />;
                                            },
                                            pre: ({node, ...props}) => <pre {...props} className="bg-gray-900 p-3 rounded-lg overflow-x-auto mb-2 border border-gray-700" />,
                                        }}
                                    >
                                        {formatToolResultToMarkdown(toolCall.result, toolCall)}
                                    </ReactMarkdown>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};