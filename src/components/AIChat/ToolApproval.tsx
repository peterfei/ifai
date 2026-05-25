import { PivoProjectTree } from "./PivoProjectTree";
import { useApprovalStore } from '../../core/approval/store/useApprovalStore';
import { DiffPreview } from './DiffPreview';
import { useTypewriter } from '../../hooks/useTypewriter';
import React, { useState, useLayoutEffect, useMemo, useRef } from 'react';
import { Check, X, Terminal, FilePlus, Eye, FolderOpen, Search, Trash2, ChevronDown, ChevronUp, File, Folder, FileCheck, CheckCircle, XCircle, RotateCcw, Loader2, AlertTriangle, Shield, ShieldAlert, ShieldCheck, ExternalLink, Copy } from 'lucide-react';
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
import { StreamingBashOutput } from './StreamingBashOutput';
import { ProbeSymbolView } from './ProbeSymbolView';
import { toast } from 'sonner';
import { toolApprovalRegistry, RiskLevel } from '../../core/approval/ToolApprovalRegistry';

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
    // 🔥 FIX: 使用 enableTypewriterEffect 设置来控制是否启用打字机效果
    const enableTypewriter = useSettingsStore((s) => s.enableTypewriterEffect);

    // 打字机效果：仅在流式传输（isPartial）且启用打字机效果时启用
    const { displayText, isTyping, skip } = useTypewriter({
        content: code,
        enabled: isPartial && enableTypewriter,
        baseCPS: 120,
        fastCPS: 300,
        threshold: 300,
    });

    const effectiveCode = (isPartial && enableTypewriter) ? displayText : code;
    const lines = effectiveCode.split('\n');
    const displayLines = isExpanded ? lines : lines.slice(0, PREVIEW_LINES);
    const shouldCollapse = code.split('\n').length > PREVIEW_LINES;

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
            <div
                className="relative max-h-80 overflow-auto scrollbar-thin scrollbar-thumb-gray-700"
                onClick={isTyping ? skip : undefined}
                style={isTyping ? { cursor: 'pointer' } : undefined}
            >
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
    const { t } = useTranslation();
    
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
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('toolApproval.fileTree.title')}</span>
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

// 🔥 PERFORMANCE FIX: 使用 React.memo 避免不必要的重新渲染
// 当单条消息包含多个工具调用时，防止过度渲染
// ⚡️ 注意：已移除调试日志以避免性能问题
const areToolApprovalPropsEqual = (prevProps: ToolApprovalProps, nextProps: ToolApprovalProps) => {
    // 如果 toolCall 引用相同，跳过渲染
    if (prevProps.toolCall === nextProps.toolCall) {
        return true;
    }

    // 检查关键字段
    return (
        prevProps.toolCall.id === nextProps.toolCall.id &&
        prevProps.toolCall.status === nextProps.toolCall.status &&
        prevProps.toolCall.isPartial === nextProps.toolCall.isPartial &&
        prevProps.toolCall.result === nextProps.toolCall.result &&
        prevProps.isLatestBashTool === nextProps.isLatestBashTool &&
        prevProps.message?.id === nextProps.message?.id
    );
};

