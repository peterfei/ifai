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
  useRealAI?;

  /**
   * 真实 AI 的 API Key（可选，如果使用真实 AI 但不想在 localStorage 中配置）
   */
  realAIApiKey?;

  /**
   * 真实 AI 的 Base URL（可选）
   */
  realAIBaseUrl?;

  /**
   * 真实 AI 的模型名称（可选）
   */
  realAIModel?;

  /**
   * 配置文件路径（默认为 tests/e2e/.env.e2e.local）
   */
  configPath?;

  /**
   * 🔥 是否模拟 DeepSeek API 的流式工具调用行为
   * 当启用时，后续参数块会使用 id: null, index: 0 的格式
   * @default false
   */
  simulateDeepSeekStreaming?;

  /**
   * 是否跳过新手引导（Welcome Tour）
   * @default true
   */
  skipWelcome?;
}

/**
 * 从 .env.e2e.local 文件加载配置
 *
 * @param configPath 配置文件路径
 * @returns 配置对象
 */
function loadE2EConfig(configPath) {
  const defaultPath = resolve(__dirname, '.env.e2e.local');
  const filePath = configPath || defaultPath;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const config = {};

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
  } catch (error) {
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
  
  const fileConfig = loadE2EConfig(options.configPath);

  // 合并配置优先级：命令行参数 > 环境变量 > 配置文件
  const useRealTauri = process.env.TAURI_DEV === 'true';
  const useRealAI = options.useRealAI ?? (fileConfig.E2E_AI_API_KEY ? true : false);
  const realAIApiKey = options.realAIApiKey ?? process.env.E2E_AI_API_KEY ?? fileConfig.E2E_AI_API_KEY;
  const realAIBaseUrl = options.realAIBaseUrl ?? process.env.E2E_AI_BASE_URL ?? fileConfig.E2E_AI_BASE_URL;
  const realAIModel = options.realAIModel ?? process.env.E2E_AI_MODEL ?? fileConfig.E2E_AI_MODEL;
  const skipWelcome = options.skipWelcome ?? (fileConfig.E2E_SKIP_WELCOME === 'false' ? false : true);

  const realAIConfigParam = {
    useRealAI,
    realAIApiKey,
    realAIBaseUrl,
    realAIModel,
    simulateDeepSeekStreaming: options.simulateDeepSeekStreaming ?? false,
    skipWelcome: skipWelcome !== false,
    useRealTauri 
  };

  if (useRealTauri) {
    console.log('[E2E] 🔥 使用真实 Tauri 后端模式');
  }

  // 1. 注入核心拦截与锁定脚本 (在 goto 之前)
  await page.addInitScript((params) => {
    // 🔥 DEBUG: 打印接收到的参数
    console.log('[E2E Setup Init] 📦 Received params:', JSON.stringify(params));
    console.log('[E2E Setup Init] useRealTauri:', params?.useRealTauri);

    // 🔥 FIX: 总是设置 __E2E__ 标志，无论是否使用真实 Tauri
    // 这样可以确保 formatToolResultToMarkdown 等测试辅助函数被正确暴露
    window.__E2E__ = true;
    window.__E2E_SKIP_STABILIZER__ = true;
    window.__E2E_REAL_AI_CONFIG__ = params;

    // 🔥 FIX: E2E 测试环境启用所有日志，以便捕获性能监控数据
    // 设置标志，让 logger.ts 检测到测试环境
    window.__E2E_ENABLE_ALL_LOGS__ = true;

    // 🔥 FIX: 禁用骨架屏引擎，避免 E2E 测试中元素被隐藏
    // 骨架屏在 initial/loading 状态时会隐藏 chat-scroll-container
    window.__ENABLE_SKELETON_ENGINE__ = false;

    const setupE2EHelpers = () => {
      if (window.__E2E_HELPERS_INSTALLED__) return;
      window.__E2E_HELPERS_INSTALLED__ = true;

      // 🔥 FIX: 确保 Tauri bridge 在 E2E 测试环境中初始化
      // 这修复了动态导入 @tauri-apps/api 时 window.__TAURI_INTERNALS__ 未定义的问题
      const ensureTauriBridge = () => {
        const w = window as any;
        const useRealTauri = params.useRealTauri; // 从 params 获取

        // 如果使用真实 Tauri，等待原生初始化
        if (useRealTauri) {
          console.log('[E2E Setup] 🔥 Real Tauri mode detected, waiting for native Tauri bridge...');

          // 🔥 FIX: 设置全局标志，让 tauriInitializer.ts 知道这是真实 Tauri 模式
          w.__E2E_REAL_TAURI_MODE__ = true;

          // 为真实 Tauri 模式设置等待和检查逻辑
          // 不创建 mock，让真实的 Tauri 初始化
          const checkTauriReady = () => {
            const invoke = w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke;

            if (!invoke) {
              return false;
            }

            // 检查是否是 mock invoke（通过检查源代码）
            const invokeStr = invoke.toString();
            const isMock = invokeStr.includes('PIVO3-Mock') ||
                           invokeStr.includes('E2E Mock') ||
                           invokeStr.includes('E2E Tauri Mock');

            if (!isMock) {
              console.log('[E2E Setup] ✅ Real Tauri bridge detected and ready');
              // 🔥 FIX: 替换 mock 的 invoke 为真实的 invoke
              // 保存真实的 invoke 供后续使用
              w._realTauriInvoke = invoke;

              // 如果 __TAURI_INTERNALS__.invoke 是 mock，替换它
              if (w.__TAURI_INTERNALS__?.invoke?.toString().includes('PIVO3-Mock')) {
                console.log('[E2E Setup] 🔄 Replacing mock invoke in __TAURI_INTERNALS__');
                Object.defineProperty(w.__TAURI_INTERNALS__, 'invoke', {
                  value: invoke,
                  writable: true,
                  configurable: true,
                  enumerable: true
                });
              }

              // 如果 __TAURI__.core.invoke 是 mock，替换它
              if (w.__TAURI__?.core?.invoke?.toString().includes('PIVO3-Mock')) {
                console.log('[E2E Setup] 🔄 Replacing mock invoke in __TAURI__.core');
                Object.defineProperty(w.__TAURI__.core, 'invoke', {
                  value: invoke,
                  writable: true,
                  configurable: true,
                  enumerable: true
                });
              }

              return true;
            }

            console.log('[E2E Setup] ⏳ Mock invoke found, still waiting for real Tauri bridge...');
            return false;
          };

          // 轮询检查 Tauri 是否就绪（最多等待 5 秒）
          if (!checkTauriReady()) {
            let attempts = 0;
            const maxAttempts = 50; // 5 秒
            const checkInterval = setInterval(() => {
              attempts++;
              if (checkTauriReady() || attempts >= maxAttempts) {
                clearInterval(checkInterval);
                if (attempts >= maxAttempts) {
                  console.warn('[E2E Setup] ⚠️ Timeout waiting for real Tauri bridge');
                }
              }
            }, 100);
          }
          return;
        } else {
          // 🔥 FIX: Mock 模式，明确标记
          w.__E2E_REAL_TAURI_MODE__ = false;
        }

        // Mock 模式：如果已经初始化，跳过
        if (w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke) {
          console.log('[E2E Setup] ✅ Tauri bridge already initialized');
          return;
        }

        console.log('[E2E Setup] 🔧 Initializing Tauri bridge mock for E2E environment...');

        // 创建 __TAURI_INTERNALS__ 对象（如果不存在）
        if (!w.__TAURI_INTERNALS__) {
          w.__TAURI_INTERNALS__ = {};
        }

        // Mock transformCallback（Tauri 内部使用）
        if (!w.__TAURI_INTERNALS__.transformCallback) {
          w.__TAURI_INTERNALS__.transformCallback = (callback: any, once: any) => {
            return callback;
          };
        }

        // Mock invoke（Mock 模式下支持特定命令）
        if (!w.__TAURI_INTERNALS__.invoke) {
          w.__TAURI_INTERNALS__.invoke = async (cmd: string, args: any) => {
            console.log(`[E2E Tauri Mock] invoke: ${cmd}`, args);

            // 🔥 HTTP API 代理：execute_quick_workflow 通过真实后端调用
            if (cmd === 'execute_quick_workflow') {
              console.log('[E2E Mock] 🌐 execute_quick_workflow - trying HTTP API...');

              try {
                // 尝试调用真实的后端 HTTP API
                const response = await fetch('http://localhost:3333/api/workflow/execute', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    workflow_type: args.workflowType,
                    target_path: args.targetPath,
                    project_root: args.projectRoot,
                    provider_config: args.providerConfig,
                    current_model: args.currentModel,
                    correlation_id: args.correlationId,
                  }),
                });

                if (response.ok) {
                  const data = await response.json();
                  console.log('[E2E Mock] ✅ HTTP API call successful:', data);
                  return data.data.workflow_id;
                } else {
                  console.warn(`[E2E Mock] ⚠️ HTTP API returned ${response.status}, falling back to mock`);
                  throw new Error(`HTTP API failed: ${response.status}`);
                }
              } catch (error) {
                console.warn('[E2E Mock] ⚠️ HTTP API unavailable, using mock:', error);

                // Fallback 到 mock 数据
                const mockWorkflowId = `workflow-mock-${Date.now()}`;
                console.log('[E2E Mock] 📝 Returning mock workflow ID:', mockWorkflowId);
                return mockWorkflowId;
              }
            }

            // 🎯 Mock: should_summarize_conversation
            if (cmd === 'should_summarize_conversation') {
              const messages = args.messages || [];
              const msgCount = messages.length;
              // 简单估算：每条消息平均 1500 tokens（约 1100 中文字符）
              const estimatedTokens = msgCount * 1500;
              // 阈值：100条消息 或 100k tokens
              const shouldSummarize = msgCount > 100 || estimatedTokens > 100000;
              console.log(`[E2E Mock] should_summarize: ${shouldSummarize} (${msgCount} messages, ~${estimatedTokens} tokens)`);
              return Promise.resolve(shouldSummarize);
            }

            // 🎯 Mock: get_token_stats
            if (cmd === 'get_token_stats') {
              const messages = args.messages || [];
              const msgCount = messages.length;
              // 简单估算：每条消息平均 100 tokens
              const totalTokens = msgCount * 100;
              console.log(`[E2E Mock] get_token_stats: ${msgCount} messages, ${totalTokens} tokens`);
              // 🔥 FIX: 使用蛇形命名以匹配 TokenStatsDisplay 的期望
              return Promise.resolve({
                message_count: msgCount,
                total_tokens: totalTokens,
                system_tokens: 50,
                user_tokens: Math.floor(totalTokens * 0.6),
                assistant_tokens: Math.floor(totalTokens * 0.4)
              });
            }

            // 🎯 Mock: compact_conversation
            if (cmd === 'compact_conversation') {
              const messages = args.messages || [];
              const summary = args.summary || '## 对话总结\n\n测试对话总结。';
              const keepLastN = args.keep_last_n || 10;

              console.log(`[E2E Mock] compact_conversation: ${messages.length} messages -> keep last ${keepLastN}`);

              // 🔥 简化压缩逻辑：直接只保留最后 N 条消息
              const compacted = messages.slice(-keepLastN);

              console.log(`[E2E Mock] compressed: ${messages.length} -> ${compacted.length} messages`);

              return Promise.resolve(compacted);
            }

            // 🎯 Mock: plugin:event|listen (Tauri event plugin)
            if (cmd === 'plugin:event|listen') {
              const eventName = args?.event || args?.[0];
              console.log(`[E2E Mock] plugin:event|listen: ${eventName}`);
              // 返回一个 mock 的 listener ID
              const listenerId = `e2e-listener-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              return Promise.resolve(listenerId);
            }

            // 🎯 Mock: plugin:event|unlisten
            if (cmd === 'plugin:event|unlisten') {
              console.log('[E2E Mock] plugin:event|unlisten');
              return Promise.resolve();
            }

            // 🎯 Mock: ai_chat (返回模拟响应)
            if (cmd === 'ai_chat') {
              console.log(`[E2E Mock] ai_chat called - returning mock response`);
              return Promise.resolve({
                id: `mock-${Date.now()}`,
                role: 'assistant',
                content: '这是一个模拟的 AI 响应。在测试环境中，我们不需要真实的 LLM 调用。',
                status: 'completed',
                timestamp: Date.now()
              });
            }

            // 其他命令：拒绝并提示
            return Promise.reject(new Error(
              `E2E Mock: Tauri invoke called but not properly mocked: ${cmd}. ` +
              `Please ensure your test properly mocks Tauri API calls.`
            ));
          };
        }

        // 确保 __TAURI__.core 存在
        if (!w.__TAURI__) {
          w.__TAURI__ = {};
        }
        if (!w.__TAURI__.core) {
          w.__TAURI__.core = {};
        }
        if (!w.__TAURI__.core.invoke) {
          w.__TAURI__.core.invoke = w.__TAURI_INTERNALS__.invoke;
        }

        // Mock __TAURI__.event.listen (plugin:event|listen)
        // StreamingResponseController 等组件通过 window.__TAURI__.event.listen 注册事件监听
        if (!w.__TAURI__.event) {
          w.__TAURI__.event = {};
        }
        if (!w.__TAURI__.event.listen) {
          w.__TAURI__.event.listen = async (event: string, handler: any) => {
            console.log(`[E2E Tauri Mock] event.listen: ${event}`);
            const listeners = w.__TAURI_EVENT_LISTENERS__ || {};
            if (!listeners[event]) {
              listeners[event] = [];
            }
            listeners[event].push(handler);
            w.__TAURI_EVENT_LISTENERS__ = listeners;
            return () => {
              const idx = listeners[event]?.indexOf(handler);
              if (idx > -1) listeners[event]?.splice(idx, 1);
            };
          };
        }
        if (!w.__TAURI__.event.emit) {
          w.__TAURI__.event.emit = async (event: string, payload?: any) => {
            const listeners = w.__TAURI_EVENT_LISTENERS__?.[event] || [];
            listeners.forEach((fn: Function) => fn({ payload }));
          };
        }

        console.log('[E2E Setup] ✅ Tauri bridge mock initialized for E2E environment');
      };

      // 立即初始化
      ensureTauriBridge();

      window.__E2E_SEND__ = async (text) => {
        const check = () => {
          const chatStore = window.__chatStore;
          const settingsStore = window.__settingsStore;
          if (chatStore && settingsStore) {
            chatStore.getState().sendMessage(text, settingsStore.getState().currentProviderId, settingsStore.getState().currentModel);
            return true;
          }
          return false;
        };
        if (!check()) {
          const timer = setInterval(() => { if (check()) clearInterval(timer); }, 100);
          setTimeout(() => clearInterval(timer), 5000);
        }
      };

      window.__E2E_GET_MESSAGES__ = () => window.__chatStore?.getState()?.messages || [];

      window.__E2E_OPEN_MOCK_FILE__ = (name, content) => {
        const fileStore = window.__fileStore;
        const layoutStore = window.__layoutStore;
        const filePath = `/Users/mac/mock-project/${name}`;
        const fileContent = content || (window.__E2E_MOCK_FILE_SYSTEM__?.get(filePath)) || '';

        if (fileStore) {
          const fileId = fileStore.getState().openFile({
            id: `mock-${name}`, path: filePath, name, content: fileContent, isDirty: false, language: 'typescript'
          });
          const layoutState = layoutStore?.getState();
          const activePaneId = layoutState?.activePaneId || (layoutState?.panes ? Object.keys(layoutState.panes)[0] : null);
          if (activePaneId) layoutStore.getState().assignFileToPane(activePaneId, fileId);
        }
      };

      window.__E2E_MOCK_FILE_SYSTEM__ = window.__E2E_MOCK_FILE_SYSTEM__ || new Map();
      window.__E2E_SYMBOL_MOCK_DATA__ = window.__E2E_SYMBOL_MOCK_DATA__ || { references: {}, definitions: {} };

      // 🔥 E2E IndexedDB Mock for message persistence tests
      if (!window.__E2E_INDEXED_DB_MOCK__) {
        window.__E2E_INDEXED_DB_MOCK__ = {
          _messages: new Map(),

          saveMessages(messages) {
            for (const msg of messages) {
              this._messages.set(msg.id, msg);
            }
          },

          getThreadMessages(threadId) {
            return Array.from(this._messages.values())
              .filter(m => m.threadId === threadId)
              .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          },

          getAllMessages() {
            return Array.from(this._messages.values());
          },

          clear() {
            this._messages.clear();
          },

          getMessage(id) {
            return this._messages.get(id);
          },

          deleteMessage(id) {
            this._messages.delete(id);
          }
        };
        console.log('[E2E Setup] ✅ IndexedDB mock initialized for E2E environment');
      }

      const interceptor = (originalInvoke) => {
        const wrapped = async (cmd, args) => {
          if (cmd === 'find_references') {
            const res = window.__E2E_SYMBOL_MOCK_DATA__.references[args.symbolName || args.name];
            if (res) return res;
          }
          if (cmd === 'find_definitions') {
            const res = window.__E2E_SYMBOL_MOCK_DATA__.definitions[args.symbolName || args.name];
            if (res) return res;
          }
          return originalInvoke(cmd, args);
        };

        // 🔥 FIX: 给 wrapped 函数添加标记，用于检测是否是 mock
        wrapped.isE2EMock = true;

        return wrapped;
      };

      if (window.__TAURI_INTERNALS__?.invoke) window.__TAURI_INTERNALS__.invoke = interceptor(window.__TAURI_INTERNALS__.invoke);
      if (window.__TAURI__?.core?.invoke) window.__TAURI__.core.invoke = interceptor(window.__TAURI__.core.invoke);
    };

    if (params.skipWelcome !== false) {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
    }

    // 🔥 FIX: 设置 AI Provider 配置到 localStorage
    // 这样即使没有真实的 API key，聊天输入框也能正常显示
    console.log('[E2E Setup] 🔍 Provider 配置检查:', {
      useRealAI: params.useRealAI,
      hasApiKey: !!params.realAIApiKey,
      apiKeyPrefix: params.realAIApiKey?.substring(0, 10) + '...',
      baseUrl: params.realAIBaseUrl,
      model: params.realAIModel
    });

    if (params.useRealAI && params.realAIApiKey) {
      console.log('[E2E Setup] 🔑 设置真实 AI Provider 配置');
      localStorage.setItem('ai_providers', JSON.stringify([
        {
          id: 'real-ai-e2e',
          name: 'Real AI E2E',
          baseUrl: params.realAIBaseUrl || 'https://api.deepseek.com',
          apiKey: params.realAIApiKey,
          enabled: true,
          isCustom: false,
          models: [
            { id: params.realAIModel || 'deepseek-chat', name: params.realAIModel || 'deepseek-chat' }
          ]
        }
      ]));
      localStorage.setItem('currentProviderId', 'real-ai-e2e');
      localStorage.setItem('currentModel', params.realAIModel || 'deepseek-chat');
      console.log('[E2E Setup] ✅ Provider 配置已设置到 localStorage');
    } else if (params.useRealAI) {
      // 🔥 FALLBACK: 如果启用了真实 AI 但没有 API key，使用 mock 配置
      // 这样聊天输入框可以正常显示，但实际调用会失败
      console.log('[E2E Setup] ⚠️ 真实 AI 模式但无 API key，使用 mock 配置');
      localStorage.setItem('ai_providers', JSON.stringify([
        {
          id: 'mock-provider',
          name: 'Mock Provider',
          baseUrl: 'http://localhost:3333',
          apiKey: 'mock-key-for-e2e',
          enabled: true,
          isCustom: true,
          models: [
            { id: 'mock-model', name: 'Mock Model' }
          ]
        }
      ]));
      localStorage.setItem('currentProviderId', 'mock-provider');
      localStorage.setItem('currentModel', 'mock-model');
      console.log('[E2E Setup] ✅ Mock Provider 配置已设置到 localStorage');
    } else {
      console.log('[E2E Setup] ℹ️ 非 Real AI 模式，跳过 Provider 配置');
    }

    setupE2EHelpers();
    document.addEventListener('DOMContentLoaded', setupE2EHelpers);
  }, realAIConfigParam);

  // 2. 导航到主页 (只有一次)
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // 3. 等待 Stores 初始化完成
  await page.waitForFunction(() => {
    return window.__chatStore && window.__settingsStore && window.__fileStore && window.__agentStore;
  }, { timeout: 30000 });

  // 🔥 FIX: 如果使用真实 AI，直接在 settingsStore 中设置 provider 配置
  // 这比修改 localStorage/IndexedDB 更可靠
  if (useRealAI && realAIApiKey) {
    console.log('[E2E] 🔑 设置真实 AI Provider 到 settingsStore');
    await page.evaluate((params) => {
      const settingsStore = (window as any).__settingsStore;
      if (!settingsStore) {
        console.error('[E2E] ❌ settingsStore 未初始化');
        return;
      }

      // 添加或更新 provider 配置
      const newProvider = {
        id: 'real-ai-e2e',
        name: 'Real AI E2E',
        protocol: 'openai' as const,
        baseUrl: params.realAIBaseUrl || 'https://api.deepseek.com',
        apiKey: params.realAIApiKey,
        models: [params.realAIModel || 'deepseek-chat'],
        enabled: true,
        isCustom: false,
      };

      // 获取当前 providers
      const currentState = settingsStore.getState();
      const existingProviders = currentState.providers || [];

      // 查找是否已存在同名 provider
      const existingIndex = existingProviders.findIndex((p: any) => p.id === 'real-ai-e2e');

      let newProviders;
      if (existingIndex >= 0) {
        // 更新现有 provider
        newProviders = [...existingProviders];
        newProviders[existingIndex] = newProvider;
      } else {
        // 添加新 provider
        newProviders = [...existingProviders, newProvider];
      }

      // 更新 settingsStore
      settingsStore.setState({
        providers: newProviders,
        currentProviderId: 'real-ai-e2e',
        currentModel: params.realAIModel || 'deepseek-chat',
      });

      console.log('[E2E] ✅ Provider 配置已设置到 settingsStore:', {
        providerCount: newProviders.length,
        currentProviderId: 'real-ai-e2e',
        currentModel: params.realAIModel || 'deepseek-chat',
      });
    }, { realAIApiKey, realAIBaseUrl, realAIModel });
  }

  // 3.1 等待重构架构核心对象初始化完成（EventBus、ToolCallManager、APP_READY）
  // 🏆 修复：使用更灵活的等待条件，兼容新旧架构
  // 🔥 FIX: 同时检查 __chatEventBus 和 __GLOBAL_CHAT_EVENT_BUS__
  await page.waitForFunction(() => {
    const w = window as any;
    // 新架构：要求 EventBus 和 ToolCallManager
    const newArchitectureReady = (w.__chatEventBus || w.__GLOBAL_CHAT_EVENT_BUS__) && w.__toolCallManager;
    // 旧架构/简化模式：只要求 APP_READY
    const simpleReady = w.__APP_READY__ === true;
    // 任一条件满足即可
    return newArchitectureReady || simpleReady;
  }, { timeout: 30000 });

  // 3.2 等待 formatToolResultToMarkdown 函数暴露（用于 E2E 测试）
  await page.waitForFunction(() => {
    const w = window as any;
    return w.__formatToolResultToMarkdown && typeof w.__formatToolResultToMarkdown === 'function';
  }, { timeout: 30000 });

  // 4. 如果是真后端 + 真 AI，手动同步 Store 配置以防万一
  if (useRealTauri && useRealAI && realAIApiKey) {
    await page.evaluate(({ apiKey, baseUrl }) => {
      const settingsStore = window.__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey,
          baseUrl: baseUrl || 'https://open.bigmodel.cn/api/paas/v4'
        });
      }
    }, { apiKey: realAIApiKey, baseUrl: realAIBaseUrl });
  }

  console.log('[E2E Setup] ✅ Environment locked and ready');
}

/**
 * 填充 Mock 文件系统 (用于测试 Diff UI)
 */
export async function setupMockFileSystem(page: Page, files, symbolData?: { references?: any, definitions?: any }) {
  await page.evaluate(({ fileData, symbols }) => {
    if (!window.__E2E_MOCK_FILE_SYSTEM__) {
      window.__E2E_MOCK_FILE_SYSTEM__ = new Map();
    }
    const mockFS = window.__E2E_MOCK_FILE_SYSTEM__;
    const fileStore = window.__fileStore;

    
    if (symbols && window.__E2E_SYMBOL_MOCK_DATA__) {
      if (symbols.references) {
        window.__E2E_SYMBOL_MOCK_DATA__.references = {
          ...window.__E2E_SYMBOL_MOCK_DATA__.references,
          ...symbols.references
        };
      }
      if (symbols.definitions) {
        window.__E2E_SYMBOL_MOCK_DATA__.definitions = {
          ...window.__E2E_SYMBOL_MOCK_DATA__.definitions,
          ...symbols.definitions
        };
      }
    }
    
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
    const buildFileTree = (data, base) => {
      const root = { id: "root", name: "mock-project", kind: "directory", path: base, children: [] };
      
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
            let dir = current.children.find((c) => c.name === part && c.kind === "directory");
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
  }, { fileData: files, symbols: symbolData });
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
    window.__JOYRIDE_DISABLED__ = true;
  });
}

/**
 * 安全点击元素（自动移除 Joyride overlay）
 *
 * @param page Playwright Page 对象
 * @param selector CSS 选择器
 */
export async function safeClick(page: Page, selector) {
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

/**
 * 获取真实 AI 配置
 *
 * 从页面环境中读取已配置的 AI 服务商和模型信息
 *
 * @param page Playwright Page 对象
 * @returns AI 配置对象，包含 providerId 和 modelId
 */
export async function getRealAIConfig(page: Page) {
  const config = await page.evaluate(() => {
    const settingsStore = (window as any).__settingsStore;
    if (!settingsStore) {
      return { providerId: null, modelId: null };
    }

    const state = settingsStore.getState();
    return {
      providerId: state.currentProviderId || null,
      modelId: state.currentModel || null
    };
  });

  return config;
}