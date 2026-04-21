/**
 * 任务完成横幅组件 - 简洁版
 * 在生成完成后紧跟内容显示，提供简洁的文字反馈
 */

import React from 'react';
import { CheckCircle, FolderOpen } from 'lucide-react';
import { Message } from '../../stores/useChatStore';
import { useTranslation } from 'react-i18next';

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
  const cleanPath = (p: string) => {
    if (!p || typeof p !== 'string') return '';
    // 如果字符串包含换行，或者明显是一个 Markdown 区块，那它肯定不是路径
    if (p.includes('\n') || p.includes('`') || p.length > 255) return '';
    const cleaned = p.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim();
    // 再次检查清理后的路径是否包含非法字符
    if (cleaned.includes(' ') && !cleaned.includes('/') && !cleaned.includes('\\')) return '';
    return cleaned;
  };

  completedCalls.forEach(tc => {
    // 兼容多种返回格式
    const result: any = tc.result;
    if (typeof result === 'string') {
        // 尝试从字符串中提取路径（启发式）
        if (result.includes('Successfully wrote to ')) {
            const path = result.replace('Successfully wrote to ', '').split('\n')[0].trim();
            const cp = cleanPath(path);
            if (cp) files.push(cp);
        }
    } else if (result && typeof result === 'object') {
        if (result.path) {
            const cp = cleanPath(result.path);
            if (cp) files.push(cp);
        }
        if (result.paths && Array.isArray(result.paths)) {
            result.paths.forEach((p: string) => {
                const cp = cleanPath(p);
                if (cp) files.push(cp);
            });
        }
        if (result.files && Array.isArray(result.files)) {
            result.files.forEach((p: string) => {
                const cp = cleanPath(p);
                if (cp) files.push(cp);
            });
        }
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
  const { t } = useTranslation();
  const info = extractCompletionInfo(message);

  // 如果不成功，或者没有生成文件且不是复杂任务，则不显示
  if (!info || !info.isSuccessful || (!info.hasFiles && info.contentLength! < 500)) {
    return null;
  }

  return (
    <div className="mt-2 mb-1 px-1 animate-in fade-in slide-in-from-bottom-1 duration-500">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] theme-text-subtle">
        <div className="theme-badge-success flex items-center gap-1.5 rounded px-1.5 py-0.5">
          <CheckCircle className="h-3 w-3" />
          <span className="font-medium">{t('aiChat.taskCompletion.completed')}</span>
        </div>

        {info.hasFiles && (
          <div className="flex items-center gap-2">
            <span className="opacity-50">|</span>
            <span className="flex items-center gap-1">
              <FolderOpen size={10} className="opacity-70" />
              {t('aiChat.taskCompletion.generatedFiles', { count: info.fileCount })}
            </span>
            <div className="flex flex-wrap gap-2">
              {message.toolCalls
                ?.filter(tc => tc.status === 'completed')
                .flatMap(tc => {
                  const result: any = tc.result;
                  const files: string[] = [];
                  const cleanP = (p: string) => p.replace(/\\n/g, ' ').replace(/\n/g, ' ').trim();
                  if (typeof result === 'string' && result.includes('wrote to ')) {
                      files.push(cleanP(result.replace('Successfully wrote to ', '').trim()));
                  } else if (result && typeof result === 'object') {
                      if (result.path) files.push(cleanP(result.path));
                      if (result.paths) result.paths.forEach((p: string) => files.push(cleanP(p)));
                      if (result.files) result.files.forEach((p: string) => files.push(cleanP(p)));
                  }
                  return files;
                })
                .slice(0, 3)
                .map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => onOpenFile?.(file)}
                    className="theme-text-accent max-w-[120px] truncate font-mono transition-colors hover:text-[var(--accent-hover)] hover:underline"
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
            <span>{t('aiChat.taskCompletion.characters', { count: info.contentLength })}</span>
            <button
              onClick={() => onCopyContent?.(typeof message.content === 'string' ? message.content : '')}
              className="theme-text-accent transition-colors hover:text-[var(--accent-hover)]"
            >
              {t('common.copy')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
