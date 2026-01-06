/**
 * 工具调用结果格式化器
 * 将JSON格式的工具调用结果转换为易读的Markdown格式
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { File, Folder, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

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
export function formatToolResultToMarkdown(result: any): string {
  if (!result) return '';

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
  if (result.message) {
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

  if (result.exitCode !== undefined) {
    const exitIcon = result.exitCode === 0 ? '✅' : '❌';
    lines.push(`**🔚 Exit Code:** ${exitIcon} ${result.exitCode}\n`);
  }

  // 处理内容
  if (result.content) {
    const content = result.content;
    const isLongContent = content.length > 200;

    if (isLongContent) {
      const preview = content.slice(0, 200);
      lines.push(`**📝 Content Preview:**\n\`\`\`\n${preview}...\n\`\`\`\n`);
      lines.push(`_(${(content.length / 1024).toFixed(1)} KB, ${content.split('\n').length} lines)_\n`);
    } else {
      lines.push(`**📝 Content:**\n\`\`\`\n${content}\n\`\`\`\n`);
    }
  }

  // 处理其他字段
  const handledKeys = new Set([
    'success', 'path', 'paths', 'files', 'error', 'message',
    'command', 'stdout', 'stderr', 'exitCode', 'content'
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
