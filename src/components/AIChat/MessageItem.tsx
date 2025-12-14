import React from 'react';
import { User, Bot, FileCode } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../../stores/chatStore';
import { ToolApproval } from './ToolApproval';
import { useTranslation } from 'react-i18next';
import { parseToolCalls } from '../../utils/toolCallParser';

interface MessageItemProps {
    message: Message;
    onApprove: (messageId: string, toolCallId: string) => void;
    onReject: (messageId: string, toolCallId: string) => void;
    onOpenFile: (path: string) => void;
}

export const MessageItem = React.memo(({ message, onApprove, onReject, onOpenFile }: MessageItemProps) => {
    const { t } = useTranslation();
    const isUser = message.role === 'user';

    // Use robust parser to clean content visually
    // This ensures that even if store hasn't updated yet (streaming), we hide the JSON block
    const displayContent = React.useMemo(() => {
        // If message already has toolCalls, we assume store handled it, but let's be safe and clean it again
        const { cleanContent } = parseToolCalls(message.content);
        return cleanContent;
    }, [message.content]);

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
                        {/* Tool Calls */}
                        {message.toolCalls && message.toolCalls.map(tc => (
                            <ToolApproval 
                                key={tc.id} 
                                toolCall={tc} 
                                onApprove={() => onApprove(message.id, tc.id)}
                                onReject={() => onReject(message.id, tc.id)}
                            />
                        ))}

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

                        {/* Content */}
                        {displayContent ? (
                            message.content.startsWith('Indexing...') ? (
                                <p className="text-sm whitespace-pre-wrap text-gray-400">{displayContent}</p>
                            ) : (
                                <ReactMarkdown
                                    children={displayContent}
                                    components={{
                                        code({ node, className, children, ...rest }) {
                                            const match = /language-(\w+)/.exec(className || '');
                                            const { ref, ...propsToPass } = rest;
                                            const isInline = (rest as any).inline;
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
                            )
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.message === next.message; 
})