export const ToolApproval = React.memo(({ toolCall, onApprove, onReject, isLatestBashTool = false, message }: ToolApprovalProps) => {
    // 🔥 PIVO 2.0: 获取新引擎的审批状态与预览数据
    const approvalItem = useApprovalStore(state => state.items[toolCall.id]);
    const previewData = approvalItem?.previewData;

    const { t } = useTranslation();
    const settings = useSettingsStore();
    const { editorMode } = useLayoutStore();
    const chatStore = useChatStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [oldContent, setOldContent] = useState<string | null>(null);
    const [pathCopied, setPathCopied] = useState<string | null>(null);

    // 🐛 DEBUG: 添加 ref 用于追踪 props 引用变化
    const previousNestedStructureRef = useRef<any>(null);
    const previousKeyFilesRef = useRef<Record<string, string>>(null);

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
              toast.success(t('toolApproval.rollbackSnapshotRestored'));
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
          toast.success(t('toolApproval.rollbackRestored'));
        } else {
          toast.error(result.error || t('toolApproval.rollbackFailed'));
        }
      } catch (e) {
        console.error('[Rollback] Error:', e);
        toast.error(t('toolApproval.rollbackFailedWithError', { error: String(e) }));
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
          toast.success(t('toolApproval.rollbackForceRestored'));
        } else {
          toast.error(result.error || t('toolApproval.rollbackFailed'));
        }
      } catch (e) {
        console.error('[Rollback] Error:', e);
        toast.error(t('toolApproval.rollbackFailedWithError', { error: String(e) }));
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
                case 'completed': return t('toolApproval.status.completed');
                case 'failed': return t('toolApproval.status.failed');
                case 'rejected': return t('toolApproval.status.rejected');
                default: return toolCall.status;
            }
        }
        if (isPartial) return t('toolApproval.status.generating');
        switch (toolCall.status) {
            case 'approved': return t('toolApproval.status.approved');
            default: return t('toolApproval.status.pending');
        }
    };

    const isWriteFile = toolCall.tool?.includes('write_file') || false;
    const isEditFile = toolCall.tool?.includes('edit_file') || false;
    const isFileTool = isWriteFile || isEditFile;

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

        return toolApprovalRegistry.calculateRisk(
            toolCall.tool || '',
            argsObj,
            editorMode as any || 'standard'
        );
    }, [toolCall.tool, toolCall.args, editorMode]);

    // 🔥 PERFORMANCE FIX: 缓存 agent_scan_project 的解析结果，避免每次工具状态变化都重新解析
    const scanData = useMemo(() => {
        if (toolCall.tool !== 'agent_scan_project' || !toolCall.result) {
            return null;
        }

        // 🐛 DEBUG: 添加日志追踪useMemo调用
        console.log('[ToolApproval] 🔍 scanData useMemo computing...', {
            toolId: toolCall.id,
            tool: toolCall.tool,
            hasResult: !!toolCall.result,
            resultLength: toolCall.result?.length || 0,
            resultPreview: toolCall.result?.substring(0, 100) || 'N/A'
        });

        try {
            const parsed = JSON.parse(toolCall.result);
            console.log('[ToolApproval] 🔍 Parsed result keys:', Object.keys(parsed));

            // 情况 1: 检查 parsed.output 字段（旧格式）
            if (parsed.output && typeof parsed.output === 'object') {
                if (parsed.output.structure || parsed.output.key_files) {
                    console.log('[ToolApproval] ✅ scanData computed successfully (path 1: parsed.output)');
                    return parsed.output;
                }
            }

            // 情况 2: 直接检查 parsed 顶层（新格式：{ structure, key_files, stats, cache_stats }）
            if (parsed.structure || parsed.key_files) {
                console.log('[ToolApproval] ✅ scanData computed successfully (path 2: parsed top-level)', {
                    hasStructure: !!parsed.structure,
                    hasKeyFiles: !!parsed.key_files,
                    structureKeys: parsed.structure ? Object.keys(parsed.structure).length : 0,
                    keyFilesKeys: parsed.key_files ? Object.keys(parsed.key_files).length : 0
                });
                return {
                    structure: parsed.structure,
                    key_files: parsed.key_files,
                    stats: parsed.stats,
                    cache_stats: parsed.cache_stats
                };
            }

            console.log('[ToolApproval] ⚠️ scanData parse found no structure/key_files', {
                parsedKeys: Object.keys(parsed),
                hasOutput: !!parsed.output,
                hasStructure: !!parsed.structure,
                hasKeyFiles: !!parsed.key_files
            });
        } catch (e) {
            console.log('[ToolApproval] ❌ scanData parse error:', e);
        }
        return null;
    }, [toolCall.tool, toolCall.result, toolCall.id]);

    // 🔥 PERFORMANCE FIX: 缓存嵌套结构转换结果
    const nestedStructure = useMemo(() => {
        if (!scanData?.structure) {
            console.log('[ToolApproval] ⚠️ nestedStructure skipped - no scanData.structure');
            return null;
        }
        // 🏆 FIX: 应用 flatStructureToNested 转换，确保正确解析混合格式
        console.log('[ToolApproval] 🔍 nestedStructure useMemo computing...', {
            keys: Object.keys(scanData.structure).length
        });
        const result = flatStructureToNested(scanData.structure);
        console.log('[ToolApproval] ✅ nestedStructure computed successfully');
        return result;
    }, [scanData?.structure]);

    // 获取风险图标与颜色
    const getRiskVisuals = (level: RiskLevel) => {
        switch (level) {
            case 'high':
                return {
                    icon: <ShieldAlert size={14} className="text-red-400" />,
                    bg: 'from-red-950/40 to-transparent',
                    border: 'border-red-500/30',
                    label: t('toolApproval.risk.high'),
                    textColor: 'text-red-400'
                };
            case 'low':
                return {
                    icon: <ShieldCheck size={14} className="text-green-400" />,
                    bg: 'from-green-950/20 to-transparent',
                    border: 'border-green-500/20',
                    label: t('toolApproval.risk.low'),
                    textColor: 'text-green-400'
                };
            default:
                return {
                    icon: <Shield size={14} className="text-amber-400" />,
                    bg: 'from-amber-950/20 to-transparent',
                    border: 'border-amber-500/20',
                    label: t('toolApproval.risk.medium'),
                    textColor: 'text-amber-400'
                };
        }
    };

    const riskVisuals = getRiskVisuals(riskLevel);

    // 智能路径格式化（三态策略）
    // 策略 A（短路径 < 40 字符）：完整显示
    // 策略 B（中路径）：折叠中间，保留首2层和文件名
    // 策略 C（长路径 > 55 字符）：换行显示
    const formatFilePathSmart = (path: string) => {
        if (!path) return '';

        const parts = path.split('/').filter(p => p.length > 0);
        const fileName = parts[parts.length - 1];

        // 策略 A: 短路径完整显示
        if (path.length <= 40) return path;

        const isAbsolute = path.startsWith('/');
        const maxCollapsedLen = 50;

        if (isAbsolute) {
            // 绝对路径: /Users/mac/.../test2.log
            const topDirs = parts.slice(0, 2).join('/'); // Users/mac
            const collapsed = `/${topDirs}/.../${fileName}`;
            if (collapsed.length <= maxCollapsedLen) return collapsed;
            // 还是太长就换行
            return `/${topDirs}/.../\n${fileName}`;
        }

        // 相对路径
        if (parts.length <= 3) return path;

        const firstDir = parts[0];
        const lastDir = parts[parts.length - 2];

        // 策略 B: 折叠中间
        const collapsed = `${firstDir}/.../${lastDir}/${fileName}`;
        if (collapsed.length <= maxCollapsedLen) return collapsed;

        // 策略 C: 换行
        return `${firstDir}/.../${lastDir}/\n${fileName}`;
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
                                            <span data-testid="file-path" className="text-[10px] text-gray-500 font-mono font-medium max-w-full break-all" title={filePath}>
                                                {toolCall.tool?.includes('write') ? t('toolApproval.fileTree.write') : t('toolApproval.fileTree.access')} <span className="text-gray-300 font-bold whitespace-pre-wrap">{formatFilePathSmart(filePath)}</span>
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
                                                        toast.info(t('toolApproval.preview.inlinePreviewOpened'));
                                                    }}
                                                    className="p-1 rounded bg-gray-800 hover:bg-blue-500/20 text-gray-500 hover:text-blue-400 transition-all opacity-0 group-hover/path:opacity-100"
                                                    title={t('toolApproval.preview.previewInEditor')}
                                                >
                                                    <ExternalLink size={10} />
                                                </button>
                                            )}
                                            {/* 📋 复制路径按钮 */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigator.clipboard.writeText(filePath).then(() => {
                                                        setPathCopied(filePath);
                                                        toast.success(t('toolApproval.copyPathSuccess'));
                                                        setTimeout(() => setPathCopied(null), 2000);
                                                    }).catch(() => {
                                                        toast.error(t('toolApproval.copyPathFailed'));
                                                    });
                                                }}
                                                className="p-1 rounded bg-gray-800 hover:bg-green-500/20 text-gray-500 hover:text-green-400 transition-all opacity-0 group-hover/path:opacity-100"
                                                title={t('toolApproval.copyPath')}
                                            >
                                                {pathCopied === filePath ? <Check size={10} /> : <Copy size={10} />}
                                            </button>
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
                {isFileTool ? (
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
                                {/* 🎨 优化后的标题栏 */}
                                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-gradient-to-r from-gray-800/50 to-gray-900/50 border border-gray-700/30">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Changes Analysis</span>
                                        </div>
                                        {/* 📊 变更统计 */}
                                        {oldContent && newContent && (
                                            <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-gray-900/50 border border-gray-700/30">
                                                <span className="text-[10px] text-green-400 font-mono">+{newContent.split('\n').length}</span>
                                                <span className="text-[9px] text-gray-600">|</span>
                                                <span className="text-[10px] text-red-400 font-mono">-{oldContent.split('\n').length}</span>
                                            </div>
                                        )}
                                    </div>
                                    {/* 🔧 操作按钮组 */}
                                    <div className="flex items-center gap-1.5">
                                        {filePath && (
                                            <span className="text-[9px] text-gray-500 font-mono max-w-[150px] truncate" title={filePath}>
                                                {filePath.split('/').pop()}
                                            </span>
                                        )}
                                    </div>
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
                                        <div className="rounded-xl border border-gray-700/40 overflow-hidden shadow-xl bg-[#0d1117] relative">
                                            {/* 🎨 顶部装饰条 */}
                                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 opacity-50" />

                                            {canShowDiff ? (
                                                <div className="relative">
                                                    {/* 📊 行数提示 */}
                                                    <div className="absolute top-2 right-2 z-10 px-2 py-1 rounded bg-black/60 border border-gray-700/50 text-[9px] text-gray-400 font-mono">
                                                        {newContent.split('\n').length} lines
                                                    </div>
                                                    <MonacoDiffView
                                                        oldValue={oldContent}
                                                        newValue={newContent}
                                                        language={lang}
                                                        height="300px"
                                                    />
                                                </div>
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
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('toolApproval.sections.parameters')}</span>
                            {isPartial && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                    </span>
                                    <span className="text-[10px] font-bold text-blue-400 animate-pulse uppercase">{t('toolApproval.status.generatingShort')}</span>
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
                                <div className="text-[10px] text-gray-500 italic">{t('toolApproval.preview.preparingChanges')}</div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 目录列表预览 */}
                        {toolCall.tool === 'agent_list_dir' && (
                            <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-center gap-3">
                                <FolderOpen className="text-blue-400" size={16} />
                                <div className="text-[11px] text-blue-300/80 italic">{t('toolApproval.preview.directoryScanning')}</div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 搜索意图预览 */}
                        {previewData && (toolCall.tool === 'agent_search' || toolCall.tool === 'search_semantic') && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/5">
                                <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/10">
                                    <Search size={14} className="text-blue-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
                                        {t('toolApproval.preview.searchTitle', { toolType: previewData.toolType })}
                                    </span>
                                </div>
                                <div className="p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[10px] text-gray-500 uppercase">{t('toolApproval.preview.queryLabel')}:</span>
                                        <code className="text-[11px] text-blue-300 font-mono bg-blue-900/30 px-1.5 py-0.5 rounded">
                                            {previewData.query}
                                        </code>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-500 uppercase">{t('toolApproval.preview.scopeLabel')}:</span>
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
                                    <div className="text-[10px] font-bold text-indigo-300 uppercase">{t('toolApproval.preview.symbolTitle', { toolType: previewData.toolType })}</div>
                                    <div className="text-[11px] text-indigo-400/80 mt-0.5 italic">{t('toolApproval.preview.symbolDescription', { fileName: previewData.fileName })}</div>
                                </div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: Bash 风险预警 */}
                        {previewData && toolCall.tool === 'bash' && previewData.isDestructive && (
                            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="text-red-400 shrink-0" size={16} />
                                <div>
                                    <div className="text-[10px] font-bold text-red-300 uppercase">{t('toolApproval.preview.dangerTitle')}</div>
                                    <div className="text-[11px] text-red-400/80 mt-0.5">{t('toolApproval.preview.dangerDescription')}</div>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* 🔥 审批操作 — pending 工具的内联确认/拒绝按钮（直调 store，绕过 props 链） */}
            {toolCall.status === 'pending' && (
                <div className="flex border-t border-gray-700/30">
                    <button
                        onClick={() => useChatStore.getState().approveToolCall(message?.id || '', toolCall.id)}
                        className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest
                                   text-green-400 hover:bg-green-500/10
                                   flex items-center justify-center gap-2 transition-all duration-200"
                    >
                        <Check size={14} />
                        确认执行
                    </button>
                    <div className="w-px bg-gray-700/30" />
                    <button
                        onClick={() => useChatStore.getState().rejectToolCall(message?.id || '', toolCall.id)}
                        className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest
                                   text-red-400 hover:bg-red-500/10
                                   flex items-center justify-center gap-2 transition-all duration-200"
                    >
                        <X size={14} />
                        拒绝
                    </button>
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
                                {t('toolApproval.actions.undoPending')}
                            </>
                        ) : (
                            <>
                                <RotateCcw size={14} />
                                {t('toolApproval.actions.undo')}
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
                                {t('toolApproval.conflict.title')}
                            </h2>
                        </div>
                        <div className="p-6 text-sm text-gray-300">
                            {t('toolApproval.conflict.description')}
                        </div>
                        <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={() => setShowConflictDialog(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
                            >
                                {t('toolApproval.actions.cancel')}
                            </button>
                            <button
                                onClick={handleConfirmRollback}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded font-bold transition-colors"
                            >
                                {t('toolApproval.actions.confirmRollback')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ Bash 工具执行中 - 终端风格实时输出 */}
            {toolCall.status === 'approved' && !toolCall.result && shouldShowConsole() && (() => {
                const bashCommand = getToolArg('command', '');
                const workingDir = getToolArg('working_dir', '');
                return (
                    <div className="px-5 pb-4">
                        <StreamingBashOutput
                            command={bashCommand}
                            workingDir={workingDir || undefined}
                            timeoutMs={30000}
                            throttleLines={5}
                            className="border-gray-700"
                        />
                    </div>
                );
            })()}

            {/* ✅ Bash 工具自动执行中 - 终端风格等待动画（后端已在执行，不重复调用） */}
            {(toolCall.status === 'executing') && !toolCall.result && shouldShowConsole() && (() => {
                const bashCommand = getToolArg('command', '');
                return (
                    <div className="px-5 pb-4">
                        <div className="border border-gray-700 rounded-lg overflow-hidden bg-[#1e1e1e]">
                            <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-gray-700">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Terminal size={14} className="text-gray-400 shrink-0" />
                                    <code className="text-xs text-gray-300 truncate font-mono">{bashCommand}</code>
                                </div>
                                <div className="flex items-center gap-2 text-yellow-400">
                                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                                    <span className="text-xs">{t('toolApproval.status.executing')}</span>
                                </div>
                            </div>
                            <div className="p-3 font-mono text-xs text-gray-500 flex items-center gap-2">
                                <div className="w-2 h-4 bg-yellow-500/50 animate-pulse" />
                                <span className="italic">{t('toolApproval.status.waitingOutput')}</span>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ✅ 非bash工具执行中指示器 */}
            {((toolCall.status === 'approved' || toolCall.status === 'executing') && !toolCall.result && !shouldShowConsole()) && (
                <div className="px-5 pb-4">
                    <ToolExecutionIndicator
                        status="running"
                        message={isWriteFile ? t('toolApproval.status.writingFile', { path: filePath }) : t('toolApproval.status.executingOperation')}
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
                                {toolCall.status === "failed" ? t('toolApproval.result.failedTitle') : t('toolApproval.result.title')}
                            </span>
                        </div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                            toolCall.status === "failed"
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : toolCall.result || toolCall.status === "completed"
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        }`}>
                            {toolCall.status === "failed" ? t('toolApproval.result.failedStatus') : toolCall.result || toolCall.status === "completed" ? t('toolApproval.result.successStatus') : t('toolApproval.result.runningStatus')}
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
                                // 🔥 PERFORMANCE FIX: 使用缓存的 scanData 和 nestedStructure
                                if (scanData && (scanData.structure || scanData.key_files) && nestedStructure) {
                                    console.log('[ToolApproval] ✅ Rendering PivoProjectTree for agent_scan_project', {
                                        structureKeys: Object.keys(nestedStructure || {}).length,
                                        keyFilesCount: Object.keys(scanData.key_files || {}).length,
                                        structureRef: nestedStructure === (previousNestedStructureRef.current) ? 'SAME' : 'NEW',
                                        keyFilesRef: scanData.key_files === (previousKeyFilesRef.current) ? 'SAME' : 'NEW'
                                    });
                                    previousNestedStructureRef.current = nestedStructure;
                                    previousKeyFilesRef.current = scanData.key_files;
                                    return <PivoProjectTree structure={nestedStructure} keyFiles={scanData.key_files} />;
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
}, areToolApprovalPropsEqual);