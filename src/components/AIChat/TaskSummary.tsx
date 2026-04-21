/**
 * 任务完成总结组件
 * 在所有工具调用完成后显示生成的文件、路径等信息
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileCheck, CheckCircle, Clock, FileText } from 'lucide-react';
import { Message } from '../../stores/useChatStore';

interface TaskSummaryProps {
  message: Message;
}

interface ToolCallSummary {
  filesCreated: string[];
  directoriesCreated: string[];
  filesRead: string[];
  commandsExecuted: number;
  errors: string[];
  totalToolCalls: number;
  completedToolCalls: number;
}

const TASK_SUMMARY_OPERATION_FAILED = '__TASK_SUMMARY_OPERATION_FAILED__';

/**
 * 从消息的工具调用中提取总结信息
 */
function extractTaskSummary(message: Message): ToolCallSummary | null {
  const toolCalls = message.toolCalls;
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  const summary: ToolCallSummary = {
    filesCreated: [],
    directoriesCreated: [],
    filesRead: [],
    commandsExecuted: 0,
    errors: [],
    totalToolCalls: toolCalls.length,
    completedToolCalls: 0,
  };

  let hasCompletedTools = false;

  toolCalls.forEach(toolCall => {
    // 只统计已完成的工具调用
    if (toolCall.status !== 'completed') {
      return;
    }

    hasCompletedTools = true;
    summary.completedToolCalls++;

    let result: any = toolCall.result;
    if (!result) return;

    // 🔥 FIX: 如果是字符串，尝试解析为 JSON
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        if (parsed && typeof parsed === 'object') {
          result = parsed;
        }
      } catch (e) {
        // 不是有效的 JSON，保持原样
      }
    }

    // 提取文件路径
    if (result.path) {
      if (toolCall.tool?.includes('write_file') || toolCall.tool?.includes('create_file')) {
        summary.filesCreated.push(result.path);
      } else if (toolCall.tool?.includes('read_file')) {
        summary.filesRead.push(result.path);
      }
    }

    // 提取多个路径
    if (result.paths && Array.isArray(result.paths)) {
      result.paths.forEach((path: string) => {
        if (toolCall.tool?.includes('write_file') || toolCall.tool?.includes('create_file')) {
          summary.filesCreated.push(path);
        }
      });
    }

    if (result.files && Array.isArray(result.files)) {
      result.files.forEach((file: string) => {
        summary.filesCreated.push(file);
      });
    }

    // 统计命令执行
    if (toolCall.tool?.includes('execute_command') || toolCall.tool?.includes('command')) {
      summary.commandsExecuted++;
    }

    // 提取错误信息
    if (result.error || result.success === false) {
      summary.errors.push(result.error || TASK_SUMMARY_OPERATION_FAILED);
    }
  });

  // 如果没有已完成的工具调用，返回null
  if (!hasCompletedTools) {
    return null;
  }

  // 如果没有任何内容，返回null
  if (
    summary.filesCreated.length === 0 &&
    summary.directoriesCreated.length === 0 &&
    summary.filesRead.length === 0 &&
    summary.commandsExecuted === 0 &&
    summary.errors.length === 0
  ) {
    return null;
  }

  return summary;
}

export const TaskSummary: React.FC<TaskSummaryProps> = ({ message }) => {
  const { t } = useTranslation();
  const summary = extractTaskSummary(message);

  if (!summary) {
    return null;
  }

  const hasContent =
    summary.filesCreated.length > 0 ||
    summary.directoriesCreated.length > 0 ||
    summary.filesRead.length > 0 ||
    summary.commandsExecuted > 0 ||
    summary.errors.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="theme-panel-elevated theme-border theme-shadow mt-4 overflow-hidden rounded-xl border">
      {/* Header */}
      <div className="theme-panel-muted theme-border flex items-center gap-2 border-b px-4 py-3">
        <CheckCircle className="theme-text-success h-4 w-4" />
        <span className="theme-text text-sm font-bold">{t('taskSummary.title')}</span>
        <span className="theme-text-subtle ml-2 text-xs">
          {t('taskSummary.completedOperations', {
            completed: summary.completedToolCalls,
            total: summary.totalToolCalls,
          })}
        </span>
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {/* 生成的文件 */}
        {summary.filesCreated.length > 0 && (
          <div className="theme-surface-success rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="theme-text-success h-3.5 w-3.5" />
              <span className="theme-text text-xs font-semibold uppercase tracking-wider">
                {t('taskSummary.filesCreated', { count: summary.filesCreated.length })}
              </span>
            </div>
            <div className="space-y-1 ml-5">
              {summary.filesCreated.map((filePath, idx) => (
                <div
                  key={idx}
                  className="theme-panel theme-border flex items-center gap-2 rounded border px-2 py-1.5 transition-colors group hover:border-[var(--success-soft-border)]"
                >
                  <FileCheck className="theme-text-success h-3 w-3 shrink-0" />
                  <code className="theme-text-muted flex-1 truncate font-mono text-xs transition-colors group-hover:text-[var(--success-color)]">
                    {filePath}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 读取的文件 */}
        {summary.filesRead.length > 0 && (
          <div className="theme-surface-info rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="theme-text-info h-3.5 w-3.5" />
              <span className="theme-text text-xs font-semibold uppercase tracking-wider">
                {t('taskSummary.filesRead', { count: summary.filesRead.length })}
              </span>
            </div>
            <div className="space-y-1 ml-5">
              {summary.filesRead.map((filePath, idx) => (
                <div
                  key={idx}
                  className="theme-panel theme-border flex items-center gap-2 rounded border px-2 py-1.5"
                >
                  <FileText className="theme-text-info h-3 w-3 shrink-0" />
                  <code className="theme-text-muted truncate font-mono text-xs">
                    {filePath}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 执行的命令 */}
        {summary.commandsExecuted > 0 && (
          <div className="theme-surface-warning flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
            <Clock className="theme-text-warning h-3.5 w-3.5" />
            <span className="theme-text">
              {t('taskSummary.commandsExecuted', { count: summary.commandsExecuted })}
            </span>
          </div>
        )}

        {/* 错误信息 */}
        {summary.errors.length > 0 && (
          <div className="theme-surface-danger rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="theme-text text-xs font-semibold uppercase tracking-wider">
                {t('taskSummary.errors', { count: summary.errors.length })}
              </span>
            </div>
            <div className="space-y-1 ml-5">
              {summary.errors.map((error, idx) => (
                <div
                  key={idx}
                  className="theme-panel theme-border theme-text rounded border px-2 py-1.5 text-xs"
                >
                  {error === TASK_SUMMARY_OPERATION_FAILED ? t('taskSummary.operationFailed') : error}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
