/**
 * 语法高亮 Worker Hook - v0.2.6 性能优化
 * 提供便捷的接口来使用语法高亮 Web Worker
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface HighlightResult {
  html: string;
  error?: string;
}

interface UseSyntaxHighlightWorkerResult {
  highlight: (code: string, language: string) => Promise<HighlightResult>;
  isLoading: boolean;
  error: string | null;
}

/**
 * 使用语法高亮 Worker
 * 自动管理 Worker 生命周期和错误处理
 * 注意：简化实现，Monaco Editor 的实际高亮在主线程处理
 */
export function useSyntaxHighlightWorker(): UseSyntaxHighlightWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化 Worker
  useEffect(() => {
    try {
      // 使用 Vite 的 Worker 导入语法
      // @ts-ignore - Vite worker import
      const worker = new Worker(new URL('../workers/syntaxHighlight.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      // 监听 Worker 错误
      worker.onerror = (err) => {
        console.error('[SyntaxHighlightWorker] Error:', err);
        setError(err.message);
        setIsLoading(false);
      };

      return () => {
        // 清理 Worker
        worker.terminate();
        workerRef.current = null;
      };
    } catch (e) {
      // Worker 加载失败（可能在某些环境下不支持）
      console.warn('[SyntaxHighlightWorker] Failed to initialize, using fallback:', e);
    }
  }, []);

  /**
   * 执行语法高亮
   */
  const highlight = useCallback(async (code: string, language: string): Promise<HighlightResult> => {
    if (!workerRef.current) {
      // Worker 未初始化，回退到后端 API
      try {
        const html = await invoke<string>('highlight_code', { code, language });
        return { html };
      } catch (e) {
        return {
          html: escapeHtml(code),  // 回退到纯文本
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    setIsLoading(true);
    setError(null);

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          html: escapeHtml(code),
          error: 'Syntax highlight timeout (5s)',
        });
        setIsLoading(false);
      }, 5000);

      const handleMessage = (event: MessageEvent) => {
        clearTimeout(timeoutId);
        workerRef.current?.removeEventListener('message', handleMessage);

        if (event.data.success) {
          resolve({ html: event.data.data.html });
        } else {
          resolve({
            html: escapeHtml(code),
            error: event.data.error,
          });
        }
        setIsLoading(false);
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.postMessage({ code, language });
    });
  }, []);

  return { highlight, isLoading, error };
}

/**
 * 转义 HTML（回退方案）
 */
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}
