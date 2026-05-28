import React, { useState, useCallback, useRef } from 'react';
import { User, FileCode, ChevronDown, ChevronUp, Copy, RotateCcw, MoreHorizontal, Bot, CheckCircle, X } from 'lucide-react';
import { Message, ContentPart, useChatStore, ContentSegment } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTypewriter } from '../../hooks/useTypewriter';

/**
 * 打字机文本包装组件（提取到外部，避免每次渲染重建导致 hook 状态丢失）
 */
const TypewriterText: React.FC<{
    content: string;
    isStreaming: boolean;
    children: (text: string) => React.ReactNode;
}> = ({ content, isStreaming, children }) => {
    // 🔥 FIX: 使用 enableTypewriterEffect 设置来控制是否启用打字机效果
    const enableTypewriter = useSettingsStore((s) => s.enableTypewriterEffect);

    const { displayText } = useTypewriter({
        content,
        enabled: isStreaming && enableTypewriter, // 只在流式传输且启用打字机效果时才启用
        baseCPS: 40,
        fastCPS: 120,
        threshold: 300,
        throttleMs: 50, // 🔥 FIX 2.1: 节流 50ms，将 React 状态更新从 ~60fps 降到 ~20fps
    });
    // useTypewriter 在 enabled=false 时自动跳到末尾，displayText === content
    return <>{children(displayText)}</>;
};
import { useThreadStore } from '../../stores/threadStore';
import { toast } from 'sonner';
import { chatEventBus } from '../../stores/chat/eventBus/ChatEventBus';
import { ToolApproval } from './ToolApproval';
import { ToolBatchApproval } from './ToolBatchApproval';
import { ExploreProgress } from './ExploreProgress';
import { ExploreProgress as ExploreProgressNew } from './ExploreProgressNew';
import { PivoProjectTree } from './PivoProjectTree';
import { TaskSummary } from './TaskSummary';
import { TaskCompletionBanner } from './TaskCompletionBanner';
import { WorkflowView } from '../workflow/WorkflowView';
import type { PhaseData } from '../../types/workflow';
import { useTranslation } from 'react-i18next';
import { parseToolCalls } from 'ifainew-core';
import ifaiLogo from '../../../imgs/ifai.png';
import { TaskBreakdownViewer } from '../TaskBreakdown/TaskBreakdownViewer';
import { TaskBreakdown } from '../../types/taskBreakdown';
import { PivoTreeList } from './PivoTreeList';
import { usePivoStore } from '../../stores/pivoStore';
import { MarkdownRenderer, SimpleMarkdownRenderer } from './MarkdownRenderer';
import styles from './MessageItem.module.css';
import { MessageCardRegistry, resolveCardType } from '../../gui/conversation/MessageCardRegistry';
import { adaptMessageToCard } from '../../gui/conversation/MessageAdapterRegistry';
import { getUserBubbleStyle, getAssistantBubbleStyle, getAgentBubbleStyle, getAgentAvatarStyle } from '../../gui/conversation/bubbleStyles';
import { getAgent } from '../../gui/conversation/AGENT_DSL';

/**
 * TOOL_RENDER_BLACKLIST — 工具渲染黑名单（声明式）
 *
 * 这些工具的 ToolApproval 不在消息流中渲染，由专用卡片接管展示。
 * 新增黑名单工具只需加一行，三处过滤自动生效。
 */
const TOOL_RENDER_BLACKLIST = new Set(['TodoWrite']);
/**
 * 将平铺的文件列表转换为 PivoProjectTree 所需的嵌套对象结构
 * @param files 文件路径数组
 * @returns 嵌套结构对象
 */
function filesToStructure(files: string[]): any {
  const structure: any = {};
  files.forEach(path => {
    const parts = path.split('/').filter(p => p.length > 0);
    let current = structure;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = (i === parts.length - 1) && !path.endsWith('/');
      if (isFile) {
        current[part] = "file";
      } else {
        if (!current[part] || current[part] === "file") current[part] = {};
        current = current[part];
      }
    }
  });
  return structure;
}

/**
 * 工业级消息样式常量
 */
const STYLES = {
    userBubble: 'max-w-[85%] rounded-2xl p-4 bg-blue-600 text-white shadow-lg ml-auto',
    assistantBubble: 'w-full rounded-2xl p-4 bg-[#252526] text-gray-200 border border-gray-700/50 shadow-sm relative group',
    agentBubble: 'w-full rounded-2xl p-4 bg-[#1e1e1e] text-blue-100 border border-blue-900/30 shadow-sm relative group',
    timestamp: 'text-[10px] text-gray-500 mt-1'
};
/**
 * 检测内容是否是任务拆解 JSON
 * @param content 消息内容
 * @returns 解析后的 TaskBreakdown 对象或 null
 */
function detectTaskBreakdown(content: string): TaskBreakdown | null {
  if (!content || typeof content !== 'string') return null;
  try {
    // 移除可能的 markdown 代码块标记
    const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    // 检查是否包含 taskTree 字段（任务拆解的核心标识）
    if (!cleanContent.includes('"taskTree"') && !cleanContent.includes('"title"')) {
      return null;
    }
    // 尝试解析 JSON
    const parsed = JSON.parse(cleanContent);
    // 验证是否是有效的 TaskBreakdown 结构
    if (parsed && parsed.taskTree && parsed.title && parsed.id) {
      return parsed as TaskBreakdown;
    }
  } catch (e) {
    // JSON 解析失败，可能是不完整的内容或流式传输中
    return null;
  }
  return null;
}
interface MessageItemProps {
    message: Message;
    onApprove: (messageId: string, toolCallId: string) => void;
    onReject: (messageId: string, toolCallId: string) => void;
    onOpenFile: (path: string) => void;
    onOpenComposer?: (messageId: string) => void; // v0.2.8: 打开 Composer 面板
    isStreaming?: boolean;
    /** conversation 模式紧凑样式：使用 PALETTE 驱动 inline style */
    compact?: boolean;
}
// Custom comparison function for React.memo
// Optimized to avoid unnecessary re-renders during streaming
const arePropsEqual = (prevProps: MessageItemProps, nextProps: MessageItemProps) => {
    // Re-render if streaming status changes
    if (prevProps.isStreaming !== nextProps.isStreaming) {
        return false;
    }
    // Re-render if compact mode changes
    if (prevProps.compact !== nextProps.compact) {
        return false;
    }
    // Re-render if message content changes
    if (prevProps.message.content !== nextProps.message.content) {
        return false;
    }
    // 🔥 FIX v0.3.4: 必须比较 segments，否则 tool segment 新增时不会触发 UI 更新
    if ((prevProps.message as any).segments !== (nextProps.message as any).segments) {
        return false;
    }
    // 🔥 FIX: 必须比较 contentSegments，否则流式工具调用不会触发 UI 更新
    if ((prevProps.message.contentSegments?.length || 0) !== (nextProps.message.contentSegments?.length || 0)) {
        return false;
    }
    // 🔥 FIX v0.3.9.3: 更彻底的 toolCalls 深度比较
    const prevToolCalls = prevProps.message.toolCalls;
    const nextToolCalls = nextProps.message.toolCalls;
    // 如果数量不同，重新渲染
    if ((prevToolCalls?.length || 0) !== (nextToolCalls?.length || 0)) {
        return false;
    }
    // 如果有 toolCalls，深度比较每个 toolCall
    if (prevToolCalls && nextToolCalls) {
        for (let i = 0; i < prevToolCalls.length; i++) {
            const prevTC = prevToolCalls[i];
            const nextTC = nextToolCalls[i];
            // 检查所有关键字段
            if (prevTC.id !== nextTC.id ||
                prevTC.tool !== nextTC.tool ||
                prevTC.status !== nextTC.status ||
                prevTC.result !== nextTC.result ||
                prevTC.isPartial !== nextTC.isPartial ||
                // ⚡️ PERFORMANCE FIX: 使用引用比较代替 JSON.stringify
                // 在 useChatStore 中，我们确保了 args 每次更新都是一个新对象
                prevTC.args !== nextTC.args) {
                return false;
            }
        }
    } else if (prevToolCalls !== nextToolCalls) {
        // 其中一个是 null/undefined 而另一个不是
        return false;
    }
    // Re-render if message ID changes
    if (prevProps.message.id !== nextProps.message.id) {
        return false;
    }
    // Re-render if references change
    if ((prevProps.message.references?.length || 0) !== (nextProps.message.references?.length || 0)) {
        return false;
    }
    // Re-render if metadata changes (exploreProgress or phaseData)
    if ((prevProps.message as any).exploreProgress !== (nextProps.message as any).exploreProgress) {
        return false;
    }
    if ((prevProps.message as any).metadata?.phaseData !== (nextProps.message as any).metadata?.phaseData) {
        return false;
    }
    // Otherwise skip re-render
    return true;
};
// 🔥 FIX: 添加自定义比较函数，确保 toolCalls 变化时触发重新渲染
// 🔥 PERFORMANCE FIX: 添加 MessageItem 比较函数，防止无关消息重新渲染
const areMessageItemPropsEqual = (prevProps: MessageItemProps, nextProps: MessageItemProps) => {
    // 如果 message 引用相同，跳过渲染
    if (prevProps.message === nextProps.message) {
        return true;
    }
    // 检查关键字段
    return (
        prevProps.message.id === nextProps.message.id &&
        prevProps.message.role === nextProps.message.role &&
        prevProps.message.content === nextProps.message.content &&
        prevProps.message.toolCalls === nextProps.message.toolCalls &&
        prevProps.isStreaming === nextProps.isStreaming
    );
};

