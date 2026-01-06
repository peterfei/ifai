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
  if (!message.toolCalls || message.toolCalls.length === 0) {
    // 没有工具调用，检查是否有内容
    const content = typeof message.content === 'string' ? message.content : '';
    if (content && content.trim()) {
      return {
        hasContent: true,
        hasFiles: false,
        fileCount: 0,
        contentLength: content.length,
        isSuccessful: true,
      };
    }
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
    const result: any = tc.result;
    if (result?.path) files.push(result.path);
    if (result?.paths) files.push(...result.paths);
    if (result?.files) files.push(...result.files);
  });

  if (files.length > 0) {
    info.hasFiles = true;
    info.fileCount = files.length;
    info.firstFile = files[0];
  }

  return info;
}

/**
 * 任务完成横幅主组件 - 简洁版
 */
export const TaskCompletionBanner: React.FC<TaskCompletionBannerProps> = ({
  message,
  onOpenFile,
  onCopyContent,
}) => {
  const info = extractCompletionInfo(message);

  if (!info || !info.isSuccessful) {
    return null;
  }

  return (
    <div className="mt-3 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 简洁横幅 */}
      <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 px-4 py-3">
        {/* 成功提示 - 简洁 */}
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-sm text-gray-300">
            {info.hasFiles && `已生成 ${info.fileCount} 个文件`}
            {!info.hasFiles && info.hasContent && '内容已生成'}
          </span>
        </div>

        {/* 文件列表 - 简洁 */}
        {info.hasFiles && (
          <div className="space-y-1.5 ml-7">
            {message.toolCalls
              ?.filter(tc => tc.status === 'completed')
              .flatMap(tc => {
                const result: any = tc.result;
                const files: string[] = [];
                if (result?.path) files.push(result.path);
                if (result?.paths) files.push(...result.paths);
                if (result?.files) files.push(...result.files);
                return files;
              })
              .slice(0, 5)
              .map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 cursor-pointer transition-colors"
                  onClick={() => onOpenFile?.(file)}
                  title="点击打开文件"
                >
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  <span className="font-mono truncate">{file}</span>
                </div>
              ))}
          </div>
        )}

        {/* 内容摘要 - 简洁 */}
        {info.hasContent && !info.hasFiles && (
          <div className="ml-7">
            <div className="text-xs text-gray-500">
              {info.contentLength} 字符
              <button
                onClick={() => onCopyContent?.(typeof message.content === 'string' ? message.content : '')}
                className="ml-3 text-blue-400 hover:text-blue-300 transition-colors"
              >
                复制内容
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
