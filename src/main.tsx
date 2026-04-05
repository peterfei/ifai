import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import './i18n/config';

// 🏆 PIVO 3.0: 物理层协议伪造 (Protocol Spoofing) - 智能轮询检测版本
// 🔥 关键理解：在 E2E 测试中，Playwright 访问的是 Vite 开发服务器，
// 而真实的 Tauri bridge 只注入到原生 Tauri window 中。
// 因此 Playwright 浏览器中永远不会有真实的 Tauri bridge。
//
// 解决方案：使用轮询机制检测，如果一段时间内没有真实 bridge 则设置 mock
if (typeof window !== 'undefined' && (import.meta.env.VITE_TEST_ENV === 'e2e' || (window as any).__E2E__)) {
  console.log('[PIVO3-Mock] 🛡️ Preparing Tauri v2 mock for E2E environment (polling mode)...');

  // 🔥 轮询检测真实的 Tauri bridge（最多等待 100ms）
  // 在真实的 Tauri window 中，bridge 会很快注入
  // 在 E2E 测试中，永远不会有真实 bridge，所以会超时后使用 mock
  const checkRealTauriBridge = (attempts = 0, maxAttempts = 10): boolean => {
    const existingInternals = (window as any).__TAURI_INTERNALS__;
    const existingTauri = (window as any).__TAURI__;
    const hasRealInvoke = existingInternals?.invoke || existingTauri?.core?.invoke;

    if (!hasRealInvoke) {
      // 还没有任何 invoke，继续等待
      if (attempts < maxAttempts) {
        // 使用 setTimeout(0) 进行非阻塞检查
        setTimeout(() => checkRealTauriBridge(attempts + 1, maxAttempts), 0);
        return false;
      }
      // 超时了，设置 mock
      return false;
    }

    // 有 invoke 函数，检查是否为真实 Tauri
    const invokeStr = hasRealInvoke.toString();
    const isRealTauri = !invokeStr.includes('PIVO3-Mock') &&
                       !invokeStr.includes('E2E Mock') &&
                       !invokeStr.includes('IPC Invoke:');

    if (isRealTauri) {
      console.log('[PIVO3-Mock] ✅ Real Tauri bridge detected!');
      console.log('[PIVO3-Mock] 📊 Real invoke source:', invokeStr.substring(0, 200));
      return true;
    }

    // 有 invoke 但不是真实 Tauri，继续等待
    if (attempts < maxAttempts) {
      setTimeout(() => checkRealTauriBridge(attempts + 1, maxAttempts), 0);
      return false;
    }

    return false;
  };

  // 开始检测
  const hasRealBridge = checkRealTauriBridge();

  // 如果没有检测到真实 bridge，设置 mock
  if (!hasRealBridge) {
    console.log('[PIVO3-Mock] 🎭 No real Tauri bridge found after polling, setting up mock...');

    const invoke = async (cmd: string, args?: any) => {
      console.log(`[PIVO3-Mock] 📞 IPC Invoke: ${cmd}`, args);
      const handler = (window as any).__E2E_INVOKE_HANDLER__;

      // 🏆 PIVO 3.0: 同步高保真探测 Mock 逻辑
      if (cmd === 'probe_symbols') {
          if (args.path?.includes('settingsStore')) {
              return [
                  { name: 'SettingsState', kind: 'interface', line: 50, context: 'export interface SettingsState' },
                  { name: 'useSettingsStore', kind: 'variable', line: 150, context: 'export const useSettingsStore = ...' }
              ];
          }
          return [];
      }
      if (cmd === 'get_file_metadata') {
          return { size: 1024, mtime: Date.now(), fingerprint: `mock_${Date.now()}` };
      }

      // 🔥 FIX: 添加 list_prompts 命令的处理（用于版本管理测试）
      if (cmd === 'list_prompts') {
        console.log('[PIVO3-Mock] 📋 Handling list_prompts command (mock mode)');
        // 返回空数组而不是空对象，避免前端错误
        return [];
      }

      // 版本管理相关命令的 mock 处理
      if (cmd === 'get_prompt_versions') {
        console.log('[PIVO3-Mock] 📋 Handling get_prompt_versions command (mock mode)');
        return [];
      }
      if (cmd === 'compare_prompt_versions') {
        console.log('[PIVO3-Mock] 📋 Handling compare_prompt_versions command (mock mode)');
        return {
          old_version: { version_id: 'mock1', timestamp: Date.now(), author: 'Mock', message: 'Mock version', content_hash: 'abc' },
          new_version: { version_id: 'mock2', timestamp: Date.now(), author: 'Mock', message: 'Mock version', content_hash: 'def' },
          additions: 0,
          deletions: 0,
          diff_text: ''
        };
      }
      if (cmd === 'rollback_prompt') {
        console.log('[PIVO3-Mock] 📋 Handling rollback_prompt command (mock mode)');
        return args.prompt_path || 'mock.md';
      }

      if (handler) return handler(cmd, args);
      return {};
    };

    const transformCallback = (callback?: any) => {
      const id = Math.floor(Math.random() * 1000000);
      if (callback) {
          // 🔥 FIX: 如果属性已存在且只读，重新定义它
          if (!(window as any).__TAURI_EVENT_LISTENERS__) {
            Object.defineProperty(window, '__TAURI_EVENT_LISTENERS__', {
              value: {},
              writable: true,
              configurable: true,
              enumerable: true
            });
          }
          const listeners = (window as any).__TAURI_EVENT_LISTENERS__;
          listeners[`callback_${id}`] = [callback];
      }
      return id;
    };

    const unregisterListener = async (id: number) => {
      console.log(`[PIVO3-Mock] 🧹 Unregistering listener: ${id}`);
      delete (window as any).__TAURI_EVENT_LISTENERS__?.[`callback_${id}`];
    };

    (window as any).__TAURI_INTERNALS__ = {
      transformCallback,
      invoke,
      unregisterListener,
      metadata: { app: { name: 'IfAI', version: '0.3.8' }, os: { name: 'darwin' } },
      window: {
          label: 'main',
          currentWindow: () => (window as any).__TAURI_INTERNALS__.window
      }
    };

    (window as any).__TAURI__ = {
      core: { invoke, transformCallback },
      event: {
          listen: (event: string, handler: any) => {
              // 🔥 FIX: 如果属性已存在且只读，重新定义它
              if (!(window as any).__TAURI_EVENT_LISTENERS__) {
                Object.defineProperty(window, '__TAURI_EVENT_LISTENERS__', {
                  value: {},
                  writable: true,
                  configurable: true,
                  enumerable: true
                });
              }
              const listeners = (window as any).__TAURI_EVENT_LISTENERS__;
              if (!listeners[event]) listeners[event] = [];
              listeners[event].push(handler);
              return Promise.resolve(() => {});
          }
      }
    };

    console.log('[PIVO3-Mock] ✅ Mock setup completed');
  }
}
// 🔥 v0.3.7: 物理级全局存储溢出保护 (Monkey Patch)
// 根治 QuotaExceededError 导致的 Promise Rejection 和 UI 中断
if (typeof window !== 'undefined') {
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    try {
      originalSetItem(key, value);
    } catch (e) {
      if (e instanceof Error && (e.name === 'QuotaExceededError' || e.message.includes('quota'))) {
        console.error('[Storage Sentinel] 🚨 LocalStorage Full! Blocking write for:', key);
        // 1. 静默拦截报错，防止程序崩溃
        // 2. 异步触发清理程序（复用 threadStore 里的逻辑，或者直接清理缓存）
        setTimeout(() => {
          console.warn('[Storage Sentinel] Attempting emergency cleanup...');
          Object.keys(localStorage).forEach(k => {
            if (k.includes('cache') || k.includes('tmp') || k.includes('search')) {
              localStorage.removeItem(k);
            }
          });
        }, 0);
      } else {
        throw e; // 其他错误照常抛出
      }
    }
  };
}

