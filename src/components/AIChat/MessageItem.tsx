import React, { useState, useCallback, useRef } from 'react';
import { User, FileCode, CheckCheck, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, ContentPart, useChatStore, ContentSegment } from '../../stores/useChatStore'; // Changed imports
import { ToolApproval } from './ToolApproval';
import { ExploreProgress } from './ExploreProgress';
import { ExploreProgress as ExploreProgressNew } from './ExploreProgressNew';
import { useTranslation } from 'react-i18next';
import { parseToolCalls } from 'ifainew-core';
import ifaiLogo from '../../../imgs/ifai.png';
import { useThrottle } from '../../hooks/useThrottle';

interface MessageItemProps {
    message: Message;
    onApprove: (messageId: string, toolCallId: string) => void;
    onReject: (messageId: string, toolCallId: string) => void;
    onOpenFile: (path: string) => void;
    isStreaming?: boolean;
}

// Custom comparison function for React.memo
// Re-render when isStreaming changes or message content changes
const arePropsEqual = (prevProps: MessageItemProps, nextProps: MessageItemProps) => {
    // Always re-render if isStreaming changes
    if (prevProps.isStreaming !== nextProps.isStreaming) {
        return false;
    }
    // Re-render if message content changes
    if (prevProps.message.content !== nextProps.message.content) {
        return false;
    }
    // Re-render if toolCalls change
    if (prevProps.message.toolCalls !== nextProps.message.toolCalls) {
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
    const lastContentLengthRef = useRef(message.content.length);
    // FIXED: Use state instead of ref to ensure re-render when streaming state changes
    const [isActivelyStreaming, setIsActivelyStreaming] = useState(false);
    // Component-level timeout to avoid global variable collision between multiple MessageItem instances
    const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // NEW: Lock render mode to ensure single switch from streaming to stable
    const renderModeRef = useRef<'streaming' | 'stable'>('stable');
    const hasSwitchedToStableRef = useRef(false);

    // NEW: Detect agent streaming state (agent doesn't set global isLoading)
    const isAgentStreaming = Boolean(
        message.agentId ||
        (message as any).isAgentLive ||
        (message.toolCalls && message.toolCalls.some(tc => tc.status === 'pending'))
    );

    // THROTTLE: Use fixed throttle interval to avoid dynamic switching
    // Removing dynamic interval (150 -> 0) eliminates useThrottle internal state changes
    const displayContent = useThrottle(message.content, 200); // Fixed 200ms throttle

    // Update streaming status based on content growth
    React.useEffect(() => {
        const currentLength = message.content.length;
        const lengthChanged = currentLength !== lastContentLengthRef.current;

        if (lengthChanged) {
            // Content is growing - actively streaming
            const wasNotStreaming = !isActivelyStreaming;
            setIsActivelyStreaming(true);
            lastContentLengthRef.current = currentLength;

            // Lock to streaming mode when streaming starts
            if (wasNotStreaming) {
                renderModeRef.current = 'streaming';
                hasSwitchedToStableRef.current = false;
            }

            // Clear previous timeout
            if (streamingTimeoutRef.current) {
                clearTimeout(streamingTimeoutRef.current);
            }

            // Set timeout to mark streaming as complete after 750ms of no changes
            streamingTimeoutRef.current = setTimeout(() => {
                // Switch to stable mode only once
                if (!hasSwitchedToStableRef.current) {
                    renderModeRef.current = 'stable';
                    hasSwitchedToStableRef.current = true;
                }
                setIsActivelyStreaming(false);  // setState triggers re-render
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
    }, [message.content, isActivelyStreaming]);

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
        if (process.env.NODE_ENV === 'development') {
            console.log('[MessageItem] isStreaming changed:', { messageId: message.id, isStreaming });
        }
        // Removed forceUpdate - rely on arePropsEqual in React.memo
    }, [isStreaming, message.id]);

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
        return (
            <ReactMarkdown
                key={key}
                children={text}
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
    }, []);

    // Helper to render ContentPart - using useCallback to ensure fresh isStreaming value
    // NOTE: Streaming detection is now handled at the CALL SITE, not inside this function
    // This function ALWAYS applies formatting (Markdown + syntax highlighting) when called
    const renderContentPart = useCallback((part: ContentPart, index: number) => {
        if (part.type === 'text' && part.text) {
            // PERFORMANCE: After streaming completes, check for code folding
            // to reduce Markdown parsing overhead by ~95% for large content
            const lines = part.text.split('\n');
            const MAX_LINES_BEFORE_COLLAPSE = 50;  // Threshold matching v0.2.0
            const shouldCollapseBlock = lines.length > MAX_LINES_BEFORE_COLLAPSE;

            if (shouldCollapseBlock) {
                // For large content (>50 lines), use folding to reduce parsing cost
                const isExpanded = expandedBlocksRef.current.has(index);
                const displayText = isExpanded
                    ? part.text
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
                    children={part.text}
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
    }, [toggleBlock]);  // Only depend on toggleBlock, read isStreaming from ref


    return (
        <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
            <div
                className={isUser
                    ? 'max-w-[85%] rounded-lg p-3 bg-blue-600 text-white'
                    : 'w-full rounded-lg p-3 bg-[#2d2d2d] text-gray-200 border border-gray-700'
                }
            >
                <div className="flex items-start">
                    {isUser ? (
                        <User size={16} className="mr-2 min-w-[16px] mt-1" />
                    ) : (
                        <img src={ifaiLogo} alt="IfAI Logo" className="w-4 h-4 mr-2 min-w-[16px] mt-1 opacity-70" /> // IfAI logo
                    )}
                    
                    <div className="flex-1 min-w-0">
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

                        {/* Multi-modal Content Rendering (if available) */}
                        {message.multiModalContent && message.multiModalContent.length > 0 ? (
                            <div className="space-y-2">
                                {message.multiModalContent.map((part, index) => renderContentPart(part, index))}
                            </div>
                        ) : (
                            /* Check if contentSegments exists for stream-order rendering */
                            sortedSegments ? (
                                /* Use locked render mode to prevent flickering */
                                (() => {
                                    // Use ref-locked render mode instead of real-time state calculation
                                    // This ensures single switch from streaming to stable
                                    if (renderModeRef.current === 'streaming') {
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
                                            return renderContentPart({ type: 'text', text: message.content as string }, 0);
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

                                        // IMPORTANT: Use message.content instead of displayContent
                                        // Position calculation is based on sortedSegments, which aligns with message.content
                                        // Using displayContent (throttled) can cause misalignment when interval > 0
                                        const fullContent = message.content as string;
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
                                            {/* Render Native Tool Calls first if they are not interleaved in text
                                                This puts tools ABOVE the summary text for Agents. */}
                                            {!hasInterleavedTools && message.toolCalls && message.toolCalls.map(toolCall => (
                                                <ToolApproval
                                                    key={toolCall.id}
                                                    toolCall={toolCall}
                                                    onApprove={() => onApprove(message.id, toolCall.id)}
                                                    onReject={() => onReject(message.id, toolCall.id)}
                                                />
                                            ))}

                                            {/* Render Segments (Text and potentially interleaved tools) */}
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
                                                    // NEW: Check if agent is streaming - use markdown without highlighting
                                                    if (isAgentStreaming) {
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
