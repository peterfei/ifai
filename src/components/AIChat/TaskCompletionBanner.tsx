/**
 * 任务完成横幅组件 - 简洁版
 * 在生成完成后紧跟内容显示，提供简洁的文字反馈
 */

import React from 'react';
import { CheckCircle, FileText, FolderOpen, Eye, Copy, RotateCcw } from 'lucide-react';
import { Message } from '../../stores/useChatStore';

interface TaskCompletionBannerProps {
  message: Message;
  onOpenFile?: (path: string) => void;
  onCopyContent?: (content: string) => void;
}

interface CompletionInfo {
  hasContent: boolean;
  hasFiles: boolean;
  fileCount: number;
  firstFile?: string;
  contentLength?: number;
  isSuccessful: boolean;
}

/**
 * 提取完成信息
 */
function extractCompletionInfo(message: Message): CompletionInfo | null {
  // v0.2.6 优化：对于没有工具调用（纯文字响应）的消息，不显示完成横幅
  if (!message.toolCalls || message.toolCalls.length === 0) {
    return null;
  }

  const completedCalls = message.toolCalls.filter(tc => tc.status === 'completed');
  if (completedCalls.length === 0) {
    return null;
  }

  const info: CompletionInfo = {
    hasContent: !!message.content,
    hasFiles: false,
    fileCount: 0,
    contentLength: typeof message.content === 'string' ? message.content.length : 0,
    isSuccessful: completedCalls.length > 0,
  };

  // 提取文件信息
  const files: string[] = [];
  completedCalls.forEach(tc => {
    // 兼容多种返回格式
    const result: any = tc.result;
    if (typeof result === 'string') {
        // 尝试从字符串中提取路径（启发式）
        if (result.includes('Successfully wrote to ')) {
            const path = result.replace('Successfully wrote to ', '').trim();
            files.push(path);
        }
    } else if (result && typeof result === 'object') {
        if (result.path) files.push(result.path);
        if (result.paths) files.push(...result.paths);
        if (result.files) files.push(...result.files);
    }
  });

  if (files.length > 0) {
    info.hasFiles = true;
    info.fileCount = files.length;
    info.firstFile = files[0];
  }

  return info;
}

/**
 * 任务完成横幅主组件 - 极致简约版
 */
export const TaskCompletionBanner: React.FC<TaskCompletionBannerProps> = ({
  message,
  onOpenFile,
  onCopyContent,
}) => {
  const info = extractCompletionInfo(message);

  // 如果不成功，或者没有生成文件且不是复杂任务，则不显示
  if (!info || !info.isSuccessful || (!info.hasFiles && info.contentLength! < 500)) {
    return null;
  }

  return (
    <div className="mt-2 mb-1 px-1 animate-in fade-in slide-in-from-bottom-1 duration-500">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
        <div className="flex items-center gap-1.5 py-0.5 px-1.5 rounded bg-green-500/5 border border-green-500/10">
          <CheckCircle className="w-3 h-3 text-green-500/70" />
          <span className="text-green-500/80 font-medium">任务已完成</span>
        </div>

        {info.hasFiles && (
          <div className="flex items-center gap-2">
            <span className="opacity-50">|</span>
            <span className="flex items-center gap-1">
              <FolderOpen size={10} className="opacity-70" />
              已生成 {info.fileCount} 个文件:
            </span>
            <div className="flex flex-wrap gap-2">
              {message.toolCalls
                ?.filter(tc => tc.status === 'completed')
                .flatMap(tc => {
                  const result: any = tc.result;
                  const files: string[] = [];
                  if (typeof result === 'string' && result.includes('wrote to ')) {
                      files.push(result.replace('Successfully wrote to ', '').trim());
                  } else if (result && typeof result === 'object') {
                      if (result.path) files.push(result.path);
                      if (result.paths) files.push(...result.paths);
                      if (result.files) files.push(...result.files);
                  }
                  return files;
                })
                .slice(0, 3)
                .map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => onOpenFile?.(file)}
                    className="hover:text-blue-400 hover:underline transition-colors font-mono truncate max-w-[120px]"
                  >
                    {file.split('/').pop()}
                  </button>
                ))}
              {info.fileCount > 3 && <span>...</span>}
            </div>
          </div>
        )}

        {info.hasContent && (
          <div className="flex items-center gap-2">
            <span className="opacity-50">|</span>
            <span>{info.contentLength} 字符</span>
            <button
              onClick={() => onCopyContent?.(typeof message.content === 'string' ? message.content : '')}
              className="text-blue-500/60 hover:text-blue-400 transition-colors"
            >
              复制
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
