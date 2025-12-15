import React from 'react';
import { User, Bot, FileCode, Image } from 'lucide-react'; // Import Image
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, ContentPart, ImageUrl } from '../../stores/chatStore'; // Import ContentPart, ImageUrl
import { ToolApproval } from './ToolApproval';
import { useTranslation } from 'react-i18next';
import { parseToolCalls } from '../../utils/toolCallParser';

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

    // Parse segments from string content (for non-multi-modal or fallback)
    const stringSegments = React.useMemo(() => {
        const { segments } = parseToolCalls(message.content);
        return segments;
    }, [message.content]);

    let toolCallIndex = 0;

    // Helper to render ContentPart
    const renderContentPart = (part: ContentPart, index: number) => {
        if (part.type === 'text' && part.text) {
            // Apply markdown rendering to text parts
            return (
                <ReactMarkdown
                    key={index}
                    children={part.text}
                    components={{
                        code({ node, className, children, ...rest }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const { ref, ...propsToPass } = rest;
                            const isInline = (rest as any).inline;

                            if (!isInline && isStreaming) {
                                return (
                                    <pre className="whitespace-pre-wrap break-word bg-[#1e1e1e] p-2 rounded my-2 text-xs font-mono text-gray-300 overflow-x-auto">
                                        {children}
                                    </pre>
                                );
                            }

                            return !isInline && match ? (
                                <SyntaxHighlighter
                                    {...propsToPass}
                                    children={String(children).replace(/\n$/, '')}
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    wrapLines={true}
                                    wrapLongLines={true}
                                    customStyle={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                />
                            ) : (
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
                        <Bot size={16} className="mr-2 min-w-[16px] mt-1" />
                    )}
                    
                    <div className="flex-1 min-w-0">
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
                            /* Fallback to String Content + Segments (Text and Tools interleaved) */
                            stringSegments.map((segment, index) => {
                                if (segment.type === 'tool') {
                                    const storedToolCall = message.toolCalls && message.toolCalls[toolCallIndex];
                                    toolCallIndex++;
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
                                    return renderContentPart({ type: 'text', text: content }, index); // Use renderContentPart for text
                                }
                            })
                        )}
                        
                        {/* Render remaining Native Tool Calls not interleaved in text */}
                        {message.toolCalls && message.toolCalls.slice(toolCallIndex).map(toolCall => (
                            <ToolApproval 
                                key={toolCall.id} 
                                toolCall={toolCall} 
                                onApprove={() => onApprove(message.id, toolCall.id)}
                                onReject={() => onReject(message.id, toolCall.id)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.message === next.message && prev.isStreaming === next.isStreaming;
})
