import React, { useState, useCallback, useRef } from 'react';
import { User, FileCode, CheckCheck, XCircle, ChevronDown, ChevronUp, Copy, RotateCcw, MoreHorizontal, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, ContentPart, useChatStore, ContentSegment } from '../../stores/useChatStore'; 
import { ToolApproval } from './ToolApproval';
import { ExploreProgress } from './ExploreProgress';
import { ExploreProgress as ExploreProgressNew } from './ExploreProgressNew';
import { useTranslation } from 'react-i18next';
import { parseToolCalls } from 'ifainew-core';
import ifaiLogo from '../../../imgs/ifai.png';
import { TaskBreakdownViewer } from '../TaskBreakdown/TaskBreakdownViewer';
import { TaskBreakdown } from '../../types/taskBreakdown';
import { toast } from 'sonner';

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
    isStreaming?: boolean;
}

// Custom comparison function for React.memo
// Optimized to avoid unnecessary re-renders during streaming
const arePropsEqual = (prevProps: MessageItemProps, nextProps: MessageItemProps) => {
    // Only re-render if isStreaming changes AND this message is the one being streamed
    // This prevents all messages from re-rendering when a new message starts streaming
    if (prevProps.isStreaming !== nextProps.isStreaming) {
        // Only the assistant message that is actually streaming needs to re-render
        const isCurrentlyStreaming = nextProps.isStreaming && nextProps.message.role === 'assistant';
        const wasStreaming = prevProps.isStreaming && prevProps.message.role === 'assistant';

        // If this specific message's streaming status changed, re-render
        if (isCurrentlyStreaming !== wasStreaming) {
            return false;
        }
    }

    // Re-render if message content changes (only for this message)
    if (prevProps.message.content !== nextProps.message.content) {
        return false;
    }

    // Re-render if toolCalls change
    if (prevProps.message.toolCalls !== nextProps.message.toolCalls) {
        return false;
    }

    // Re-render if message ID changes (edge case)
    if (prevProps.message.id !== nextProps.message.id) {
        return false;
    }

    // Otherwise skip re-render
    return true;
};

