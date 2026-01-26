/**
 * 工具调用结果格式化器
 * 将JSON格式的工具调用结果转换为易读的Markdown格式
 */

/**
 * 🔥 v0.3.4 OPT: 系统目录忽略列表
 * 这些目录通常包含大量文件，不感兴趣，应该被过滤
 */
const IGNORED_DIRECTORIES = new Set([
  'node_modules/',
  '.ifai/',
  '.git/',
  'dist/',
  'build/',
  'target/',
  'out/',
  '.next/',
  '.nuxt/',
  'coverage/',
  '.vscode/',
  '.idea/',
  'tmp/',
  'temp/',
]);

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { File, Folder, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { diffLines } from 'diff';

/**
 * 🔥 v0.3.4: 检测是否为 read_file 工具的结果
 * 用于简洁显示模式（类似 Claude Code）
 */
function isReadFileResult(result: any, toolCall?: any): boolean {
  // 🔥 FIX v0.3.4: 首先检查 result 类型，如果是字符串，让后续逻辑先解析JSON
  if (typeof result === 'string') {
    // 字符串需要先解析成对象，不能直接识别为读文件结果
    return false;
  }

  // 方法 1: 检查 toolCall.tool
  if (toolCall?.tool === 'agent_read_file' || toolCall?.tool === 'read_file') {
    return true;
  }

  // 方法 2: 检查结果结构特征
  // 读文件特征：有 path 和 content，但没有 write/delete 的特征
  if (result && typeof result === 'object') {
    const hasPathAndContent = result.path && result.content !== undefined;
    const isNotWriteOperation = !result.filePath && !result.originalContent && !result.newContent;
    return hasPathAndContent && isNotWriteOperation;
  }

  return false;
}

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

  // 🔥 v0.3.4: 读文件简洁显示（方案 A）
  if (isReadFileResult(result, toolCall)) {
    // 🔥 FIX v0.3.4: 处理 content 可能是字符数组的情况
    let content = result.content || '';
    // 如果 content 是字符数组（ifainew_core 的 bug），拼接成字符串
    if (Array.isArray(content) && content.every(item => typeof item === 'string')) {
      console.log('[formatToolResultToMarkdown] 🔥 Content is char array, joining:', content.length, 'chars');
      content = content.join('');
    }

    // 处理空内容：空字符串应该是 0 行
    const lines = content === '' ? 0 : content.split('\n').length;
    const sizeKB = (content.length / 1024).toFixed(2);
    return `📄 已读取文件 \`${result.path}\` (${lines} 行, ${sizeKB} KB)`;
  }

  // 如果结果是字符串，尝试解析JSON
  if (typeof result === 'string') {
    // 🔥 v0.3.4 FIX: 检查是否是 agent_read_file 直接返回字符串（非 JSON）
    // 如果是读文件工具，且结果不是 JSON，可能是纯文本内容
    // 这种情况下，我们不应该显示完整内容，而是简洁格式
    const isReadFileTool = toolCall?.tool === 'agent_read_file' ||
                           toolCall?.tool === 'read_file' ||
                           (toolCall as any)?.function?.name === 'agent_read_file';

    // 🔥 v0.3.4 FIX: 检查是否是 agent_list_dir 返回的字符串（可能是字符数组被拼接后的结果）
    const isListDirTool = toolCall?.tool === 'agent_list_dir' ||
                          toolCall?.tool === 'list_dir' ||
                          (toolCall as any)?.function?.name === 'agent_list_dir';

    if (isReadFileTool) {
      // 尝试解析 JSON（可能是包装格式）
      try {
        const parsed = JSON.parse(result);
        return formatToolResultToMarkdown(parsed, toolCall);
      } catch {
        // 不是 JSON，但这可能是文件内容
        // 🔥 v0.3.4: 读文件简洁显示 - 直接字符串的情况
        // 由于没有 path 信息，我们使用默认格式
        const lines = result === '' ? 0 : result.split('\n').length;
        const sizeKB = (result.length / 1024).toFixed(2);
        // 尝试从 toolCall.args 获取路径
        const filePath = toolCall?.args?.rel_path ||
                        toolCall?.args?.path ||
                        toolCall?.args?.relPath ||
                        'unknown';
        return `📄 已读取文件 \`${filePath}\` (${lines} 行, ${sizeKB} KB)`;
      }
    }

    // 🔥 v0.3.4 FIX: 如果是 agent_list_dir 工具，直接返回简洁格式
    // 不显示完整内容（因为可能是字符数组被拼接后的乱码字符串）
    if (isListDirTool) {
      // 🔥 DEBUG: 添加调试日志
      console.log('[formatToolResultToMarkdown] 🔥 isListDirTool, result type:', typeof result);
      console.log('[formatToolResultToMarkdown] 🔥 result preview:', result.toString().substring(0, 100));

      // 尝试解析 JSON（如果是正常的数组结果）
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          // 是 JSON 数组，递归处理
          console.log('[formatToolResultToMarkdown] 🔥 Parsed JSON array, length:', parsed.length);
          console.log('[formatToolResultToMarkdown] 🔥 First element:', parsed[0]);
          return formatToolResultToMarkdown(parsed, toolCall);
        }
      } catch {
        // 不是 JSON，可能是字符数组被拼接后的字符串
        // 直接返回简洁格式，不显示具体内容
        console.log('[formatToolResultToMarkdown] 🔥 Not JSON array, treating as plain string');
      }

      const dirPath = toolCall?.args?.rel_path ||
                      toolCall?.args?.path ||
                      toolCall?.args?.relPath ||
                      'unknown';
      console.log('[formatToolResultToMarkdown] 🔥 Returning simple format for:', dirPath);
      return `📂 已列出目录 \`${dirPath}\``;
    }

    // 非读文件工具的字符串处理
    try {
      const parsed = JSON.parse(result);
      return formatToolResultToMarkdown(parsed, toolCall);
    } catch {
      // 不是JSON，返回原字符串
      return result;
    }
  }

  // 处理数组类型的结果
  if (Array.isArray(result)) {
    // 🔥 v0.3.4: 优先检查是否是 agent_list_dir 工具（包括空数组）
    const isListDirTool = toolCall?.tool === 'agent_list_dir' ||
                          toolCall?.tool === 'list_dir' ||
                          (toolCall as any)?.function?.name === 'agent_list_dir';

    // 🔥 FIX: 检查是否是字符数组（ifainew_core 的 bug）
    // 🔥 v0.3.4: 更准确的检测 - 字符数组特征：
    // 1. 每个元素都是单个字符的字符串（长度 <= 1）
    // 2. 数组长度大于 10（避免误判小文件列表）
    const isCharArray = result.length > 10 &&
                       result.every(item => typeof item === 'string' && item.length <= 1);

    // 🔥 v0.3.4 FIX: 如果是 agent_list_dir 工具返回的字符数组，直接返回简洁格式
    // 避免拼接成字符串后丢失文件数量信息（因为拼接后无法还原原始文件列表）
    if (isCharArray && isListDirTool) {
      const dirPath = toolCall?.args?.rel_path ||
                      toolCall?.args?.path ||
                      toolCall?.args?.relPath ||
                      'unknown';
      // 字符数组的长度是字符总数，不是文件数量，所以不显示数量
      return `📂 已列出目录 \`${dirPath}\``;
    }

    // 非字符数组的 list_dir 工具结果（正常的文件列表数组）
    if (isListDirTool) {
      const dirPath = toolCall?.args?.rel_path ||
                      toolCall?.args?.path ||
                      toolCall?.args?.relPath ||
                      'unknown';

      // 🔥 v0.3.4: 统计文件和子目录数量
      // 🔥 v0.3.4 OPT: 过滤系统目录（node_modules, .ifai 等）
      let fileCount = 0;
      let dirCount = 0;

      result.forEach((item: string) => {
        // 🔥 v0.3.4 OPT: 跳过系统目录
        if (IGNORED_DIRECTORIES.has(item)) {
          return;
        }

        // 以 '/' 结尾的是目录
        if (item.endsWith('/')) {
          dirCount++;
        } else {
          fileCount++;
        }
      });

      // 根据统计结果生成不同的显示格式
      let statsText = '';
      if (fileCount > 0 && dirCount > 0) {
        statsText = ` (${fileCount} 个文件, ${dirCount} 个子目录)`;
      } else if (fileCount > 0) {
        statsText = ` (${fileCount} 个文件)`;
      } else if (dirCount > 0) {
        statsText = ` (${dirCount} 个子目录)`;
      } else {
        // 空目录：显示 (0 个文件)
        statsText = ` (0 个文件)`;
      }

      return `📂 已列出目录 \`${dirPath}\`${statsText}`;
    }

    if (result.length === 0) {
      return '_No results_';
    }

    if (isCharArray) {
      // 将字符数组拼接成字符串（用于 agent_read_file 等其他工具）
      const joinedString = result.join('');
      // 🔥 FIX v0.3.4: 递归时传递 toolCall 参数
      return formatToolResultToMarkdown(joinedString, toolCall);
    }

    // 🔥 FIX: 检查是否是文件/目录列表（agent_list_dir 的结果，无 toolCall 的情况）
    // 特征：大部分元素是字符串，且包含常见文件名模式（如扩展名、路径分隔符）
    // 🔥 v0.3.4: 排除字符数组（元素长度 > 1）
    const allStrings = result.every(item => typeof item === 'string' && item.length > 1);
    const hasFilePatterns = result.some(item =>
      typeof item === 'string' && (item.includes('.') || item.includes('/') || item.match(/^[a-z_][a-z0-9_]*$/i))
    );

    if (allStrings && hasFilePatterns && result.length >= 2) {
      // 🔥 v0.3.4: 使用简洁格式，不再列出所有文件
      return `📂 已列出目录 (${result.length} 个文件/目录)`;
    }

    // 检查是否是生成的文件路径列表（旧的逻辑，保留兼容）
    if (result.every(item => typeof item === 'string' && item.includes('/'))) {
      // 已有类型检查，这里保持不变
      return `## 📁 Generated Files\n\n${result.map(path => `- \`${path}\``).join('\n')}`;
    }

    // 🔥 FIX: 如果数组包含非字符串元素，使用 JSON 格式显示
    if (!allStrings) {
      return `## 📊 Array (${result.length} items)\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
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

  // 处理命令执行结果（优先级最高，因为这是最常见的情况）
  if (result.stdout !== undefined || result.stderr !== undefined || result.command !== undefined) {
    // 🔥 工业化设计：命令执行结果
    const command = result.command;
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const exitCode = result.exitCode !== undefined ? result.exitCode : result.exit_code;
    const success = result.success !== undefined ? result.success : (exitCode === 0);

    // 执行状态标题
    if (success) {
      lines.push(`### ✅ 命令执行成功\n`);
    } else {
      lines.push(`### ❌ 命令执行失败\n`);
    }

    // 执行的命令
    if (command) {
      lines.push(`**🔧 执行的命令:**\n`);
      lines.push(`\`\`\`bash\n${command}\n\`\`\`\n\n`);
    }

    // 标准输出（只有有内容时才显示）
    if (stdout) {
      const stdoutLines = stdout.split('\n').length;
      if (stdoutLines > 5) {
        // 输出较长，显示统计信息
        lines.push(`**📤 标准输出** (${stdoutLines} 行):\n`);
      } else {
        lines.push(`**📤 标准输出:**\n`);
      }
      lines.push(`\`\`\`\n${stdout}\n\`\`\`\n\n`);
    }

    // 标准错误（只有有内容时才显示）
    if (stderr) {
      const stderrLines = stderr.split('\n').length;
      lines.push(`**⚠️ 错误输出** (${stderrLines} 行):\n`);
      lines.push('```\n' + stderr + '\n```\n\n');
    }

    // 退出码
    if (exitCode !== undefined) {
      const exitIcon = exitCode === 0 ? '✅' : '❌';
      const exitText = exitCode === 0 ? '成功' : '失败';
      lines.push(`**🔚 退出码:** ${exitIcon} ${exitCode} (${exitText})\n`);
    }

    // 执行时间（如果有）
    if (result.elapsed_ms !== undefined) {
      const timeInSeconds = (result.elapsed_ms / 1000).toFixed(2);
      lines.push(`**⏱️ 执行时间:** ${timeInSeconds} 秒\n`);
    }

    // 如果没有任何输出
    if (!stdout && !stderr && exitCode === 0) {
      lines.push(`_命令执行成功，无输出_\n`);
    }

    return lines.join('\n');
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
