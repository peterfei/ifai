/**
 * 工具调用结果格式化器
 * 将JSON格式的工具调用结果转换为易读的Markdown格式
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { File, Folder, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { diffLines } from 'diff';

export interface ToolResult {
  success?: boolean;
  path?: string;
  paths?: string[];
  content?: string;
  error?: string;
  message?: string;
  files?: string[];
  command?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  [key: string]: any;
}

/**
 * 格式化工具调用结果为Markdown
 */
export function formatToolResultToMarkdown(result: any, toolCall?: any): string {
  if (!result) return '';

  console.log('[formatToolResultToMarkdown] result keys:', Object.keys(result));
  console.log('[formatToolResultToMarkdown] result.newContent:', result.newContent ? result.newContent.substring(0, 50) : 'undefined');
  console.log('[formatToolResultToMarkdown] result.originalContent:', result.originalContent ? result.originalContent.substring(0, 50) : 'undefined');

  // 如果结果是字符串，直接返回
  if (typeof result === 'string') {
    // 尝试解析JSON字符串
    try {
      const parsed = JSON.parse(result);
      return formatToolResultToMarkdown(parsed);
    } catch {
      // 不是JSON，返回原字符串
      return result;
    }
  }

  // 处理数组类型的结果
  if (Array.isArray(result)) {
    if (result.length === 0) {
      return '_No results_';
    }

    // 检查是否是文件列表
    if (result.every(item => typeof item === 'string' && item.includes('/'))) {
      return `## 📁 Generated Files\n\n${result.map(path => `- \`${path}\``).join('\n')}`;
    }

    // 普通数组
    return result.map(item => formatToolResultToMarkdown(item)).join('\n\n');
  }

  const lines: string[] = [];

  // 🔥 FIX: 处理 agent_write_file 的特殊结构
  if (result.filePath && result.success !== undefined) {
    // 这是 agent_write_file 的结果
    lines.push(`### ✅ 文件写入成功\n`);

    // 文件路径
    lines.push(`**📄 文件路径:** \`${result.filePath}\`\n`);

    // 原始内容信息（用于回滚）
    if (result.originalContent !== undefined) {
      if (result.originalContent === '') {
        lines.push(`**📝 操作类型:** 新建文件\n`);
      } else {
        const originalLines = result.originalContent.split('\n').length;
        const originalSize = (result.originalContent.length / 1024).toFixed(2);
        lines.push(`**📝 操作类型:** 覆盖已有文件\n`);

        // 🔥 显示增减信息（类似 git diff）
        // 优先从 result.newContent 获取新内容，如果没有则从 toolCall.args 获取
        const newContent = result.newContent || toolCall?.args?.content || '';
        const newLines = newContent ? newContent.split('\n').length : 0;

        // 🔥 先不显示变更统计，等智能 diff 检测完成后再显示
        // lines.push(`**📊 变更统计:** -${originalLines} +${newLines} 行\n`);
        lines.push(`**📁 原始文件:** ${originalLines} 行，${originalSize} KB\n`);

        // 🔥 智能diff：检测行级别变化
        if (newContent && result.originalContent) {
          const originalLinesList = result.originalContent.split('\n');
          const newLinesList = newContent.split('\n');

          // 🔥 先检测是否只是行号前缀变化（如 "1 xxx" -> "2 xxx"）
          const isLineNumberChange = originalLinesList.length > 0 && newLinesList.length > 0;
          let hasLineNumberPrefix = false;

          if (isLineNumberChange) {
            // 检查第一行是否匹配行号模式：数字 + 空格 + 内容
            const firstOriginalLine = originalLinesList[0];
            const firstNewLine = newLinesList[0];
            const lineNumberRegex = /^(\d+)\s+(.+)$/;

            const originalMatch = firstOriginalLine.match(lineNumberRegex);
            const newMatch = firstNewLine.match(lineNumberRegex);

            if (originalMatch && newMatch) {
              // 检查内容是否相同（只是行号变了）
              if (originalMatch[2] === newMatch[2]) {
                hasLineNumberPrefix = true;
              }
            }
          }

          if (hasLineNumberPrefix) {
            // 🔥 行号模式：只显示真正变化的内容
            const removedLines: string[] = [];
            const addedLines: string[] = [];
            const lineNumberRegex = /^(\d+)\s+(.+)$/;

            // 构建原始内容的映射（去掉行号）
            const originalContentMap = new Map<string, number[]>(); // 内容 -> 行号数组
            originalLinesList.forEach((line, idx) => {
              const match = line.match(lineNumberRegex);
              if (match) {
                const content = match[2];
                if (!originalContentMap.has(content)) {
                  originalContentMap.set(content, []);
                }
                originalContentMap.get(content)!.push(parseInt(match[1]));
              }
            });

            // 构建新内容的映射
            const newContentMap = new Map<string, number[]>(); // 内容 -> 行号数组
            newLinesList.forEach((line, idx) => {
              const match = line.match(lineNumberRegex);
              if (match) {
                const content = match[2];
                if (!newContentMap.has(content)) {
                  newContentMap.set(content, []);
                }
                newContentMap.get(content)!.push(parseInt(match[1]));
              }
            });

            // 找出被删除的内容（在原始中有，在新内容中没有）
            for (const [content, originalLineNumbers] of originalContentMap) {
              if (!newContentMap.has(content)) {
                // 内容被完全删除
                originalLineNumbers.forEach(lineNum => {
                  removedLines.push(`${lineNum} ${content}`);
                });
              }
            }

            // 找出被新增的内容（在新内容中有，在原始中没有）
            for (const [content, newLineNumbers] of newContentMap) {
              if (!originalContentMap.has(content)) {
                // 内容被新增
                newLineNumbers.forEach(lineNum => {
                  addedLines.push(`${lineNum} ${content}`);
                });
              }
            }

            // 🔥 智能模式：显示实际变化的行数统计
            lines.push(`**📊 变更统计:** -${removedLines.length} +${addedLines.length} 行（只统计真正变化的行）\n`);

            // 显示被删除的内容
            if (removedLines.length > 0) {
              lines.push(`**🗑️ 被删除内容** (共 ${removedLines.length} 行):\n`);
              lines.push(`\`\`\`diff\n`);
              const previewLines = Math.min(20, removedLines.length);
              for (let i = 0; i < previewLines; i++) {
                const line = removedLines[i];
                if (line.trim()) {
                  lines.push(`-${line}\n`);  // 🔥 智能模式：行号是内容的一部分，不添加空格
                }
              }
              if (removedLines.length > 20) {
                lines.push(`... (还有 ${removedLines.length - 20} 行)\n`);
              }
              lines.push(`\`\`\`\n`);
            }

            // 显示被新增的内容
            if (addedLines.length > 0) {
              lines.push(`**✨ 新增内容** (共 ${addedLines.length} 行):\n`);
              lines.push(`\`\`\`diff\n`);
              const previewLines = Math.min(20, addedLines.length);
              for (let i = 0; i < previewLines; i++) {
                const line = addedLines[i];
                if (line.trim()) {
                  lines.push(`+${line}\n`);  // 🔥 智能模式：行号是内容的一部分，不添加空格
                }
              }
              if (addedLines.length > 20) {
                lines.push(`... (还有 ${addedLines.length - 20} 行)\n`);
              }
              lines.push(`\`\`\`\n`);
            }
          } else {
            // 🔥 非行号模式：使用简单的逐行对比
            const removedLines: string[] = [];
            const addedLines: string[] = [];

            const maxLines = Math.max(originalLinesList.length, newLinesList.length);

            for (let i = 0; i < maxLines; i++) {
              const originalLine = originalLinesList[i] || '';
              const newLine = newLinesList[i] || '';

              if (originalLine && !newLine) {
                removedLines.push(originalLine);
              } else if (!originalLine && newLine) {
                addedLines.push(newLine);
              } else if (originalLine !== newLine) {
                removedLines.push(originalLine);
                addedLines.push(newLine);
              }
            }

            // 🔥 非行号模式：显示实际变化的行数统计
            lines.push(`**📊 变更统计:** -${removedLines.length} +${addedLines.length} 行\n`);

            // 显示被删除的内容
            if (removedLines.length > 0) {
              lines.push(`**🗑️ 被删除内容** (共 ${removedLines.length} 行):\n`);
              lines.push(`\`\`\`diff\n`);
              const previewLines = Math.min(20, removedLines.length);
              for (let i = 0; i < previewLines; i++) {
                const line = removedLines[i];
                if (line.trim()) {
                  lines.push(`- ${line}\n`);  // 🔥 在 - 后面添加空格，符合标准 diff 格式
                }
              }
              if (removedLines.length > 20) {
                lines.push(`... (还有 ${removedLines.length - 20} 行)\n`);
              }
              lines.push(`\`\`\`\n`);
            }

            // 显示被新增的内容
            if (addedLines.length > 0) {
              lines.push(`**✨ 新增内容** (共 ${addedLines.length} 行):\n`);
              lines.push(`\`\`\`diff\n`);
              const previewLines = Math.min(20, addedLines.length);
              for (let i = 0; i < previewLines; i++) {
                const line = addedLines[i];
                if (line.trim()) {
                  lines.push(`+ ${line}\n`);  // 🔥 在 + 后面添加空格，符合标准 diff 格式
                }
              }
              if (addedLines.length > 20) {
                lines.push(`... (还有 ${addedLines.length - 20} 行)\n`);
              }
              lines.push(`\`\`\`\n`);
            }
          }
        }
      }
    }

    // 写入的文件信息
    if (result.message) {
      // 🔥 FIX: 处理双重序列化的 message
      let messageContent = result.message;
      if (typeof messageContent === 'string') {
        try {
          const parsedMsg = JSON.parse(messageContent);
          if (parsedMsg.message) {
            messageContent = parsedMsg.message;
          }
        } catch {
          // 保持原样
        }
      }
      lines.push(`**💬 结果:** ${messageContent}\n`);
    }

    return lines.join('\n');
  }

  // 处理成功/失败状态
  if (result.success !== undefined) {
    const icon = result.success ? '✅' : '❌';
    const status = result.success ? 'Success' : 'Failed';
    lines.push(`### ${icon} ${status}\n`);
  }

  // 处理路径信息
  if (result.path) {
    lines.push(`**📄 File:** \`${result.path}\`\n`);
  }

  // 处理多个路径
  if (result.paths && Array.isArray(result.paths) && result.paths.length > 0) {
    lines.push(`**📁 Files (${result.paths.length}):**\n`);
    result.paths.forEach((path: string, idx: number) => {
      lines.push(`${idx + 1}. \`${path}\`\n`);
    });
    lines.push('');
  }

  // 处理文件列表
  if (result.files && Array.isArray(result.files) && result.files.length > 0) {
    lines.push(`**📁 Files (${result.files.length}):**\n`);
    result.files.forEach((file: string, idx: number) => {
      lines.push(`${idx + 1}. \`${file}\`\n`);
    });
    lines.push('');
  }

  // 处理错误信息
  if (result.error) {
    lines.push(`**❌ Error:** \`${result.error}\`\n`);
  }

  // 处理消息
  if (result.message && typeof result.message === 'string') {
    lines.push(`**💬 Message:** ${result.message}\n`);
  }

  // 处理命令执行结果
  if (result.command) {
    lines.push(`**🔧 Command:** \`${result.command}\`\n`);
  }

  if (result.stdout) {
    lines.push(`**📤 Output:**\n\`\`\`\n${result.stdout}\n\`\`\`\n`);
  }

  if (result.stderr) {
    lines.push(`**⚠️ Stderr:**\n\`\`\`\n${result.stderr}\n\`\`\`\n`);
  }

  const exitCode = result.exitCode !== undefined ? result.exitCode : result.exit_code;
  if (exitCode !== undefined) {
    const exitIcon = exitCode === 0 ? '✅' : '❌';
    lines.push(`**🔚 Exit Code:** ${exitIcon} ${exitCode}\n`);
  }

  // 处理内容
  if (result.content) {
    const contentValue = result.content;
    const isLongContent = contentValue.length > 200;

    if (isLongContent) {
      const preview = contentValue.slice(0, 200);
      const contentLines = contentValue.split('\n').length;
      const sizeKB = (contentValue.length / 1024).toFixed(2);
      lines.push(`**📝 Content Preview:**\n\`\`\`\n${preview}...\n\`\`\`\n`);
      lines.push(`_(${sizeKB} KB, ${contentLines} lines)_\n`);
    } else {
      lines.push(`**📝 Content:**\n\`\`\`\n${contentValue}\n\`\`\`\n`);
    }
  }

  // 处理其他字段
  const handledKeys = new Set([
    'success', 'path', 'paths', 'files', 'error', 'message',
    'command', 'stdout', 'stderr', 'exitCode', 'exit_code',
    'filePath', 'originalContent', 'newContent', 'timestamp'  // agent_write_file 特有字段
  ]);

  const otherKeys = Object.keys(result).filter(key => !handledKeys.has(key));
  if (otherKeys.length > 0) {
    lines.push(`**📋 Additional Info:**\n`);
    otherKeys.forEach(key => {
      const value = result[key];
      if (value !== undefined && value !== null) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        lines.push(`- **${key}:** ${displayValue}`);
      }
    });
    lines.push('');
  }

  const markdown = lines.join('\n');

  // 如果没有任何内容，返回原始JSON的格式化版本
  if (!markdown.trim()) {
    return `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
  }

  return markdown;
}

/**
 * 格式化工具调用结果为React组件（带样式）
 */
export function FormattedToolResult({ result }: { result: any }) {
  const markdown = formatToolResultToMarkdown(result);

  return (
    <div className="formatted-tool-result">
      <ReactMarkdown
        components={{
          h1: ({node, ...props}) => <h1 {...props} className="text-lg font-bold text-gray-200 mb-2" />,
          h2: ({node, ...props}) => <h2 {...props} className="text-base font-bold text-gray-300 mb-2" />,
          h3: ({node, ...props}) => <h3 {...props} className="text-sm font-bold text-gray-400 mb-1" />,
          p: ({node, ...props}) => <p {...props} className="text-sm text-gray-300 mb-2" />,
          ul: ({node, ...props}) => <ul {...props} className="list-disc list-inside mb-2 text-gray-300" />,
          ol: ({node, ...props}) => <ol {...props} className="list-decimal list-inside mb-2 text-gray-300" />,
          li: ({node, ...props}) => <li {...props} className="ml-4 text-gray-300" />,
          strong: ({node, ...props}) => <strong {...props} className="font-bold text-gray-200" />,
          code({ node, inline, ...rest }: any) {
            if (inline) {
              return (
                <code {...rest} className="px-1 py-0.5 bg-gray-800 text-green-400 rounded text-xs font-mono" />
              );
            }
            return (
              <code {...rest} className="block bg-gray-900 p-2 rounded text-xs text-gray-300 font-mono overflow-x-auto" />
            );
          },
          pre({node, ...props}) {
            return (
              <pre {...props} className="bg-gray-900 p-3 rounded-lg overflow-x-auto mb-2 border border-gray-700" />
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

/**
 * 提取工具调用总结信息（用于生成完成后的总结）
 */
export function extractToolSummary(result: any): {
  filesCreated?: string[];
  filesModified?: string[];
  errors?: string[];
  commandCount?: number;
} {
  if (!result) return {};

  const summary: any = {};

  // 提取文件路径
  if (result.path) {
    if (!summary.filesCreated) summary.filesCreated = [];
    summary.filesCreated.push(result.path);
  }

  if (result.paths && Array.isArray(result.paths)) {
    if (!summary.filesCreated) summary.filesCreated = [];
    summary.filesCreated.push(...result.paths);
  }

  if (result.files && Array.isArray(result.files)) {
    if (!summary.filesCreated) summary.filesCreated = [];
    summary.filesCreated.push(...result.files);
  }

  // 提取错误信息
  if (result.error || !result.success) {
    if (!summary.errors) summary.errors = [];
    summary.errors.push(result.error || 'Operation failed');
  }

  // 统计命令执行
  if (result.command) {
    summary.commandCount = (summary.commandCount || 0) + 1;
  }

  return summary;
}