export const MessageItem = React.memo(({ message, onApprove, onReject, onOpenFile, isStreaming }: MessageItemProps) => {
    const { t } = useTranslation();
    const isUser = message.role === 'user';

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
    const [isActivelyStreaming, setIsActivelyStreaming] = useState(false);
    // Component-level timeout to avoid global variable collision between multiple MessageItem instances
    const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Convert content to string for display
    // Handle both string and ContentPart[] types
    const displayContent = React.useMemo(() => {
      const content = message.content;
      // If content is an array (ContentPart[]), convert to string
      if (Array.isArray(content)) {
        return content.map(part => part.type === 'text' ? part.text : '[image]').join('');
      }
      // If content is already a string, use as-is
      return content || '';
    }, [message.content]);

    // v0.2.6: 检测任务拆解内容
    const taskBreakdown = React.useMemo(() => {
      // 仅在非流式状态时检测（流式中的 JSON 不完整）
      if (isActivelyStreaming || isStreaming) return null;
      return detectTaskBreakdown(displayContent);
    }, [displayContent, isActivelyStreaming, isStreaming]);

    // v0.2.6: 检测是否正在流式传输任务拆解内容
    const isStreamingTaskBreakdown = React.useMemo(() => {
      if (!isActivelyStreaming && !isStreaming) return false;
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
    }, [displayContent, isActivelyStreaming, isStreaming]);

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

            // Set timeout to mark streaming as complete after 750ms of no changes
            streamingTimeoutRef.current = setTimeout(() => {
                setIsActivelyStreaming(false);
                streamingTimeoutRef.current = undefined;
            }, 750);
        }

        // Cleanup timeout on unmount
        return () => {
            if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
                streamingTimeoutRef.current = undefined;
            }
        };
    }, [displayContent]);

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
        if (process.env.NODE_ENV === 'development' && isStreaming && message.role === 'assistant') {
            console.log('[MessageItem] 🚀 Message is actively streaming:', message.id);
        }
    }, [isStreaming, message.id, message.role]);

    // Count pending tool calls for batch actions
    const pendingCount = React.useMemo(() => {
        if (!message.toolCalls) return 0;
        return message.toolCalls.filter(tc => tc.status === 'pending' && !tc.isPartial).length;
    }, [message.toolCalls]);

    const handleApproveAll = () => {
        const store = useChatStore.getState() as any;
        if (store.approveAllToolCalls) {
            store.approveAllToolCalls(message.id);
        }
    };

    const handleRejectAll = () => {
        const store = useChatStore.getState() as any;
        if (store.rejectAllToolCalls) {
            store.rejectAllToolCalls(message.id);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(displayContent);
        toast.success(t('common.copied') || 'Copied to clipboard');
    };

    // Determine bubble style
    const isAgent = !!(message as any).agentId;
    const bubbleClass = isUser ? STYLES.userBubble : (isAgent ? STYLES.agentBubble : STYLES.assistantBubble);
//...

    // Parse segments from string content (for non-multi-modal or fallback)
    const stringSegments = React.useMemo(() => {
        // Use displayContent (throttled) instead of raw message.content
        const { segments } = parseToolCalls(displayContent);
        return segments;
    }, [displayContent]);

    // PERFORMANCE: Cache sorted contentSegments to avoid O(n log n) sort on every render
    const sortedSegments = React.useMemo(() => {
        // @ts-ignore
        if (!message.contentSegments || message.contentSegments.length === 0) {
            return null;
        }
        // @ts-ignore
        return [...message.contentSegments].sort((a: ContentSegment, b: ContentSegment) => a.order - b.order);
    }, [message.contentSegments]);

    let toolCallIndex = 0;

    // Helper to render Markdown WITHOUT syntax highlighting (for streaming mode)
    // This provides markdown formatting (bold, lists, etc.) without the performance cost
    const renderMarkdownWithoutHighlight = useCallback((text: string, key: any) => {
        // Process scan result i18n before rendering
        const processedText = processScanResult(text);
        return (
            <ReactMarkdown
                key={key}
                children={processedText}
                components={{
                    p: ({node, ...props}) => <div {...props} className="mb-2 last:mb-0 text-gray-300" />,
                    code({ node, className, children, ...rest }) {
                        const { inline } = rest as any;
                        if (!inline) {
                            // Code block: use plain pre without syntax highlighting
                            return (
                                <pre className="whitespace-pre-wrap break-word text-[13px] font-mono text-gray-300 bg-[#1e1e1e] p-3 rounded border border-gray-700 my-2 overflow-x-auto">
                                    {String(children)}
                                </pre>
                            );
                        }
                        // Inline code
                        return (
                            <code {...rest} className="px-1 py-0.5 bg-gray-800 text-gray-300 rounded text-sm font-mono">
                                {children}
                            </code>
                        );
                    },
                    strong: ({node, ...props}) => <strong {...props} className="font-bold text-white" />,
                    em: ({node, ...props}) => <em {...props} className="italic text-gray-200" />,
                    ul: ({node, ...props}) => <ul {...props} className="list-disc list-inside mb-2 text-gray-300" />,
                    ol: ({node, ...props}) => <ol {...props} className="list-decimal list-inside mb-2 text-gray-300" />,
                    li: ({node, ...props}) => <li {...props} className="ml-4" />,
                    h1: ({node, ...props}) => <h1 {...props} className="text-xl font-bold mb-2 text-white" />,
                    h2: ({node, ...props}) => <h2 {...props} className="text-lg font-bold mb-2 text-white" />,
                    h3: ({node, ...props}) => <h3 {...props} className="text-md font-bold mb-2 text-white" />,
                    a: ({node, ...props}) => <a {...props} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" />,
                }}
            />
        );
    }, [processScanResult]);

    // Helper to render ContentPart - using useCallback to ensure fresh isStreaming value
    // NOTE: Streaming detection is now handled at the CALL SITE, not inside this function
    // This function ALWAYS applies formatting (Markdown + syntax highlighting) when called
    const renderContentPart = useCallback((part: ContentPart, index: number) => {
        if (part.type === 'text' && part.text) {
            // Process scan result i18n before rendering
            const processedText = processScanResult(part.text);

            // PERFORMANCE: After streaming completes, check for code folding
            // to reduce Markdown parsing overhead by ~95% for large content
            const lines = processedText.split('\n');
            const MAX_LINES_BEFORE_COLLAPSE = 50;  // Threshold matching v0.2.0
            const shouldCollapseBlock = lines.length > MAX_LINES_BEFORE_COLLAPSE;

            if (shouldCollapseBlock) {
                // For large content (>50 lines), use folding to reduce parsing cost
                const isExpanded = expandedBlocksRef.current.has(index);
                const displayText = isExpanded
                    ? processedText
                    : lines.slice(0, MAX_LINES_BEFORE_COLLAPSE).join('\n') + '\n... (展开查看全部)';

                return (
                    <div key={index} className="flex flex-col">
                        <ReactMarkdown
                            children={displayText}
                            components={{
                                p: ({node, ...props}) => <div {...props} className="mb-2 last:mb-0" />,
                                code({ node, className, children, ...rest }) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const { ref, ...propsToPass } = rest;
                                    const isInline = (rest as any).inline;

                                    if (!isInline) {
                                        return (
                                            <div className="my-2">
                                                <SyntaxHighlighter
                                                    {...propsToPass}
                                                    children={String(children)}
                                                    style={vscDarkPlus}
                                                    language={match ? match[1] : 'text'}
                                                    PreTag="div"
                                                    wrapLines={true}
                                                    customStyle={{
                                                        margin: 0,
                                                        borderRadius: '0.375rem',
                                                        fontSize: '0.75rem',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                        display: 'block'
                                                    }}
                                                />
                                            </div>
                                        );
                                    }

                                    return (
                                        <code {...rest} className={className}>
                                            {children}
                                        </code>
                                    );
                                },
                            }}
                        />
                        <button
                            onClick={() => toggleBlock(index)}
                            className="self-start mt-1 px-3 py-1 text-xs text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 bg-gray-900 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
                        >
                            {isExpanded ? (
                                <>
                                    <ChevronUp size={12} />
                                    收起 ({lines.length} 行)
                                </>
                            ) : (
                                <>
                                    <ChevronDown size={12} />
                                    展开全部 ({lines.length} 行)
                                </>
                            )}
                        </button>
                    </div>
                );
            }

            // Normal Markdown rendering for small to medium content
            return (
                <ReactMarkdown
                    key={index}
                    children={processedText}
                    components={{
                        p: ({node, ...props}) => <div {...props} className="mb-2 last:mb-0" />,
                        code({ node, className, children, ...rest }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const { ref, ...propsToPass } = rest;
                            const isInline = (rest as any).inline;

                            if (!isInline) {
                                return (
                                    <SyntaxHighlighter
                                        {...propsToPass}
                                        children={String(children)}
                                        style={vscDarkPlus}
                                        language={match ? match[1] : 'text'}
                                        PreTag="div"
                                        wrapLines={true}
                                        customStyle={{
                                            margin: 0,
                                            borderRadius: '0.375rem',
                                            fontSize: '0.75rem',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            display: 'block'
                                        }}
                                    />
                                );
                            }

                            return (
                                <code {...rest} className={className}>
                                    {children}
                                </code>
                            );
                        },
                    }}
                />
            );
        } else if (part.type === 'image_url' && part.image_url?.url) {
            return (
                <div key={index} className="my-2 max-w-xs border border-gray-600 rounded overflow-hidden">
                    <img src={part.image_url.url} alt="AI generated image" className="w-full h-auto" />
                </div>
            );
        }
        return null;
    }, [toggleBlock, processScanResult]);  // Only depend on toggleBlock, read isStreaming from ref


    return (
        <div className={`group flex flex-col mb-6 ${isUser ? 'items-end' : 'items-start'}`}>
            <div className={bubbleClass}>
                {/* Actions Toolbar - Floating on top right of assistant messages */}
                {!isUser && !isActivelyStreaming && (
                    <div className="absolute -top-3 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 border border-gray-700 rounded-md p-1 shadow-lg z-10">
                        <button onClick={handleCopy} className="p-1 hover:bg-gray-700 rounded text-gray-400" title="Copy content">
                            <Copy size={12} />
                        </button>
                        <button className="p-1 hover:bg-gray-700 rounded text-gray-400" title="Regenerate">
                            <RotateCcw size={12} />
                        </button>
                        <button className="p-1 hover:bg-gray-700 rounded text-gray-400">
                            <MoreHorizontal size={12} />
                        </button>
                    </div>
                )}

                <div className="flex items-start gap-3">
                    {/* Avatar Logic */}
                    <div className="shrink-0 mt-0.5">
                        {isUser ? (
                            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-inner text-white">
                                <User size={14} />
                            </div>
                        ) : isAgent ? (
                            <div className="w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center border border-blue-500/50 shadow-inner text-blue-400">
                                <Bot size={14} />
                            </div>
                        ) : (
                            <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-700 bg-black/20 flex items-center justify-center">
                                <img src={ifaiLogo} alt="IfAI Logo" className="w-4 h-4 opacity-90" />
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 min-w-0 text-inherit">
                        {isAgent && (
                            <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-500/20">
                                    Agent Live
                                </span>
                            </div>
                        )}

                        {/* Batch Review Panel */}
                        {pendingCount > 1 && (
                            <div className="mb-3 p-2 bg-blue-900/20 rounded border border-blue-700/50 flex items-center justify-between">
                                <div className="text-xs font-medium text-blue-300">
                                    有 {pendingCount} 个待处理的操作
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleApproveAll}
                                        className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] rounded transition-colors"
                                    >
                                        <CheckCheck size={12} />
                                        全部批准
                                    </button>
                                    <button 
                                        onClick={handleRejectAll}
                                        className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] rounded transition-colors"
                                    >
                                        <XCircle size={12} />
                                        全部拒绝
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* References */}
                        {message.references && message.references.length > 0 && (
                            <div className="mb-3 p-2 bg-gray-800 rounded border border-gray-600">
                                <div className="flex items-center text-xs text-gray-400 mb-2">
                                    <FileCode size={12} className="mr-1" />
                                    <span className="font-semibold">{t('chat.references') || 'References'}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {message.references.map((ref, idx) => (
                                        <button 
                                            key={idx} 
                                            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-blue-400 hover:text-blue-300 border border-gray-600 truncate max-w-full text-left"
                                            title={ref}
                                            onClick={() => onOpenFile(ref)}
                                        >
                                            {ref.split('/').pop()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* v0.2.6: 任务拆解结果展示（工业级渲染） */}
                        {taskBreakdown ? (
                            <TaskBreakdownViewer
                                breakdown={taskBreakdown}
                                mode="inline"
                                allowModeSwitch={true}
                            />
                        ) : isStreamingTaskBreakdown ? (
                            /* 流式传输中的任务拆解 - 显示进度 */
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                    <span>正在拆解任务...</span>
                                </div>
                                {/* 显示流式内容（用于调试和进度查看） */}
                                <div className="text-xs text-gray-500 font-mono max-h-32 overflow-y-auto bg-[#1e1e1e] rounded border border-gray-700 p-2">
                                    {displayContent.slice(-500)}
                                </div>
                            </div>
                        ) : message.multiModalContent && message.multiModalContent.length > 0 ? (
                            <div className="space-y-2">
                                {message.multiModalContent.map((part, index) => renderContentPart(part, index))}
                            </div>
                        ) : (
                            /* Check if contentSegments exists for stream-order rendering */
                            sortedSegments ? (
                                /* Use simple streaming check */
                                (() => {
                                    // Simple check: use streaming mode if actively streaming
                                    if (isActivelyStreaming) {
                                        /* === STREAMING MODE: Render ALL segments (text + tools) in order as plain text === */
                                        return (
                                            <>
                                                {sortedSegments.map((segment: ContentSegment, index: number) => {
                                                    if (segment.type === 'text') {
                                                        const content = segment.content;
                                                        if (!content) return null;
                                                        if (content.startsWith('Indexing...')) {
                                                            return <p key={`text-${index}`} className="text-sm whitespace-pre-wrap text-gray-400">{content}</p>;
                                                        }
                                                        // Render with Markdown formatting but WITHOUT syntax highlighting (for performance)
                                                        return renderMarkdownWithoutHighlight(content, `streaming-text-${index}`);
                                                    } else if (segment.type === 'tool' && segment.toolCallId) {
                                                        const toolCall = message.toolCalls?.find(tc => tc.id === segment.toolCallId);
                                                        if (!toolCall) return null;
                                                        return (
                                                            <ToolApproval
                                                                key={`streaming-tool-${segment.toolCallId}`}
                                                                toolCall={toolCall}
                                                                onApprove={() => onApprove(message.id, toolCall.id)}
                                                                onReject={() => onReject(message.id, toolCall.id)}
                                                            />
                                                        );
                                                    }
                                                    return null;
                                                })}
                                            </>
                                        );
                                    } else {
                                        /* === NON-STREAMING MODE: Use full content with Markdown/highlighting === */

                                        // First, check if there are any tools in sortedSegments
                                        const hasToolsInSegments = sortedSegments.some(s => s.type === 'tool');

                                        if (!hasToolsInSegments) {
                                            // Simple case: No tools, render full content directly with index 0
                                            // This ensures code block indices start from 0, matching toggleBlock expectations
                                            return renderContentPart({ type: 'text', text: displayContent }, 0);
                                        }

                                        // Complex case: Has tools, use precise interleaving
                                        // Build tool position map: order -> { toolCallId, charPos }
                                        const toolPositions = new Map<number, { toolCallId: string, charPos: number }>();

                                        // FIXED: Use endPos (absolute position) instead of accumulating content.length
                                        // This ensures correct tool placement even when text chunks are split
                                        sortedSegments.forEach((segment: ContentSegment, index: number) => {
                                            if (segment.type === 'tool' && segment.toolCallId) {
                                                // Find the last text segment before this tool
                                                let charPos = 0;
                                                for (let i = index - 1; i >= 0; i--) {
                                                    const prevSeg = sortedSegments[i];
                                                    if (prevSeg.type === 'text' && prevSeg.endPos !== undefined) {
                                                        charPos = prevSeg.endPos;
                                                        break;
                                                    }
                                                }
                                                toolPositions.set(segment.order, {
                                                    toolCallId: segment.toolCallId,
                                                    charPos: charPos
                                                });
                                            }
                                        });

                                        // IMPORTANT: Use displayContent which is already converted to string
                                        // Position calculation is based on sortedSegments, which aligns with message.content
                                        const fullContent = displayContent;
                                        const parts: Array<{type: 'text', content: string} | {type: 'tool', toolCallId: string}> = [];
                                        let lastPos = 0;

                                        // Sort tools by character position
                                        const sortedTools = Array.from(toolPositions.values()).sort((a, b) => a.charPos - b.charPos);

                                        sortedTools.forEach(({ toolCallId, charPos }) => {
                                            // Add text before this tool
                                            if (charPos > lastPos) {
                                                parts.push({
                                                    type: 'text',
                                                    content: fullContent.substring(lastPos, charPos)
                                                });
                                            }
                                            // Add tool
                                            parts.push({ type: 'tool', toolCallId });
                                            lastPos = charPos;
                                        });

                                        // Add remaining text
                                        if (lastPos < fullContent.length) {
                                            parts.push({
                                                type: 'text',
                                                content: fullContent.substring(lastPos)
                                            });
                                        }

                                        // Render all parts
                                        // Note: When tools are interleaved, each text part gets its own index
                                        // Code block indices will be offset, but this is acceptable for the interleaved case
                                        return (
                                            <>
                                                {parts.map((part, index) => {
                                                    if (part.type === 'text') {
                                                        return renderContentPart({ type: 'text', text: part.content }, index);
                                                    } else {
                                                        const toolCall = message.toolCalls?.find(tc => tc.id === part.toolCallId);
                                                        if (!toolCall) return null;
                                                        return (
                                                            <ToolApproval
                                                                key={`tool-${part.toolCallId}`}
                                                                toolCall={toolCall}
                                                                onApprove={() => onApprove(message.id, toolCall.id)}
                                                                onReject={() => onReject(message.id, toolCall.id)}
                                                            />
                                                        );
                                                    }
                                                })}
                                            </>
                                        );
                                    }
                                })()
                            ) : (
                                /* Fallback to String Content + Segments (Text and Tools interleaved) */
                                (() => {
                                    // 1. Pre-calculate tool indexing to support both interleaved and native tools
                                    let currentToolIndex = 0;

                                    // 2. Determine which tool calls are "native" (not interleaved in text)
                                    // If parseToolCalls found tool segments, we interleave.
                                    // Otherwise, we treat them as native and show them at the top.
                                    const hasInterleavedTools = stringSegments.some(s => s.type === 'tool');

                                    return (
                                        <>
                                            {/* Render Segments (Text and potentially interleaved tools) FIRST */}
                                            {stringSegments.map((segment, index) => {
                                                if (segment.type === 'tool') {
                                                    const storedToolCall = message.toolCalls && message.toolCalls[currentToolIndex];
                                                    currentToolIndex++;
                                                    const displayToolCall = storedToolCall || segment.toolCall;
                                                    if (!displayToolCall) return null;
                                                    return (
                                                        <ToolApproval
                                                            key={displayToolCall.id}
                                                            toolCall={displayToolCall}
                                                            onApprove={() => onApprove(message.id, displayToolCall.id)}
                                                            onReject={() => onReject(message.id, displayToolCall.id)}
                                                        />
                                                    );
                                                } else {
                                                    const content = segment.content;
                                                    if (!content) return null;
                                                    if (content.startsWith('Indexing...')) {
                                                        return <p key={index} className="text-sm whitespace-pre-wrap text-gray-400">{content}</p>;
                                                    }
                                                    // Use streaming check - use markdown without highlighting
                                                    if (isActivelyStreaming) {
                                                        return renderMarkdownWithoutHighlight(content, index);
                                                    }
                                                    return renderContentPart({ type: 'text', text: content }, index);
                                                }
                                            })}

                                            {/* Render remaining Native Tool Calls (if any were missed in interleaved mode) */}
                                            {hasInterleavedTools && message.toolCalls && message.toolCalls.slice(currentToolIndex).map(toolCall => (
                                                <ToolApproval
                                                    key={toolCall.id}
                                                    toolCall={toolCall}
                                                    onApprove={() => onApprove(message.id, toolCall.id)}
                                                    onReject={() => onReject(message.id, toolCall.id)}
                                                />
                                            ))}

                                            {/* Render Native Tool Calls AFTER text (at the bottom)
                                                This puts tools BELOW the text content */}
                                            {!hasInterleavedTools && message.toolCalls && message.toolCalls.map(toolCall => (
                                                <ToolApproval
                                                    key={toolCall.id}
                                                    toolCall={toolCall}
                                                    onApprove={() => onApprove(message.id, toolCall.id)}
                                                    onReject={() => onReject(message.id, toolCall.id)}
                                                />
                                            ))}
                                        </>
                                    );
                                })()
                            )
                        )}

                        {/* Explore Agent Progress */}
                        {(message as any).exploreProgress && (
                            <ExploreProgressNew progress={(message as any).exploreProgress} mode="minimal" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}, arePropsEqual)
