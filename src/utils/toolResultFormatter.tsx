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
      // 🏆 PIVO 3.0: 物理保真度修复 - 不要尝试解析文件内容原文
      // 除非内容非常短且看起来像包装对象（如 { success: true, content: "..." }）
      if (result.length < 1000 && result.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(result);
          if (parsed && typeof parsed === 'object' && (parsed.content !== undefined || parsed.success !== undefined)) {
            return formatToolResultToMarkdown(parsed, toolCall);
          }
        } catch {}
      }

      // 否则，它就是文件内容原文，直接显示简洁格式
      const lines = result === '' ? 0 : result.split('\n').length;
      const sizeKB = (result.length / 1024).toFixed(2);
      const filePath = toolCall?.args?.rel_path || toolCall?.args?.path || toolCall?.args?.relPath || 'unknown';
      return `📄 已读取文件 \`${filePath}\` (${lines} 行, ${sizeKB} KB)`;
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

  // 🔥 FIX: 处理 agent_write_file 的特殊结构 (PIVO 2.0 简洁模式)
  if (result.filePath && result.success !== undefined) {
    return `### ✅ 文件操作成功\n\n**📄 目标路径:** \`${result.filePath}\`\n\n${result.message || '文件已同步物理磁盘。'}`;
  }

  // 🏆 FIX: 处理 agent_scan_project 的特殊结构（支持直接格式和 output 包装格式）
  // 🚨 注意：不转换为 Markdown，保持原始 JSON 格式，让 MessageItem.tsx 渲染 PivoProjectTree
  if (result.structure || result.key_files ||
      (result.output && (typeof result.output === 'string' || typeof result.output === 'object'))) {
    // 检查是否包含 project scan 数据
    let scanData = null;

    // 情况 1: 直接包含 structure/key_files
    if (result.structure || result.key_files) {
      scanData = result;
    }
    // 情况 2: 包装在 output 字段中（JSON 字符串）
    else if (result.output && typeof result.output === 'string') {
      try {
        const outputParsed = JSON.parse(result.output);
        if (outputParsed.structure || outputParsed.key_files) {
          scanData = outputParsed;
        }
      } catch (e) {}
    }
    // 情况 3: output 是对象
    else if (result.output && typeof result.output === 'object') {
      if (result.output.structure || result.output.key_files) {
        scanData = result.output;
      }
    }

    // 如果包含项目扫描数据，返回纯净的 scanData JSON（不包含外层的 status/output 包装）
    if (scanData) {
      return JSON.stringify(scanData, null, 2);
    }
  }

  // 🔥 FIX: 处理 agent_write_file 的特殊结构 (PIVO 2.0 简洁模式)
  if (result.filePath && result.success !== undefined) {
    return `### ✅ 文件操作成功\n\n**📄 目标路径:** \`${result.filePath}\`\n\n${result.message || '文件已同步物理磁盘。'}`;
  }
  let scanData = null;

  // 情况 1: 直接包含 structure/key_files
  if (result.structure || result.key_files) {
    scanData = result;
  }
  // 情况 2: 包装在 output 字段中（JSON 字符串）
  else if (result.output && typeof result.output === 'string') {
    try {
      const parsed = JSON.parse(result.output);
      if (parsed.structure || parsed.key_files) {
        scanData = parsed;
      }
    } catch (e) {
      // 解析失败，忽略
    }
  }
  // 情况 3: output 是对象
  else if (result.output && typeof result.output === 'object') {
    if (result.output.structure || result.output.key_files) {
      scanData = result.output;
    }
  }

  if (scanData) {
    const lines: string[] = ['## 📂 项目扫描结果\n\n'];

    // 处理文件结构
    if (scanData.structure && typeof scanData.structure === 'object') {
      lines.push('### 📁 文件结构\n\n');
      const structure = scanData.structure as Record<string, string>;

      // 分离文件和目录
      const files: string[] = [];
      const dirs: string[] = [];
      for (const [path, type] of Object.entries(structure)) {
        if (type === 'dir' || path.endsWith('/')) {
          dirs.push(path);
        } else {
          files.push(path);
        }
      }

      // 先显示目录，再显示文件
      if (dirs.length > 0) {
        dirs.sort().forEach(dir => {
          lines.push(`📁 \`${dir}\`\n`);
        });
      }
      if (files.length > 0) {
        files.sort().forEach(file => {
          lines.push(`📄 \`${file}\`\n`);
        });
      }
      lines.push('\n');
    }

    // 处理关键文件
    if (scanData.key_files && typeof scanData.key_files === 'object') {
      const keyFiles = scanData.key_files as Record<string, string>;
      const fileCount = Object.keys(keyFiles).length;

      if (fileCount > 0) {
        lines.push(`### 📝 关键文件 (${fileCount} 个)\n\n`);

        for (const [path, content] of Object.entries(keyFiles)) {
          lines.push(`#### \`${path}\`\n\n`);

          // 截断过长的文件内容
          const maxContentLength = 500;
          const displayContent = content.length > maxContentLength
            ? content.substring(0, maxContentLength) + `\n\n... (已截断，共 ${content.length} 字符)`
            : content;

          lines.push(`\`\`\`\n${displayContent}\n\`\`\`\n\n`);
        }
      }
    }

    return lines.join('');
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
  if (result.message && typeof result.message === 'string') {
    lines.push(`**💬 Message:** ${result.message}\n`);
  }

  // 处理命令执行结果
  if (result.stdout !== undefined || result.stderr !== undefined || result.command !== undefined) {
    const command = result.command;
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const exitCode = result.exitCode !== undefined ? result.exitCode : result.exit_code;
    const success = result.success !== undefined ? result.success : (exitCode === 0);

    if (success) {
      lines.push(`### ✅ 命令执行成功\n`);
    } else {
      lines.push(`### ❌ 命令执行失败\n`);
    }

    if (command) {
      lines.push(`**🔧 执行的命令:**\n`);
      lines.push(`\`\`\`bash\n${command}\n\`\`\`\n\n`);
    }

    if (stdout) {
      const stdoutLines = stdout.split('\n').length;
      lines.push(`**📤 标准输出** (${stdoutLines} 行):\n`);
      lines.push(`\`\`\`\n${stdout}\n\`\`\`\n\n`);
    }

    if (stderr) {
      const stderrLines = stderr.split('\n').length;
      lines.push(`**⚠️ 错误输出** (${stderrLines} 行):\n`);
      lines.push('```\n' + stderr + '\n```\n\n');
    }

    if (exitCode !== undefined) {
      const exitIcon = exitCode === 0 ? '✅' : '❌';
      lines.push(`**🔚 退出码:** ${exitIcon} ${exitCode}\n`);
    }

    return lines.join('\n');
  }

  // 处理内容
  if (result.content) {
    const contentValue = result.content;
    if (contentValue.length > 200) {
      const preview = contentValue.slice(0, 200);
      lines.push(`**📝 Content Preview:**\n\`\`\`\n${preview}...\n\`\`\`\n`);
    } else {
      lines.push(`**📝 Content:**\n\`\`\`\n${contentValue}\n\`\`\`\n`);
    }
  }

  // 处理其他字段
  const handledKeys = new Set([
    'success', 'path', 'paths', 'files', 'error', 'message',
    'command', 'stdout', 'stderr', 'exitCode', 'exit_code',
    'filePath', 'originalContent', 'newContent', 'timestamp',
    'original_content', 'new_content', 'file_path', 'rel_path', 'relPath', 'rootPath', 'root_path',
    'metadata', // 🚀 隐藏复杂的执行元数据
    'structure', 'key_files', // 🏆 agent_scan_project 的字段
    'output', 'status' // 🏆 后端包装字段
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
  }

  const markdown = lines.join('\n');
  return markdown.trim() ? markdown : `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
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
 * 清理路径或文本中的转义字符
 */
function cleanRawString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  const addPath = (p: string) => {
    if (!p || typeof p !== 'string') return;
    const cleaned = cleanRawString(p);
    if (!cleaned) return;
    if (!summary.filesCreated) summary.filesCreated = [];
    if (!summary.filesCreated.includes(cleaned)) {
      summary.filesCreated.push(cleaned);
    }
  };

  // 提取文件路径
  if (result.path) {
    addPath(result.path);
  }

  if (result.paths && Array.isArray(result.paths)) {
    result.paths.forEach(addPath);
  }

  if (result.files && Array.isArray(result.files)) {
    result.files.forEach(addPath);
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
