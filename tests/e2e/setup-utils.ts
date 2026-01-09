import { Page } from '@playwright/test';

/**
 * 设置 E2E 测试环境，强力锁定应用状态
 */
export async function setupE2ETestEnvironment(page: Page) {
  // 1. Mock API
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

  // 2. 注入核心拦截与锁定脚本
  await page.addInitScript(() => {
    // A. 深度 Mock Tauri with event support
    // Put eventListeners on window so it's accessible from Mock code
    (window as any).__TAURI_EVENT_LISTENERS__ = {};

    // 🔥 内存文件系统，用于跟踪文件内容和回滚测试
    const mockFileSystem = new Map<string, string>();
    // 暴露到 window 以便其他函数可以访问
    (window as any).__E2E_MOCK_FILE_SYSTEM__ = mockFileSystem;

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

            // 返回简单消息（避免嵌套结构）
            // 🔥 前端的 enhancedResult 会包含 originalContent 和 newContent
            return `File written: ${args.relPath}`;
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
            // Mock streaming response that sends content and triggers _finish event
            const eventId = args?.event_id || 'mock-event-id';
            const messages = args?.messages || [];
            const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
            const query = lastUserMsg?.content?.Text || lastUserMsg?.content || '';

            // Check if this is a bash command request
            const isBashCommand = query.includes('执行') || query.includes('运行') ||
                                 query.includes('python') || query.includes('java') ||
                                 query.includes('curl') || query.includes('whoami') ||
                                 query.includes('sleep') || query.includes('git') ||
                                 query.includes('npm') || query.includes('cargo');

            let responseContent = 'Mock AI response: Task completed successfully.';

            // Simulate async streaming
            setTimeout(() => {
                const streamListeners = (window as any).__TAURI_EVENT_LISTENERS__[eventId] || [];

                if (isBashCommand) {
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
        getVersion: async () => '0.2.6',
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
    (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string, args?: any) => {
      if (cmd === 'list_proposals') return await mockListProposals();
      if (cmd === 'load_proposal') return await mockLoadProposal(args);
      return originalMockInvoke(cmd, args);
    };

    // B. 强力劫持 LocalStorage 防止被 SettingsStore 初始化覆盖
    const providers = [{
        id: 'ollama-e2e', name: 'Ollama Mock', protocol: 'openai', 
        baseUrl: 'http://localhost:11434/v1/chat/completions', 
        apiKey: 'e2e-token', models: ['mock-model'], enabled: true
    }];
    
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
        'settings-storage': { state: { currentProviderId: 'ollama-e2e', currentModel: 'mock-model', providers }, version: 0 },
        'thread-storage': { state: { activeThreadId: 'e2e-thread-1', threads: [{ id: 'e2e-thread-1', messages: [] }] }, version: 0 },
        // 🔥 修复持久化测试:保留 panes 等状态的持久化
        'layout-storage': (existing: any) => ({
          ...existing,
          state: {
            ...(existing?.state || {}),
            isChatOpen: true,
            isSidebarOpen: true,
          },
          version: existing?.version || 0,
        }),
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
            await store.sendMessage(text, 'ollama-e2e', 'mock-model');
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
        const fileStore = (window as any).__fileStore?.getState();
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
            fileStore.openFile({
                id: `mock-${name}`,
                path: filePath,
                name: name,
                content: fileContent,
                isDirty: false,
                language: 'typescript'
            });
            // Auto assign to active pane if possible
            const layoutStore = (window as any).__layoutStore?.getState();
            if (layoutStore && layoutStore.activePaneId) {
                layoutStore.assignFileToPane(layoutStore.activePaneId, `mock-${name}`);
            }
        }

        // 🔥 初始化 mock 文件系统，确保文件存在
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        if (mockFileSystem && !mockFileSystem.has(filePath)) {
            mockFileSystem.set(filePath, fileContent);
            console.log('[E2E Mock] Initialized file system with:', name);
        }
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
        
        const settings = (window as any).__settingsStore?.getState();
        if (settings && settings.currentProviderId !== 'ollama-e2e') {
            settings.updateSettings({ currentProviderId: 'ollama-e2e', currentModel: 'mock-model' });
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
    }, 1000);
  });
}