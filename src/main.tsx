import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import './i18n/config';

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
