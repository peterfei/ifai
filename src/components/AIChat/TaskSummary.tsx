/**
 * 任务完成总结组件
 * 在所有工具调用完成后显示生成的文件、路径等信息
 */

import React from 'react';
import { FileCheck, FolderOpen, CheckCircle, Clock, FileText } from 'lucide-react';
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

    const result: any = toolCall.result;
    if (!result) return;

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
      summary.errors.push(result.error || 'Operation failed');
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
    <div className="mt-4 p-4 rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle className="w-4 h-4 text-green-400" />
        <span className="text-sm font-bold text-gray-200">生成完成</span>
        <span className="text-xs text-gray-500 ml-2">
          {summary.completedToolCalls}/{summary.totalToolCalls} 操作已完成
        </span>
      </div>

      {/* Content */}
      <div className="space-y-3">
        {/* 生成的文件 */}
        {summary.filesCreated.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                生成的文件 ({summary.filesCreated.length})
              </span>
            </div>
            <div className="space-y-1 ml-5">
              {summary.filesCreated.map((filePath, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700/30 hover:border-green-500/30 transition-colors group"
                >
                  <FileCheck className="w-3 h-3 text-green-400 shrink-0" />
                  <code className="text-xs text-gray-300 font-mono truncate flex-1 group-hover:text-green-300 transition-colors">
                    {filePath}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 读取的文件 */}
        {summary.filesRead.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                读取的文件 ({summary.filesRead.length})
              </span>
            </div>
            <div className="space-y-1 ml-5">
              {summary.filesRead.map((filePath, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700/30"
                >
                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                  <code className="text-xs text-gray-400 font-mono truncate">
                    {filePath}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 执行的命令 */}
        {summary.commandsExecuted > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>执行了 {summary.commandsExecuted} 个命令</span>
          </div>
        )}

        {/* 错误信息 */}
        {summary.errors.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                错误 ({summary.errors.length})
              </span>
            </div>
            <div className="space-y-1 ml-5">
              {summary.errors.map((error, idx) => (
                <div
                  key={idx}
                  className="px-2 py-1.5 bg-red-500/10 rounded border border-red-500/20 text-xs text-red-300"
                >
                  {error}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
