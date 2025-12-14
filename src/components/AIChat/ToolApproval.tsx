import React from 'react';
import { Check, X, Terminal, FilePlus, Eye } from 'lucide-react';
import { ToolCall } from '../../stores/chatStore';
import { useTranslation } from 'react-i18next';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ToolApprovalProps {
    toolCall: ToolCall;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

export const ToolApproval = ({ toolCall, onApprove, onReject }: ToolApprovalProps) => {
    const { t } = useTranslation();
    const isPending = toolCall.status === 'pending';

    const getIcon = () => {
        const toolName = toolCall.tool.trim();
        if (toolName.includes('write_file')) return <FilePlus size={16} />;
        if (toolName.includes('read_file')) return <Eye size={16} />;
        if (toolName.includes('list_dir')) return <Terminal size={16} />;
        return <Terminal size={16} />;
    };

    const detectLanguage = (path: string) => {
        if (!path) return 'plaintext';
        if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
        if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
        if (path.endsWith('.html')) return 'html';
        if (path.endsWith('.css')) return 'css';
        if (path.endsWith('.json')) return 'json';
        if (path.endsWith('.rs')) return 'rust';
        return 'plaintext';
    };

    return (
        <div className="mt-2 mb-2 bg-gray-800 rounded-lg border border-gray-600 overflow-hidden w-full max-w-full">
            <div className="flex items-center justify-between p-2 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center text-xs font-semibold text-gray-300">
                    <span className="mr-2 text-blue-400">{getIcon()}</span>
                    {toolCall.tool}
                </div>
                <div className={`text-xs capitalize ${
                    toolCall.status === 'completed' ? 'text-green-500' :
                    toolCall.status === 'failed' ? 'text-red-500' :
                    toolCall.status === 'rejected' ? 'text-red-400' : 'text-yellow-500'
                }`}>
                    {toolCall.status}
                </div>
            </div>
            
            <div className="p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                {toolCall.tool.includes('agent_write_file') ? (
                    <div>
                        <div className="text-gray-500 mb-1">Path: <span className="text-green-400">{toolCall.args.rel_path}</span></div>
                        <div className="max-h-64 overflow-y-auto rounded border border-gray-800">
                             <SyntaxHighlighter
                                language={detectLanguage(toolCall.args.rel_path)}
                                style={vscDarkPlus}
                                customStyle={{ margin: 0, fontSize: '11px' }}
                                wrapLines={true}
                                wrapLongLines={true}
                              >
                                {toolCall.args.content || ''}
                              </SyntaxHighlighter>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="text-gray-500 mb-1">Tool Args:</div>
                        <pre className="whitespace-pre-wrap break-words">{JSON.stringify(toolCall.args, null, 2)}</pre>
                        {/* Debug info if needed */}
                    </div>
                )}
            </div>

            {isPending && (
                <div className="flex border-t border-gray-700">
                    <button 
                        onClick={() => onApprove(toolCall.id)}
                        className="flex-1 p-2 text-xs font-medium text-green-400 hover:bg-green-900/30 flex items-center justify-center border-r border-gray-700 transition-colors"
                    >
                        <Check size={14} className="mr-1" /> Approve
                    </button>
                    <button 
                        onClick={() => onReject(toolCall.id)}
                        className="flex-1 p-2 text-xs font-medium text-red-400 hover:bg-red-900/30 flex items-center justify-center transition-colors"
                    >
                        <X size={14} className="mr-1" /> Reject
                    </button>
                </div>
            )}
            
            {toolCall.status === 'completed' && toolCall.result && (
                <div className="p-2 border-t border-gray-700 bg-green-900/10 text-xs text-green-300 truncate">
                    Result: {toolCall.result}
                </div>
            )}
             {toolCall.status === 'failed' && toolCall.result && (
                <div className="p-2 border-t border-gray-700 bg-red-900/10 text-xs text-red-300 truncate">
                    Error: {toolCall.result}
                </div>
            )}
        </div>
    );
};