export const MessageItem = React.memo(({ message, onApprove, onReject, onOpenFile, onOpenComposer, isStreaming, compact }: MessageItemProps) => {
    const { t } = useTranslation();
    const isUser = message.role === 'user';
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

    // 🔥 v0.3.7: 订阅 PIVO 任务树状态与活动的持有者 ID
    const pivoTasks = usePivoStore(state => state.taskTrees[message.id]);
    const activePivoMessageId = usePivoStore(state => state.activeMessageId);
    const isPivoEscort = message.id === activePivoMessageId;
    // PERFORMANCE: State for managing code block folding (for >50 line blocks)
    const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());
    // Force re-render counter for isStreaming changes
    const [, forceUpdate] = useState(0);
    // Store latest isStreaming in ref for renderContentPart to access
    const isStreamingRef = useRef(isStreaming);
    isStreamingRef.current = isStreaming;
    // Track content length to detect active streaming (more reliable than isStreaming prop)
    const lastContentLengthRef = useRef(0);
    // Helper to process scan result i18n
    const processScanResult = useCallback((text: string): string => {
        const SCAN_RESULT_MARKER = '__SCAN_RESULT__';
        if (text.includes(SCAN_RESULT_MARKER)) {
            return text.replace(
                /__SCAN_RESULT__(\d+)\|(\d+)/g,
                (match, count, time) => t('commands.scanResult', { count, time })
            );
        }
        return text;
    }, [t]);
    // FIXED: Use state instead of ref to ensure re-render when streaming state changes
    // v0.2.6: 优化流式检测逻辑，结合外部 props 和内部内容增长
    const [isActivelyStreaming, setIsActivelyStreaming] = useState(false);
    // 🔥 FIX: 使用 ref 跟踪 isActivelyStreaming，避免依赖循环导致无限渲染
    const isActivelyStreamingRef = useRef(isActivelyStreaming);
    isActivelyStreamingRef.current = isActivelyStreaming;
    // v0.2.9: Track ignored actions for E2E testing
    const [ignoredActions, setIgnoredActions] = useState<Set<number>>(new Set());
    // 强制使用外部传进来的 isStreaming 作为主要判定依据
    // 🔥 FIX v0.3.1 → v0.4.2: effectivelyStreaming 三维检测
    // 问题分析（多轮调试结论）：
    //   isStreaming: SSE 流式传输中 → true
    //   isActivelyStreaming: 文本内容增长中 → true（1500ms 超时后 false）
    //   hasActiveToolCalls: 有工具正在执行 → true
    // 根因：AI 生成工具调用后，文本 delta 暂停，isActivelyStreaming 超时变 false，
    //        但工具仍在执行/等待审批。新文本到达时 effectivelyStreaming=false，
    //        TypewriterText 不被渲染，文本直接通过 MarkdownRenderer 全量显示。
    const hasActiveToolCalls = !!(message.toolCalls?.some(tc =>
        tc.status === 'pending' || tc.status === 'executing' || tc.status === 'running' || tc.isPartial
    ));
    const effectivelyStreaming = isStreaming || isActivelyStreaming || hasActiveToolCalls;
    // v0.2.8: Composer 2.0 - 检测消息中是否有文件变更
    const hasFileChanges = React.useMemo(() => {
        if (!message.toolCalls || isStreaming) return false;
        return message.toolCalls.some(tc => {
            const toolName = (tc as any).function?.name || (tc as any).toolName || (tc as any).tool || '';
            const result = tc.result;
            // result 可能是字符串或对象
            if (typeof result === 'string') {
                try {
                    const parsed = JSON.parse(result);
                    return toolName === 'agent_write_file' && parsed.success;
                } catch {
                    return false;
                }
            }
            return toolName === 'agent_write_file' && (result as any)?.success;
        });
    }, [message.toolCalls, isStreaming]);
    // ⚡️ FIX: 辅助函数 - 判断toolCall是否是最新的bash命令
    const isLatestBashTool = useCallback((toolCallId: string): boolean => {
        if (!message.toolCalls) return false;
        // 找到所有bash命令
        const bashToolCalls = message.toolCalls.filter(tc => {
            const toolName = tc.tool?.toLowerCase() || '';
            return toolName.includes('bash') ||
                   toolName.includes('execute_command') ||
                   toolName.includes('shell') ||
                   toolName.includes('agent_list_dir') ||
                   toolName.includes('agent_read_file');
        });
        if (bashToolCalls.length === 0) return false;
        // 检查当前toolCall是否是最后一个bash命令
        const latestBashTool = bashToolCalls[bashToolCalls.length - 1];
        return latestBashTool.id === toolCallId;
    }, [message.toolCalls]);
    // Component-level timeout to avoid global variable collision between multiple MessageItem instances
    const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Convert content to string for display
    // Handle both string and ContentPart[] types
    const displayContent = React.useMemo(() => {
      // 🔥 v0.3.7: 对于 Inline 任务，只显示简洁的标签
      if ((message as any).isInlineTask && (message as any).displayLabel) {
        return (message as any).displayLabel;
      }

      const content = message.content;
      let rawText = '';
      // If content is an array (ContentPart[]), convert to string
      if (Array.isArray(content)) {
        rawText = content.map(part => part.type === 'text' ? part.text : '[image]').join('');
      } else {
        // If content is already a string, use as-is
        rawText = content || '';
      }
      // v0.2.6: 过滤思维链标记 <think...>
      // AI Transparency: debug 模式下保留思考内容
      const isDebugMode = useSettingsStore.getState().transparencyLevel === 'debug';
      if (!isDebugMode) {
        // 移除完整的 think 块以及由于流式截断可能残留的 </think 标签
        return rawText
          .replace(/<think[\s\S]*?<\/think>/gi, '') // 移除完整的思考块
          .replace(/<\/think>/gi, '');               // 移除残留的闭合标签
      }
      return rawText;
    }, [message.content]);
    // v0.2.6: 检测任务拆解内容
    const taskBreakdown = React.useMemo(() => {
      // 仅在非流式状态时检测（流式中的 JSON 不完整）
      if (effectivelyStreaming) return null;
      return detectTaskBreakdown(displayContent);
    }, [displayContent, effectivelyStreaming]);
    // v0.2.6: 检测是否正在流式传输任务拆解内容
    const isStreamingTaskBreakdown = React.useMemo(() => {
      if (!effectivelyStreaming) return false;
      // 检查内容是否包含任务拆解的特征
      const cleanContent = displayContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      // v0.2.6: 优先检测 proposal-generator，避免与 task-breakdown 混淆
      const isProposalGenerator = cleanContent.includes('"specDeltas"') ||
                                   cleanContent.includes('"changeId"') ||
                                   cleanContent.includes('"whatChanges"');
      if (isProposalGenerator) return false; // proposal-generator 不显示为任务拆解
      return cleanContent.includes('"taskTree"') ||
             cleanContent.includes('"children"') ||
             (cleanContent.includes('"title"') && cleanContent.includes('"tasks"'));
    }, [displayContent, effectivelyStreaming]);
    // Update streaming status based on content growth
    React.useEffect(() => {
        const currentLength = displayContent.length;
        // Initialize on first run
        if (lastContentLengthRef.current === 0 && currentLength > 0) {
            lastContentLengthRef.current = currentLength;
        }
        const isGrowing = currentLength > lastContentLengthRef.current;
        if (isGrowing) {
            // Content is growing - actively streaming
            setIsActivelyStreaming(true);
            lastContentLengthRef.current = currentLength;
            // Clear previous timeout
            if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
            }
            // Set timeout to mark streaming as complete after 1500ms of no changes
            // ⚡️ FIX: 延长超时时间，减少频繁的状态切换，降低重渲染次数
            streamingTimeoutRef.current = setTimeout(() => {
                setIsActivelyStreaming(false);
                streamingTimeoutRef.current = undefined;
            }, 1500);
        }
        // 🔥 FIX: 检查 toolCalls 状态，如果所有都完成了，立即停止流式状态
        const hasCompletedToolCallsOnly = message.toolCalls && message.toolCalls.length > 0 &&
            message.toolCalls.every(tc => tc.status === 'completed' || tc.status === 'failed');
        // 如果所有工具调用都完成了，立即停止流式状态
        if (hasCompletedToolCallsOnly && isActivelyStreamingRef.current) {
            setIsActivelyStreaming(false);
            if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
                streamingTimeoutRef.current = undefined;
            }
        }
        // Cleanup timeout on unmount
        return () => {
            if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
                streamingTimeoutRef.current = undefined;
            }
        };
        // 🔥 FIX: 移除 isActivelyStreaming 依赖，防止无限循环
        // 这个 useEffect 内部会调用 setIsActivelyStreaming，如果将它作为依赖项
        // 会导致每次状态变化都重新触发 useEffect，造成无限循环
    }, [displayContent, message.toolCalls]);
    const toggleBlock = useCallback((index: number) => {
        setExpandedBlocks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    }, []);
    // Create a stable reference to expandedBlocks for useCallback
    const expandedBlocksRef = useRef(expandedBlocks);
    expandedBlocksRef.current = expandedBlocks;
    // Debug: Log message toolCalls on every render (development only)
    React.useEffect(() => {
        if (process.env.NODE_ENV === 'development' && message.toolCalls && message.toolCalls.length > 0) {
            console.log('[MessageItem] Rendering message with toolCalls:', message.id, message.toolCalls.length);
        }
    }, [message.toolCalls, message.id]);

    // Debug: Log when isStreaming changes
    React.useEffect(() => {
        // 🔥 FIX: When streaming stops, immediately clear activelyStreaming state
        // This prevents the "生成中..." indicator from staying forever
        if (!isStreaming && isActivelyStreamingRef.current) {
            console.log('[MessageItem] 🏁 Streaming stopped, clearing activelyStreaming state');
            setIsActivelyStreaming(false);
            if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
                streamingTimeoutRef.current = undefined;
            }
        }
    }, [isStreaming, message.id]);
    // Count pending tool calls for batch actions
    const pendingCount = React.useMemo(() => {
        if (!message.toolCalls) return 0;
        return message.toolCalls.filter(tc => tc.status === 'pending' && !tc.isPartial).length;
    }, [message.toolCalls]);
    const handleApproveAll = () => {
        const store = useChatStore.getState() as any;
        if (store.approveAllToolCalls) {
            // 🔥 v0.3.4: 记录会话信任（批量批准时）
            const settings = useSettingsStore.getState();
            const approvalMode = settings.agentApprovalMode || 'session-once'; // 🔥 默认值处理
            if (approvalMode === 'session-once') {
                const threadId = useThreadStore.getState().activeThreadId || 'default';
                const sessionTrust = settings.trustedSessions[threadId];
                // 只在首次批准时记录
                if (!sessionTrust || Date.now() >= sessionTrust.expiresAt) {
                    const now = Date.now();
                    settings.updateSettings({
                        trustedSessions: {
                            ...settings.trustedSessions,
                            [threadId]: {
                                approvedAt: now,
                                expiresAt: now + 60 * 60 * 1000
                            }
                        }
                    });
                    console.log(`[MessageItem] 🔥 v0.3.4 Session trusted via batch approval: ${threadId}`);
                }
            }
            store.approveAllToolCalls(message.id);
        }
    };
    const handleRejectAll = () => {
        const store = useChatStore.getState() as any;
        if (store.rejectAllToolCalls) {
            store.rejectAllToolCalls(message.id);
        }
    };
    // 🔥 回滚功能 - 检查 result 是否有回滚数据
    // 🔥 必须在 hasRollbackableFiles 之前定义，避免初始化顺序错误
    // 🔥 FIX: 同时支持 Rust 后端的 snake_case (original_content) 和 camelCase (originalContent)
    const hasRollbackData = (result: string | undefined): boolean => {
        if (!result) return false;
        try {
            const data = JSON.parse(result);
            // 检查 snake_case（Rust 后端返回）或 camelCase（向后兼容）
            return data.originalContent !== undefined || data.original_content !== undefined;
        } catch {
            return false;
        }
    };
    // 🔥 回滚功能 - 检查是否有可回滚的文件
    const hasRollbackableFiles = React.useMemo(() => {
        if (!message.toolCalls) return false;
        return message.toolCalls.some(tc =>
            tc.tool === 'agent_write_file' &&
            tc.status === 'completed' &&
            hasRollbackData(tc.result)
        );
    }, [message.toolCalls]);
    // 🔥 撤销所有处理函数
    const handleUndoAll = async () => {
        const store = useChatStore.getState() as any;
        if (!store.rollbackMessageToolCalls) {
            toast.error(t('messageItem.rollbackUnavailable'));
            return;
        }
        try {
            const result = await store.rollbackMessageToolCalls(message.id, false);
            if (result?.hasConflict) {
                toast.error(t('messageItem.rollbackConflict'));
                return;
            }
            if (result?.success) {
                toast.success(t('messageItem.rollbackSuccess', { count: result.count || 0 }));
            } else {
                toast.error(result?.error || t('messageItem.rollbackFailed'));
            }
        } catch (e) {
            console.error('[Rollback] Error:', e);
            toast.error(t('messageItem.rollbackFailedWithError', { error: String(e) }));
        }
    };
    const handleCopy = () => {
        navigator.clipboard.writeText(displayContent);
        toast.success(t('common.copied') || 'Copied to clipboard');
    };
    // Determine bubble style
    const isAgent = !!(message as any).agentId;
    const isInlineTask = !!(message as any).isInlineTask;
    const bubbleClass = isInlineTask
        ? "bg-gray-800/40 border border-white/5 text-white/40 italic py-1.5 px-3 rounded-lg text-[11px]"
        : (isUser ? STYLES.userBubble : (isAgent ? STYLES.agentBubble : STYLES.assistantBubble));

    // PALETTE 驱动的 inline style（compact 和 normal 模式均使用）
    const paletteBubbleStyle = React.useMemo(() => {
        if (isInlineTask) return undefined;
        if (isUser) return getUserBubbleStyle(compact);
        if (isAgent) return getAgentBubbleStyle((message as any).agentId || '', compact);
        return getAssistantBubbleStyle(compact);
    }, [compact, isInlineTask, isUser, isAgent, (message as any).agentId]);
    // 🔥 FIX v0.3.9.3: 更加稳健的内容检测逻辑，支持字符串和数组
    const hasVisibleContent = React.useMemo(() => {
        if (!message.content) return false;
        if (typeof message.content === 'string') {
            return message.content.trim().length > 0;
        }
        if (Array.isArray(message.content)) {
            // 检查数组中是否有任何文本片段非空
            return (message.content as any[]).some(part => 
                (part.type === 'text' && part.text?.trim().length > 0) || 
                part.type === 'image_url'
            );
        }
        return false;
    }, [message.content]);
    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
    
    // 🏆 v0.3.6: 极简模式判定 - 隐藏 Vibe 模式下的冗余引导语
    const isVibeMode = (window as any).__IFAI_EDITOR_MODE__ === 'vibe';
    const isRedundantIntro = React.useMemo(() => {
        if (!isVibeMode || isUser || !hasToolCalls) return false;
        // 🔥 FIX v0.3.5: 有 pending 工具调用时绝不能隐藏气泡（用户需要看到审批按钮）
        if (pendingCount > 0) return false;
        const text = typeof displayContent === 'string' ? displayContent.trim() : '';
        // 🚀 激进模式：只要包含聚合卡片，默认就隐藏助理的普通说明文字，除非包含代码块
        return !text.includes('```');
    }, [isVibeMode, isUser, hasToolCalls, displayContent, pendingCount]);

    // 🏆 v0.4.1: 探索模式判定 (基于是否包含进度/树元数据)
    const isExploreMessage = !!(message as any).exploreProgress;

    // 决定是否隐藏气泡
    // 1. 如果有 pending 的工具调用，必须显示气泡（用户需要批准/拒绝）
    // 2. 如果没有可见内容但有工具调用，且所有工具调用都已完成，隐藏 (交给聚合卡片)
    // 3. 如果是 Vibe 模式下的冗余引导语，隐藏
    // 4. 如果是工具角色的消息且已经是探索结果，隐藏 (数据已同步到助理消息的树 UI)
    // 5. 🏆 如果是工具角色的消息且内容包含项目扫描数据，隐藏原始 JSON (交给 ToolApproval 渲染)
    const hasProjectScanData = message.role === 'tool' && message.content && typeof message.content === 'string' && message.content.includes('structure');
    const shouldHideBubble = (pendingCount === 0 && !isUser && !hasVisibleContent && hasToolCalls) ||
                            isRedundantIntro ||
                            (message.role === 'tool' && isExploreMessage) ||
                            (message.role === 'tool' && hasProjectScanData);
    // 🔥 FIX v0.3.5: 有 pending 工具调用时强制显示气泡（审批按钮不能被隐藏）
    const effectiveShouldHideBubble = pendingCount > 0 ? false : shouldHideBubble;

    // 🔥 FIX v0.4.0: 智能内容预处理 - 提取思考内容
    const { thinkingText, contentWithoutThinking } = React.useMemo(() => {
        // 🏆 PIVO 3.0: 物理级防护，防止多模态对象直接进入渲染流
        const content = typeof message.content === 'string' ? message.content : (Array.isArray(message.content) ? (message.content as any).map((p: any) => p.type === 'text' ? p.text : '').join('') : '');
        const thinkingMatch = String(content || '').match(/^_\(([^)]+)\)_/);
        if (thinkingMatch) {
            return {
                thinkingText: String(thinkingMatch[1]),
                contentWithoutThinking: String(content).replace(/^_\([^)]+\)_\s*/, '')
            };
        }
        return { thinkingText: null, contentWithoutThinking: String(content || '') };
    }, [message.content]);

    // 🏆 新增：优先使用 message.segments (新逻辑)
    const segmentsFromStore = React.useMemo(() => {
        // @ts-ignore
        if (message.segments && message.segments.length > 0) {
            // @ts-ignore
            return message.segments.map(s => ({
                ...s,
                // 确保有 phase 字段（兼容旧数据）
                phase: s.phase || 'pre-tool'
            }));
        }
        return null;
    }, [message.segments]);

    // Parse segments from string content (for non-multi-modal or fallback)
    const stringSegments = React.useMemo(() => {
        // Use contentWithoutThinking instead of raw displayContent
        const { segments } = parseToolCalls(contentWithoutThinking);
        return segments;
    }, [contentWithoutThinking]);

    // PERFORMANCE: Cache sorted contentSegments to avoid O(n log n) sort on every render
    const sortedSegments = React.useMemo(() => {
        // 🏆 新增：优先使用 segmentsFromStore
        if (segmentsFromStore && segmentsFromStore.length > 0) {
            return [...segmentsFromStore].sort((a: any, b: any) => a.order - b.order);
        }

        // Fallback: 使用旧的 contentSegments
        // @ts-ignore
        if (!message.contentSegments || message.contentSegments.length === 0) {
            return null;
        }
        // @ts-ignore
        return [...message.contentSegments].sort((a: ContentSegment, b: ContentSegment) => a.order - b.order);
    }, [segmentsFromStore, message.contentSegments]);

    // 🔥 FIX v0.4.0: 工业级骨架屏占位，防止 CLS (布局抖动)
    const renderSkeleton = () => (
        <div className="space-y-3 py-2 animate-pulse w-full max-w-[280px]">
            <div className="h-2.5 bg-blue-500/10 rounded-full w-full opacity-60"></div>
            <div className="h-2.5 bg-blue-500/10 rounded-full w-[90%] opacity-40"></div>
            <div className="h-2.5 bg-blue-500/10 rounded-full w-[70%] opacity-20"></div>
        </div>
    );

    // ⚡️ FIX: 全局排序渲染中枢 - 确保文字与工具调用严格按接收顺序排列
    // 🏆 更新：优先使用 segmentsFromStore，保留 fallback 逻辑
    const mergedSegments = React.useMemo(() => {
        // A. 🏆 新增：优先使用 segmentsFromStore (新逻辑)
        if (segmentsFromStore && segmentsFromStore.length > 0) {
            return segmentsFromStore.filter(seg => {
                // 基础验证
                if (!seg || typeof seg !== 'object' || !seg.type) {
                    console.warn('[MessageItem] Filtering out invalid segment:', seg);
                    return false;
                }

                // 过滤思考文本
                if (seg.type === 'text' && seg.content) {
                    if (thinkingText && seg.content.includes(thinkingText)) {
                        return false;
                    }
                    if (seg.content.trim().startsWith('_(') && seg.content.trim().endsWith(')_')) {
                        return false;
                    }

                    // 探索模式过滤
                    if (isExploreMessage) {
                        const text = seg.content;
                        const isRedundant = text.includes(t('messageItem.exploreProject')) ||
                                          text.includes(t('messageItem.analyzeProject')) ||
                                          text.includes('[Local Model] Completed');
                        if (isRedundant) return false;
                    }
                }

                // 探索模式隐藏工具
                if (isExploreMessage && seg.type === 'tool') {
                    return false;
                }

                return true;
            });
        }

        // B. Fallback: 使用旧的逻辑（向后兼容）
        console.log('[MessageItem] ⚠️ Fallback to legacy segment parsing');

        // @ts-ignore
        let items: any[] = message.contentSegments ? [...message.contentSegments] : [];

        // 🔥 FIX: 验证初始 segments，过滤掉空对象
        items = items.filter(seg => seg && typeof seg === 'object' && seg.type);

        // 如果没有显式段落，根据当前内容解析
        if (items.length === 0 && contentWithoutThinking) {
            const { segments } = parseToolCalls(contentWithoutThinking);
            items = segments.map((s, idx) => ({
                ...s,
                order: idx,
                timestamp: Date.now() - (segments.length - idx) * 10
            })).filter(seg => seg && typeof seg === 'object' && seg.type);
        }

        // 过滤和排序逻辑（保持不变）
        const filteredItems = items.filter(seg => {
            if (!seg || typeof seg !== 'object' || !seg.type) {
                console.warn('[MessageItem] Filtering out invalid segment:', seg);
                return false;
            }

            if (seg.type === 'text' && seg.content) {
                if (thinkingText && (thinkingText.includes(seg.content) || seg.content.includes(thinkingText))) {
                    return false;
                }
                if (seg.content.trim().startsWith('_(') && seg.content.trim().endsWith(')_')) {
                    return false;
                }

                if (isExploreMessage) {
                    const text = seg.content;
                    const isRedundant = text.includes(t('messageItem.exploreProject')) ||
                                      text.includes(t('messageItem.analyzeProject')) ||
                                      text.includes('[Local Model] Completed') ||
                                      text.includes('[OK] agent_list_dir');
                    if (isRedundant) return false;
                }
            }

            if (isExploreMessage && seg.type === 'tool') {
                return false;
            }
            return true;
        });

        // 集成未被追踪的工具调用
        const trackedIds = new Set(filteredItems.filter(s => s.type === 'tool').map(s => s.toolCallId));
        const untrackedToolCalls = message.toolCalls?.filter(tc => !trackedIds.has(tc.id)) || [];

        const untrackedSegments = isExploreMessage ? [] : untrackedToolCalls.map(tc => ({
            type: 'tool' as const,
            order: 999,
            timestamp: (tc as any).timestamp || Date.now(),
            toolCallId: tc.id
        }));

        // 统一排序
        const sorted = [...filteredItems, ...untrackedSegments].sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined && a.order < 999 && b.order < 999) {
                if (a.order !== b.order) return a.order - b.order;
            }
            
            // 2. 物理兜底：基于时间戳排序 (确保新产生的段落总是在后面)
            const timeA = a.timestamp || 0;
            const timeB = b.timestamp || 0;
            if (timeA !== timeB) return timeA - timeB;

            // 3. 终极兜底：工具优先原则 (如果时间戳完全一致)
            if (a.type !== b.type) {
                return a.type === 'tool' ? -1 : 1;
            }
            
            return 0;
        });

        // F. 归并相邻文本片段
        const mergedTextResult: ContentSegment[] = [];
        for (const seg of sorted) {
            // 🔥 FIX: 验证 segment 结构，跳过空对象或无效的 segment
            if (!seg || typeof seg !== 'object' || !seg.type) {
                console.warn('[MessageItem] Skipping invalid segment:', seg);
                continue;
            }

            if (seg.type === 'text') {
                // 🔥 FIX: 确保 content 是有效的字符串
                const contentValue = seg.content;
                if (contentValue !== undefined && contentValue !== null && typeof contentValue !== 'string') {
                    console.warn('[MessageItem] Text segment has non-string content, skipping:', contentValue);
                    continue;
                }

                const last = mergedTextResult[mergedTextResult.length - 1];
                const contentStr = String(contentValue || '');

                // 🔥 FIX: 如果合并后的内容为空，跳过此 segment
                if (!contentStr.trim()) {
                    continue;
                }

                if (last && last.type === 'text') {
                    // 🏆 PIVO 3.0: 物理级 String 强制转换保护
                    last.content = last.content + contentStr;
                    last.timestamp = seg.timestamp;
                } else {
                    mergedTextResult.push({ ...seg, content: contentStr });
                }
            } else {
                mergedTextResult.push(seg);
            }
        }

        // G. 🚀 v0.3.6: 批处理聚合 (Batch Consolidation)
        // 扫描已排序和归并后的段落，将属于同一个 batchId 的工具调用聚合
        const finalSegments: any[] = [];
        const seenBatches = new Set<string>();

        for (const segment of mergedTextResult) {
            if (segment.type === 'tool' && segment.toolCallId) {
                const toolCall = message.toolCalls?.find(tc => tc.id === segment.toolCallId);
                const batchId = (toolCall as any)?.batchId;
                const currentEditorMode = (window as any).__IFAI_EDITOR_MODE__ || 'vibe';
                const lowerToolName = (toolCall?.tool || "").toLowerCase();
                const isAggregatableName = lowerToolName.includes('list') || 
                                         lowerToolName.includes('dir') || 
                                         lowerToolName.includes('search') ||
                                         lowerToolName.includes('read');

                if (batchId) {
                    if (seenBatches.has(batchId)) {
                        // 属于已处理过的批次，跳过此段落
                        continue;
                    }
                    seenBatches.add(batchId);
                    // 标记这是一个批次锚点
                    finalSegments.push({
                        ...segment,
                        isBatchAnchor: true,
                        batchId
                    });
                } else if (currentEditorMode === 'vibe' && isAggregatableName) {
                    // 🏆 物理兜底：即便没有 batchId，在 Vibe 模式下也将单个 List/Dir 强制聚合为树形外观
                    finalSegments.push({
                        ...segment,
                        isBatchAnchor: true,
                        batchId: `standalone_${toolCall?.id}`
                    });
                } else {
                    finalSegments.push(segment);
                }
            } else {
                finalSegments.push(segment);
            }
        }

        return finalSegments;
    }, [segmentsFromStore, message.contentSegments, contentWithoutThinking, message.toolCalls, effectivelyStreaming, thinkingText]);

    let toolCallIndex = 0;
    // Helper to render Markdown WITHOUT syntax highlighting (for streaming mode)
    // 使用统一的 SimpleMarkdownRenderer（无语法高亮，性能优化）
    const renderMarkdownWithoutHighlight = useCallback((text: string, key: any) => {
        // Process scan result i18n before rendering
        const processedText = processScanResult(text);
        return <SimpleMarkdownRenderer key={key} content={processedText} />;
    }, [processScanResult]);
    // 使用统一的 MarkdownRenderer（带语法高亮和代码折叠）
    // 🔥 FIX: 始终使用 TypewriterText 包裹，避免 isStreaming 闪烁时组件卸载/重新挂载导致文本重复
    const renderContentPart = useCallback((part: ContentPart, index: number, isStreaming: boolean) => {
        if (part.type === 'text' && part.text) {
            // Process scan result i18n before rendering
            const processedText = processScanResult(part.text);
            return (
                <TypewriterText
                    key={index}
                    content={processedText}
                    isStreaming={isStreaming}
                >
                    {(text) => (
                        <MarkdownRenderer
                            content={text}
                            isStreaming={isStreaming}
                            maxLinesBeforeCollapse={50}
                            isExpanded={expandedBlocksRef.current.has(index)}
                            onToggleExpand={() => toggleBlock(index)}
                            index={index}
                        />
                    )}
                </TypewriterText>
            );
        } else if (part.type === 'image_url' && part.image_url?.url) {
            return (
                <div key={index} className="my-2 max-w-xs border border-gray-600 rounded overflow-hidden">
                    <img src={part.image_url.url} alt="AI generated image" className="w-full h-auto" />
                </div>
            );
        }
        return null;
    }, [toggleBlock, processScanResult]);

    // Phase D: 预计算 MessageCard — 通过 MessageAdapterRegistry 适配真实消息
    // 移除 cardType? 守卫后，resolveCardType 的智能推断（toolCalls → tool-call 等）对所有消息生效
    const adaptedCard = adaptMessageToCard(message);
    const resolvedCardType = adaptedCard ? resolveCardType(adaptedCard as any) : null;
    const ResolvedCard = resolvedCardType ? MessageCardRegistry.get(resolvedCardType) : null;
    const cardMessage = adaptedCard ? { ...message, ...adaptedCard } : message;

    // 统一渲染逻辑 (v0.4.1: 去分支化重构，杜绝 Hook 冲突)
    return (
        <div
            className={`${styles.messageContainer} ${isUser ? styles.user : styles.assistant} group`}
            data-testid={`message-${message.id}`}
            data-role={message.role} // 🔥 FIX: 添加 role 属性用于 E2E 测试
        >
            <div
                className={`flex items-start gap-3 w-full ${!effectiveShouldHideBubble ? styles.bubble + ' ' + (isUser ? styles.user : styles.assistant) + ' ' + styles.industrial : ''}`}
                style={paletteBubbleStyle}
            >
                {/* A. 头像区 - 始终显示 */}
                <div className="shrink-0 mt-0.5">
                    {isUser ? (
                        <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center shadow-lg text-white">
                            <User size={12} />
                        </div>
                    ) : isAgent ? (
                        <div style={getAgentAvatarStyle((message as any).agentId || '')}>
                            {getAgent((message as any).agentId)?.abbr ?? '?'}
                        </div>
                    ) : (
                        <div className="w-5 h-5 rounded-md overflow-hidden border border-white/5 bg-black/40 flex items-center justify-center">
                            <img src={ifaiLogo} alt="AI" className="w-3.5 h-3.5 opacity-80" />
                        </div>
                    )}
                </div>

                {/* B. 内容区 - 统一布局 */}
                <div className="flex-1 min-w-0 text-inherit relative">
                    {/* B1. 悬浮工具栏 (仅在非用户气泡模式下显示) */}
                    {!isUser && !effectiveShouldHideBubble && (
                        <div className="absolute -top-10 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#2d2d2d] border border-white/10 rounded-md p-1 shadow-xl z-10">
                            <button onClick={handleCopy} className="p-1 hover:bg-white/5 rounded text-gray-400" title="Copy">
                                <Copy size={12} />
                            </button>
                            <button className="p-1 hover:bg-white/5 rounded text-gray-400" title="Regenerate">
                                <RotateCcw size={12} />
                            </button>
                        </div>
                    )}

                    {/* B2. 状态标签 */}
                    {isAgent && (
                        <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                Agent Live
                            </span>
                        </div>
                    )}

                    {/* B3. 智能思考折叠区 (Thinking Accordion) */}
                    {thinkingText && (
                        <div className="mb-3">
                            <button 
                                onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                                className="flex items-center gap-2 text-[10px] font-bold text-gray-500 hover:text-blue-400 transition-colors uppercase tracking-widest group/think"
                            >
                                <div className={`transition-transform duration-200 ${isThinkingExpanded ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={10} />
                                </div>
                                <span>Thinking: {thinkingText.substring(0, 30)}{thinkingText.length > 30 ? '...' : ''}</span>
                                {effectivelyStreaming && !isThinkingExpanded && (
                                    <div className="w-1 h-1 bg-blue-500 rounded-full animate-ping" />
                                )}
                            </button>
                            {isThinkingExpanded && (
                                <div className="mt-2 p-3 bg-white/[0.03] border border-white/5 rounded-lg text-xs text-gray-400 leading-relaxed italic animate-in fade-in slide-in-from-top-1 duration-200">
                                    {thinkingText}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Phase D: MessageCard — ApprovalCard 仅作信息面板（按钮在 ToolApproval 内联） */}
                    {ResolvedCard && (
                        <ResolvedCard
                            message={cardMessage}
                            onAction={(action, data) => {
                                console.log('[MessageItem] Card action:', action, data);
                                if (action === 'approve') {
                                    const toolId = data?.toolId;
                                    if (toolId) {
                                        // 直接调 store，绕过 props 链（useCallback / React.memo / 虚拟滚动）
                                        useChatStore.getState().approveToolCall(message.id, toolId);
                                    } else {
                                        handleApproveAll();
                                    }
                                } else if (action === 'reject') {
                                    const toolId = data?.toolId;
                                    if (toolId) {
                                        useChatStore.getState().rejectToolCall(message.id, toolId);
                                    } else {
                                        handleRejectAll();
                                    }
                                } else if (action === 'openComposer') {
                                    onOpenComposer?.(message.id);
                                } else if (action === 'confirm') {
                                    const questionAnswers = data?.questionAnswers || [];
                                    const cardAction = data?.action;
                                    const feedbackRequestId = (message as any)?.metadata?.feedbackRequestId;
                                    if (feedbackRequestId) {
                                        chatEventBus.emit('workflow:feedback', {
                                            workflowId: (message as any)?.metadata?.workflowId,
                                            feedbackRequestId,
                                            questionAnswers,
                                            action: cardAction,
                                        });
                                    } else {
                                        console.warn('[MessageItem] ⚠️ confirm action: no feedbackRequestId found');
                                    }
                                }
                            }}
                            compact={!isUser}
                        />
                    )}

                    <div className="space-y-3">

                        {/* 如果内容为空且正在流式传输，显示骨架屏（仅无卡片时） */}
                        {!ResolvedCard && effectivelyStreaming && !contentWithoutThinking && !hasToolCalls && renderSkeleton()}

                        {/* v0.3.7 新增：PIVO 极简任务列表 (随行渲染模式) */}
                        {isPivoEscort && pivoTasks && pivoTasks.length > 0 && (
                            <div className="mb-4">
                                <PivoTreeList tasks={pivoTasks} />
                            </div>
                        )}

                        {/* 🔥 FIX v0.4.1: 将任务总结 (TaskSummary) 提升到最上方 (Cursor-like Experience) */}
                        {!effectivelyStreaming && message.toolCalls && message.toolCalls.length > 0 && (
                            <div className="mb-4">
                                <TaskSummary message={message} />
                            </div>
                        )}

                        {/* Batch Review Panel 已移除，审批由 ToolApproval 内联处理 */}

                        {/* 主要内容流 (Interleaved Text and Tools) */}
                        {taskBreakdown ? (
                            <TaskBreakdownViewer breakdown={taskBreakdown} mode="inline" allowModeSwitch={true} />
                        ) : isStreamingTaskBreakdown ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                    <span>{t('messageItem.breakingDownTask')}</span>
                                </div>
                                <div className="text-xs text-gray-500 font-mono max-h-32 overflow-y-auto bg-[#1e1e1e] rounded border border-gray-700 p-2">
                                    {displayContent.slice(-500)}
                                </div>
                            </div>
                        ) : message.multiModalContent && message.multiModalContent.length > 0 ? (() => {
                            // 🔥 FIX: 同 mergedSegments 路径，只对最后一个 text part 传递 isStreaming
                            const lastTextPartIdx = (() => {
                                for (let i = message.multiModalContent.length - 1; i >= 0; i--) {
                                    if (message.multiModalContent[i].type === 'text') return i;
                                }
                                return -1;
                            })();
                            return (
                            <div className="space-y-2">
                                {message.multiModalContent.map((part, index) => {
                                    // 🔥 FIX: 跳过无效的 part 对象
                                    if (!part || typeof part !== 'object') {
                                        console.warn('[MessageItem] Skipping invalid multiModal part:', part);
                                        return null;
                                    }

                                    // 🏆 PIVO 3.0: 物理级防护，防止多模态对象直接进入渲染流
                                    if (part.type === 'text') {
                                        // 🔥 FIX: 确保 text 是字符串，如果是对象则跳过
                                        const textContent = part.text;
                                        if (typeof textContent !== 'string') {
                                            console.warn('[MessageItem] Text part has non-string content:', textContent);
                                            return null;
                                        }
                                        return renderContentPart({ ...part, text: String(part.text || '') }, index, index === lastTextPartIdx ? effectivelyStreaming : false);
                                    }

                                    // 🔥 FIX: 确保 image_url 对象有效
                                    if (part.type === 'image_url') {
                                        if (!part.image_url || !part.image_url.url) {
                                            console.warn('[MessageItem] Image part missing url:', part);
                                            return null;
                                        }
                                    }

                                    return renderContentPart(part, index, index === lastTextPartIdx ? effectivelyStreaming : false);
                                })}
                            </div>
                            );
                        })() : mergedSegments && mergedSegments.length > 0 ? (() => {
                            // 🔥 FIX: 只对最后一个 text segment 传递 isStreaming=true
                            // 根因：continuation 场景下，消息中有多个 text segment（pre-tool + post-tool），
                            // 如果对所有 text segment 都传 effectivelyStreaming=true，
                            // 每个 MarkdownRenderer 都会显示"生成中..."脉冲，造成视觉干扰
                            const lastTextSegIdx = (() => {
                                for (let i = mergedSegments.length - 1; i >= 0; i--) {
                                    if (mergedSegments[i].type === 'text') return i;
                                }
                                return -1;
                            })();
                            return (
                            <div className="space-y-3">
                                {mergedSegments.map((segment: any, index: number) => {
                                    // 🔥 FIX: 验证 segment 对象有效性
                                    if (!segment || typeof segment !== 'object') {
                                        console.warn('[MessageItem] Skipping invalid segment in render:', segment);
                                        return null;
                                    }

                                    if (segment.type === 'text') {
                                        // 🏆 PIVO 3.0: 物理级 String 强制转换保护
                                        const rawContent = segment.content;

                                        // 🔥 FIX: 如果 content 不是字符串、null 或 undefined，跳过
                                        if (rawContent !== undefined && rawContent !== null && typeof rawContent !== 'string') {
                                            console.warn('[MessageItem] Text segment has non-string content:', rawContent);
                                            return null;
                                        }

                                        const content = String(rawContent || '');

                                        // 🔥 FIX: 检查是否是被错误转换的对象字符串
                                        if (content === '[object Object]' || content === '[object]' || content.startsWith('[object ')) {
                                            console.warn('[MessageItem] Text segment content looks like object string:', content);
                                            return null;
                                        }

                                        // 🏆 PIVO 3.0: 拒绝非字符串对象
                                        if (!content || !content.trim()) {
                                            return null;
                                        }

                                        // 🏆 新增：添加 phase 和 test 属性用于调试和 E2E 测试
                                        const segmentPhase = segment.phase || 'pre-tool';
                                        const stableKey = segment.order ?? segment.timestamp ?? index;
                                        const renderedContent = renderContentPart({ type: 'text', text: content }, stableKey, index === lastTextSegIdx ? effectivelyStreaming : false);

                                        return (
                                            <div
                                                key={`text-seg-${stableKey}`}
                                                data-phase={segmentPhase}
                                                data-test={`segment-${index}`}
                                                data-type="text"
                                                data-order={segment.order}
                                            >
                                                {renderedContent}
                                            </div>
                                        );
                                    } else if (segment.type === 'tool' && segment.toolCallId) {
                                        // 🚀 v0.3.6: 批处理聚合渲染 (单例聚合版)
                                        if (segment.isBatchAnchor && segment.batchId) {
                                            // 🏆 核心逻辑：检查这是否是当前会话中"最后一条"包含该批次的消息
                                            const allMessages = (window as any).__chatStore?.getState().messages || [];
                                            const lastMsgWithThisBatch = [...allMessages].reverse().find(m =>
                                                m.role === 'assistant' &&
                                                m.toolCalls?.some(tc => (tc as any).batchId === segment.batchId)
                                            );

                                            // 如果当前消息不是最后一条包含该批次的消息，物理隐藏它，交给最后一条消息去渲染全量聚合
                                            if (lastMsgWithThisBatch && lastMsgWithThisBatch.id !== message.id) {
                                                return null;
                                            }

                                            const isStandalone = segment.batchId.startsWith('standalone_');
                                            const standaloneId = isStandalone ? segment.batchId.replace('standalone_', '') : null;

                                            // 获取全量聚合数据（跨消息提取）
                                            const batchCalls = isStandalone
                                                ? (message.toolCalls?.filter(tc => tc.id === standaloneId) || [])
                                                : allMessages.flatMap(m =>
                                                    (m.toolCalls || []).filter(tc => (tc as any).batchId === segment.batchId)
                                                  );

                                            if (batchCalls.length === 0) return null;

                                            return (
                                                <ToolBatchApproval
                                                    key={segment.batchId}
                                                    batchId={segment.batchId}
                                                    toolCalls={batchCalls}
                                                    onApprove={(id) => onApprove(message.id, id)}
                                                    onReject={(id) => onReject(message.id, id)}
                                                    message={message}
                                                />
                                            );
                                        }

                                        const toolCall = message.toolCalls?.find(tc => tc.id === segment.toolCallId);
                                        if (!toolCall) {
                                            console.warn('[MessageItem] ⚠️ Tool segment has no matching toolCall', {
                                                segmentToolCallId: segment.toolCallId,
                                                segmentToolName: segment.toolName,
                                                availableToolCallIds: message.toolCalls?.map(tc => tc.id),
                                                toolCallsCount: message.toolCalls?.length
                                            });
                                            return null;
                                        }

                                        // 声明式过滤：黑名单工具由专用卡片接管，不渲染 ToolApproval
                                        if (TOOL_RENDER_BLACKLIST.has(toolCall.tool)) return null;

                                        // 🏆 新增：添加 phase 和 test 属性用于调试和 E2E 测试
                                        const segmentPhase = segment.phase || 'in-tool';
                                        const toolComponent = (
                                            <ToolApproval
                                                key={toolCall.id} toolCall={toolCall}
                                                onApprove={() => onApprove(message.id, toolCall.id)} onReject={() => onReject(message.id, toolCall.id)}
                                                isLatestBashTool={isLatestBashTool(toolCall.id)} message={message}
                                            />
                                        );

                                        return (
                                            <div
                                                key={`tool-seg-${segment.toolCallId || index}`}
                                                data-phase={segmentPhase}
                                                data-test={`segment-${index}`}
                                                data-type="tool"
                                                data-order={segment.order}
                                                data-tool-call-id={toolCall.id}
                                            >
                                                {toolComponent}
                                            </div>
                                        );
                                    }
                                    return null;
                                })}

                                {/* 🔥 FIX: 补偿渲染 — 当 segments 中缺少 tool segment 但 message.toolCalls 有 pending 工具时
                                    *  场景：AI 先输出文本（创建 text segment），然后调用工具，但 tool segment 未及时创建或被过滤
                                    *  此时 mergedSegments 非空（有 text），不会走 fallback 路径，ToolApproval 不渲染
                                    *  刷新后 segments 可能被重建，所以能显示 — 这解释了"刷新后才出现"的现象
                                    */}
                                {(() => {
                                    if (!message.toolCalls || message.toolCalls.length === 0) return null;

                                    // 收集 segments 中已有的 toolCallId
                                    const renderedToolIds = new Set(
                                        mergedSegments
                                            .filter((s: any) => s.type === 'tool' && s.toolCallId)
                                            .map((s: any) => s.toolCallId)
                                    );

                                    // 找出 segments 中没有对应 tool segment 的 pending toolCalls
                                    const orphanedPendingCalls = message.toolCalls.filter((tc: any) =>
                                        tc.status === 'pending' && !renderedToolIds.has(tc.id) && !tc.isPartial
                                        && !TOOL_RENDER_BLACKLIST.has(tc.tool)
                                    );

                                    if (orphanedPendingCalls.length === 0) return null;

                                    console.log(`[MessageItem] 🔧 Compensating ${orphanedPendingCalls.length} orphaned pending toolCalls not in segments`, {
                                        orphanedIds: orphanedPendingCalls.map((tc: any) => tc.id)
                                    });

                                    return orphanedPendingCalls.map((toolCall: any) => (
                                        <ToolApproval
                                            key={`orphan-${toolCall.id}`}
                                            toolCall={toolCall}
                                            onApprove={() => onApprove(message.id, toolCall.id)}
                                            onReject={() => onReject(message.id, toolCall.id)}
                                            isLatestBashTool={isLatestBashTool(toolCall.id)}
                                            message={message}
                                        />
                                    ));
                                })()}
                            </div>
                            );
                        })() : (
                            /* 🔥 FIX: Fallback 渲染也必须遵循 Action-First 逻辑并支持聚合 */
                            <div className="space-y-3">
                                {(() => {
                                    if (!message.toolCalls) return null;

                                    // 🔥 FIX: 验证 toolCalls 数组，过滤掉无效对象
                                    const validToolCalls = message.toolCalls.filter(tc => {
                                        if (!tc || typeof tc !== 'object') {
                                            console.warn('[MessageItem] Filtering out invalid toolCall:', tc);
                                            return false;
                                        }
                                        if (!tc.id) {
                                            console.warn('[MessageItem] ToolCall missing id:', tc);
                                            return false;
                                        }
                                        if (TOOL_RENDER_BLACKLIST.has(tc.tool)) return false;
                                        return true;
                                    });

                                    if (validToolCalls.length === 0) return null;

                                    const renderedBatches = new Set<string>();
                                    return validToolCalls.map(toolCall => {
                                        const batchId = (toolCall as any).batchId;

                                        if (batchId) {
                                            if (renderedBatches.has(batchId)) return null;
                                            renderedBatches.add(batchId);

                                            const batchCalls = validToolCalls.filter(tc => (tc as any).batchId === batchId) || [];
                                            return (
                                                <ToolBatchApproval
                                                    key={batchId}
                                                    batchId={batchId}
                                                    toolCalls={batchCalls}
                                                    onApprove={(id) => onApprove(message.id, id)}
                                                    onReject={(id) => onReject(message.id, id)}
                                                    message={message}
                                                />
                                            );
                                        }

                                        return (
                                            <ToolApproval
                                                key={toolCall.id} toolCall={toolCall}
                                                onApprove={() => onApprove(message.id, toolCall.id)} onReject={() => onReject(message.id, toolCall.id)}
                                                isLatestBashTool={isLatestBashTool(toolCall.id)} message={message}
                                            />
                                        );
                                    });
                                })()}
                                {/* 放置总结文字 */}
                                {!effectivelyStreaming && contentWithoutThinking && renderContentPart({ type: 'text', text: contentWithoutThinking }, 0, false)}
                            </div>
                        )}

                        {/* WorkflowData 工作流进度可视化（TUI 格式，优先于旧的 exploreProgress） */}
                        {(() => {
                            // 🔥 HIFI FIX: AgentWorkspaceCard/ExploreCard 已通过适配器渲染，
                            // 跳过遗留 WorkflowView/ExploreProgressNew 避免重复。
                            if (resolvedCardType === 'agent_workspace' || resolvedCardType === 'explore') return null;

                            const metadata = (message as any).metadata || {};
                            const workflowData = metadata.workflowData;
                            // doc 类型使用 DAG Monitor，不在消息内重复展示 WorkflowView
                            if (workflowData) {
                                if (metadata.workflowType === 'doc') return null;
                                return (
                                    <div className="my-2">
                                        <WorkflowView workflowData={workflowData} />
                                    </div>
                                );
                            }
                            // 向后兼容：旧消息只有 phaseData（无 workflowData）
                            if (metadata.phaseData) {
                                const phaseData = metadata.phaseData as PhaseData[];
                                return (
                                    <div className="my-2">
                                        <WorkflowView
                                            workflowData={{
                                                workflowId: metadata.workflowId || 'legacy',
                                                intent: phaseData[0]?.intent || '',
                                                nodes: phaseData.map(p => ({
                                                    nodeId: p.nodeId,
                                                    agentType: p.intent || 'Agent' as const,
                                                    intent: p.intent,
                                                    status: p.status,
                                                    tools: (p.sub || []).map(s => ({
                                                        toolName: s.name,
                                                        status: s.status,
                                                        elapsedSecs: 0,
                                                    })),
                                                    elapsedSecs: 0,
                                                    totalTokens: 0,
                                                })),
                                                totalElapsedSecs: 0,
                                                totalTokens: 0,
                                                totalTools: phaseData.reduce((sum, p) => sum + (p.sub?.length || 0), 0),
                                                status: phaseData.some(p => p.status === 'running') ? 'running' as const : 'done' as const,
                                            }}
                                        />
                                    </div>
                                );
                            }
                            // 旧版 exploreProgress 回退
                            if ((message as any).exploreProgress) {
                                const exploreProgress = (message as any).exploreProgress;
                                return (
                            <div className="space-y-2 my-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                {/* 🏆 v0.4.1: 当探索完成时，物理渲染 PivoProjectTree 项目树 */}
                                {(message as any).exploreProgress.phase === 'completed' && (message as any).exploreProgress.scannedFiles && (
                                    <PivoProjectTree
                                        structure={filesToStructure((message as any).exploreProgress.scannedFiles)}
                                        keyFiles={{}} // 以后可以集成关键文件识别
                                    />
                                )}
                                <ExploreProgressNew progress={(message as any).exploreProgress} mode="minimal" />
                            </div>
                                );
                            }
                            return null;
                        })()}

                        {/* Task Completion Banner */}
                        {!effectivelyStreaming && (
                            <div className="min-h-[24px]">
                                <TaskCompletionBanner 
                                    message={message} 
                                    onOpenFile={onOpenFile} 
                                    onCopyContent={(content) => { 
                                        navigator.clipboard.writeText(content); 
                                        toast.success(t('messageItem.contentCopied')); 
                                    }} 
                                />
                            </div>
                        )}

                        {/* Composer Diff Button */}
                        {hasFileChanges && onOpenComposer && !effectivelyStreaming && (
                            <div className="mt-3">
                                <button onClick={() => onOpenComposer(message.id)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                                    <FileCode size={16} />
                                    <span>{t('messageItem.viewDiff', { count: (message.toolCalls || []).filter(tc => tc && ((tc as any).tool === 'agent_write_file')).length })}</span>
                                </button>
                            </div>
                        )}

                        {/* Patch Actions */}
                        {(message as any).actions && Array.isArray((message as any).actions) && (message as any).actions.length > 0 && !effectivelyStreaming && (
                            <div className="mt-3 space-y-2">
                                {(message as any).actions.map((action: any, actionIndex: number) => {
                                    if (action.type === 'patch') {
                                        const isIgnored = ignoredActions.has(actionIndex);
                                        return (
                                            <div key={`action-${actionIndex}`} className={`p-3 rounded border ${isIgnored ? 'bg-gray-900/20 border-gray-700/50' : 'bg-green-900/20 border-green-700/50'}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <FileCode size={14} className={isIgnored ? 'text-gray-400' : 'text-green-400'} />
                                                            <span className="text-xs font-medium truncate">{action.filePath || 'Apply Fix'}</span>
                                                        </div>
                                                        {!isIgnored && action.patch && (
                                                            <div className="text-xs text-gray-400 font-mono max-h-20 overflow-y-auto bg-[#1e1e1e] rounded p-2">
                                                                {action.patch.substring(0, 200)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {!isIgnored && (
                                                        <div className="flex gap-2">
                                                            <button onClick={() => { setIgnoredActions(prev => new Set(prev).add(actionIndex)); toast.info('Fix ignored'); }} className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium rounded">Ignore</button>
                                                            <button onClick={() => toast.success('Fix applied')} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded">Apply Fix</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}, arePropsEqual)
