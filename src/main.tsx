import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import './i18n/config';

// v0.3.0: 启动调试日志
console.log('[Main] 🚀 App starting...');
console.log('[Main] Mode:', import.meta.env.MODE);
console.log('[Main] Dev:', import.meta.env.DEV);

// Import type extensions to apply module augmentation
import './types/chat';

// Import Monaco language contributions for syntax highlighting
import './utils/monacoLanguages';

// Configure Monaco Workers for Vite
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// @ts-ignore
window.MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

// 🔥 E2E 调试：临时移除 React Profiler 代码以排查是否导致无限循环
// const componentStack: string[] = [];
// const originalCreateElement = React.createElement;
// const renderCounts = new Map<string, number>();
// const pathRenderCounts = new Map<string, number>();
//
// type ElementType = React.ElementType | string;
// type Props = Record<string, any>;
//
// // @ts-ignore
// React.createElement = function(type: ElementType, props?: Props, ...children: any[]) {
//   const typeName = typeof type === 'string' ? type : type.name || type.displayName || 'Anonymous';
//
//   // 追踪组件渲染
//   const count = (renderCounts.get(typeName) || 0) + 1;
//   renderCounts.set(typeName, count);
//
//   // 🔥 特别追踪 path 元素 - 找出是哪个组件产生的
//   if (typeName === 'path') {
//     const parentComponent = componentStack[componentStack.length - 1] || 'unknown';
//     const parentCount = (pathRenderCounts.get(parentComponent) || 0) + 1;
//     pathRenderCounts.set(parentComponent, parentCount);
//
//     // 每 50 次 path 渲染输出一次
//     if (parentCount % 50 === 0) {
//       console.log(`[React Profiler] ⚠️  path element rendered ${parentCount} times from: ${parentComponent}`);
//     }
//   }
//
//   // 追踪组件栈
//   if (typeof type !== 'string') {
//     componentStack.push(typeName);
//     try {
//       const result = originalCreateElement(type, props, ...children);
//       componentStack.pop();
//       return result;
//     } catch (e) {
//       componentStack.pop();
//       throw e;
//     }
//   }
//
//   return originalCreateElement(type, props, ...children);
// };
//
// // 暴露到全局
// (window as any).__reactRenderCounts = renderCounts;
// (window as any).__pathRenderCounts = pathRenderCounts;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // 🔥 E2E: 临时禁用 StrictMode 以避免双重渲染导致的混淆
  <App />
);

// v0.3.0: 渲染完成日志
console.log('[Main] ✅ App rendered successfully');
console.log('[Main] Root element:', document.getElementById("root"));
console.log('[Main] Document ready state:', document.readyState);
