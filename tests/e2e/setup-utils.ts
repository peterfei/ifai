import { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES 模块兼容：获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * E2E 测试环境配置选项
 */
export interface E2ETestEnvironmentOptions {
  /**
   * 是否使用真实 AI（不 Mock AI API）
   * @default false
   */
  useRealAI?: boolean;

  /**
   * 真实 AI 的 API Key（可选，如果使用真实 AI 但不想在 localStorage 中配置）
   */
  realAIApiKey?: string;

  /**
   * 真实 AI 的 Base URL（可选）
   */
  realAIBaseUrl?: string;

  /**
   * 真实 AI 的模型名称（可选）
   */
  realAIModel?: string;

  /**
   * 配置文件路径（默认为 tests/e2e/.env.e2e.local）
   */
  configPath?: string;
}

/**
 * 从 .env.e2e.local 文件加载配置
 *
 * @param configPath 配置文件路径
 * @returns 配置对象
 */
function loadE2EConfig(configPath?: string): Record<string, string> {
  const defaultPath = resolve(__dirname, '.env.e2e.local');
  const filePath = configPath || defaultPath;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const config: Record<string, string> = {};

    content.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }
      // 解析 KEY=VALUE 格式
      const match = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        // 移除值两端的引号（如果有）
        config[key] = value.replace(/^['"]|['"]$/g, '');
      }
    });

    return config;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // 文件不存在，返回空配置
      return {};
    }
    console.warn(`[E2E] Warning: Failed to load config from ${filePath}:`, error.message);
    return {};
  }
}

/**
 * 设置 E2E 测试环境，强力锁定应用状态
 *
 * @param page Playwright Page 对象
 * @param options 配置选项
 */
