import React, { useState } from 'react';
import { Check, X, Terminal, FilePlus, Eye, FolderOpen, Search, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { ToolCall } from '../../stores/chatStore';
import { useTranslation } from 'react-i18next';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getToolLabel, getToolColor } from '../../utils/toolCallParser';

interface ToolApprovalProps {
    toolCall: ToolCall;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

// 工具图标映射
const TOOL_ICONS: Record<string, React.ReactNode> = {
    'agent_write_file': <FilePlus size={14} />,
    'agent_read_file': <Eye size={14} />,
    'agent_list_dir': <FolderOpen size={14} />,
    'agent_execute_command': <Terminal size={14} />,
    'agent_search': <Search size={14} />,
    'agent_delete_file': <Trash2 size={14} />,
};

// 代码预览行数
const PREVIEW_LINES = 8;

export const ToolApproval = ({ toolCall, onApprove, onReject }: ToolApprovalProps) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const isPending = toolCall.status === 'pending';

    const getIcon = () => {
        const toolName = toolCall.tool.trim();
        for (const [key, icon] of Object.entries(TOOL_ICONS)) {
            if (toolName.includes(key.replace('agent_', ''))) {
                return icon;
            }
        }
        return <Terminal size={14} />;
    };

    const detectLanguage = (path: string): string => {
        if (!path) return 'plaintext';
        const ext = path.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            'js': 'javascript',
            'jsx': 'jsx',
            'ts': 'typescript',
            'tsx': 'tsx',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'json': 'json',
            'rs': 'rust',
            'py': 'python',
            'go': 'go',
            'md': 'markdown',
            'yaml': 'yaml',
            'yml': 'yaml',
            'toml': 'toml',
            'sh': 'bash',
            'bash': 'bash',
        };
        return langMap[ext || ''] || 'plaintext';
    };

    const getStatusColor = () => {
        switch (toolCall.status) {
            case 'completed': return 'text-green-400';
            case 'failed': return 'text-red-400';
            case 'rejected': return 'text-red-300';
            case 'approved': return 'text-blue-400';
            default: return 'text-yellow-400';
        }
    };

    const getStatusLabel = () => {
        switch (toolCall.status) {
            case 'completed': return '已完成';
            case 'failed': return '失败';
            case 'rejected': return '已拒绝';
            case 'approved': return '已批准';
            default: return '待审批';
        }
    };

    // 处理文件写入类工具
    const isWriteFile = toolCall.tool.includes('write_file');
    const filePath = toolCall.args?.rel_path || toolCall.args?.path || '';
    const fileContent = toolCall.args?.content || '';
    const contentLines = fileContent.split('\n');
    const shouldCollapse = contentLines.length > PREVIEW_LINES;
    const displayContent = isExpanded
        ? fileContent
        : contentLines.slice(0, PREVIEW_LINES).join('\n');

    return (
        <div className="mt-2 mb-2 bg-gray-800 rounded-lg border border-gray-600 overflow-hidden w-full max-w-full">
            <div className="flex items-center justify-between p-2 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-200 min-w-0">
                    <span className={`flex-shrink-0 ${getToolColor(toolCall.tool)}`}>
                        {getIcon()}
                    </span>
                    <span className="truncate">{getToolLabel(toolCall.tool)}</span>
                </div>
                <span className={`text-xs font-medium flex-shrink-0 ${getStatusColor()}`}>
                    {getStatusLabel()}
                </span>
            </div>

            {/* Content */}
            <div className="p-3 text-xs">
                {isWriteFile ? (
                    <div className="space-y-2">
                        {/* File Path */}
                        <div className="flex items-center gap-2 text-gray-400">
                            <span>路径:</span>
                            <code className="text-green-400 bg-gray-900 px-1.5 py-0.5 rounded break-all">
                                {filePath}
                            </code>
                        </div>

                        {/* Code Preview */}
                        {fileContent && (
                            <div className="relative">
                                <div className="max-h-80 overflow-auto rounded border border-gray-700">
                                    <SyntaxHighlighter
                                        language={detectLanguage(filePath)}
                                        style={vscDarkPlus}
                                        customStyle={{
                                            margin: 0,
                                            fontSize: '11px',
                                            background: '#1a1a1a',
                                        }}
                                        wrapLines={true}
                                        wrapLongLines={true}
                                        showLineNumbers={true}
                                        lineNumberStyle={{
                                            minWidth: '2.5em',
                                            paddingRight: '1em',
                                            color: '#666',
                                        }}
                                    >
                                        {displayContent}
                                    </SyntaxHighlighter>
                                </div>

                                {/* Expand/Collapse Button */}
                                {shouldCollapse && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="w-full mt-1 py-1 text-xs text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1 bg-gray-900 rounded border border-gray-700 hover:bg-gray-800 transition-colors"
                                    >
                                        {isExpanded ? (
                                            <>
                                                <ChevronUp size={12} />
                                                收起 ({contentLines.length} 行)
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown size={12} />
                                                展开全部 ({contentLines.length} 行)
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    // 其他工具类型：显示 JSON 参数
                    <div className="space-y-2">
                        <div className="text-gray-400">参数:</div>
                        <pre className="bg-gray-900 p-2 rounded border border-gray-700 overflow-x-auto whitespace-pre-wrap break-words text-gray-300">
                            {JSON.stringify(toolCall.args, null, 2)}
                        </pre>
                    </div>
                )}
            </div>

            {/* Approve/Reject Buttons */}
            {isPending && (
                <div className="flex border-t border-gray-700">
                    <button
                        onClick={() => onApprove(toolCall.id)}
                        className="flex-1 p-2 text-xs font-medium text-green-400 hover:bg-green-900/30 flex items-center justify-center gap-1 border-r border-gray-700 transition-colors"
                    >
                        <Check size={14} />
                        批准
                    </button>
                    <button
                        onClick={() => onReject(toolCall.id)}
                        className="flex-1 p-2 text-xs font-medium text-red-400 hover:bg-red-900/30 flex items-center justify-center gap-1 transition-colors"
                    >
                        <X size={14} />
                        拒绝
                    </button>
                </div>
            )}

            {/* Result */}
            {toolCall.status === 'completed' && toolCall.result && (
                <div className="p-2 border-t border-gray-700 bg-green-900/10 text-xs text-green-300">
                    <span className="font-medium">结果: </span>
                    <span className="break-all">{toolCall.result}</span>
                </div>
            )}
            {toolCall.status === 'failed' && toolCall.result && (
                <div className="p-2 border-t border-gray-700 bg-red-900/10 text-xs text-red-300">
                    <span className="font-medium">错误: </span>
                    <span className="break-all">{toolCall.result}</span>
                </div>
            )}
        </div>
    );
};
