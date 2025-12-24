import React from 'react';
import { User, FileCode, CheckCheck, XCircle } from 'lucide-react'; // Added icons
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, ContentPart, useChatStore, ContentSegment } from '../../stores/useChatStore'; // Changed imports
import { ToolApproval } from './ToolApproval';
import { useTranslation } from 'react-i18next';
import { parseToolCalls } from 'ifainew-core';
import ifaiLogo from '../../../imgs/ifai.png';

interface MessageItemProps {
    message: Message;
    onApprove: (messageId: string, toolCallId: string) => void;
    onReject: (messageId: string, toolCallId: string) => void;
    onOpenFile: (path: string) => void;
    isStreaming?: boolean;
}

export const MessageItem = React.memo(({ message, onApprove, onReject, onOpenFile, isStreaming }: MessageItemProps) => {
    const { t } = useTranslation();
    const isUser = message.role === 'user';

    // Debug: Log message toolCalls on every render
    React.useEffect(() => {
        if (message.toolCalls && message.toolCalls.length > 0) {
            console.log('[MessageItem] Rendering message with toolCalls:', message.id, message.toolCalls);
        }
    }, [message.toolCalls, message.id]);

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
        const { segments } = parseToolCalls(message.content);
        return segments;
    }, [message.content]);

    let toolCallIndex = 0;

    // Helper to render ContentPart
    const renderContentPart = (part: ContentPart, index: number) => {
        if (part.type === 'text' && part.text) {
            // Optimization: If message is extremely long and streaming,
            // fallback to plain pre tag to avoid heavy Markdown parsing/diffing
            // Increased limit from 3000 to 10000 for better code rendering
            const isTooLongToMarkdown = isStreaming && part.text.length > 10000;

            if (isTooLongToMarkdown) {
                return (
                    <pre key={index} className="whitespace-pre-wrap break-word text-[11px] font-mono text-gray-300 bg-[#1e1e1e] p-2 rounded border border-gray-700">
                        {part.text}
                    </pre>
                );
            }

            // Apply markdown rendering to text parts
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

                            if (!isInline && isStreaming) {
                                return (
                                    <pre className="whitespace-pre-wrap break-word bg-[#1e1e1e] p-2 rounded my-2 text-[11px] font-mono text-gray-300 overflow-x-auto border border-gray-700">
                                        {children}
                                    </pre>
                                );
                            }

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
    };


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
                            // @ts-ignore
                            message.contentSegments && message.contentSegments.length > 0 ? (
                                /* New Logic: Render in stream reception order */
                                <>
                                    {/* Render segments in reception order */}
                                    {/* @ts-ignore */}
                                    {message.contentSegments
                                        .sort((a: ContentSegment, b: ContentSegment) => a.order - b.order)
                                        .map((segment: ContentSegment, index: number) => {
                                            if (segment.type === 'text') {
                                                const content = segment.content;
                                                if (!content) return null;
                                                if (content.startsWith('Indexing...')) {
                                                    return <p key={`text-${index}`} className="text-sm whitespace-pre-wrap text-gray-400">{content}</p>;
                                                }
                                                return renderContentPart({ type: 'text', text: content }, index);
                                            } else if (segment.type === 'tool' && segment.toolCallId) {
                                                const toolCall = message.toolCalls?.find(tc => tc.id === segment.toolCallId);
                                                if (!toolCall) return null;
                                                return (
                                                    <ToolApproval
                                                        key={`tool-${segment.toolCallId}`}
                                                        toolCall={toolCall}
                                                        onApprove={() => onApprove(message.id, toolCall.id)}
                                                        onReject={() => onReject(message.id, toolCall.id)}
                                                    />
                                                );
                                            }
                                            return null;
                                        })}
                                </>
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
                    </div>
                </div>
            </div>
        </div>
    );
})