export async function setupE2ETestEnvironment(
  page: Page,
  options: E2ETestEnvironmentOptions = {}
) {
  // 🔥 首先从配置文件加载 AI API 配置
  const fileConfig = loadE2EConfig(options.configPath);

  // 合并配置优先级：命令行参数 > 环境变量 > 配置文件
  const useRealAI = options.useRealAI ?? (fileConfig.E2E_AI_API_KEY ? true : false);
  const realAIApiKey = options.realAIApiKey ?? process.env.E2E_AI_API_KEY ?? fileConfig.E2E_AI_API_KEY;
  const realAIBaseUrl = options.realAIBaseUrl ?? process.env.E2E_AI_BASE_URL ?? fileConfig.E2E_AI_BASE_URL;
  const realAIModel = options.realAIModel ?? process.env.E2E_AI_MODEL ?? fileConfig.E2E_AI_MODEL;

  // 🔥 检查是否需要真实 AI 但没有配置
  if (useRealAI && !realAIApiKey) {
    console.warn(`[E2E] ⚠️  真实 AI 模式已启用，但未配置 API Key。`);
    console.warn(`[E2E] 🔑 请创建 ${options.configPath || 'tests/e2e/.env.e2e.local'} 文件并配置：`);
    console.warn(`[E2E]`);
    console.warn(`[E2E]   E2E_AI_API_KEY=your-api-key-here`);
    console.warn(`[E2E]   E2E_AI_BASE_URL=https://api.deepseek.com`);
    console.warn(`[E2E]   E2E_AI_MODEL=deepseek-chat`);
    console.warn(`[E2E]`);
    console.warn(`[E2E] 💡 或者参考 tests/e2e/.env.e2e.example 模板文件。`);
    console.warn(`[E2E]`);
    console.warn(`[E2E] 🔄 测试将自动跳过或使用 Mock AI。`);
  } else if (useRealAI && realAIApiKey) {
    console.log(`[E2E] 🤖 使用真实 AI 模式`);
    console.log(`[E2E]    API: ${realAIBaseUrl || 'default'}`);
    console.log(`[E2E]    模型: ${realAIModel || 'default'}`);
    console.log(`[E2E]    Key: ${realAIApiKey ? realAIApiKey.substring(0, 10) + '...' : 'N/A'}`);
  }

  // 1. Mock API（除非使用真实 AI）
  if (!useRealAI) {
    await page.route('**/v1/chat/completions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-' + Date.now(),
          choices: [{ index: 0, message: { role: 'assistant', content: 'Starting task implementation...' }, finish_reason: 'stop' }],
          usage: { total_tokens: 10 }
        }),
      });
    });
  } else {
    // 真实 AI 模式：不拦截 AI API，让真实的 AI 请求通过
    console.log('[E2E] 🤖 Using REAL AI mode - API calls will not be mocked');
    if (realAIApiKey) {
      console.log('[E2E] 🔑 Real AI API Key provided:', realAIApiKey?.substring(0, 10) + '...');
    }
    if (realAIBaseUrl) {
      console.log('[E2E] 🌐 Real AI Base URL:', realAIBaseUrl);
    }
    if (realAIModel) {
      console.log('[E2E] 🤖 Real AI Model:', realAIModel);
    }
  }

  // 2. 注入核心拦截与锁定脚本
  await page.addInitScript((realAIConfigParam) => {
    // A. 设置真实 AI 配置（必须在最前面）
    console.log('[E2E Init] Received config:', JSON.stringify(realAIConfigParam));
    (window as any).__E2E_REAL_AI_CONFIG__ = realAIConfigParam;

    // B. 深度 Mock Tauri with event support
    // Put eventListeners on window so it's accessible from Mock code
    (window as any).__TAURI_EVENT_LISTENERS__ = {};

    // 🔥 内存文件系统，用于跟踪文件内容和回滚测试
    const mockFileSystem = new Map<string, string>();
    // 暴露到 window 以便其他函数可以访问
    (window as any).__E2E_MOCK_FILE_SYSTEM__ = mockFileSystem;
    // 别名：兼容测试中的不同命名约定
    (window as any).__E2E_MOCK_FILE_SYSTEM = mockFileSystem;

    // 🔥 暴露格式化函数用于测试
    (window as any).__formatToolResultToMarkdown = (result: any, toolCall?: any) => {
      if (!result) return '';

      // 处理 agent_write_file 的特殊结构
      if (result.filePath && result.success !== undefined) {
        const lines: string[] = [];
        lines.push(`### ✅ 文件写入成功\n`);
        lines.push(`**📄 文件路径:** \`${result.filePath}\`\n`);

        // 原始内容信息
        if (result.originalContent !== undefined) {
          if (result.originalContent === '') {
            lines.push(`**📝 操作类型:** 新建文件\n`);
          } else {
            const originalLines = result.originalContent.split('\n').length;
            const originalSize = (result.originalContent.length / 1024).toFixed(2);
            lines.push(`**📝 操作类型:** 覆盖已有文件\n`);

            // 🔥 使用 result.newContent 或 toolCall.args.content
            const newContent = result.newContent || toolCall?.args?.content || '';
            const newLines = newContent ? newContent.split('\n').length : 0;

            // 🔥 先不显示变更统计，等智能 diff 检测完成后再显示
            lines.push(`**📁 原始文件:** ${originalLines} 行，${originalSize} KB\n`);

            // 🔥 智能diff：检测行级别变化
            if (newContent && result.originalContent) {
              const originalLinesList = result.originalContent.split('\n');
              const newLinesList = newContent.split('\n');

              // 🔥 先检测是否只是行号前缀变化
              const isLineNumberChange = originalLinesList.length > 0 && newLinesList.length > 0;
              let hasLineNumberPrefix = false;

              if (isLineNumberChange) {
                const firstOriginalLine = originalLinesList[0];
                const firstNewLine = newLinesList[0];
                const lineNumberRegex = /^(\d+)\s+(.+)$/;

                const originalMatch = firstOriginalLine.match(lineNumberRegex);
                const newMatch = firstNewLine.match(lineNumberRegex);

                if (originalMatch && newMatch) {
                  if (originalMatch[2] === newMatch[2]) {
                    hasLineNumberPrefix = true;
                  }
                }
              }

              if (hasLineNumberPrefix) {
                // 行号模式：只显示真正变化的内容
                const removedLines: string[] = [];
                const addedLines: string[] = [];
                const lineNumberRegex = /^(\d+)\s+(.+)$/;

                const originalContentMap = new Map<string, number[]>();
                originalLinesList.forEach((line) => {
                  const match = line.match(lineNumberRegex);
                  if (match) {
                    const content = match[2];
                    if (!originalContentMap.has(content)) {
                      originalContentMap.set(content, []);
                    }
                    originalContentMap.get(content)!.push(parseInt(match[1]));
                  }
                });

                const newContentMap = new Map<string, number[]>();
                newLinesList.forEach((line) => {
                  const match = line.match(lineNumberRegex);
                  if (match) {
                    const content = match[2];
                    if (!newContentMap.has(content)) {
                      newContentMap.set(content, []);
                    }
                    newContentMap.get(content)!.push(parseInt(match[1]));
                  }
                });

                for (const [content, originalLineNumbers] of originalContentMap) {
                  if (!newContentMap.has(content)) {
                    originalLineNumbers.forEach(lineNum => {
                      removedLines.push(`${lineNum} ${content}`);
                    });
                  }
                }

                for (const [content, newLineNumbers] of newContentMap) {
                  if (!originalContentMap.has(content)) {
                    newLineNumbers.forEach(lineNum => {
                      addedLines.push(`${lineNum} ${content}`);
                    });
                  }
                }

                // 🔥 智能模式：显示实际变化的行数统计
                lines.push(`**📊 变更统计:** -${removedLines.length} +${addedLines.length} 行（只统计真正变化的行）\n`);

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
                // 非行号模式：逐行对比
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

        lines.push(`**💬 结果:** File written\n`);

        return lines.join('');
      }

      return JSON.stringify(result, null, 2);
    };

    const mockInvoke = async (cmd: string, args?: any) => {
        if (cmd === 'get_git_statuses') return [];
        if (cmd === 'plugin:fs|read_dir') return [
            { name: 'App.tsx', isDirectory: false, isFile: true },
            { name: 'main.tsx', isDirectory: false, isFile: true },
            { name: 'src', isDirectory: true, isFile: false }
        ];
        if (cmd === 'plugin:fs|read_text_file') {
            if (args.path.endsWith('App.tsx')) return 'export function App() { return <div>App</div>; }';
            if (args.path.endsWith('main.tsx')) return 'import { App } from "./App";\nReactDOM.render(<App />, document.body);';
            return '// Mock content';
        }
        if (cmd === 'read_directory') return [
            { name: 'App.tsx', isDirectory: false, isFile: true },
            { name: 'main.tsx', isDirectory: false, isFile: true }
        ];
        if (cmd === 'plugin:dialog|ask') return true;

        // 🔥 商业版 (ifainew-core) 使用的命令
        if (cmd === 'agent_read_file') {
            console.log('[E2E Mock] agent_read_file:', args);
            const filePath = `${args.rootPath}/${args.relPath}`.replace(/\/\//g, '/');
            const content = mockFileSystem.get(filePath);
            if (content !== undefined) {
                console.log('[E2E Mock] Returning existing file content');
                return content;
            }
            // 文件不存在，抛出错误
            const error = new Error(`File not found: ${filePath}`);
            (error as any).code = 'ENOENT';
            throw error;
        }
        if (cmd === 'agent_write_file') {
            console.log('[E2E Mock] agent_write_file:', args);
            const filePath = `${args.rootPath}/${args.relPath}`.replace(/\/\//g, '/');

            // 🔥 获取原始内容（如果文件已存在）
            const originalContent = mockFileSystem.get(filePath) || '';

            // 🔥 写入新内容到内存文件系统
            mockFileSystem.set(filePath, args.content);

            console.log('[E2E Mock] File updated:', {
                filePath,
                hadOriginalContent: originalContent !== '',
                newContent: args.content.substring(0, 50)
            });

            // 🔥 返回 JSON 字符串格式的结果（前端会 JSON.parse）
            // 包含 success 和 originalContent 以支持 Composer 功能
            return JSON.stringify({
                success: true,
                filePath: args.relPath,
                originalContent: originalContent
            });
        }
        if (cmd === 'agent_list_dir') {
            console.log('[E2E Mock] agent_list_dir:', args);
            let dirPath = `${args.rootPath}/${args.relPath}`.replace(/\/\//g, '/');

            // 处理 . 和 .. 路径
            if (dirPath.endsWith('/.')) {
                dirPath = dirPath.substring(0, dirPath.length - 2);
            }
            // 确保路径以 / 结尾
            if (!dirPath.endsWith('/')) {
                dirPath += '/';
            }

            // 从内存文件系统中获取该目录下的所有文件/目录
            const entries: string[] = [];
            for (const [filePath, _] of mockFileSystem.entries()) {
                // 检查文件是否在目标目录下（直接子项）
                if (filePath.startsWith(dirPath)) {
                    const relativePath = filePath.substring(dirPath.length);
                    // 只添加直接子项（不包含子目录中的文件）
                    if (relativePath && !relativePath.includes('/')) {
                        entries.push(relativePath);
                    }
                }
            }

            console.log('[E2E Mock] Directory listing for', dirPath, ':', entries);
            return entries.join('\n');
        }
        if (cmd === 'delete_file') {
            console.log('[E2E Mock] delete_file:', args);
            const filePath = args.path;
            mockFileSystem.delete(filePath);
            console.log('[E2E Mock] File deleted from memory:', filePath);
            return { success: true };
        }
        if (cmd === 'agent_delete_file') {
            console.log('[E2E Mock] agent_delete_file:', args);
            const filePath = `${args.rootPath}/${args.relPath}`.replace(/\/\//g, '/');
            mockFileSystem.delete(filePath);
            console.log('[E2E Mock] File deleted from memory:', filePath);
            return `File deleted: ${args.relPath}`;
        }
        if (cmd === 'execute_bash_command') {
            console.log('[E2E Mock] execute_bash_command:', args);
            const command = args?.command || '';

            // 🔥 根据实际命令返回不同的输出
            // 注意：直接返回对象，让 Tauri 的 invoke 机制处理序列化

            // 先检查 stderr 测试（因为包含 echo，需要优先处理）
            if (command.includes('>&2')) {
                console.log('[E2E Mock] Detected stderr test command:', command);
                const parts = command.split('&&');
                console.log('[E2E Mock] Parts:', parts);
                const stdoutMatch = parts[0].match(/echo\s+"([^"]+)"/);
                const stderrMatch = parts[1].match(/echo\s+"([^"]+)"/);
                console.log('[E2E Mock] Matches:', { stdoutMatch, stderrMatch });
                const stdout = stdoutMatch ? stdoutMatch[1] : '';
                const stderr = stderrMatch ? stderrMatch[1] : '';
                const result = {
                    stdout: stdout,
                    stderr: stderr,
                    exitCode: 0
                };
                console.log('[E2E Mock] Returning:', result);
                return result;
            } else if (command.includes('echo')) {
                // 提取 echo 的内容
                const echoMatch = command.match(/echo\s+"([^"]+)"/) || command.match(/echo\s+'([^']+)'/) || command.match(/echo\s+(.+)/);
                if (echoMatch) {
                    const output = echoMatch[1];
                    return {
                        stdout: output,
                        stderr: '',
                        exitCode: 0
                    };
                }
            } else if (command.includes('ls') && command.includes('/nonexistent')) {
                // 不存在的目录
                return {
                    stdout: '',
                    stderr: 'ls: cannot access \'/nonexistent_directory_12345\': No such file or directory',
                    exitCode: 2
                };
            } else if (command.includes('npm run dev')) {
                // 🔥 模拟 npm run dev 启动成功（用于测试启动成功检测）
                // 返回 Vite 的典型启动输出
                return {
                    stdout: '> vite-project@0.0.0 dev\n> vite\n\n  VITE v5.0.0  ready in 250 ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose\n  ➜  press h + enter to show help',
                    stderr: '',
                    exitCode: 0,
                    success: true,
                    elapsed_ms: 300
                };
            } else if (command.includes('npm start')) {
                // 🔥 模拟 npm start (Create React App) 启动成功
                return {
                    stdout: 'Starting the development server...\n\nCompiled successfully!\n\nYou can now view vite-project in the browser.\n\n  Local:            http://localhost:3000',
                    stderr: '',
                    exitCode: 0,
                    success: true,
                    elapsed_ms: 2000
                };
            } else if (command.includes('python app.py')) {
                // 🔥 模拟 Python Flask 服务器启动成功
                return {
                    stdout: ' * Serving Flask app \'app\'\n * Debug mode: on\nWARNING: This is a development server. Do not use it in a production deployment.\n * Running on http://127.0.0.1:5000\n * Press CTRL+C to quit',
                    stderr: '',
                    exitCode: 0,
                    success: true,
                    elapsed_ms: 500
                };
            }

            // 默认返回通用输出
            return {
                stdout: 'Mock command output',
                stderr: '',
                exitCode: 0
            };
        }

        // Handle launch_agent command for Demo Agent
        if (cmd === 'launch_agent') {
            const agentId = args?.id;
            const eventId = `agent_${agentId}`; // eventId is generated by frontend

            console.log(`[E2E Mock] Launching agent: ${agentId}, eventId: ${eventId}`);

            // Simulate agent execution with delay
            setTimeout(async () => {
                const globalEventListeners = (globalThis as any).__TAURI_EVENT_LISTENERS__ || {};
                console.log(`[E2E Mock] Checking listeners for ${eventId}:`, Object.keys(globalEventListeners));
                console.log(`[E2E Mock] Listeners count for ${eventId}:`, (globalEventListeners[eventId] || []).length);

                // Emit agent status: running
                const statusListeners = globalEventListeners[eventId] || [];
                console.log(`[E2E Mock] Sending status event to ${statusListeners.length} listeners`);

                statusListeners.forEach((fn: Function) => fn({
                    payload: {
                        type: 'status',
                        status: 'running',
                        progress: 0.5
                    }
                }));

                // Emit log: starting task
                setTimeout(() => {
                    statusListeners.forEach((fn: Function) => fn({
                        payload: {
                            type: 'log',
                            message: '📋 正在读取 Demo Proposal...'
                        }
                    }));
                }, 300);

                // Emit log: creating files
                setTimeout(() => {
                    statusListeners.forEach((fn: Function) => fn({
                        payload: {
                            type: 'log',
                            message: '📁 正在创建 src/views/Login.vue...'
                        }
                    }));
                }, 800);

                setTimeout(() => {
                    statusListeners.forEach((fn: Function) => fn({
                        payload: {
                            type: 'log',
                            message: '📁 正在创建 src/router/index.ts...'
                        }
                    }));
                }, 1300);

                setTimeout(() => {
                    statusListeners.forEach((fn: Function) => fn({
                        payload: {
                            type: 'log',
                            message: '🧪 正在创建 tests/e2e/demo-login.spec.ts...'
                        }
                    }));
                }, 1800);

                // Emit final result
                setTimeout(() => {
                    const finalResult = '✅ **Demo 应用创建成功！**\n\n📁 **已创建文件：**\n- `src/views/Login.vue` - 登录组件（Vue 3 Composition API）\n- `src/router/index.ts` - 路由配置\n- `tests/e2e/demo-login.spec.ts` - E2E 测试\n\n🎯 **下一步：**\n1. 运行 `npm install` 安装依赖\n2. 运行 `npm run dev` 启动开发服务器\n3. 访问 http://localhost:5173/login 查看登录页面\n4. 运行 `npm run test:e2e` 执行测试\n\n💡 **提示：** 这是一个演示应用，展示了如何使用 IfAI 创建完整的 Vue 登录功能。\n\n（注：这是 E2E 测试环境的模拟输出，真实环境中会实际创建文件）';

                    // Emit status: completed
                    statusListeners.forEach((fn: Function) => fn({
                        payload: {
                            type: 'status',
                            status: 'completed',
                            progress: 1.0
                        }
                    }));

                    // Emit result
                    setTimeout(() => {
                        statusListeners.forEach((fn: Function) => fn({
                            payload: {
                                type: 'result',
                                result: finalResult
                            }
                        }));
                    }, 100);
                }, 2500);
            }, 500);

            return { success: true, agent_id: agentId };
        }

        if (cmd === 'ai_chat') {
            // 🔥 检查是否使用真实 AI
            const realAIConfig = (window as any).__E2E_REAL_AI_CONFIG__ || {};
            const useRealAI = realAIConfig.useRealAI === true;

            // 设置标志，让测试可以检查
            (window as any).__E2E_AI_CHAT_CALL_INFO__ = {
                called: true,
                useRealAI,
                hasConfig: !!realAIConfig,
                hasBaseUrl: !!realAIConfig.realAIBaseUrl,
                hasApiKey: !!realAIConfig.realAIApiKey
            };

            console.log('[E2E Mock] ai_chat called, useRealAI:', useRealAI, 'config:', realAIConfig);

            if (useRealAI && realAIConfig.realAIBaseUrl && realAIConfig.realAIApiKey) {
                // 🔥 真实 AI 模式：调用真实的 API
                // 🔥 注意：invoke 调用使用 eventId (camelCase)，不是 event_id
                const eventId = args?.eventId || args?.event_id || 'real-ai-event-id';
                const messages = args?.messages || [];
                const providerId = args?.provider_id || 'real-ai-e2e';
                const model = realAIConfig.realAIModel || 'moonshot-v1-8k';

                // 🔥 自动补全 baseUrl：如果缺少 /chat/completions 后缀，自动添加
                let apiBaseUrl = realAIConfig.realAIBaseUrl;
                if (!apiBaseUrl.endsWith('/chat/completions')) {
                    apiBaseUrl = apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
                }

                console.log('[E2E Real AI] Calling real AI API:', {
                    baseUrl: apiBaseUrl,
                    model: model,
                    messagesCount: messages.length
                });

                // 🔥 关键修复：返回一个 Promise，等待 AI 响应完成
                // 这样商业版的 await invoke('ai_chat', ...) 会等待响应
                return (async () => {
                    try {
                        const response = await fetch(apiBaseUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${realAIConfig.realAIApiKey}`
                            },
                            body: JSON.stringify({
                                model: model,
                                messages: messages.map(m => ({
                                    role: m.role,
                                    content: m.content?.Text || m.content || ''
                                })),
                                stream: false
                            })
                        });

                        const data = await response.json();
                        console.log('[E2E Real AI] API response:', {
                            id: data.id,
                            hasChoices: !!data.choices,
                            finishReason: data.choices?.[0]?.finish_reason,
                            hasError: !!data.error,
                            error: data.error
                        });

                        // 🔥 检查 API 是否返回了错误
                        if (data.error) {
                            console.error('[E2E Real AI] API returned error:', data.error);
                            const errorMsg = data.error.message || JSON.stringify(data.error);
                            const errorPayload = { type: 'content', content: `API Error: ${errorMsg}` };
                            streamListeners.forEach((fn, index) => {
                                console.log(`[E2E Real AI] Sending error to listener ${index}`);
                                try {
                                    fn({ payload: errorPayload });
                                } catch (e) {
                                    console.error(`[E2E Real AI] Error listener ${index} error:`, e);
                                }
                            });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            finishListeners.forEach(fn => fn({ payload: { type: 'done' } }));
                            return { success: false, eventId, error: errorMsg };
                        }

                        const streamListeners = (window as any).__TAURI_EVENT_LISTENERS__[eventId] || [];
                        const finishListeners = (window as any).__TAURI_EVENT_LISTENERS__[`${eventId}_finish`] || [];

                        // 🔥 详细调试：检查事件监听器状态
                        console.log('[E2E Real AI] Event listeners for eventId:', eventId);
                        console.log('[E2E Real AI] Stream listeners count:', streamListeners.length);
                        console.log('[E2E Real AI] Finish listeners count:', finishListeners.length);
                        console.log('[E2E Real AI] All event listener keys:', Object.keys((window as any).__TAURI_EVENT_LISTENERS__ || {}));

                        if (data.choices && data.choices[0]) {
                            const choice = data.choices[0];
                            const content = choice.message?.content || '';

                            // 🔥 商业版期望的 payload 格式: { type: 'content', content: '...' }
                            const payload = { type: 'content', content };
                            console.log('[E2E Real AI] Sending payload:', payload);
                            console.log('[E2E Real AI] Payload type:', typeof payload, 'keys:', Object.keys(payload));

                            // 发送内容 - 添加详细日志
                            console.log('[E2E Real AI] Calling stream listeners...');
                            streamListeners.forEach((fn, index) => {
                                console.log(`[E2E Real AI] Calling stream listener ${index}:`, fn);
                                try {
                                    fn({ payload });
                                    console.log(`[E2E Real AI] Stream listener ${index} called successfully`);
                                } catch (e) {
                                    console.error(`[E2E Real AI] Stream listener ${index} error:`, e);
                                }
                            });
                            console.log('[E2E Real AI] All stream listeners called');

                            // 等待一小段时间后再发送完成事件
                            await new Promise(resolve => setTimeout(resolve, 100));

                            // 发送完成事件
                            finishListeners.forEach(fn => fn({ payload: { type: 'done' } }));
                        } else {
                            console.error('[E2E Real AI] Invalid response format - missing choices:', data);
                            // 发送错误消息
                            const errorPayload = { type: 'content', content: 'Error: Invalid AI response format (missing choices)' };
                            console.log('[E2E Real AI] Sending error payload:', errorPayload);
                            streamListeners.forEach((fn, index) => {
                                console.log(`[E2E Real AI] Calling error listener ${index}`);
                                try {
                                    fn({ payload: errorPayload });
                                    console.log(`[E2E Real AI] Error listener ${index} called successfully`);
                                } catch (e) {
                                    console.error(`[E2E Real AI] Error listener ${index} error:`, e);
                                }
                            });
                            await new Promise(resolve => setTimeout(resolve, 100));
                            finishListeners.forEach(fn => fn({ payload: { type: 'done' } }));
                        }

                        return { success: true, eventId };
                    } catch (error: any) {
                        console.error('[E2E Real AI] API call failed:', error);
                        const streamListeners = (window as any).__TAURI_EVENT_LISTENERS__[eventId] || [];
                        const finishListeners = (window as any).__TAURI_EVENT_LISTENERS__[`${eventId}_finish`] || [];

                        // 发送错误消息
                        const errorPayload = { type: 'content', content: `Error: ${error.message}` };
                        streamListeners.forEach(fn => fn({ payload: errorPayload }));
                        await new Promise(resolve => setTimeout(resolve, 100));
                        finishListeners.forEach(fn => fn({ payload: { type: 'done' } }));

                        return { success: false, eventId, error: error.message };
                    }
                })();
            }

            // 🔥 Mock 模式：使用模拟响应
            // Mock streaming response that sends content and triggers _finish event
            // 🔥 注意：invoke 调用使用 eventId (camelCase)，不是 event_id
            const eventId = args?.eventId || args?.event_id || 'mock-event-id';
            const messages = args?.messages || [];
            const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
            const query = lastUserMsg?.content?.Text || lastUserMsg?.content || '';

            // 🔥 Debug logging
            console.log('[E2E Mock] Using MOCK AI mode');
            console.log('[E2E Mock] ai_chat called with eventId:', eventId);
            console.log('[E2E Mock] query:', query);

            // Check if this is a bash command request
            const isBashCommand = query.includes('执行') || query.includes('运行') ||
                                 query.includes('python') || query.includes('java') ||
                                 query.includes('curl') || query.includes('whoami') ||
                                 query.includes('sleep') || query.includes('git') ||
                                 query.includes('npm') || query.includes('cargo');

            // 🔥 Check if this is a Composer test (Refactor/Update/Add documentation)
            const isComposerTest = query.includes('Refactor') || query.includes('Update imports') ||
                                   query.includes('Add documentation');

            console.log('[E2E Mock] isComposerTest:', isComposerTest);

            let responseContent = 'Mock AI response: Task completed successfully.';

            // Simulate async streaming
            setTimeout(() => {
                const streamListeners = (window as any).__TAURI_EVENT_LISTENERS__[eventId] || [];
                console.log('[E2E Mock] Stream listeners count:', streamListeners.length);

                if (isComposerTest) {
                    // 🔥 Composer 测试：返回多个 agent_write_file tool_calls
                    // 使用前端期望的自定义格式
                    const toolCalls = [
                        {
                            id: 'call_write_1',
                            function: {
                                name: 'agent_write_file',
                                arguments: JSON.stringify({
                                    rootPath: '/Users/mac/mock-project',
                                    relPath: 'src/services/AuthService.ts',
                                    content: `/**
 * Refactored Auth Service with new Logger trait
 */
export class AuthService {
    constructor(private logger: Logger) {}

    login(user: string, pass: string) {
        this.logger.info(\`Login attempt for \${user}\`);
        // ... implementation
    }
}`
                                })
                            }
                        },
                        {
                            id: 'call_write_2',
                            function: {
                                name: 'agent_write_file',
                                arguments: JSON.stringify({
                                    rootPath: '/Users/mac/mock-project',
                                    relPath: 'src/traits/Logger.ts',
                                    content: `/**
 * Logger trait for consistent logging across services
 */
export trait Logger {
    fn info(message: &str);
    fn error(message: &str);
    fn debug(message: &str);
}`
                                })
                            }
                        },
                        {
                            id: 'call_write_3',
                            function: {
                                name: 'agent_write_file',
                                arguments: JSON.stringify({
                                    rootPath: '/Users/mac/mock-project',
                                    relPath: 'src/utils/helpers.ts',
                                    content: `// Utility functions with documentation

/**
 * Format a date string
 */
export function formatDate(date: Date): string {
    return date.toISOString();
}`
                                })
                            }
                        }
                    ];

                    // Send tool_calls using custom format expected by frontend
                    toolCalls.forEach((tc, idx) => {
                        setTimeout(() => {
                            const toolCallPayload = {
                                type: 'tool_call',
                                toolCall: tc
                            };
                            streamListeners.forEach(fn => fn({ payload: toolCallPayload }));
                        }, idx * 100);
                    });

                    // After tool calls, send results and finish message
                    setTimeout(() => {
                        // Send results for each tool call
                        toolCalls.forEach((tc, idx) => {
                            setTimeout(() => {
                                const resultPayload = {
                                    type: 'content',
                                    content: `\n✅ File ${idx + 1} written successfully.\n`
                                };
                                streamListeners.forEach(fn => fn({ payload: resultPayload }));
                            }, idx * 100);
                        });

                        // Send final completion message
                        setTimeout(() => {
                            const completionPayload = {
                                type: 'content',
                                content: `\n\n✨ **Refactoring Complete!**\n\nModified 3 files:\n- \`src/services/AuthService.ts\` - Added Logger trait\n- \`src/traits/Logger.ts\` - Created new trait\n- \`src/utils/helpers.ts\` - Added documentation\n`
                            };
                            streamListeners.forEach(fn => fn({ payload: completionPayload }));

                            // Trigger _finish event
                            setTimeout(() => {
                                const finishListeners = (window as any).__TAURI_EVENT_LISTENERS__[`${eventId}_finish`] || [];
                                finishListeners.forEach(fn => fn({ payload: 'DONE' }));
                            }, 100);
                        }, 500);
                    }, 500);
                } else if (isBashCommand) {
                    // Simulate tool_calls for bash commands
                    const toolCallPayload = JSON.stringify({
                        choices: [{
                            index: 0,
                            delta: {
                                tool_calls: [{
                                    index: 0,
                                    id: 'call_bash_mock',
                                    type: 'function',
                                    function: {
                                        name: 'bash',
                                        arguments: JSON.stringify({
                                            command: query.replace(/^(帮我)?(执行|运行)\s+/, ''),
                                            timeout: 30000
                                        })
                                    }
                                }]
                            }
                        }]
                    });

                    streamListeners.forEach(fn => fn({ payload: toolCallPayload }));

                    // After tool call, send the result
                    setTimeout(() => {
                        // Generate mock command output
                        let mockOutput = '';
                        if (query.includes('python')) mockOutput = 'Python 3.11.0';
                        else if (query.includes('java')) mockOutput = 'openjdk version "17.0.2"';
                        else if (query.includes('curl')) mockOutput = 'HTTP/1.1 200 OK';
                        else if (query.includes('whoami')) mockOutput = 'mock-user';
                        else if (query.includes('sleep')) mockOutput = 'Command completed';
                        else if (query.includes('git')) mockOutput = 'git version 2.39.0';
                        else mockOutput = 'Command executed successfully';

                        const contentPayload = JSON.stringify({
                            choices: [{
                                index: 0,
                                delta: { content: mockOutput }
                            }]
                        });

                        streamListeners.forEach(fn => fn({ payload: contentPayload }));

                        // Trigger _finish event
                        setTimeout(() => {
                            const finishListeners = (window as any).__TAURI_EVENT_LISTENERS__[`${eventId}_finish`] || [];
                            finishListeners.forEach(fn => fn({ payload: 'DONE' }));
                        }, 50);
                    }, 200);
                } else {
                    // Regular response for non-bash commands
                    streamListeners.forEach(fn => fn({ payload: responseContent }));

                    // Trigger _finish event shortly after
                    setTimeout(() => {
                        const finishListeners = (window as any).__TAURI_EVENT_LISTENERS__[`${eventId}_finish`] || [];
                        finishListeners.forEach(fn => fn({ payload: 'DONE' }));
                    }, 50);
                }
            }, 100);
            return {};
        }
        return {};
    };

    const mockListen = async (event: string, handler: Function) => {
        const listeners = (window as any).__TAURI_EVENT_LISTENERS__[event] || [];
        listeners.push(handler);
        (window as any).__TAURI_EVENT_LISTENERS__[event] = listeners;
        return () => {
            const idx = (window as any).__TAURI_EVENT_LISTENERS__[event]?.indexOf(handler);
            if (idx > -1) (window as any).__TAURI_EVENT_LISTENERS__[event]?.splice(idx, 1);
        };
    };

    // 🔥 Mock Tauri app API
    const mockApp = {
        getName: async () => 'IfAI',
        getVersion: async () => '0.2.7',
        getTauriVersion: async () => '1.5.0',
    };

    (window as any).__TAURI_INTERNALS__ = {
        transformCallback: (cb: any) => cb,
        invoke: mockInvoke,
        // 🔥 Add unregisterCallback support
        unregisterCallback: (cb: any) => {
            // Mock implementation - do nothing
        }
    };
    (window as any).__TAURI__ = {
      core: { invoke: mockInvoke },
      event: {
        listen: mockListen,
        // 🔥 Add event.emit support
        emit: async (event: string, payload?: any) => {
            const listeners = (window as any).__TAURI_EVENT_LISTENERS__[event] || [];
            listeners.forEach((fn: Function) => fn({ payload }));
        }
      },
      // 🔥 Add app API
      app: mockApp,
      // 🔥 Mock window API for App.tsx initialization
      window: {
        getCurrent: () => ({
          show: async () => console.log('[E2E Mock] Window shown'),
          hide: async () => console.log('[E2E Mock] Window hidden'),
          close: async () => console.log('[E2E Mock] Window closed'),
          minimize: async () => console.log('[E2E Mock] Window minimized'),
          maximize: async () => console.log('[E2E Mock] Window maximized'),
          unmaximize: async () => console.log('[E2E Mock] Window unmaximized'),
          isFocused: async () => true,
          isMaximized: async () => false,
          isMinimized: async () => false,
          scaleFactor: async () => 1,
          innerPosition: async () => ({ x: 0, y: 0 }),
          innerSize: async () => ({ width: 1920, height: 1080 }),
          outerPosition: async () => ({ x: 0, y: 0 }),
          outerSize: async () => ({ width: 1920, height: 1080 }),
          setAlwaysOnTop: async () => {},
          setAlwaysOnBottom: async () => {},
          setDecorations: async () => {},
          setIgnoreCursorEvents: async () => {},
          setSize: async () => {},
          setMinSize: async () => {},
          setMaxSize: async () => {},
          setPosition: async () => {},
          setTitle: async () => {},
          setResizable: async () => {},
          setSkipTaskbar: async () => {},
          onFocusChanged: () => {},
          onResizeRequested: () => {},
          onCloseRequested: () => {},
          onScaleChanged: () => {},
        })
      }
    };

    // 🔥 暴露 mockInvoke 到 window，供 tauri-mocks/api/core.ts 延迟注册使用
    (window as any).__E2E_INVOKE_HANDLER__ = mockInvoke;
    console.log('[E2E Init] Exposed __E2E_INVOKE_HANDLER__ to window');

    // 🔥 同时尝试通过 __tauriSetInvokeHandler__ 直接设置（如果可用）
    const trySetInvokeHandler = (attempt: number) => {
      console.log(`[E2E Init] Attempt ${attempt} to set invoke handler via __tauriSetInvokeHandler__...`);
      const tauriSetInvokeHandler = (window as any).__tauriSetInvokeHandler__;
      console.log(`[E2E Init] __tauriSetInvokeHandler__ exists:`, !!tauriSetInvokeHandler);

      if (tauriSetInvokeHandler) {
        tauriSetInvokeHandler(mockInvoke);
        console.log('[E2E Init] ✅ Set invoke handler using __tauriSetInvokeHandler__');
        return true;
      } else {
        console.warn(`[E2E Init] ⚠️ __tauriSetInvokeHandler__ not found (attempt ${attempt}), will use __E2E_INVOKE_HANDLER__ fallback`);
        return false;
      }
    };

    // 尝试立即设置
    if (!trySetInvokeHandler(1)) {
      // 100ms 后重试
      setTimeout(() => {
        if (!trySetInvokeHandler(2)) {
          // 500ms 后再次重试
          setTimeout(() => {
            trySetInvokeHandler(3);
          }, 400);
        }
      }, 100);
    }

    // 🔥 同时设置到全局 __TAURI__ 作为备份
    setTimeout(() => {
      (window as any).__TAURI__ = {
        core: { invoke: mockInvoke },
        event: {
          listen: mockListen,
          // 🔥 Add event.emit support
          emit: async (event: string, payload?: any) => {
            const listeners = (window as any).__TAURI_EVENT_LISTENERS__[event] || [];
            listeners.forEach((fn: Function) => fn({ payload }));
          }
        },
        // 🔥 Add app API
        app: mockApp,
        // 🔥 Mock window API for App.tsx initialization
        window: {
          getCurrent: () => ({
            show: async () => console.log('[E2E Mock] Window shown'),
            hide: async () => console.log('[E2E Mock] Window hidden'),
            close: async () => console.log('[E2E Mock] Window closed'),
            minimize: async () => console.log('[E2E Mock] Window minimized'),
            maximize: async () => console.log('[E2E Mock] Window maximized'),
            unmaximize: async () => console.log('[E2E Mock] Window unmaximized'),
            isFocused: async () => true,
            isMaximized: async () => false,
            isMinimized: async () => false,
            scaleFactor: async () => 1,
            innerPosition: async () => ({ x: 0, y: 0 }),
            innerSize: async () => ({ width: 1920, height: 1080 }),
            outerPosition: async () => ({ x: 0, y: 0 }),
            outerSize: async () => ({ width: 1920, height: 1080 }),
            setAlwaysOnTop: async () => {},
            setAlwaysOnBottom: async () => {},
            setDecorations: async () => {},
            setIgnoreCursorEvents: async () => {},
            setSize: async () => {},
            setMinSize: async () => {},
            setMaxSize: async () => {},
            setPosition: async () => {},
            setTitle: async () => {},
            setResizable: async () => {},
            setSkipTaskbar: async () => {},
            onFocusChanged: () => {},
            onResizeRequested: () => {},
            onCloseRequested: () => {},
            onScaleChanged: () => {},
          })
        }
      };
    }, 100); // 延迟执行，确保 tauri-mocks 模块已加载

    // Mock proposal commands to auto-load v0.2.6-demo-vue-login
    const mockListProposals = async () => {
      const mockProposal = {
        proposals: [
          {
            id: 'v0.2.6-demo-vue-login',
            title: 'Demo Vue Login Feature',
            status: 'draft',
            location: 'proposals',
            created_at: Date.now(),
            updated_at: Date.now()
          }
        ],
        last_updated: Date.now() / 1000
      };
      return mockProposal;
    };

    const mockLoadProposal = async (args: any) => {
      if (args.id === 'v0.2.6-demo-vue-login') {
        // 读取真实的 proposal 文件
        const proposalData = {
          id: 'v0.2.6-demo-vue-login',
          path: '.ifai/proposals/v0.2.6-demo-vue-login/',
          status: 'draft',
          location: 'proposals',
          proposal_location: 'proposals',
          why: '实现 Vue 登录功能演示',
          what_changes: ['添加登录组件', '实现认证逻辑'],
          impact: {
            specs: [],
            files: [],
            breaking_changes: false
          },
          tasks: [],
          spec_deltas: [],
          design: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          validated: false
        };
        return proposalData;
      }
      throw new Error('Proposal not found');
    };

    // Override mockInvoke for proposal commands
    const originalMockInvoke = mockInvoke;
    const enhancedMockInvoke = async (cmd: string, args?: any) => {
      // 通用日志：记录 ai_chat 和 proposal 相关调用
      if (cmd === 'ai_chat' || cmd.includes('proposal')) {
        console.log('[E2E Invoke] cmd:', cmd, 'hasArgs:', !!args);
      }

      if (cmd === 'list_proposals') return await mockListProposals();
      if (cmd === 'load_proposal') return await mockLoadProposal(args);
      return originalMockInvoke(cmd, args);
    };

    // 更新两个 invoke 引用
    (window as any).__TAURI_INTERNALS__.invoke = enhancedMockInvoke;
    (window as any).__TAURI__.core.invoke = enhancedMockInvoke;

    // B. 强力劫持 LocalStorage 防止被 SettingsStore 初始化覆盖
    // 读取真实 AI 配置（如果存在）
    const realAIConfig = (window as any).__E2E_REAL_AI_CONFIG__ || {};
    console.log('[E2E Init] realAIConfig:', JSON.stringify(realAIConfig));

    // 默认 providers（Mock 模式）
    const defaultProviders = [
        {
            id: 'kimi-e2e',
            name: 'Kimi (Moonshot)',
            protocol: 'openai',
            baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
            apiKey: 'sk-sDj3JEEB21A0BlRIncaphsF7sWQALkAIIhjhRfMddzxNahXV',
            models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-thinking'],
            enabled: true
        },
        {
            id: 'ollama-e2e',
            name: 'Ollama Mock',
            protocol: 'openai',
            baseUrl: 'http://localhost:11434/v1/chat/completions',
            apiKey: 'e2e-token',
            models: ['mock-model'],
            enabled: true
        }
    ];

    // 真实 AI providers（真实 AI 模式）
    let providers = defaultProviders;
    let currentProviderId = 'kimi-e2e';
    let currentModel = 'moonshot-v1-8k';

    console.log('[E2E Init] useRealAI check:', realAIConfig.useRealAI, 'type:', typeof realAIConfig.useRealAI);

    if (realAIConfig.useRealAI) {
      console.log('[E2E Init] Using REAL AI mode for providers');

      // 🔥 自动补全 baseUrl：如果缺少 /chat/completions 后缀，自动添加
      let baseUrl = realAIConfig.realAIBaseUrl || 'https://api.openai.com/v1/chat/completions';
      if (!baseUrl.endsWith('/chat/completions')) {
        // 确保路径格式正确
        baseUrl = baseUrl.replace(/\/+$/, '') + '/chat/completions';
        console.log('[E2E Init] 🔧 Auto-fixed baseUrl to:', baseUrl);
      }

      // 使用真实 AI 配置
      const realAIProvider: any = {
        id: 'real-ai-e2e',
        name: baseUrl.includes('moonshot') ? 'Kimi (Real)' : (baseUrl.includes('ollama') ? 'Ollama (Real)' : 'Real AI Provider'),
        protocol: 'openai',
        baseUrl: baseUrl,
        apiKey: realAIConfig.realAIApiKey || '',
        models: realAIConfig.realAIModel ? [realAIConfig.realAIModel] : ['gpt-4', 'gpt-3.5-turbo'],
        enabled: true,
        isCustom: true
      };

      providers = [realAIProvider];
      currentProviderId = 'real-ai-e2e';
      currentModel = realAIConfig.realAIModel || realAIProvider.models[0];

      console.log('[E2E Init] 🤖 Using Real AI Provider:', {
        id: realAIProvider.id,
        name: realAIProvider.name,
        baseUrl: realAIProvider.baseUrl.replace(/sk\-.+/, '***'), // 隐藏 API Key
        models: realAIProvider.models
      });
    }

    const configurations: Record<string, any> = {
        'ifai_onboarding_state': { completed: true, skipped: true },
        // 🔥 修复持久化测试:只设置 rootPath,保留 openedFiles 等其他状态的持久化
        'file-storage': (existing: any) => ({
          ...existing,
          state: {
            ...(existing?.state || {}),
            rootPath: '/Users/mac/mock-project',
          },
          version: existing?.version || 0,
        }),
        'settings-storage': {
            state: {
                currentProviderId,
                currentModel,
                providers
            },
            version: 0
        },
        'thread-storage': { state: { activeThreadId: 'e2e-thread-1', threads: [{ id: 'e2e-thread-1', messages: [] }] }, version: 0 },
        // 🔥 修复持久化测试:保留 panes 等状态的持久化
        'layout-storage': (existing: any) => {
          const existingState = existing?.state || {};
          return {
            ...existing,
            state: {
              ...existingState,
              isChatOpen: true,
              isSidebarOpen: true,
              // 🔥 v0.2.9: Ensure there's at least one pane
              panes: existingState.panes && existingState.panes.length > 0
                ? existingState.panes
                : [{ id: 'pane-1', fileId: null, splitDirection: null, splitPercentage: null }],
              activePaneId: existingState.activePaneId || 'pane-1',
            },
            version: existing?.version || 0,
          };
        },
    };

    const originalGetItem = window.localStorage.getItem.bind(window.localStorage);
    window.localStorage.getItem = (key: string) => {
        if (configurations[key]) {
          const config = configurations[key];
          // 如果是函数,调用它并传入现有值
          if (typeof config === 'function') {
            const existingValue = originalGetItem(key);
            const existing = existingValue ? JSON.parse(existingValue) : undefined;
            return JSON.stringify(config(existing));
          }
          return JSON.stringify(config);
        }
        return originalGetItem(key);
    };

    // C. 注入万能后门
    (window as any).__E2E_SEND__ = async (text: string) => {
        const store = (window as any).__chatStore?.getState();
        if (store) {
            console.log(`[E2E] Direct Store Send: ${text}`);
            await store.sendMessage(text, 'kimi-e2e', 'kimi-k2-thinking');
        }
    };

    // D. 自动刷新 proposal 索引
    (window as any).__E2E_REFRESH_PROPOSALS__ = async () => {
        const proposalStore = (window as any).__proposalStore;
        if (proposalStore) {
            console.log('[E2E] Refreshing proposal index...');
            await proposalStore.getState().refreshIndex();
            console.log('[E2E] Proposal index refreshed:', proposalStore.getState().index);
        }
    };

    (window as any).__E2E_GET_MESSAGES__ = () => {
        return (window as any).__chatStore?.getState()?.messages || [];
    };

    (window as any).__E2E_OPEN_MOCK_FILE__ = (name: string, content?: string) => {
        const fileStore = (window as any).__fileStore;
        const layoutStore = (window as any).__layoutStore;
        const fileContent = content || `
/**
 * Test class for breadcrumbs
 */
export class TestApp {
    private value: number = 0;

    constructor() {
        console.log("Initialized");
    }

    public getValue() {
        return this.value;
    }
}
                `;
        const filePath = `/Users/mac/mock-project/${name}`;

        if (fileStore) {
            // Call openFile and get the fileId
            const fileId = fileStore.getState().openFile({
                id: `mock-${name}`,
                path: filePath,
                name: name,
                content: fileContent,
                isDirty: false,
                language: 'typescript'
            });
            console.log('[E2E Mock] File opened with ID:', fileId);

            // Auto assign to active pane if possible
            const layoutState = layoutStore.getState();
            if (layoutState && layoutState.activePaneId) {
                layoutStore.getState().assignFileToPane(layoutState.activePaneId, fileId);
                console.log('[E2E Mock] File assigned to pane:', layoutState.activePaneId, 'fileId:', fileId);
            } else {
                console.error('[E2E Mock] No active pane found!', layoutState);
            }
        }

        // 🔥 初始化 mock 文件系统，确保文件存在
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        if (mockFileSystem && !mockFileSystem.has(filePath)) {
            mockFileSystem.set(filePath, fileContent);
            console.log('[E2E Mock] Initialized file system with:', name);
        }
    };

    // 🔥 v0.2.9: E2E 辅助函数 - 触发 Cmd+K 行内编辑
    (window as any).__E2E_TRIGGER_INLINE_EDIT__ = (selectedText = '', position = { lineNumber: 1, column: 1 }) => {
        const inlineEditStore = (window as any).__inlineEditStore;
        if (inlineEditStore) {
            console.log('[E2E] Triggering inline edit with:', { selectedText, position });
            inlineEditStore.getState().showInlineEdit(selectedText, position);
            return true;
        }
        console.error('[E2E] inlineEditStore not found!');
        return false;
    };

    // E. Mock IndexedDB for thread persistence testing
    (window as any).__E2E_INDEXED_DB_MOCK__ = {
        threads: new Map<string, any>(),
        messages: new Map<string, any[]>(),

        clear() {
            this.threads.clear();
            this.messages.clear();
        },

        saveThread(thread: any) {
            this.threads.set(thread.id, thread);
        },

        getThread(threadId: string) {
            return this.threads.get(threadId);
        },

        getAllThreads() {
            return Array.from(this.threads.values());
        },

        saveMessages(messages: any[]) {
            messages.forEach(msg => {
                const threadMsgs = this.messages.get(msg.threadId) || [];
                threadMsgs.push(msg);
                this.messages.set(msg.threadId, threadMsgs);
            });
        },

        getThreadMessages(threadId: string) {
            return this.messages.get(threadId) || [];
        },

        deleteThread(threadId: string) {
            this.threads.delete(threadId);
            this.messages.delete(threadId);
        }
    };

    // 暴露任务拆解 Store
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (key, val) => {
        if (key === 'task-breakdown-storage') {
            console.log('[E2E] Intercepted Task Breakdown Store Save');
        }
        return originalSetItem(key, val);
    };

    // D. 运行时状态稳定器 (防止组件挂载后的状态偏移)
    setInterval(() => {
        if ((window as any).__E2E_SKIP_STABILIZER__) return;

        // 🔥 真实 AI 模式：不覆盖 settings，让它保持 E2E 配置
        const realAIConfig = (window as any).__E2E_REAL_AI_CONFIG__;
        if (realAIConfig && realAIConfig.useRealAI) {
            // 真实 AI 模式：只初始化 FileStore，不修改 settings
            const file = (window as any).__fileStore?.getState();
            if (file && (!file.rootPath || !file.fileTree)) {
                console.log('[E2E Mock] Initializing FileStore state...');
                file.setRootPath('/Users/mac/mock-project');
                file.setFileTree({
                    id: 'root',
                    name: 'mock-project',
                    kind: 'directory',
                    path: '/Users/mac/mock-project',
                    children: [
                        { id: 'app-tsx', name: 'App.tsx', kind: 'file', path: '/Users/mac/mock-project/App.tsx' },
                        { id: 'main-tsx', name: 'main.tsx', kind: 'file', path: '/Users/mac/mock-project/main.tsx' }
                    ]
                });
            }
            return;
        }

        // 🔥 Mock 模式：重置为 kimi-e2e
        const settings = (window as any).__settingsStore?.getState();
        if (settings && settings.currentProviderId !== 'kimi-e2e') {
            settings.updateSettings({ currentProviderId: 'kimi-e2e', currentModel: 'kimi-k2-thinking' });
        }
        const file = (window as any).__fileStore?.getState();
        if (file && (!file.rootPath || !file.fileTree)) {
            console.log('[E2E Mock] Initializing FileStore state...');
            file.setRootPath('/Users/mac/mock-project');
            file.setFileTree({ 
                id: 'root', 
                name: 'mock-project', 
                kind: 'directory', 
                path: '/Users/mac/mock-project', 
                children: [
                    { id: 'app-tsx', name: 'App.tsx', kind: 'file', path: '/Users/mac/mock-project/App.tsx' },
                    { id: 'main-tsx', name: 'main.tsx', kind: 'file', path: '/Users/mac/mock-project/main.tsx' }
                ] 
            });
        }
    }, 1000);

    // E. 自动刷新 proposal 索引（延迟执行，确保 store 已初始化）
    setTimeout(async () => {
      try {
        const proposalStore = (window as any).__proposalStore;
        if (proposalStore) {
          console.log('[E2E] Auto-refreshing proposal index...');
          await proposalStore.getState().refreshIndex();
          console.log('[E2E] Proposal index refreshed:', proposalStore.getState().index);
        } else {
          console.warn('[E2E] Proposal store not found');
        }
      } catch (e) {
        console.error('[E2E] Failed to refresh proposal index:', e);
      }
    }, 500);

    // 🔥 商业版：确保 ifainew-core 的 store 被暴露到 window
    setTimeout(() => {
      if (!(window as any).__chatStore) {
        console.log('[E2E] __chatStore not found, attempting to set from module...');
        // 尝试从全局作用域获取 ifainew-core 的 useChatStore
        try {
          // 检查是否可以通过 require/import 获取
          const stores = (window as any).___stores___;
          if (stores && stores.useChatStore) {
            (window as any).__chatStore = stores.useChatStore;
            console.log('[E2E] __chatStore set from ___stores___');
          }
        } catch (e) {
          console.warn('[E2E] Could not set __chatStore:', e);
        }
      } else {
        console.log('[E2E] __chatStore already available');
      }

      // 🔥 Mock atomicWriteService for E2E tests
      (window as any).__atomicWriteService = {
        executeAtomicWrite: async (operations: any[], options?: any) => {
          console.log('[E2E Mock] atomicWriteService.executeAtomicWrite called with', operations.length, 'operations');
          // 模拟成功执行
          return {
            success: true,
            applied: operations.length,
            conflicts: []
          };
        }
      };
      console.log('[E2E] atomicWriteService mocked');

      // 🔥 v0.2.9 E2E 测试：向现有 store 添加 v0.2.9 方法
      // 这些方法将在应用初始化后被添加到现有 store 中
      const addV029Methods = () => {
        // EditorStore: 添加 openFile 便捷方法（用于 E2E 测试）
        const editorStore = (window as any).__editorStore;
        if (editorStore) {
          // Create the openFile function
          const openFileFunc = (filePath: string) => {
            console.log('[E2E v0.2.9] editorStore.openFile:', filePath);
            const fileStore = (window as any).__fileStore;
            const layoutStore = (window as any).__layoutStore;
            const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;

            if (!fileStore || !layoutStore || !mockFS) {
              console.error('[E2E v0.2.9] Required stores not available');
              return;
            }

            // Get content from mock file system - try multiple path variations
            let content = mockFS.get(filePath);
            if (!content) {
              // Try without /test-project prefix
              const relativePath = filePath.replace('/test-project/', '');
              content = mockFS.get(relativePath);
              console.log('[E2E v0.2.9] Trying relative path:', relativePath, 'found:', !!content);
            }
            if (!content) {
              // Try with /test-project prefix
              const absolutePath = filePath.startsWith('/test-project/') ? filePath : `/test-project/${filePath.replace(/^\//, '')}`;
              content = mockFS.get(absolutePath);
              console.log('[E2E v0.2.9] Trying absolute path:', absolutePath, 'found:', !!content);
            }

            // Create OpenedFile object
            const fileName = filePath.split('/').pop() || 'unknown';
            const language = fileName.endsWith('.tsx') ? 'typescript' :
                            fileName.endsWith('.ts') ? 'typescript' :
                            fileName.endsWith('.jsx') ? 'javascript' :
                            fileName.endsWith('.js') ? 'javascript' :
                            fileName.endsWith('.py') ? 'python' :
                            'plaintext';

            const openedFile = {
              id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              path: filePath,
              name: fileName,
              content: content || '// Empty file',
              isDirty: false,
              language: language
            };

            // Open file in fileStore
            const fileId = fileStore.getState().openFile(openedFile);

            // Assign to active pane
            const layoutState = layoutStore.getState();
            if (layoutState.activePaneId) {
              layoutStore.getState().assignFileToPane(layoutState.activePaneId, fileId);
              console.log('[E2E v0.2.9] File assigned to pane:', layoutState.activePaneId);
            }

            return fileId;
          };

          // Add to store (direct method call)
          if (!editorStore.openFile) {
            console.log('[E2E v0.2.9] Adding openFile to editorStore');
            editorStore.openFile = openFileFunc;
          }

          // Wrap getState to inject openFile into state snapshot
          const originalGetState = editorStore.getState.bind(editorStore);
          editorStore.getState = () => {
            const state = originalGetState();
            if (!state.openFile) {
              state.openFile = openFileFunc;
            }
            return state;
          };
        }

        // LayoutStore: 添加 toggleReviewHistory 方法
        const layoutStore = (window as any).__layoutStore;
        if (layoutStore && !layoutStore.toggleReviewHistory) {
          console.log('[E2E v0.2.9] Adding toggleReviewHistory to layoutStore');
          const originalGetState = layoutStore.getState.bind(layoutStore);
          layoutStore.toggleReviewHistory = () => {
            const state = originalGetState();
            state.isReviewHistoryVisible = !state.isReviewHistoryVisible;
            console.log('[E2E v0.2.9] toggleReviewHistory:', state.isReviewHistoryVisible);
          };
          // 同时添加到 state 对象（向后兼容）
          const state = layoutStore.getState();
          if (!state.toggleReviewHistory) {
            state.toggleReviewHistory = layoutStore.toggleReviewHistory;
          }
        }

        // ReviewStore: 如果不存在则创建 mock（v0.2.9 新功能）
        const reviewStore = (window as any).__reviewStore;
        if (!reviewStore) {
          console.log('[E2E v0.2.9] Creating __reviewStore mock');
          (window as any).__reviewStore = {
            getState: () => ({
              reviewHistory: [],
              customRules: [],
              addReviewHistory: (review: any) => {
                console.log('[E2E v0.2.9] addReviewHistory:', review.id);
                const history = (window as any).__reviewHistory || [];
                history.push(review);
                (window as any).__reviewHistory = history;
              },
              setCustomRules: (rules: any[]) => {
                console.log('[E2E v0.2.9] setCustomRules:', rules.length, 'rules');
                (window as any).__customRules = rules;
              },
              getReviewHistory: () => (window as any).__reviewHistory || [],
              getCustomRules: () => (window as any).__customRules || [],
              toggleReviewHistory: () => {
                console.log('[E2E v0.2.9] ReviewStore.toggleReviewHistory');
                (window as any).__reviewHistoryVisible = !((window as any).__reviewHistoryVisible || false);
              }
            })
          };
        }

        // TerminalStore: 如果不存在则创建 mock（v0.2.9 新功能）
        const terminalStore = (window as any).__terminalStore;
        if (!terminalStore) {
          console.log('[E2E v0.2.9] Creating __terminalStore mock');
          (window as any).__terminalStore = {
            getState: () => ({
              isFixApplied: false,
              lastCommand: '',
              setFixApplied: (applied: boolean) => {
                console.log('[E2E v0.2.9] setFixApplied:', applied);
                (window as any).__isFixApplied = applied;
              },
              executeCommand: async (command: string) => {
                console.log('[E2E v0.2.9] executeCommand:', command);
                (window as any).__lastCommand = command;
                return { stdout: 'Mock output', stderr: '', exitCode: 0 };
              }
            })
          };
        }

        // SymbolIndexer: 如果不存在则创建 mock（v0.2.9 新功能）
        const symbolIndexer = (window as any).__symbolIndexer;
        if (!symbolIndexer) {
          console.log('[E2E v0.2.9] Creating __symbolIndexer mock');
          (window as any).__symbolIndexer = {
            indexFile: async (filePath: string, content: string) => {
              console.log('[E2E v0.2.9] symbolIndexer.indexFile:', filePath);
              const symbols = (window as any).__symbolIndex || new Map();
              // 简单解析 exports
              const exportRegex = /export\s+(?:function|class|const|let|var)\s+(\w+)/g;
              let match;
              while ((match = exportRegex.exec(content)) !== null) {
                symbols.set(match[1], { name: match[1], file: filePath, kind: 'function' });
              }
              (window as any).__symbolIndex = symbols;
            },
            queryInScope: async (scope: any) => {
              console.log('[E2E v0.2.9] symbolIndexer.queryInScope');
              return Array.from(((window as any).__symbolIndex || new Map()).values());
            }
          };
        }

        console.log('[E2E v0.2.9] ✅ v0.2.9 methods added to stores');
      };

      // 首次尝试添加
      addV029Methods();

      // 如果第一次失败，继续尝试直到成功（最多 10 次）
      let attempts = 0;
      const v029Interval = setInterval(() => {
        attempts++;
        const layoutStore = (window as any).__layoutStore;
        if (layoutStore && !layoutStore.toggleReviewHistory) {
          console.log(`[E2E v0.2.9] Retrying to add methods (attempt ${attempts})`);
          addV029Methods();
        }
        if (attempts >= 10 || (layoutStore && layoutStore.toggleReviewHistory)) {
          clearInterval(v029Interval);
          console.log('[E2E v0.2.9] Finished adding v0.2.9 methods');
        }
      }, 500);
    }, 1000);
  }, { useRealAI, realAIApiKey, realAIBaseUrl, realAIModel });
}