// v0.3.0: 启动调试日志
console.log('[Main] 🚀 App starting...');
console.log('[Main] Mode:', import.meta.env.MODE);
console.log('[Main] Dev:', import.meta.env.DEV);

// Import type extensions to apply module augmentation
import './types/chat';

// Import Monaco language contributions for syntax highlighting
import './utils/monacoLanguages';

// Monaco 环境延迟初始化函数
const initMonacoEnvironment = async () => {
  console.log('[Main] 🛠️  Initializing Monaco Environment...');
  
  // 动态导入 Worker (Vite 会将其处理为独立的 chunk)
  const [
    editorWorker, 
    jsonWorker, 
    cssWorker, 
    htmlWorker, 
    tsWorker
  ] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/json/json.worker?worker'),
    import('monaco-editor/esm/vs/language/css/css.worker?worker'),
    import('monaco-editor/esm/vs/language/html/html.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker')
  ]);

  // @ts-ignore
  window.MonacoEnvironment = {
    getWorker(_: any, label: string) {
      if (label === 'json') return new jsonWorker.default();
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker.default();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker.default();
      if (label === 'typescript' || label === 'javascript') return new tsWorker.default();
      return new editorWorker.default();
    },
  };
  
  // 动态加载语言贡献
  await import('./utils/monacoLanguages');
  console.log('[Main] ✅ Monaco Environment ready');
};

