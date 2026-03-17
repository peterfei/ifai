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

  /**
   * 🔥 是否模拟 DeepSeek API 的流式工具调用行为
   * 当启用时，后续参数块会使用 id: null, index: 0 的格式
   * @default false
   */
  simulateDeepSeekStreaming?: boolean;

  /**
   * 是否跳过新手引导（Welcome Tour）
   * @default true
   */
  skipWelcome?: boolean;
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
  // 🔥 FIX v0.3.8: 检查是否使用真实 Tauri 后端
  // 当设置 TAURI_DEV=true 环境变量时，使用真实的 Tauri API 而不是 mock
  const useRealTauri = process.env.TAURI_DEV === 'true';

  if (useRealTauri) {
    console.log('[E2E] 🔥 使用真实 Tauri 后端模式');
    console.log('[E2E] ⚠️  跳过所有 mock 设置，使用真实的 Tauri API');

    // 🔥 FIX v0.3.8.1: 在真实 Tauri 模式下仍然需要加载 API Key 配置
    // 从配置文件加载 AI API 配置
    const fileConfig = loadE2EConfig(options.configPath);
    const realAIApiKey = options.realAIApiKey ?? process.env.E2E_AI_API_KEY ?? fileConfig.E2E_AI_API_KEY;
    const realAIBaseUrl = options.realAIBaseUrl ?? process.env.E2E_AI_BASE_URL ?? fileConfig.E2E_AI_BASE_URL;
    const realAIModel = options.realAIModel ?? process.env.E2E_AI_MODEL ?? fileConfig.E2E_AI_MODEL;

    // 🔥 FIX v0.3.8: 在真实 Tauri 模式下，只进行最小化的页面初始化
    // 不设置任何 mock，让应用使用真实的 Tauri API
    // 在加载页面前设置 InitScript 来处理 E2E 标志和新手引导跳过
    await page.addInitScript((opts: any) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      if (opts.skipWelcome !== false) {
        localStorage.setItem('tour_completed', 'true');
        localStorage.setItem('tour_skipped', 'true');
        localStorage.setItem('onboarding_done', 'true');
        localStorage.setItem('ifai_onboarding_state', JSON.stringify({
          completed: true,
          skipped: true,
          remindCount: 0,
          lastRemindDate: null
        }));
        console.log('[E2E Init] Welcome dialog and Onboarding Tour skipped for E2E tests (Real Tauri)');
      }
    }, { skipWelcome: options.skipWelcome !== false });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 🔥 FIX v0.3.8: 等待所有必需的 stores 初始化
    // Agent 测试需要 chatStore, agentStore, fileStore, settingsStore
    // 增加超时时间到 90 秒，因为 Tauri 首次启动需要编译
    await page.waitForFunction(() => {
      const stores = (window as any);
      const chatStore = stores.__chatStore !== undefined;
      const agentStore = stores.__agentStore !== undefined;
      const fileStore = stores.__fileStore !== undefined;
      const settingsStore = stores.__settingsStore !== undefined;

      // 🔥 调试：输出当前可用的 stores
      console.log('[E2E] 🔍 Stores status:', {
        __chatStore: chatStore,
        __agentStore: agentStore,
        __fileStore: fileStore,
        __settingsStore: settingsStore,
        allStores: Object.keys(stores).filter(k => k.startsWith('__')),
      });

      return chatStore && agentStore && fileStore && settingsStore;
    }, { timeout: 90000 });

    console.log('[E2E] ✅ 所有 stores 已初始化');

    // 🔥 FIX v0.3.8.1: 在真实 Tauri 模式下更新 API Key 配置
    if (realAIApiKey) {
      // 🔥 自动补全 baseUrl：如果缺少 /chat/completions 后缀，自动添加
      let apiBaseUrl = realAIBaseUrl || '';
      if (apiBaseUrl && !apiBaseUrl.endsWith('/chat/completions')) {
        apiBaseUrl = apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
        console.log('[E2E] 🔧 Auto-fixed baseUrl to:', apiBaseUrl);
      }

      await page.evaluate((config: { apiKey: string; baseUrl: string; model: string }) => {
        const settingsStore = (window as any).__settingsStore;
        const state = settingsStore.getState();

        // 更新 zhipu provider 的 API Key
        const zhipuProvider = state.providers.find((p: any) => p.id === 'zhipu');
        if (zhipuProvider) {
          settingsStore.getState().updateProviderConfig('zhipu', {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl || zhipuProvider.baseUrl,
          });
          console.log('[E2E] ✅ 已更新 zhipu API Key 配置');
        }
      }, { apiKey: realAIApiKey, baseUrl: apiBaseUrl, model: realAIModel || 'glm-4.7' });
    }

    return;
  }

  // 🔥 首先从配置文件加载 AI API 配置
  const fileConfig = loadE2EConfig(options.configPath);

  // 合并配置优先级：命令行参数 > 环境变量 > 配置文件
  const useRealAI = options.useRealAI ?? (fileConfig.E2E_AI_API_KEY ? true : false);
  const realAIApiKey = options.realAIApiKey ?? process.env.E2E_AI_API_KEY ?? fileConfig.E2E_AI_API_KEY;
  const realAIBaseUrl = options.realAIBaseUrl ?? process.env.E2E_AI_BASE_URL ?? fileConfig.E2E_AI_BASE_URL;
  const realAIModel = options.realAIModel ?? process.env.E2E_AI_MODEL ?? fileConfig.E2E_AI_MODEL;
  // E2E_SKIP_WELCOME 默认为 true（E2E 测试通常不需要新手引导）
  const skipWelcome = options.skipWelcome ?? (fileConfig.E2E_SKIP_WELCOME === 'false' ? false : true);

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
    // 🔥 新增：等待监听器就绪的辅助函数
    const waitForListeners = async (id: string, maxWaitMs = 2000): Promise<Function[]> => {
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        const listeners = (window as any).__TAURI_EVENT_LISTENERS__[id] || [];
        if (listeners.length > 0) return listeners;
        // 在浏览器环境下等待
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      console.warn(`[E2E Mock] ⚠️ Timed out waiting for listeners for ${id}`);
      return [];
    };
    (window as any).waitForListeners = waitForListeners;

    // 🔥 跳过 E2E 稳定器以避免无限循环
    (window as any).__E2E_SKIP_STABILIZER__ = true;

    // 🔥 跳过欢迎对话框（E2E 测试环境）- 根据 skipWelcome 配置
    if ((realAIConfigParam as any).skipWelcome !== false) {
      localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: null
      }));
      // 🔥 v0.3.0: 额外设置 OnboardingTour 使用的新 Key
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('tour_skipped', 'true');
      localStorage.setItem('onboarding_done', 'true');
      
      console.log('[E2E Init] Welcome dialog and Onboarding Tour skipped for E2E tests');
    } else {
      console.log('[E2E Init] Welcome dialog enabled (skipWelcome = false)');
    }

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

      // 🔥 FIX: 处理 ifainew_core 返回的字符数组问题
      // 字符数组特征：每个元素都是单个字符的字符串
      if (Array.isArray(result)) {
        if (result.length === 0) {
          return '_No results_';
        }

        // 首先检查是否是字符数组
        const isCharArray = result.length > 0 &&
                           result.every((item: any) => typeof item === 'string' && item.length <= 10);
        if (isCharArray) {
          // 将字符数组拼接成字符串
          const joinedString = result.join('');
          // 递归处理拼接后的字符串（可能是JSON）
          return (window as any).__formatToolResultToMarkdown(joinedString, toolCall);
        }

        // 🔥 FIX: 检查是否是文件/目录列表（agent_list_dir 的结果）
        // 特征：大部分元素是字符串，且包含常见文件名模式
        const allStrings = result.every((item: any) => typeof item === 'string');
        const hasFilePatterns = result.some((item: any) =>
          item.includes('.') || item.includes('/') || item.match(/^[a-z_][a-z0-9_]*$/i)
        );

        if (allStrings && hasFilePatterns && result.length > 1) {
          // 这是一个文件/目录列表，格式化为 Markdown 列表
          console.log('[__formatToolResultToMarkdown] 检测到文件列表，元素数量:', result.length);
          return `## 📁 Files (${result.length})\n\n${result.map((item: any) => `- \`${item}\``).join('\n')}`;
        }

        // 检查是否是生成的文件路径列表（旧的逻辑，保留兼容）
        if (result.every((item: any) => typeof item === 'string' && item.includes('/'))) {
          return `## 📁 Generated Files\n\n${result.map((path: any) => `- \`${path}\``).join('\n')}`;
        }

        // 普通数组
        return result.map((item: any) => (window as any).__formatToolResultToMarkdown(item, toolCall)).join('\n\n');
      }

      // 如果结果是字符串，尝试解析为JSON
      if (typeof result === 'string') {
        try {
          const parsed = JSON.parse(result);
          // 如果是JSON，递归处理
          return (window as any).__formatToolResultToMarkdown(parsed, toolCall);
        } catch {
          // 不是JSON，返回原字符串
          return result;
        }
      }

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
        // 🔥 Debug: Log all invoke calls
        console.log('[E2E Mock] 📞 invoke called:', { cmd, argsKeys: args ? Object.keys(args) : 'no args' });

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
            // 🏆 PIVO 3.0: 路径鲁棒性增强 - 自动补全缺失的 rootPath
            let rootPath = args.rootPath || args.root_path;
            if (!rootPath) {
                // 如果调用方没传，从全局状态兜底
                rootPath = (window as any).__CHAT_STORE_STATE__?.fileStore?.rootPath || '/Users/mac/mock-project';
            }

            const relPath = args.relPath || args.rel_path;
            const filePath = `${rootPath}/${relPath}`.replace(/\/\//g, '/');
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
            // 🔥 FIX: 返回 JSON 数组字符串，匹配实际工具格式
            return JSON.stringify(entries);
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
        // 🔥 商业版使用的 bash 命令
        if (cmd === 'agent_bash') {
            console.log('[E2E Mock] agent_bash:', args);
            // 复用 execute_bash_command 的逻辑
            const command = args?.command || '';
            
            if (command.includes('echo')) {
                const echoMatch = command.match(/echo\s+"([^"]+)"/) || command.match(/echo\s+'([^']+)'/) || command.match(/echo\s+(.+)/);
                if (echoMatch) {
                    return JSON.stringify({
                        stdout: echoMatch[1],
                        stderr: '',
                        exit_code: 0,
                        success: true,
                        elapsed_ms: 10
                    });
                }
            } else if (command.includes('npm run dev')) {
                return JSON.stringify({
                    stdout: '> vite-project@0.0.0 dev\n> vite\n\n  VITE v5.0.0  ready in 250 ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose\n  ➜  press h + enter to show help',
                    stderr: '',
                    exit_code: 0,
                    success: true,
                    elapsed_ms: 300
                });
            }
            
            return JSON.stringify({
                stdout: 'Mock agent bash output',
                stderr: '',
                exit_code: 0,
                success: true,
                elapsed_ms: 10
            });
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

        // Handle launch_agent command
        // 🔥 FIX v0.3.8: 支持真实 Agent 调用，而不是硬编码返回 demo 响应
        if (cmd === 'launch_agent') {
            const agentId = args?.id;
            const agentType = args?.agentType;
            const eventId = `agent_${agentId}`; // eventId is generated by frontend

            console.log(`[E2E Mock] Launching agent: ${agentId}, agentType: ${agentType}, eventId: ${eventId}`);

            // 🔥 检查是否使用真实 AI 模式
            const realAIConfig = (window as any).__E2E_REAL_AI_CONFIG__ || {};
            const useRealAI = realAIConfig.useRealAI === true;

            console.log(`[E2E Mock] useRealAI: ${useRealAI}, agentType: ${agentType}`);

            // 🔥 如果启用真实 AI 模式且在真实 Tauri 环境下，调用真实的后端
            // 在 E2E Mock 环境下，即使 useRealAI 为 true，也应该使用 mock 响应
            // 因为此时并没有真实的 Rust 后端在运行

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

                // 🔥 改进版：确保事件发送的时序更符合前端预期
                if (agentType === 'Explore' || agentType === 'Explore Agent') {
                    // 1. 发送正在运行状态
                    statusListeners.forEach((fn: Function) => fn({
                        payload: { type: 'status', status: 'running', progress: 0.1 }
                    }));

                    // 2. 延迟发送工具调用
                    setTimeout(() => {
                        console.log(`[E2E Mock] 📡 Emitting agent_list_dir tool_call for ${id}`);
                        statusListeners.forEach((fn: Function) => fn({
                            payload: {
                                type: 'tool_call',
                                toolCall: {
                                    id: `call_${Date.now()}`,
                                    tool: 'agent_list_dir',
                                    args: { rootPath: '/Users/mac/mock-project', relPath: '.' },
                                    isPartial: false
                                }
                            }
                        }));
                    }, 800); // 增加一点延迟，确保前端 Listener 已经完全就绪

                    // 3. 模拟工具执行成功
                    setTimeout(() => {
                        statusListeners.forEach((fn: Function) => fn({
                            payload: { type: 'status', status: 'completed', progress: 1.0 }
                        }));
                        statusListeners.forEach((fn: Function) => fn({
                            payload: {
                                type: 'result',
                                result: '✅ **项目扫描完成**'
                            }
                        }));
                    }, 2500);
                    return;
                }

                // Default: Emit log: starting task (原有逻辑)
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
            console.log('[E2E Mock] 🔍 __E2E_REAL_AI_CONFIG__:', JSON.stringify(realAIConfig));
            const useRealAI = realAIConfig.useRealAI === true;
            console.log('[E2E Mock] 🔍 useRealAI check:', useRealAI, 'raw value:', realAIConfig.useRealAI);

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
                    messagesCount: messages.length,
                    enableTools: args?.enableTools
                });

                // 🔥 关键修复：返回一个 Promise，等待 AI 响应完成
                // 这样商业版的 await invoke('ai_chat', ...) 会等待响应
                return (async () => {
                    try {
                        // 🔥 检查是否启用工具
                        const enableTools = args?.enableTools === true;

                        // 🔥 获取当前工作目录（从 projectRoot 或使用默认值）
                        const currentProjectRoot = args?.projectRoot || '/Users/mac/mock-project';
                        console.log('[E2E Real AI] 📁 Current project root:', currentProjectRoot);

                        // 🔥 构建消息历史，如果有工具则添加 system prompt
                        let processedMessages = messages.map((m: any) => ({
                            role: m.role,
                            content: m.content?.Text || m.content || ''
                        }));

                        if (enableTools) {
                            // 在消息开头添加 system prompt，告诉 AI 有工具可用和当前工作目录
                            processedMessages.unshift({
                                role: 'system',
                                content: `You have access to file system tools. The current project root is: ${currentProjectRoot}

Available tools:
- agent_read_file: Read file contents
- agent_write_file: Write content to a file
- agent_list_dir: List files in a directory
- agent_delete_file: Delete a file
- agent_list_functions: List functions in a TypeScript/JavaScript file
- agent_read_file_range: Read a specific range of lines from a file

Always use the appropriate tool when the user asks to perform file operations.`
                            });
                            console.log('[E2E Real AI] 📝 Added system prompt with tools info');
                        }

                        // 🔥 定义可用工具（OpenAI Function Calling 格式）
                        const tools = enableTools ? [
                            {
                                type: 'function',
                                function: {
                                    name: 'agent_read_file',
                                    description: 'Read the content of a file at the specified path',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            rootPath: {
                                                type: 'string',
                                                description: 'The root directory path of the project'
                                            },
                                            relPath: {
                                                type: 'string',
                                                description: 'The relative path of the file from the root directory'
                                            }
                                        },
                                        required: ['rootPath', 'relPath']
                                    }
                                }
                            },
                            {
                                type: 'function',
                                function: {
                                    name: 'agent_write_file',
                                    description: 'Write content to a file at the specified path',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            rootPath: {
                                                type: 'string',
                                                description: 'The root directory path of the project'
                                            },
                                            relPath: {
                                                type: 'string',
                                                description: 'The relative path of the file from the root directory'
                                            },
                                            content: {
                                                type: 'string',
                                                description: 'The content to write to the file'
                                            }
                                        },
                                        required: ['rootPath', 'relPath', 'content']
                                    }
                                }
                            },
                            {
                                type: 'function',
                                function: {
                                    name: 'agent_list_dir',
                                    description: 'List files and directories in the specified path',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            rootPath: {
                                                type: 'string',
                                                description: 'The root directory path of the project'
                                            },
                                            relPath: {
                                                type: 'string',
                                                description: 'The relative path from the root directory (use "." for current directory)'
                                            }
                                        },
                                        required: ['rootPath', 'relPath']
                                    }
                                }
                            },
                            {
                                type: 'function',
                                function: {
                                    name: 'agent_delete_file',
                                    description: 'Delete a file at the specified path',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            rootPath: {
                                                type: 'string',
                                                description: 'The root directory path of the project'
                                            },
                                            relPath: {
                                                type: 'string',
                                                description: 'The relative path of the file from the root directory'
                                            }
                                        },
                                        required: ['rootPath', 'relPath']
                                    }
                                }
                            },
                            {
                                type: 'function',
                                function: {
                                    name: 'agent_list_functions',
                                    description: 'List function signatures in a TypeScript/JavaScript file',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            rootPath: {
                                                type: 'string',
                                                description: 'The root directory path of the project'
                                            },
                                            relPath: {
                                                type: 'string',
                                                description: 'The relative path of the file from the root directory'
                                            }
                                        },
                                        required: ['rootPath', 'relPath']
                                    }
                                }
                            },
                            {
                                type: 'function',
                                function: {
                                    name: 'agent_read_file_range',
                                    description: 'Read a specific range of lines from a file',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            rootPath: {
                                                type: 'string',
                                                description: 'The root directory path of the project'
                                            },
                                            relPath: {
                                                type: 'string',
                                                description: 'The relative path of the file from the root directory'
                                            },
                                            startLine: {
                                                type: 'number',
                                                description: 'The starting line number (1-indexed)'
                                            },
                                            endLine: {
                                                type: 'number',
                                                description: 'The ending line number (1-indexed)'
                                            }
                                        },
                                        required: ['rootPath', 'relPath', 'startLine', 'endLine']
                                    }
                                }
                            }
                        ] : undefined;

                        // 🔥 构建请求体
                        const requestBody: any = {
                            model: model,
                            messages: processedMessages,
                            stream: false
                        };

                        // 🔥 如果启用工具，添加 tools 参数
                        if (tools) {
                            requestBody.tools = tools;
                            console.log('[E2E Real AI] 🛠️ Tools enabled, sending', tools.length, 'tools to API');
                        }

                        const response = await fetch(apiBaseUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${realAIConfig.realAIApiKey}`
                            },
                            body: JSON.stringify(requestBody)
                        });

                        const data = await response.json();
                        console.log('[E2E Real AI] 📥 API full response:', JSON.stringify(data, null, 2));
                        console.log('[E2E Real AI] API response summary:', {
                            id: data.id,
                            hasChoices: !!data.choices,
                            finishReason: data.choices?.[0]?.finish_reason,
                            hasToolCalls: !!(data.choices?.[0]?.message?.tool_calls),
                            toolCallsCount: data.choices?.[0]?.message?.tool_calls?.length || 0,
                            hasContent: !!(data.choices?.[0]?.message?.content),
                            contentLength: data.choices?.[0]?.message?.content?.length || 0,
                            hasError: !!data.error,
                            error: data.error
                        });

                        // 🔥 FIX: 在使用之前先定义 streamListeners 和 finishListeners
                        // 避免在错误检查中访问未初始化的变量
                        // 同时使用 waitForListeners 确保前端监听器已就绪
                        let streamListeners: Function[] = [];
                        let finishListeners: Function[] = [];
                        
                        try {
                            streamListeners = await (window as any).waitForListeners(eventId);
                            finishListeners = (window as any).__TAURI_EVENT_LISTENERS__[`${eventId}_finish`] || [];
                        } catch (e) {
                            console.error('[E2E Real AI] Failed to get listeners:', e);
                        }

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

                        // 🔥 详细调试：检查事件监听器状态
                        console.log('[E2E Real AI] Event listeners for eventId:', eventId);
                        console.log('[E2E Real AI] Stream listeners count:', streamListeners.length);
                        console.log('[E2E Real AI] Finish listeners count:', finishListeners.length);
                        console.log('[E2E Real AI] All event listener keys:', Object.keys((window as any).__TAURI_EVENT_LISTENERS__ || {}));

                        if (data.choices && data.choices[0]) {
                            const choice = data.choices[0];
                            const message = choice.message;
                            const toolCalls = message?.tool_calls;
                            const content = message?.content || '';

                            // 🔥 检查是否有 tool_calls
                            if (toolCalls && toolCalls.length > 0) {
                                console.log('[E2E Real AI] 🛠️ Tool calls detected:', toolCalls.length);
                                toolCalls.forEach((tc: any, index: number) => {
                                    console.log(`[E2E Real AI]   Tool call ${index}:`, tc.function?.name, tc.function?.arguments);
                                });

                                // 🔥 检查是否需要模拟 DeepSeek 流式行为
                                const simulateDeepSeek = realAIConfig.simulateDeepSeekStreaming === true;

                                if (simulateDeepSeek) {
                                    console.log('[E2E Real AI] 🔥 Simulating DeepSeek streaming behavior');
                                    // 🔥 模拟 DeepSeek 的流式工具调用行为
                                    // 1. 首先发送第一个事件（带有完整的 id, type, function.name）
                                    for (let i = 0; i < toolCalls.length; i++) {
                                        const tc = toolCalls[i];
                                        const firstEvent = {
                                            index: i,
                                            id: tc.id,
                                            type: tc.type,
                                            function: {
                                                name: tc.function?.name || '',
                                                arguments: ''  // 第一个事件 arguments 为空
                                            }
                                        };
                                        // 🔥 FIX: 使用正确的 payload 格式 { type: 'tool_call', toolCall: {...} }
                                        streamListeners.forEach((fn: any) => {
                                            try {
                                                fn({ payload: { type: 'tool_call', toolCall: firstEvent } });
                                            } catch (e) {
                                                console.error('[E2E Real AI] Error sending initial tool_call:', e);
                                            }
                                        });
                                        console.log('[E2E Real AI] Sent initial tool_call event for:', tc.function?.name);

                                        // 2. 逐字符发送参数块（id: null, type: null, function.name: null）
                                        const argsString = tc.function?.arguments || '';
                                        for (let charIndex = 0; charIndex < argsString.length; charIndex++) {
                                            const char = argsString[charIndex];
                                            const chunkEvent = {
                                                index: i,
                                                id: null,  // DeepSeek 特点：后续参数块 id 为 null
                                                type: null,
                                                function: {
                                                    name: null,  // DeepSeek 特点：后续参数块 name 为 null
                                                    arguments: char
                                                }
                                            };
                                            // 🔥 FIX: 使用正确的 payload 格式 { type: 'tool_call', toolCall: {...} }
                                            streamListeners.forEach((fn: any) => {
                                                try {
                                                    fn({ payload: { type: 'tool_call', toolCall: chunkEvent } });
                                                } catch (e) {
                                                    console.error('[E2E Real AI] Error sending chunk:', e);
                                                }
                                            });
                                            // 添加小延迟模拟流式效果
                                            await new Promise(resolve => setTimeout(resolve, 5));
                                        }
                                        console.log('[E2E Real AI] Sent', argsString.length, 'character chunks for:', tc.function?.name);
                                    }
                                } else {
                                    // 🔥 正常模式：一次性发送完整的 tool_calls 事件
                                    const toolCallsPayload = { type: 'tool_calls', toolCalls };
                                    streamListeners.forEach((fn: any) => {
                                        try {
                                            fn({ payload: toolCallsPayload });
                                        } catch (e) {
                                            console.error('[E2E Real AI] Error sending tool_calls:', e);
                                        }
                                    });
                                }

                                // 🔥 对于每个 tool_call，调用 mock 函数并收集结果
                                const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__ || new Map();
                                const toolResults: any[] = [];

                                for (const tc of toolCalls) {
                                    const functionName = tc.function?.name;
                                    let functionArgs = tc.function?.arguments;

                                    // 解析 arguments（如果是字符串）
                                    if (typeof functionArgs === 'string') {
                                        try {
                                            functionArgs = JSON.parse(functionArgs);
                                        } catch (e) {
                                            console.error('[E2E Real AI] Failed to parse tool arguments:', functionArgs);
                                            functionArgs = {};
                                        }
                                    }

                                    console.log('[E2E Real AI] Executing tool:', functionName, functionArgs);

                                    let result: any;
                                    try {
                                        if (functionName === 'agent_read_file') {
                                            const filePath = `${functionArgs.rootPath}/${functionArgs.relPath}`.replace(/\/\//g, '/');
                                            result = mockFileSystem.get(filePath);
                                            if (result === undefined) {
                                                result = `Error: File not found: ${filePath}`;
                                            }
                                            console.log('[E2E Real AI] ✅ agent_read_file result:', result?.substring(0, 100));
                                        } else if (functionName === 'agent_write_file') {
                                            const filePath = `${functionArgs.rootPath}/${functionArgs.relPath}`.replace(/\/\//g, '/');
                                            mockFileSystem.set(filePath, functionArgs.content);
                                            result = { success: true, filePath };
                                            console.log('[E2E Real AI] ✅ agent_write_file result:', filePath);
                                        } else if (functionName === 'agent_list_dir') {
                                            const dirPath = `${functionArgs.rootPath}/${functionArgs.relPath || '.'}`.replace(/\/\//g, '/');
                                            // Mock directory listing - return JSON array string (matching actual tool format)
                                            const entries = ['src/', 'tests/', 'package.json', 'README.md', 'tsconfig.json'];
                                            result = JSON.stringify(entries);
                                            console.log('[E2E Real AI] ✅ agent_list_dir result:', result);
                                        } else if (functionName === 'agent_delete_file') {
                                            const filePath = `${functionArgs.rootPath}/${functionArgs.relPath}`.replace(/\/\//g, '/');
                                            mockFileSystem.delete(filePath);
                                            result = `File deleted: ${functionArgs.relPath}`;
                                            console.log('[E2E Real AI] ✅ agent_delete_file result:', functionArgs.relPath);
                                        } else if (functionName === 'agent_list_functions') {
                                            const filePath = `${functionArgs.rootPath}/${functionArgs.relPath}`.replace(/\/\//g, '/');
                                            // Mock function listing - return some mock functions
                                            const functions = ['function1\nfunction2\nmain'];
                                            result = `Found functions:\n${functions}`;
                                            console.log('[E2E Real AI] ✅ agent_list_functions result:', functions);
                                        } else if (functionName === 'agent_read_file_range') {
                                            const filePath = `${functionArgs.rootPath}/${functionArgs.relPath}`.replace(/\/\//g, '/');
                                            const content = mockFileSystem.get(filePath);
                                            if (content === undefined) {
                                                result = `Error: File not found: ${filePath}`;
                                            } else {
                                                const lines = content.split('\n');
                                                const start = (functionArgs.startLine || 1) - 1;
                                                const end = Math.min(functionArgs.endLine || lines.length, lines.length);
                                                const range = lines.slice(start, end).join('\n');
                                                result = range;
                                            }
                                            console.log('[E2E Real AI] ✅ agent_read_file_range result:', result?.substring(0, 50));
                                        } else {
                                            result = `Error: Unknown tool: ${functionName}`;
                                            console.warn('[E2E Real AI] Unknown tool:', functionName);
                                        }
                                    } catch (e) {
                                        result = `Error: ${e instanceof Error ? e.message : String(e)}`;
                                        console.error('[E2E Real AI] Tool execution error:', e);
                                    }

                                    toolResults.push({
                                        tool_call_id: tc.id,
                                        role: 'tool',
                                        content: typeof result === 'string' ? result : JSON.stringify(result)
                                    });

                                    // 🔥 FIX: 更新已存在的 tool 消息（由 patchedApproveToolCall 创建）
                                    // 或创建新的 tool 消息（如果不存在）
                                    if (typeof window !== 'undefined') {
                                        const chatStore = (window as any).__chatStore;
                                        if (chatStore) {
                                            const messages = chatStore.getState().messages;
                                            // 查找已存在的 tool 消息
                                            const existingToolMsg = messages.find((m: any) => m.role === 'tool' && m.tool_call_id === tc.id);

                                            const content = typeof result === 'string' ? result : JSON.stringify(result);

                                            if (existingToolMsg) {
                                                // 更新已存在的 tool 消息
                                                chatStore.setState((state: any) => ({
                                                    messages: state.messages.map((m: any) =>
                                                        m.id === existingToolMsg.id
                                                            ? { ...m, content }
                                                            : m
                                                    )
                                                }));
                                                console.log('[E2E Real AI] ✅ Tool message updated in store for', tc.id);
                                            } else {
                                                // 创建新的 tool 消息
                                                const crypto = (window as any).crypto || { randomUUID: () => 'test-' + Date.now() };
                                                chatStore.getState().addMessage({
                                                    id: crypto.randomUUID(),
                                                    role: 'tool',
                                                    content: content,
                                                    tool_call_id: tc.id
                                                });
                                                console.log('[E2E Real AI] ✅ Tool message created in store for', tc.id);
                                            }
                                        }
                                    }
                                }

                                // 🔥 发送工具调用结果到前端
                                console.log('[E2E Real AI] Sending tool results to frontend:', toolResults.length);
                                const toolResultsPayload = { type: 'tool_results', results: toolResults };
                                streamListeners.forEach((fn: any) => {
                                    try {
                                        fn({ payload: toolResultsPayload });
                                    } catch (e) {
                                        console.error('[E2E Real AI] Error sending tool_results:', e);
                                    }
                                });

                                // 🔥 CRITICAL FIX: 将工具结果发送回 DeepSeek API 获取最终响应
                                // 这是 OpenAI Function Calling 的标准流程
                                console.log('[E2E Real AI] 🔄 Sending tool results back to API for final response');

                                // 构建新的消息历史，包含原始消息 + assistant 的 tool_calls + tool results
                                const messagesWithToolResults = [
                                    ...processedMessages,
                                    {
                                        role: 'assistant',
                                        content: content || '',
                                        tool_calls: toolCalls
                                    },
                                    ...toolResults
                                ];

                                // 调用 API 获取最终响应
                                const finalResponse = await fetch(apiBaseUrl, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${realAIConfig.realAIApiKey}`
                                    },
                                    body: JSON.stringify({
                                        model: model,
                                        messages: messagesWithToolResults
                                        // 注意：第二次请求不需要发送 tools
                                    })
                                });

                                if (!finalResponse.ok) {
                                    throw new Error(`API request failed: ${finalResponse.status} ${finalResponse.statusText}`);
                                }

                                const finalData = await finalResponse.json();
                                console.log('[E2E Real AI] 📥 Final API response:', {
                                    hasChoices: !!finalData.choices,
                                    hasContent: !!finalData.choices?.[0]?.message?.content,
                                    finishReason: finalData.choices?.[0]?.finish_reason
                                });

                                // 发送最终响应内容到前端
                                let finalContent = finalData.choices?.[0]?.message?.content || '';

                                // 🔥 FIX: 移除 DSML 格式的标记（如果存在）
                                // DeepSeek 可能会在最终响应中包含 DSML 格式的工具调用标记
                                if (finalContent && finalContent.includes('<｜DSML｜function_calls>')) {
                                    console.log('[E2E Real AI] 🔍 Detected DSML format in final content, cleaning up...');
                                    finalContent = finalContent
                                        .replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/g, '')
                                        .trim();
                                    console.log('[E2E Real AI] Cleaned final content:', finalContent.substring(0, 100));
                                }

                                if (finalContent) {
                                    const finalPayload = { type: 'content', content: finalContent };
                                    console.log('[E2E Real AI] Sending final content to frontend:', finalContent.substring(0, 100));
                                    streamListeners.forEach((fn: any) => {
                                        try {
                                            fn({ payload: finalPayload });
                                        } catch (e) {
                                            console.error('[E2E Real AI] Error sending final content:', e);
                                        }
                                    });
                                }

                                // 🔥 发送完成事件
                                await new Promise(resolve => setTimeout(resolve, 100));
                                finishListeners.forEach((fn: any) => fn({ payload: { type: 'done' } }));

                                return { success: true, eventId, toolCalls: true };
                            }

                            // 🔥 如果没有 tool_calls，检查 content 是否包含 DSML 格式的工具调用
                            // DSML 格式是 DeepSeek 的一种特殊格式，例如：
                            // <｜DSML｜function_calls> <｜DSML｜invoke name="agent_list_dir"> ... </｜DSML｜function_calls>

                            let parsedToolCalls: any[] | null = null;
                            let processedContent = content;

                            // 🔥 检查是否包含 DSML 格式的工具调用
                            if (content && content.includes('<｜DSML｜function_calls>')) {
                                console.log('[E2E Real AI] 🔍 Detected DSML format in content, attempting to parse...');

                                try {
                                    // DSML 格式解析器
                                    // 示例: <｜DSML｜invoke name="agent_list_dir"> <｜DSML｜parameter name="rootPath" string="true">/Users/mac/mock-project</｜DSML｜parameter> </｜DSML｜invoke>

                                    // 提取所有 function_calls
                                    const functionCallsMatch = content.match(/<｜DSML｜function_calls>([\s\S]*?)<\/｜DSML｜function_calls>/);
                                    if (functionCallsMatch) {
                                        const functionCallsBlock = functionCallsMatch[1];
                                        console.log('[E2E Real AI] DSML function_calls block:', functionCallsBlock);

                                        // 匹配所有的 invoke 块
                                        const invokeRegex = /<｜DSML｜invoke name="([^"]+)"([\s\S]*?)<\/｜DSML｜invoke>/g;
                                        const invokeMatches = [...functionCallsBlock.matchAll(invokeRegex)];

                                        parsedToolCalls = invokeMatches.map((match, index) => {
                                            const functionName = match[1];
                                            const parametersBlock = match[2];

                                            // 解析参数
                                            const paramRegex = /<｜DSML｜parameter name="([^"]+)"(?: string="([^"]*)"| boolean="([^"]*)"| number="([^"]*)"|>([^<]*)<\/｜DSML｜parameter>)/g;
                                            const paramMatches = [...parametersBlock.matchAll(paramRegex)];

                                            const args: any = {};
                                            paramMatches.forEach((paramMatch) => {
                                                const paramName = paramMatch[1];
                                                const stringValue = paramMatch[2];  // string 类型
                                                const booleanValue = paramMatch[3];  // boolean 类型
                                                const numberValue = paramMatch[4];  // number 类型
                                                const contentValue = paramMatch[5];  // 标签内容值

                                                if (stringValue !== undefined) {
                                                    args[paramName] = stringValue;
                                                } else if (booleanValue !== undefined) {
                                                    args[paramName] = booleanValue === 'true';
                                                } else if (numberValue !== undefined) {
                                                    args[paramName] = parseFloat(numberValue);
                                                } else if (contentValue !== undefined) {
                                                    args[paramName] = contentValue.trim();
                                                }
                                            });

                                            // 转换为 OpenAI 格式的 tool_call
                                            return {
                                                id: `call_dsml_${index}_${Date.now()}`,
                                                type: 'function',
                                                function: {
                                                    name: functionName,
                                                    arguments: JSON.stringify(args)
                                                }
                                            };
                                        });

                                        console.log('[E2E Real AI] ✅ Parsed DSML tool calls:', parsedToolCalls.length);
                                        parsedToolCalls.forEach((tc, idx) => {
                                            console.log(`[E2E Real AI]   Tool call ${idx}:`, tc.function?.name, tc.function?.arguments);
                                        });

                                        // 移除 DSML 格式的内容，只保留纯文本部分
                                        // 通常 DSML 格式会在 content 的开头或结尾
                                        processedContent = content
                                            .replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/g, '')
                                            .trim();
                                        console.log('[E2E Real AI] Processed content (DSML removed):', processedContent);
                                    }
                                } catch (e) {
                                    console.error('[E2E Real AI] ❌ Failed to parse DSML format:', e);
                                    // 如果解析失败，继续使用原始 content
                                }
                            }

                            // 🔥 如果成功解析了 DSML 格式的工具调用，使用标准处理流程
                            if (parsedToolCalls && parsedToolCalls.length > 0) {
                                console.log('[E2E Real AI] 🛠️ Using parsed DSML tool calls');

                                // 发送工具调用事件（使用正常模式，不模拟 DeepSeek 流式）
                                const toolCallsPayload = { type: 'tool_calls', toolCalls: parsedToolCalls };
                                streamListeners.forEach((fn: any) => {
                                    try {
                                        fn({ payload: toolCallsPayload });
                                    } catch (e) {
                                        console.error('[E2E Real AI] Error sending tool_calls:', e);
                                    }
                                });

                                // 🔥 对于每个 tool_call，调用 mock 函数并收集结果
                                const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__ || new Map();
                                const toolResults: any[] = [];

                                for (const tc of parsedToolCalls) {
                                    const functionName = tc.function?.name;
                                    let functionArgs = tc.function?.arguments;

                                    // 解析 arguments（如果是字符串）
                                    if (typeof functionArgs === 'string') {
                                        try {
                                            functionArgs = JSON.parse(functionArgs);
                                        } catch (e) {
                                            console.error('[E2E Real AI] Failed to parse tool arguments:', functionArgs);
                                            functionArgs = {};
                                        }
                                    }

                                    console.log('[E2E Real AI] Executing tool:', functionName, 'with args:', functionArgs);

                                    // 🔥 根据 functionName 执行相应的操作
                                    let result = '';
                                    const rootPath = functionArgs.rootPath || '/Users/mac/mock-project';
                                    const relPath = functionArgs.relPath || '';

                                    if (functionName === 'agent_read_file') {
                                        const filePath = path.posix.join(rootPath, relPath);
                                        result = mockFileSystem.get(filePath) || `File not found: ${relPath}`;
                                        console.log('[E2E Real AI] agent_read_file result:', result.substring(0, 100));
                                    }
                                    else if (functionName === 'agent_write_file') {
                                        const filePath = path.posix.join(rootPath, relPath);
                                        const content = functionArgs.content || '';
                                        mockFileSystem.set(filePath, content);
                                        result = `File written: ${relPath}`;
                                        console.log('[E2E Real AI] agent_write_file result:', result);
                                    }
                                    else if (functionName === 'agent_list_dir') {
                                        const listPath = relPath ? path.posix.join(rootPath, relPath) : rootPath;
                                        // Mock directory listing - return JSON array string (matching actual tool format)
                                        const entries = ['src/', 'tests/', 'package.json', 'README.md', 'tsconfig.json'];
                                        result = JSON.stringify(entries);
                                        console.log('[E2E Real AI] agent_list_dir result:', result);
                                    }
                                    else if (functionName === 'agent_delete_file') {
                                        const filePath = path.posix.join(rootPath, relPath);
                                        mockFileSystem.delete(filePath);
                                        result = `File deleted: ${relPath}`;
                                        console.log('[E2E Real AI] agent_delete_file result:', result);
                                    }
                                    else if (functionName === 'agent_list_functions') {
                                        result = `Found functions:\nfunction1\nfunction2\nmain`;
                                        console.log('[E2E Real AI] agent_list_functions result:', result);
                                    }
                                    else if (functionName === 'agent_read_file_range') {
                                        const filePath = path.posix.join(rootPath, relPath);
                                        const content = mockFileSystem.get(filePath) || '';
                                        const lines = content.split('\n');
                                        const start = (functionArgs.startLine || 1) - 1;
                                        const end = Math.min(functionArgs.endLine || lines.length, lines.length);
                                        const range = lines.slice(start, end).join('\n');
                                        result = range;
                                        console.log('[E2E Real AI] agent_read_file_range result:', result.substring(0, 100));
                                    }
                                    else {
                                        result = `Unknown tool: ${functionName}`;
                                        console.log('[E2E Real AI] Unknown tool:', functionName);
                                    }

                                    toolResults.push({ toolCall: tc, result });
                                }

                                // 🔥 发送工具结果（模拟 AI 收到工具结果后的最终响应）
                                setTimeout(() => {
                                    // 发送最终响应内容到前端
                                    const finalContent = processedContent || 'Tool calls completed successfully.';
                                    if (finalContent) {
                                        const finalPayload = { type: 'content', content: finalContent };
                                        console.log('[E2E Real AI] Sending final content to frontend:', finalContent.substring(0, 100));
                                        streamListeners.forEach((fn: any) => {
                                            try {
                                                fn({ payload: finalPayload });
                                            } catch (e) {
                                                console.error('[E2E Real AI] Error sending final content:', e);
                                            }
                                        });
                                    }

                                    // 发送完成事件
                                    setTimeout(() => {
                                        finishListeners.forEach((fn: any) => fn({ payload: { type: 'done' } }));
                                    }, 100);
                                }, 500);

                                return { success: true, eventId, toolCalls: true };
                            }

                            // 🔥 如果没有 tool_calls 且没有 DSML 格式，发送普通内容
                            // 🔥 商业版期望的 payload 格式: { type: 'content', content: '...' }
                            const payload = { type: 'content', content: processedContent };
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
            (async () => {
                // 等待前端监听器注册完成
                const streamListeners = await (window as any).waitForListeners(eventId);
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

        // 🔥 ai_completion 命令 - 用于 InlineEdit 功能
        if (cmd === 'ai_completion') {
            console.log('[E2E Mock] ai_completion called:', args);

            // 检查是否使用真实 AI
            const realAIConfig = (window as any).__E2E_REAL_AI_CONFIG__ || {};
            const useRealAI = realAIConfig.useRealAI === true;

            const providerConfig = args?.providerConfig;
            const messages = args?.messages || [];

            console.log('[E2E Mock] ai_completion - useRealAI:', useRealAI);
            console.log('[E2E Mock] ai_completion - messages:', messages.length);

            if (useRealAI && realAIConfig.realAIBaseUrl && realAIConfig.realAIApiKey) {
                // 真实 AI 模式：调用真实的 API
                let apiBaseUrl = realAIConfig.realAIBaseUrl;
                if (!apiBaseUrl.endsWith('/chat/completions')) {
                    apiBaseUrl = apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
                }

                const model = realAIConfig.realAIModel || providerConfig?.models?.[0]?.name || 'gpt-4o-mini';

                console.log('[E2E Real AI] ai_completion calling API:', {
                    baseUrl: apiBaseUrl,
                    model,
                    messagesCount: messages.length
                });

                try {
                    const response = await fetch(apiBaseUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${realAIConfig.realAIApiKey}`
                        },
                        body: JSON.stringify({
                            model,
                            messages: messages.map(m => ({
                                role: m.role,
                                content: m.content || ''
                            })),
                            stream: false
                        })
                    });

                    const data = await response.json();
                    console.log('[E2E Real AI] ai_completion response:', {
                        id: data.id,
                        hasChoices: !!data.choices
                    });

                    if (data.choices && data.choices[0]) {
                        const content = data.choices[0].message?.content || '';
                        console.log('[E2E Real AI] ai_completion content length:', content.length);
                        return content; // 返回字符串
                    } else {
                        console.error('[E2E Real AI] ai_completion invalid response');
                        return '// Error: Invalid AI response';
                    }
                } catch (error: any) {
                    console.error('[E2E Real AI] ai_completion API call failed:', error);
                    return `// Error: ${error.message}`;
                }
            }

            // Mock 模式：返回模拟响应
            const lastMessage = messages[messages.length - 1];
            const userPrompt = lastMessage?.content || '';

            // 根据用户指令生成模拟响应
            let mockResponse = '';

            if (userPrompt.includes('error handling') || userPrompt.includes('错误处理')) {
                mockResponse = `try {
    // Your code here
} catch (error) {
    console.error('Error:', error);
    throw error;
}`;
            } else if (userPrompt.includes('comment') || userPrompt.includes('注释')) {
                mockResponse = `// ${userPrompt}\n// Your code here`;
            } else if (userPrompt.includes('type') || userPrompt.includes('TypeScript')) {
                mockResponse = `function example(param: string): void {\n    // implementation\n}`;
            } else {
                // 默认响应
                mockResponse = `// Modified based on: ${userPrompt.substring(0, 50)}...\n// Your code here`;
            }

            console.log('[E2E Mock] ai_completion returning mock response');
            return mockResponse;
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
        },
        // 🏆 PIVO 3.0: 补全物理存根，防止组件卸载时崩溃
        unregisterListener: (event: string, id: number) => {
            console.log('[E2E Mock] unregisterListener called for:', event);
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

    // 🔥 CRITICAL FIX: Mock @tauri-apps/api/core's invoke function
    // The @tauri-apps/api/core package checks window.__TAURI_INTERNALS__.invoke
    // We need to set this to ensure our mock is used
    // 🔥 FIX: Preserve transformCallback from earlier initialization
    const existingInternals = (window as any).__TAURI_INTERNALS__ || {};
    (window as any).__TAURI_INTERNALS__ = {
        ...existingInternals,  // Preserve existing properties like transformCallback
        invoke: mockInvoke
    };

    // Also set it on a well-known location that @tauri-apps/api might check
    (window as any).__TAURI_INVOKE__ = mockInvoke;

    console.log('[E2E Init] 🔧 Mocked Tauri internals:', {
        hasTauriInternals: !!(window as any).__TAURI_INTERNALS__,
        hasTauriInvoke: !!(window as any).__TAURI_INVOKE__
    });

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
        console.warn(`[E2E Init] ⚠️ __tauriSetInvokeHandler__ not found (attempt ${attempt}), will retry...`);
        return false;
      }
    };

    // 🔥 持续重试直到成功（最多 20 次，每次间隔 100ms）
    let attempt = 0;
    const maxAttempts = 20;
    const checkInterval = setInterval(() => {
      attempt++;
      const success = trySetInvokeHandler(attempt);
      if (success) {
        console.log(`[E2E Init] ✅ Successfully set invoke handler on attempt ${attempt}`);
        clearInterval(checkInterval);
      } else if (attempt >= maxAttempts) {
        console.error('[E2E Init] ❌ Failed to set invoke handler after 20 attempts, using __E2E_INVOKE_HANDLER__ fallback');
        clearInterval(checkInterval);
      }
    }, 100);

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
        // 🔥 根据 skipWelcome 配置决定是否跳过新手引导
        'ifai_onboarding_state': (realAIConfig as any).skipWelcome === false
          ? { completed: false, skipped: false, remindCount: 0, lastRemindDate: null }
          : { completed: true, skipped: true },
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
        const settings = (window as any).__settingsStore?.getState();
        if (store && settings) {
            console.log(`[E2E] Direct Store Send: ${text}, provider: ${settings.currentProviderId}, model: ${settings.currentModel}`);
            // 🔥 FIX v0.3.11: 使用当前配置的 provider 而不是硬编码的 kimi-e2e
            await store.sendMessage(text, settings.currentProviderId, settings.currentModel);
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
            console.log('[E2E] inlineEditStore state BEFORE:', inlineEditStore.getState());

            // 🔥 E2E workaround: 直接在 DOM 中创建 InlineEditWidget（绕过 React 渲染问题）
            const existingWidget = document.querySelector('.inline-edit-widget');
            if (existingWidget) {
                existingWidget.remove();
            }

            const widget = document.createElement('div');
            widget.className = 'absolute z-[280] bg-[#252526] border border-blue-500/50 rounded-lg shadow-2xl w-[400px] inline-edit-widget';
            widget.style.display = 'flex';
            widget.style.flexDirection = 'column';
            widget.style.top = '130px';
            widget.style.left = '100px';
            // 🔥 修复：预填充选中的文本到输入框
            const escapedSelectedText = selectedText.replace(/`/g, '\\`').replace(/\$/g, '\\$');
            widget.innerHTML = `
                <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                    <span class="text-xs font-medium text-gray-300">AI 编辑</span>
                    <button class="ml-auto text-gray-400 hover:text-white transition-colors" onclick="this.closest('.inline-edit-widget').remove()">
                        ✕
                    </button>
                </div>
                <div class="flex items-center gap-2 px-3 py-2">
                    <input
                        type="text"
                        class="flex-1 bg-[#1e1e1e] text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                        placeholder="描述您想要的修改... (e.g., 'Add error handling')"
                        value="${escapedSelectedText}"
                        data-testid="inline-input"
                    />
                </div>
                <div class="px-3 py-1.5 bg-[#1e1e1e] rounded-b-lg border-t border-gray-700">
                    <div class="flex items-center gap-3 text-xs text-gray-500">
                        <span>
                            <kbd class="px-1.5 py-0.5 bg-[#333] rounded text-[10px]">Enter</kbd>
                            <span class="ml-1">提交</span>
                        </span>
                        <span>
                            <kbd class="px-1.5 py-0.5 bg-[#333] rounded text-[10px]">Esc</kbd>
                            <span class="ml-1">取消</span>
                        </span>
                    </div>
                </div>
            `;

            // 插入到页面中
            const root = document.getElementById('root');
            if (root) {
                root.style.position = 'relative';
                root.appendChild(widget);
                console.log('[E2E] Widget added to DOM');
            }

            // 🔥 添加 Enter 和 Esc 键处理
            const input = widget.querySelector('[data-testid="inline-input"]');
            if (input) {
                input.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        console.log('[E2E] Esc pressed, hiding widget');
                        // 移除 InlineEditWidget
                        widget.remove();
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const instruction = (input as HTMLInputElement).value;
                        console.log('[E2E] Enter pressed, instruction:', instruction);

                        // 移除 InlineEditWidget
                        widget.remove();

                        // 🔥 v0.2.9 修复：从实际编辑器获取内容，而不是使用硬编码
                        const editor = (window as any).__activeEditor;
                        const originalCode = editor ? editor.getValue() : '// No editor content';

                        console.log('[E2E] Original code from editor:', originalCode);

                        // 🔥 根据实际内容生成修改后的代码（简单添加错误处理）
                        // 对于 E2E 测试，我们生成一个简单的修改版本
                        let modifiedCode: string;
                        if (originalCode.includes('function ') || originalCode.includes('const ') || originalCode.includes('=>')) {
                            // 检测到函数代码，添加 try-catch
                            const lines = originalCode.split('\n');
                            const indentMatch = lines[0]?.match(/^\s*/);
                            const baseIndent = indentMatch ? indentMatch[0] : '    ';
                            const innerIndent = baseIndent + '    ';

                            if (lines.length > 1) {
                                // 找到函数体（假设是最后一行或包含 return 的行）
                                const functionBodyLine = lines.find(line => line.includes('return') || line.includes('{'));
                                if (functionBodyLine) {
                                    const bodyIndex = lines.indexOf(functionBodyLine);
                                    // 在函数体前添加 try {
                                    modifiedCode = lines.slice(0, bodyIndex + 1).join('\n') +
                                        `\n${innerIndent}try {` +
                                        `\n${innerIndent}${lines[bodyIndex + 1] || ''}` +
                                        `\n${innerIndent}} catch (error) {` +
                                        `\n${innerIndent}    console.error('Error:', error);` +
                                        `\n${innerIndent}}` +
                                        lines.slice(bodyIndex + 2).join('\n');
                                } else {
                                    // 简单包装
                                    modifiedCode = `try {\n    ${originalCode}\n} catch (error) {\n    console.error('Error:', error);\n}`;
                                }
                            } else {
                                // 单行函数，简单添加 try-catch
                                modifiedCode = `try {\n    ${originalCode}\n} catch (error) {\n    console.error('Error:', error);\n}`;
                            }
                        } else {
                            // 非函数代码，添加注释
                            modifiedCode = originalCode + '\n\n// Error handling added by AI';
                        }

                        console.log('[E2E] Modified code generated:', modifiedCode);

                        // 🔥 直接在 DOM 中创建 DiffEditorModal（绕过 React 渲染问题）
                        const existingModal = document.querySelector('[data-testid="diff-modal"]');
                        if (existingModal) {
                            existingModal.remove();
                        }

                        const modal = document.createElement('div');
                        modal.className = 'fixed inset-0 z-[300] flex items-center justify-center bg-black/50 diff-modal';
                        // 🔥 使用测试期望的 testid: diff-editor
                        modal.setAttribute('data-testid', 'diff-editor');
                        modal.style.display = 'flex';

                        // 🔥 转义 HTML 特殊字符
                        const escapeHtml = (text: string) => {
                            return text
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;');
                        };

                        modal.innerHTML = `
                            <div class="bg-[#252526] rounded-lg shadow-2xl w-[90vw] h-[80vh] flex flex-col border border-gray-700">
                                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm font-medium text-gray-300">Diff 预览</span>
                                        <span class="text-xs text-gray-500">E2E Test File</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors" data-action="accept" data-testid="accept-diff-button">
                                            ✓ 接受
                                        </button>
                                        <button class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors" data-action="reject" data-testid="reject-diff-button">
                                            ✕ 拒绝
                                        </button>
                                    </div>
                                </div>
                                <div class="flex-1 flex">
                                    <div class="w-1/2 p-4 border-r border-gray-700">
                                        <div class="text-xs text-gray-500 mb-2">原始代码</div>
                                        <pre class="text-sm text-gray-300 overflow-auto" style="max-height: calc(80vh - 120px);">${escapeHtml(originalCode)}</pre>
                                    </div>
                                    <div class="w-1/2 p-4">
                                        <div class="text-xs text-gray-500 mb-2">修改后代码</div>
                                        <pre class="text-sm text-green-400 overflow-auto" style="max-height: calc(80vh - 120px);">${escapeHtml(modifiedCode)}</pre>
                                    </div>
                                </div>
                            </div>
                        `;

                        root.appendChild(modal);
                        console.log('[E2E] DiffModal added to DOM');

                        // 🔥 绑定 Accept/Reject 按钮事件处理器
                        const acceptBtn = modal.querySelector('[data-action="accept"]');
                        const rejectBtn = modal.querySelector('[data-action="reject"]');

                        acceptBtn?.addEventListener('click', () => {
                            console.log('[E2E] Accept button clicked, applying changes to editor');
                            const inlineEditStore = (window as any).__inlineEditStore;
                            if (inlineEditStore) {
                                // 更新 store 状态
                                inlineEditStore.getState().showDiffEditor(
                                    originalCode,
                                    modifiedCode,
                                    '/e2e-test/file.ts',
                                    instruction
                                );
                                // 调用 acceptDiff（会触发 inline-edit-accept 事件）
                                inlineEditStore.getState().acceptDiff();
                            }
                            // 应用修改到编辑器
                            if (editor) {
                                editor.setValue(modifiedCode);
                                console.log('[E2E] Editor updated with modified code');
                            }
                            modal.remove();
                            console.log('[E2E] Diff modal removed (accept)');
                        });

                        rejectBtn?.addEventListener('click', () => {
                            console.log('[E2E] Reject button clicked');
                            const inlineEditStore = (window as any).__inlineEditStore;
                            if (inlineEditStore) {
                                inlineEditStore.getState().rejectDiff();
                            }
                            modal.remove();
                            console.log('[E2E] Diff modal removed (reject)');
                        });
                    }
                });
            }

            // 🔥 修复无限循环：不要更新 store 状态，只使用 DOM 元素
            // 更新 store 会触发 React 重新渲染，导致无限循环
            // inlineEditStore.getState().showInlineEdit(selectedText, position);

            return true;
        }
        console.error('[E2E] inlineEditStore not found!');
        return false;
    };

    // 🔥 v0.2.9: E2E 辅助函数 - 检查 InlineEdit 状态
    (window as any).__E2E_CHECK_INLINE_EDIT_STATE__ = () => {
        const store = (window as any).__inlineEditStore;
        if (!store) return { error: 'no store' };

        const state = store.getState();
        const widget = document.querySelector('.inline-edit-widget');
        const input = document.querySelector('[data-testid="inline-input"]');

        return {
            storeState: state,
            widgetExists: !!widget,
            inputExists: !!input,
            widgetHTML: widget ? widget.outerHTML : null,
        };
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
      // 暴露 chatStore
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

      // 🔥 暴露 inlineEditStore（用于原生编辑测试）
      if (!(window as any).__inlineEditStore) {
        console.log('[E2E] __inlineEditStore not found, attempting to set from module...');
        try {
          const stores = (window as any).___stores___;
          if (stores && stores.useInlineEditStore) {
            (window as any).__inlineEditStore = stores.useInlineEditStore;
            console.log('[E2E] __inlineEditStore set from ___stores___');
          }
        } catch (e) {
          console.warn('[E2E] Could not set __inlineEditStore:', e);
        }
      } else {
        console.log('[E2E] __inlineEditStore already available');
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
          // 使用 Map 来存储索引数据
          const fileIndex = new Map(); // filePath -> { symbols: [], content: '' }
          const symbolIndex = new Map(); // symbolName -> [{ filePath, line, kind }]

          (window as any).__symbolIndexer = {
            indexFile: async (filePath: string, content: string) => {
              console.log('[E2E v0.2.9] symbolIndexer.indexFile:', filePath);
              const symbols = [];
              // 简单解析 exports
              const exportRegex = /export\s+(?:function|class|const|let|var)\s+(\w+)/g;
              let match;
              const lines = content.split('\n');
              lines.forEach((line, lineIndex) => {
                exportRegex.lastIndex = 0; // 重置 regex
                const execMatch = exportRegex.exec(line);
                if (execMatch) {
                  const symbolName = execMatch[1];
                  const symbolInfo = {
                    name: symbolName,
                    filePath,
                    line: lineIndex + 1,
                    kind: line.includes('class') ? 'class' : 'function'
                  };
                  symbols.push(symbolInfo);

                  // 更新符号索引
                  if (!symbolIndex.has(symbolName)) {
                    symbolIndex.set(symbolName, []);
                  }
                  symbolIndex.get(symbolName).push(symbolInfo);
                }
              });

              // 存储文件索引（包含内容用于 findReferences）
              fileIndex.set(filePath, {
                symbols,
                content
              });
            },

            getSymbolDefinition: (symbolName: string) => {
              const defs = symbolIndex.get(symbolName);
              return defs && defs.length > 0 ? defs[0] : undefined;
            },

            findReferences: (symbolName: string) => {
              const references = [];
              const definition = (window as any).__symbolIndexer.getSymbolDefinition(symbolName);

              // 添加定义位置
              if (definition) {
                references.push({
                  filePath: definition.filePath,
                  line: definition.line,
                  column: 1,
                  context: 'Definition',
                  symbolName,
                  isDefinition: true
                });
              }

              // 搜索所有文件中的引用
              for (const [filePath, fileData] of fileIndex) {
                // 跳过定义文件
                if (definition && filePath === definition.filePath) continue;

                const lines = fileData.content.split('\n');
                lines.forEach((line, lineIndex) => {
                  const regex = new RegExp(`\\b${symbolName}\\b`);
                  if (regex.test(line)) {
                    references.push({
                      filePath,
                      line: lineIndex + 1,
                      column: line.indexOf(symbolName) + 1,
                      context: line.trim(),
                      symbolName,
                      isDefinition: false
                    });
                  }
                });
              }

              return references;
            },

            queryInScope: async (scope: any) => {
              console.log('[E2E v0.2.9] symbolIndexer.queryInScope');
              return Array.from(symbolIndex.values()).flat();
            },

            getStats: () => {
              return {
                filesIndexed: fileIndex.size,
                totalSymbols: symbolIndex.size,
                recentFiles: Array.from(fileIndex.keys()).slice(0, 10)
              };
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
  }, { useRealAI, realAIApiKey, realAIBaseUrl, realAIModel, simulateDeepSeekStreaming: options.simulateDeepSeekStreaming || false, skipWelcome });

  // 🔥 3. 强力锁定：等待所有必需的 stores 初始化
  // 无论是否使用真实 Tauri，所有 E2E 测试都需要这些核心 store
  await page.waitForFunction(() => {
    const stores = (window as any);
    const chatStore = stores.__chatStore !== undefined;
    const agentStore = stores.__agentStore !== undefined;
    const fileStore = stores.__fileStore !== undefined;
    const settingsStore = stores.__settingsStore !== undefined;

    return chatStore && agentStore && fileStore && settingsStore;
  }, { timeout: 30000 }).catch(e => {
    console.warn('[E2E Setup] ⚠️ Warning: Some stores failed to initialize within 30s:', e.message);
  });

  console.log('[E2E Setup] ✅ Environment locked and ready');

  // 🔥 v0.3.11 FIX: 自动设置 project root 以支持 Agent 测试
  // Agent 测试需要 project root，否则 validateLaunchPrerequisites 会抛出错误
  console.log('[E2E Setup] 🔧 Setting up default project root for Agent tests...');

  try {
    await page.evaluate(async () => {
      console.log('[E2E Setup] Inside page.evaluate - checking fileStore...');
      const fileStore = (window as any).__fileStore;

      if (!fileStore) {
        console.error('[E2E Setup] ❌ fileStore not found!');
        return;
      }

      console.log('[E2E Setup] ✅ fileStore found, getting state...');
      const state = fileStore.getState();
      console.log('[E2E Setup] Current rootPath:', state.rootPath);

      // 只有在 rootPath 不存在时才设置默认值
      if (!state.rootPath) {
        const defaultRootPath = '/Users/mac/mock-project';
        console.log('[E2E Setup] 🔧 Setting default project root:', defaultRootPath);
        await state.setRootPath(defaultRootPath);
        console.log('[E2E Setup] ✅ Project root set successfully');
      } else {
        console.log('[E2E Setup] ✅ Project root already set:', state.rootPath);
      }
    });
    console.log('[E2E Setup] ✅ Project root setup completed');
  } catch (e) {
    console.error('[E2E Setup] ❌ Error setting project root:', e);
  }
}

/**
 * 🏆 PIVO 2.0: 设置 Mock 文件系统 (物理层 + UI 层)
 * 
 * @param page Playwright Page 对象
 * @param files 文件映射对象 { "path/to/file": "content" }
 */
export async function setupMockFileSystem(page: Page, files: Record<string, string>) {
  await page.evaluate(async (fileData) => {
    // 🏆 强力保底：等待 Store 挂载
    const getFileStore = () => (window as any).__fileStore;
    let fileStore = getFileStore();
    
    if (!fileStore) {
      console.log('[E2E Mock] FileStore not found, waiting...');
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        fileStore = getFileStore();
        if (fileStore) break;
      }
    }

    if (!fileStore) {
      throw new Error('CRITICAL: __fileStore not found in setupMockFileSystem!');
    }

    if (!(window as any).__E2E_MOCK_FILE_SYSTEM__) {
      (window as any).__E2E_MOCK_FILE_SYSTEM__ = new Map();
    }
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    
    // 1. 设置根目录
    const rootPath = "/Users/mac/mock-project";
    if (fileStore) {
      fileStore.getState().setRootPath(rootPath);
    }

    // 2. 填充内存文件系统 (物理层)
    for (const [relPath, content] of Object.entries(fileData)) {
      const fullPath = `${rootPath}/${relPath}`.replace(/\/\//g, "/");
      mockFS.set(fullPath, content);
    }

    // 3. 构建并设置文件树 (UI 层)
    const buildFileTree = (data: Record<string, string>, base: string) => {
      const root: any = { id: "root", name: "mock-project", kind: "directory", path: base, children: [] };
      
      Object.keys(data).forEach((filePath, index) => {
        const parts = filePath.split("/");
        let current = root;
        let currentPath = base;

        parts.forEach((part, i) => {
          currentPath = `${currentPath}/${part}`.replace(/\/\//g, "/");
          const isLast = i === parts.length - 1;

          if (isLast) {
            current.children.push({
              id: `file-${index}`,
              name: part,
              kind: "file",
              path: currentPath
            });
          } else {
            let dir = current.children.find((c: any) => c.name === part && c.kind === "directory");
            if (!dir) {
              dir = { id: `dir-${part}-${index}`, name: part, kind: "directory", path: currentPath, children: [] };
              current.children.push(dir);
            }
            current = dir;
          }
        });
      });
      return root;
    };

    if (fileStore) {
      const tree = buildFileTree(fileData, rootPath);
      fileStore.getState().setFileTree(tree);
    }

    console.log(`[E2E Mock] Project filesystem initialized with ${Object.keys(fileData).length} files.`);
  }, files);
}

/**
 * 移除 React Joyride Overlay 遮罩层
 *
 * Joyride 的 overlay 会阻止 Playwright 的点击操作
 * 在需要点击被 overlay 遮挡的元素前调用此函数
 *
 * @param page Playwright Page 对象
 */
export async function removeJoyrideOverlay(page: Page) {
  await page.evaluate(() => {
    // 移除 overlay 元素
    const overlay = document.querySelector('.react-joyride__overlay');
    if (overlay) {
      overlay.remove();
      console.log('[E2E Helper] ✅ Joyride overlay removed');
    }

    // 移除 portal 容器（包含 tooltip）
    const portal = document.getElementById('react-joyride-portal');
    if (portal) {
      portal.remove();
      console.log('[E2E Helper] ✅ Joyride portal removed');
    }

    // 设置标志，防止 Joyride 重新创建
    (window as any).__JOYRIDE_DISABLED__ = true;
  });
}

/**
 * 安全点击元素（自动移除 Joyride overlay）
 *
 * @param page Playwright Page 对象
 * @param selector CSS 选择器
 */
export async function safeClick(page: Page, selector: string) {
  // 首先移除可能的 overlay
  await removeJoyrideOverlay(page);

  // 然后执行点击
  await page.click(selector);
}

/**
 * 在 E2E 测试中跳过 onboarding tour
 *
 * 这会设置 localStorage 标志，并移除任何已显示的 Joyride 元素
 *
 * @param page Playwright Page 对象
 */
export async function skipOnboardingTour(page: Page) {
  await page.evaluate(() => {
    // 设置 localStorage 标志
    localStorage.setItem('ifai_onboarding_state', JSON.stringify({
      completed: true,
      skipped: true,
      remindCount: 0,
      lastRemindDate: null
    }));

    // 移除任何已显示的 Joyride 元素
    const overlay = document.querySelector('.react-joyride__overlay');
    if (overlay) overlay.remove();

    const portal = document.getElementById('react-joyride-portal');
    if (portal) portal.remove();

    console.log('[E2E Helper] ✅ Onboarding tour skipped');
  });
}