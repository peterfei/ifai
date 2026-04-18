import { PivoProjectTree } from "./PivoProjectTree";
import { useApprovalStore } from '../../core/approval/store/useApprovalStore';
import { DiffPreview } from './DiffPreview';
import { useTypewriter } from '../../hooks/useTypewriter';
import React, { useState, useLayoutEffect, useMemo, useRef } from 'react';
import { Check, X, Terminal, FilePlus, Eye, FolderOpen, Search, Trash2, ChevronDown, ChevronUp, File, CheckCircle, XCircle, RotateCcw, Loader2, AlertTriangle, Shield, ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react';
import { ToolCall, useChatStore } from '../../stores/useChatStore';
import { useEditorStore } from '../../stores/editorStore';
import { useTranslation } from 'react-i18next';
import { readFileContent } from '../../utils/fileSystem';
import { MonacoDiffView } from '../Editor/MonacoDiffView';
import { getToolLabel, getToolColor } from 'ifainew-core';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { formatToolResultToMarkdown } from '../../utils/toolResultFormatter';
import { StreamingToolArgsViewer } from './StreamingToolArgsViewer';
import { ToolExecutionIndicator } from './ToolExecutionIndicator';
import ReactMarkdown from 'react-markdown';
import { BashConsoleOutput } from './BashConsoleOutput';
import { StreamingBashOutput } from './StreamingBashOutput';
import { ProbeSymbolView } from './ProbeSymbolView';
import { toast } from 'sonner';
import { toolApprovalRegistry, RiskLevel } from '../../core/approval/ToolApprovalRegistry';
import { openFileFromPath } from '../../utils/fileActions';

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
    const { t } = useTranslation();
    const tt = (key: string, defaultValue: string, options?: Record<string, any>) =>
        t(`toolApproval.${key}`, { defaultValue, ...(options ?? {}) });

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
        <div className="group/typewriter relative rounded-xl border theme-border theme-code-surface theme-shadow overflow-hidden transition-all duration-300 hover:border-[var(--accent-soft-border)]">
            {/* Glossy Header */}
            <div className="flex items-center justify-between px-4 py-2 theme-panel-muted border-b theme-border">
                <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5 mr-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--danger-color)] shadow-inner" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--warning-color)] shadow-inner" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--success-color)] shadow-inner" />
                    </div>
                    <span className="text-[10px] font-bold theme-text-subtle uppercase tracking-widest px-2 py-0.5 theme-panel rounded border theme-border">
                        {language}
                    </span>
                    <span className="text-[11px] theme-text-subtle font-mono truncate max-w-[150px]">
                        {fileName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {isPartial && (
                        <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-soft-border)] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-color)]"></span>
                            </span>
                            <span className="text-[10px] font-bold text-[var(--accent-color)] animate-pulse uppercase">
                                {tt('preview.streaming', 'Streaming')}
                            </span>
                        </div>
                    )}
                    <span className="text-[10px] theme-text-subtle font-mono">
                        {tt('preview.lines', '{{count}} lines', { count: lines.length })}
                    </span>
                </div>
            </div>

            {/* Code Content with Dynamic Typewriter Cursor */}
            <div
                className="relative max-h-80 overflow-auto scrollbar-thin scrollbar-thumb-[var(--border-strong)]"
                onClick={isTyping ? skip : undefined}
                style={isTyping ? { cursor: 'pointer' } : undefined}
            >
                <pre className="p-4 text-[12px] leading-6 theme-text-muted font-mono whitespace-pre-wrap break-all">
                    <code>
                        {displayLines.join('\n')}
                        {isPartial && (
                            <span className="inline-block w-2 h-4 bg-[var(--accent-color)] ml-1 shadow-[0_0_8px_var(--accent-soft-border)] animate-bounce" />
                        )}
                    </code>
                </pre>
                
                {/* Streaming Overlay Gradient */}
                {isPartial && (
                    <div
                        className="absolute inset-0 pointer-events-none animate-pulse"
                        style={{ background: 'linear-gradient(to bottom, transparent 0%, transparent 65%, var(--accent-soft-bg) 100%)' }}
                    />
                )}
            </div>

            {/* Footer Actions */}
            {shouldCollapse && (
                <button
                    onClick={onToggleExpand}
                    className="w-full py-1.5 theme-panel-muted theme-hoverable border-t theme-border text-[10px] font-bold theme-text-subtle hover:text-[var(--accent-color)] uppercase tracking-widest transition-all"
                >
                    {isExpanded
                        ? tt('preview.collapseView', 'Collapse View')
                        : tt('preview.showAllLines', 'Show All Lines ({{count}})', { count: lines.length })}
                </button>
            )}
        </div>
    );
};