// 暴露 Store 到全局以便调试 (延迟执行)
const exposeDebugStores = () => {
  if (import.meta.env.DEV || (window as any).__E2E__) {
    // 🔥 E2E: 立即暴露 formatToolResultToMarkdown 函数（不延迟）
    if ((window as any).__E2E__ || (window as any).process?.env?.NODE_ENV === 'test') {
      import('./utils/toolResultFormatter').then(formatter => {
        (window as any).__formatToolResultToMarkdown = formatter.formatToolResultToMarkdown;
        console.log('[Main] ✅ formatToolResultToMarkdown exposed to window.__formatToolResultToMarkdown (Immediate)');
      }).catch(err => {
        console.error('[Main] ❌ Failed to expose formatToolResultToMarkdown:', err);
      });
    }

    // 使用 requestIdleCallback 确保在浏览器空闲时执行
    const runExpose = () => {
      Promise.all([
        import('./stores/skillStore'),
        import('./stores/fileStore'),
        import('./stores/useChatStore'),
        import('./stores/settingsStore'),
        import('./stores/layoutStore'),
        import('./stores/editorStore'),
        import('./utils/tokenCounter'),
        import('./stores/pivoStore')
      ]).then(([skill, file, chat, settings, layout, editor, tokens, pivo]) => {
        const stores = {
          skillStore: skill.useSkillStore,
          fileStore: file.useFileStore,
          chatStore: chat.useChatStore,
          settingsStore: settings.useSettingsStore,
          layoutStore: layout.useLayoutStore,
          editorStore: editor.useEditorStore,
          pivoStore: pivo.usePivoStore,
          utils: {
            ...((window as any).__DEBUG__?.utils || {}),
            tokenCounter: tokens
          }
        };
        (window as any).__DEBUG__ = { ...(window as any).__DEBUG__, ...stores };

        // 🔥 为 E2E 测试直接暴露
        if ((window as any).__E2E__ || (window as any).process?.env?.NODE_ENV === 'test') {
          (window as any).__chatStore = chat.useChatStore;
          (window as any).__pivoStore = pivo.usePivoStore;
          (window as any).__layoutStore = layout.useLayoutStore; // P3: 暴露 layoutStore
        }

        console.log('[Main] 🛠️  Core Stores and Utils exposed to window.__DEBUG__ (Idle)');
      });
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(runExpose);
    } else {
      setTimeout(runExpose, 1000);
    }
  }
};

// 启动流程
initMonacoEnvironment();

// 🏆 PIVO 3.0: 物理数据迁移 (LocalStorage -> IndexedDB)
import { DataMigrator } from './services/storage/DataMigrator';
DataMigrator.migrationPromise.catch(e => console.error('[Main] Migration Error:', e));

exposeDebugStores();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);

// v0.3.0: 渲染完成日志
console.log('[Main] ✅ App rendered successfully');
console.log('[Main] Root element:', document.getElementById("root"));
console.log('[Main] Document ready state:', document.readyState);