// Helper to organize paths into a tree structure for better visualization (Point 3)
const FileTreeVisualizer: React.FC<{ paths: string[] }> = ({ paths }) => {
    const { t } = useTranslation();
    const tt = (key: string, defaultValue: string, options?: Record<string, any>) =>
        t(`toolApproval.${key}`, { defaultValue, ...(options ?? {}) });
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
                <div className="flex items-center gap-1.5 text-[11px] theme-text-muted py-0.5">
                    <FolderOpen size={10} className="theme-text-warning opacity-70" />
                    <span className="font-medium">{name}</span>
                </div>
            )}
            <div className={name ? "border-l theme-border ml-1.5 pl-2" : ""}>
                {Object.keys(node.nodes).map(dir => renderNode(node.nodes[dir], dir, depth + 1))}
                {node.files.map((file: string) => (
                    <div key={file} className="flex items-center gap-1.5 text-[11px] theme-text-muted py-0.5 group">
                        <File size={10} className="theme-text-accent opacity-70" />
                        <span className="truncate group-hover:text-[var(--accent-color)] transition-colors cursor-default">{file}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="theme-panel-muted rounded-lg border theme-border p-2.5">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold theme-text-subtle uppercase tracking-widest">
                    {tt('fileTree.title', '文件结构')}
                </span>
                <button onClick={() => setIsExpanded(!isExpanded)} className="theme-button-ghost theme-text-subtle">
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
    const tt = (key: string, defaultValue: string, options?: Record<string, any>) =>
        t(`toolApproval.${key}`, { defaultValue, ...(options ?? {}) });
    const settings = useSettingsStore();
    const { editorMode } = useLayoutStore();
    const chatStore = useChatStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [oldContent, setOldContent] = useState<string | null>(null);

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
                case 'completed': return tt('status.completed', '已完成');
                case 'failed': return tt('status.failed', '失败');
                case 'rejected': return tt('status.rejected', '已拒绝');
                default: return toolCall.status;
            }
        }
        if (isPartial) return tt('status.generating', '生成中...');
        switch (toolCall.status) {
            case 'approved': return tt('status.approved', '已批准');
            default: return tt('status.pending', '待审批');
        }
    };

    const getStatusBadgeClass = () => {
        if (isPartial) return 'theme-badge-accent';
        switch (toolCall.status) {
            case 'completed':
                return 'theme-badge-success';
            case 'failed':
                return 'theme-badge-danger';
            case 'approved':
                return 'theme-badge-info';
            case 'rejected':
                return 'theme-panel-muted theme-text-subtle border-[var(--border-color)]';
            default:
                return 'theme-badge-warning';
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
    const fileActionLabel = toolCall.tool?.includes('write') ? t('tool.fileWritten') : t('tool.fileRead');

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
            resultPreview: toolCall.result?.substring(0, 50) || 'N/A'
        });

        try {
            const parsed = JSON.parse(toolCall.result);
            // 检查 output 字段
            if (parsed.output && typeof parsed.output === 'object') {
                if (parsed.output.structure || parsed.output.key_files) {
                    console.log('[ToolApproval] ✅ scanData computed successfully (path 1)');
                    return parsed.output;
                }
            }
            // 情况 3: output 是对象
            else if (parsed.output && typeof parsed.output === 'object') {
                if (parsed.output.structure || parsed.output.key_files) {
                    console.log('[ToolApproval] ✅ scanData computed successfully (path 2)');
                    return parsed.output;
                }
            }
            console.log('[ToolApproval] ⚠️ scanData parse found no structure/key_files');
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
                    icon: <ShieldAlert size={14} className="theme-text-danger" />,
                    headerStyle: { background: 'linear-gradient(90deg, var(--danger-soft-bg) 0%, transparent 72%)' },
                    border: 'border-[var(--danger-soft-border)]',
                    label: tt('risk.high', '高风险操作'),
                    badgeClass: 'theme-surface-danger'
                };
            case 'low':
                return {
                    icon: <ShieldCheck size={14} className="theme-text-success" />,
                    headerStyle: { background: 'linear-gradient(90deg, var(--success-soft-bg) 0%, transparent 72%)' },
                    border: 'border-[var(--success-soft-border)]',
                    label: tt('risk.low', '低风险操作'),
                    badgeClass: 'theme-surface-success'
                };
            default:
                return {
                    icon: <Shield size={14} className="theme-text-warning" />,
                    headerStyle: { background: 'linear-gradient(90deg, var(--warning-soft-bg) 0%, transparent 72%)' },
                    border: 'border-[var(--warning-soft-border)]',
                    label: tt('risk.medium', '中等风险'),
                    badgeClass: 'theme-surface-warning'
                };
        }
    };

    const riskVisuals = getRiskVisuals(riskLevel);
    const statusBadgeClass = getStatusBadgeClass();
    const resultState = toolCall.status === 'failed'
        ? 'failed'
        : (toolCall.result || toolCall.status === 'completed')
            ? 'success'
            : 'running';
    const resultVisuals = resultState === 'failed'
        ? {
            barClass: 'bg-[var(--danger-color)]',
            badgeClass: 'theme-badge-danger',
            containerClass: 'bg-[var(--danger-soft-bg)] border-[var(--danger-soft-border)]',
            title: tt('result.failedTitle', '执行失败'),
            statusLabel: tt('result.failedStatus', '失败'),
            iconWrapperClass: 'bg-[var(--danger-soft-bg)]',
            iconClass: 'theme-text-danger',
        }
        : resultState === 'success'
            ? {
                barClass: 'bg-[var(--success-color)]',
                badgeClass: 'theme-badge-success',
                containerClass: 'bg-[var(--success-soft-bg)] border-[var(--success-soft-border)]',
                title: tt('result.title', '执行结果'),
                statusLabel: tt('result.successStatus', '成功'),
                iconWrapperClass: 'bg-[var(--success-soft-bg)]',
                iconClass: 'theme-text-success',
            }
            : {
                barClass: 'bg-[var(--accent-color)]',
                badgeClass: 'theme-badge-info',
                containerClass: 'bg-[var(--accent-soft-bg)] border-[var(--accent-soft-border)]',
                title: tt('result.title', '执行结果'),
                statusLabel: tt('result.runningStatus', '运行中'),
                iconWrapperClass: 'bg-[var(--accent-soft-bg)]',
                iconClass: 'theme-text-accent',
            };

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

    const handleOpenPreview = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();

        if (!filePath) {
            return;
        }

        const opened = await openFileFromPath(filePath, {
            id: filePath,
            name: filePath.split('/').pop() || filePath,
            language: detectLanguage(filePath),
        });

        if (!opened) {
            return;
        }

        useEditorStore.getState().setApprovalPreview({
            isVisible: true,
            filePath,
            oldContent: oldContent || '',
            newContent,
            toolCallId: toolCall.id,
        });
    };

    return (
        <div data-testid="file-approval-dialog" data-test-id="tool-approval-card" className={`group/tool mt-4 mb-4 rounded-2xl border ${riskVisuals.border} theme-panel-elevated backdrop-blur-sm theme-shadow overflow-hidden w-full transition-all duration-300 hover:shadow-[var(--app-shadow)]`}>
                        {/* Elegant Header (Point 2) */}
                        <div className="flex items-center justify-between px-5 py-3 border-b theme-border" style={riskVisuals.headerStyle}>
                            <div className="flex items-center gap-3 pr-12"> {/* Added pr-12 to avoid copy button overlap */}
                                <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${getToolColor(toolCall.tool)} bg-opacity-10 border border-current opacity-80 shadow-[0_10px_24px_var(--backdrop-strong)]`}>
                                    {getIcon()}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span data-testid="tool-name" className="text-[13px] font-bold theme-text tracking-tight leading-tight">
                                            {getToolLabel(toolCall.tool)}
                                        </span>
                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${riskVisuals.badgeClass}`}>
                                            {riskVisuals.icon}
                                            <span className="text-[9px] font-bold uppercase tracking-tighter">
                                                {riskVisuals.label}
                                            </span>
                                        </div>
                                    </div>
                                    {filePath ? (
                                        <div className="flex items-center gap-2 group/path">
                                            <span data-testid="file-path" className="text-[10px] theme-text-subtle font-mono font-medium truncate max-w-[220px]" title={filePath}>
                                                {fileActionLabel} <span className="theme-text font-bold">{formatFilePath(filePath)}</span>
                                            </span>
                                            {isWriteFile && !isPartial && (
                                                <button
                                                    onClick={handleOpenPreview}
                                                    className="theme-soft-hover-accent theme-text-subtle rounded p-1 transition-all opacity-0 group-hover/path:opacity-100 hover:text-[var(--accent-color)]"
                                                    title={t('promptManager.editor.tabPreview')}
                                                >
                                                    <ExternalLink size={10} />
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        getToolArg('command') && (
                                            <span className="text-[10px] theme-text-subtle font-mono truncate max-w-[220px]">
                                                {tt('commandLabel', 'exec')}: {getToolArg('command')}
                                            </span>
                                        )
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div data-testid="status-badge" className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${statusBadgeClass}`}>
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
                            <div data-testid="tool-params" className="theme-code-surface p-4 rounded-xl border theme-border shadow-inner">
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
                                    <div className="w-1 h-3 bg-[var(--accent-color)] rounded-full" />
                                    <span className="text-[10px] font-bold theme-text-subtle uppercase tracking-widest">
                                        {tt('diff.title', 'Changes Analysis')}
                                    </span>
                                </div>
                                {(() => {
                                    const contentLength = newContent.length;
                                    if (contentLength > MAX_DIFF_SIZE) {
                                        return (
                                            <div className="p-4 rounded-xl border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[11px] theme-text-warning leading-relaxed italic">
                                                {tt(
                                                    'diff.largeFileSkipped',
                                                    'Diff view skipped due to large file size ({{size}} KB). Content preserved in editor.',
                                                    { size: (contentLength / 1024).toFixed(1) }
                                                )}
                                            </div>
                                        );
                                    }
                                    
                                    // 🏆 FIX: 即使没有 oldContent，也允许显示新内容（作为回退）
                                    // 或者显示一个清晰的占位符，防止整个组件崩溃
                                    const lang = filePath ? detectLanguage(filePath) : 'typescript';
                                    
                                    // 只有当 oldContent 和 newContent 都准备好了才渲染 MonacoDiffView
                                    const canShowDiff = oldContent !== null && newContent && typeof oldContent === 'string' && typeof newContent === 'string';

                                    return (
                                        <div className="rounded-xl border theme-border overflow-hidden shadow-inner theme-code-surface">
                                            {canShowDiff ? (
                                                <MonacoDiffView
                                                    oldValue={oldContent}
                                                    newValue={newContent}
                                                    language={lang}
                                                    height="300px"
                                                />
                                            ) : (
                                                <div className="p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
                                                    <div className="text-[11px] theme-text-subtle font-mono mb-3 uppercase tracking-widest animate-pulse">
                                                        {isWriteFile
                                                            ? tt('diff.preparing', 'Preparing Diff Analysis...')
                                                            : tt('diff.loadingContent', 'Loading Content...')}
                                                    </div>
                                                    {newContent && typeof newContent === 'string' && (
                                                        <div className="w-full max-w-md">
                                                            <pre className="text-[10px] theme-text-muted text-left theme-panel p-4 rounded border theme-border max-h-40 overflow-auto scrollbar-hide">
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
                            <div className="w-1 h-4 bg-[var(--accent-color)] rounded-full" />
                            <span className="text-[10px] font-bold theme-text-subtle uppercase tracking-widest">
                                {tt('sections.parameters', '操作参数')}
                            </span>
                            {isPartial && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-soft-border)] opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-color)]"></span>
                                    </span>
                                    <span className="text-[10px] font-bold text-[var(--accent-color)] animate-pulse uppercase">
                                        {tt('status.generatingShort', '生成中')}
                                    </span>
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
                        <div data-testid="tool-params" className="theme-code-surface p-4 rounded-xl border theme-border shadow-inner">
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
                            <div className="mt-3 p-3 theme-panel border theme-border rounded-xl">
                                <div className="text-[10px] theme-text-subtle italic">
                                    {tt('preview.preparingChanges', '正在准备变更预览...')}
                                </div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 目录列表预览 */}
                        {toolCall.tool === 'agent_list_dir' && (
                            <div className="mt-3 p-3 theme-surface-info rounded-xl flex items-center gap-3">
                                <FolderOpen className="theme-text-info" size={16} />
                                <div className="text-[11px] italic">{tt('preview.directoryScanning', '正在扫描目录结构...')}</div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 搜索意图预览 */}
                        {previewData && (toolCall.tool === 'agent_search' || toolCall.tool === 'search_semantic') && (
                            <div className="mt-3 overflow-hidden rounded-xl theme-surface-info">
                                <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--info-soft-border)]">
                                    <Search size={14} className="theme-text-info" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest theme-text-info">
                                        {tt('preview.searchTitle', '{{toolType}}预览', { toolType: previewData.toolType })}
                                    </span>
                                </div>
                                <div className="p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[10px] theme-text-subtle uppercase">
                                            {tt('preview.queryLabel', '关键词')}:
                                        </span>
                                        <code className="theme-code-inline theme-text-accent text-[11px] font-mono px-1.5 py-0.5 rounded">
                                            {previewData.query}
                                        </code>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] theme-text-subtle uppercase">
                                            {tt('preview.scopeLabel', '范围')}:
                                        </span>
                                        <span className="text-[11px] theme-text-muted font-mono">{previewData.scope}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: 符号分析预览 */}
                        {previewData && (toolCall.tool === 'get_file_symbols' || toolCall.tool === 'agent_list_functions') && (
                            <div className="mt-3 p-3 theme-surface-accent rounded-xl flex items-start gap-3">
                                <Search className="theme-text-accent shrink-0" size={16} />
                                <div>
                                    <div className="text-[10px] font-bold theme-text-accent uppercase">
                                        {tt('preview.symbolTitle', '{{toolType}}预览', { toolType: previewData.toolType })}
                                    </div>
                                    <div className="text-[11px] mt-0.5 italic">
                                        {tt('preview.symbolDescription', '正在深度解析代码语义: {{fileName}}', { fileName: previewData.fileName })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 🔥 PIVO 2.0: Bash 风险预警 */}
                        {previewData && toolCall.tool === 'bash' && previewData.isDestructive && (
                            <div className="mt-3 p-3 theme-surface-danger rounded-xl flex items-start gap-3">
                                <AlertTriangle className="theme-text-danger shrink-0" size={16} />
                                <div>
                                    <div className="text-[10px] font-bold theme-text-danger uppercase">
                                        {tt('preview.dangerTitle', '高风险操作警示')}
                                    </div>
                                    <div className="text-[11px] mt-0.5">
                                        {tt('preview.dangerDescription', '该命令包含敏感操作（如删除或权限修改），执行前请仔细检查。')}
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Actions (Approve/Reject) */}
            {isPending && !isPartial && (
                <div className="flex border-t theme-border">
                    {!settings.agentAutoApprove ? (
                        <>
                            <button
                                data-testid="approve-button"
                                onClick={() => onApprove(toolCall.id)}
                                className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest theme-text-success hover:bg-[var(--success-soft-bg)] flex items-center justify-center gap-2 border-r theme-border transition-all duration-200"
                            >
                                <Check size={14} /> {tt('actions.approve', '批准执行')}
                            </button>
                            <button
                                data-testid="reject-button"
                                onClick={() => onReject(toolCall.id)}
                                className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest theme-text-danger hover:bg-[var(--danger-soft-bg)] flex items-center justify-center gap-2 transition-all duration-200"
                            >
                                <X size={14} /> {tt('actions.reject', '拒绝')}
                            </button>
                        </>
                    ) : (
                        <div className="w-full px-5 py-3 theme-surface-info flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--info-color)] animate-pulse" />
                            {tt('autoApprove.enabled', '自动批准已开启 · 工具执行中')}
                        </div>
                    )}
                </div>
            )}

            {/* 🔥 撤销按钮 - 仅在已完成的文件写入操作且有回滚数据时显示 */}
            {toolCall.status === 'completed' &&
             toolCall.tool === 'agent_write_file' &&
             hasRollbackData &&
             hasRollbackFeature && (
                <div className="flex border-t theme-border">
                    <button
                        onClick={handleUndo}
                        disabled={isRollingBack}
                        className="flex-1 p-3 text-[11px] font-bold uppercase tracking-widest
                                   theme-text-warning hover:bg-[var(--warning-soft-bg)]
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   flex items-center justify-center gap-2 transition-all duration-200"
                    >
                        {isRollingBack ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                {tt('actions.undoPending', '撤销中...')}
                            </>
                        ) : (
                            <>
                                <RotateCcw size={14} />
                                {tt('actions.undo', '撤销')}
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* 🔥 冲突确认对话框 */}
            {showConflictDialog && (
                <div className="theme-backdrop fixed inset-0 z-[200] flex items-center justify-center">
                    <div className="theme-panel-elevated w-[400px] rounded-lg border theme-border theme-shadow">
                        <div className="p-4 border-b theme-border">
                            <h2 className="text-lg font-medium flex items-center gap-2">
                                <AlertTriangle className="theme-text-warning" size={18} />
                                {tt('conflict.title', '检测到手动修改')}
                            </h2>
                        </div>
                        <div className="p-6 text-sm theme-text-muted">
                            {tt('conflict.description', '文件在 AI 修改后又被手动编辑过。确认回滚将覆盖手动修改，此操作无法撤销。')}
                        </div>
                        <div className="p-4 border-t theme-border flex justify-end gap-3">
                            <button
                                onClick={() => setShowConflictDialog(false)}
                                className="px-4 py-2 theme-button-secondary text-sm rounded transition-colors"
                            >
                                {tt('actions.cancel', '取消')}
                            </button>
                            <button
                                onClick={handleConfirmRollback}
                                className="px-4 py-2 theme-button-danger text-sm rounded font-bold transition-colors"
                            >
                                {tt('actions.confirmRollback', '确认回滚')}
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
                            className="theme-border"
                        />
                    </div>
                );
            })()}

            {/* ✅ Bash 工具自动执行中 - 终端风格等待动画（后端已在执行，不重复调用） */}
            {(toolCall.status === 'executing') && !toolCall.result && shouldShowConsole() && (() => {
                const bashCommand = getToolArg('command', '');
                return (
                    <div className="px-5 pb-4">
                        <div className="border theme-border rounded-lg overflow-hidden theme-code-surface">
                            <div className="flex items-center justify-between px-3 py-2 theme-panel-muted border-b theme-border">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Terminal size={14} className="theme-text-subtle shrink-0" />
                                    <code className="text-xs theme-text-muted truncate font-mono">{bashCommand}</code>
                                </div>
                                <div className="flex items-center gap-2 theme-text-warning">
                                    <div className="w-2 h-2 bg-[var(--warning-color)] rounded-full animate-pulse" />
                                    <span className="text-xs">{tt('status.executing', '执行中...')}</span>
                                </div>
                            </div>
                            <div className="p-3 font-mono text-xs theme-text-subtle flex items-center gap-2">
                                <div className="w-2 h-4 bg-[var(--warning-soft-border)] animate-pulse" />
                                <span className="italic">{tt('status.waitingOutput', '等待命令输出...')}</span>
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
                        message={isWriteFile
                            ? tt('status.writingFile', '正在写入文件: {{path}}', { path: filePath })
                            : tt('status.executingOperation', '正在执行操作...')}
                    />
                </div>
            )}

            {/* ✅ 执行结果展示 - 工业级UI，无JSON显示 */}
            {(toolCall.status === "completed" || toolCall.status === "failed" || toolCall.result) && !isPartial && (
                <div className="px-5 pb-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className={`w-1 h-4 rounded-full ${resultVisuals.barClass}`} />
                            <span className="text-[10px] font-bold theme-text-subtle uppercase tracking-widest">
                                {resultVisuals.title}
                            </span>
                        </div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${resultVisuals.badgeClass}`}>
                            {resultVisuals.statusLabel}
                        </div>
                    </div>

                    <div className={`p-4 rounded-xl border overflow-hidden ${resultVisuals.containerClass}`}>
                        {(toolCall.result || toolCall.status === "completed") && toolCall.status !== "failed" && (
                            <div className="flex items-center justify-center mb-3">
                                <div className="relative">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${resultVisuals.iconWrapperClass}`}>
                                        <CheckCircle className={`w-6 h-6 ${resultVisuals.iconClass}`} />
                                    </div>
                                    <div className="absolute inset-0 w-12 h-12 rounded-full bg-[var(--success-soft-bg)] animate-ping" />
                                </div>
                            </div>
                        )}

                        {toolCall.status === "failed" && (
                            <div className="flex items-center justify-center mb-3">
                                <div className="relative">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${resultVisuals.iconWrapperClass}`}>
                                        <XCircle className={`w-6 h-6 ${resultVisuals.iconClass}`} />
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
                                            h1: ({node, ...props}) => <h1 {...props} className="text-base font-bold theme-text mb-2" />,
                                            h2: ({node, ...props}) => <h2 {...props} className="text-sm font-bold theme-text-muted mb-2 mt-3" />,
                                            h3: ({node, ...props}) => <h3 {...props} className="text-xs font-bold theme-text-subtle mb-1" />,
                                            p: ({node, ...props}) => <p {...props} className="text-xs theme-text-muted mb-2 last:mb-0" />,
                                            ul: ({node, ...props}) => <ul {...props} className="list-disc list-inside mb-2 theme-text-muted space-y-1" />,
                                            ol: ({node, ...props}) => <ol {...props} className="list-decimal list-inside mb-2 theme-text-muted space-y-1" />,
                                            li: ({node, ...props}) => <li {...props} className="ml-2 theme-text-muted" />,
                                            strong: ({node, ...props}) => <strong {...props} className="font-bold theme-text" />,
                                            em: ({node, ...props}) => <em {...props} className="italic theme-text-muted" />,
                                            code({ node, inline, ...rest }: any) {
                                                if (inline) return <code {...rest} className="px-1.5 py-0.5 theme-code-inline theme-text rounded text-[10px] font-mono" />;
                                                return <code {...rest} className="block theme-code-surface p-2 rounded text-[10px] theme-text-muted font-mono overflow-x-auto" />;
                                            },
                                            pre: ({node, ...props}) => <pre {...props} className="theme-code-surface p-3 rounded-lg overflow-x-auto mb-2 border theme-border" />,
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
