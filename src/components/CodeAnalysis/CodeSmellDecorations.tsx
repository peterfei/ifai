/**
 * v0.3.0: Monaco Editor 代码异味装饰器
 *
 * 在编辑器中显示代码异味标记
 */

import { useEffect, useRef } from 'react';
import { useCodeSmellStore } from '../../stores/codeSmellStore';
import { useEditorStore } from '../../stores/editorStore';

export const useCodeSmellDecorations = () => {
  const decorationIdsRef = useRef<string[]>([]);
  const { getResult, activeFilePath } = useCodeSmellStore();
  const { getActiveEditor } = useEditorStore();

  useEffect(() => {
    if (!activeFilePath) return;

    const editor = getActiveEditor();
    if (!editor) return;

    // 清除旧的装饰
    if (decorationIdsRef.current.length > 0) {
      editor.deltaDecorations(decorationIdsRef.current, []);
      decorationIdsRef.current = [];
    }

    // 获取当前文件的分析结果
    const result = getResult(activeFilePath);
    if (!result || result.smells.length === 0) return;

    // 创建新的装饰
    const decorations = result.smells.map((smell) => {
      const severity = smell.severity;
      const colorClass =
        severity === 'error'
          ? 'text-red-400'
          : severity === 'warning'
          ? 'text-yellow-400'
          : 'text-blue-400';

      return {
        range: {
          startLineNumber: smell.line,
          startColumn: smell.column || 1,
          endLineNumber: smell.endLine || smell.line,
          endColumn: smell.endColumn || 1000,
        },
        options: {
          // 行内装饰（波浪线）
          inlineClassName:
            severity === 'error'
              ? 'code-smell-error-line'
              : severity === 'warning'
              ? 'code-smell-warning-line'
              : 'code-smell-info-line',
          // 行号旁图标
          glyphMarginClassName:
            severity === 'error'
              ? 'code-smell-error-glyph'
              : severity === 'warning'
              ? 'code-smell-warning-glyph'
              : 'code-smell-info-glyph',
          // 悬停提示
          hoverMessage: {
            value: `
              <div style="padding: 4px 0;">
                <strong style="color: ${
                  severity === 'error' ? '#f87171' : severity === 'warning' ? '#fbbf24' : '#60a5fa'
                }">${smell.message}</strong>
                ${smell.suggestion ? `<br/><em style="color: #9ca3af; font-size: 0.9em;">💡 ${smell.suggestion}</em>` : ''}
              </div>
            `.trim(),
          },
          // 概览标尺标记
          overviewRuler: {
            color:
              severity === 'error'
                ? '#ef4444'
                : severity === 'warning'
                ? '#f59e0b'
                : '#3b82f6',
            position: 1, // overview ruler 位置
          },
        },
      };
    });

    decorationIdsRef.current = editor.deltaDecorations([], decorations);
  }, [activeFilePath, getResult, getActiveEditor]);

  useEffect(() => {
    // 组件卸载时清理装饰
    return () => {
      const editor = getActiveEditor();
      if (editor && decorationIdsRef.current.length > 0) {
        editor.deltaDecorations(decorationIdsRef.current, []);
      }
    };
  }, [getActiveEditor]);
};

/**
 * 代码异味装饰器提供组件
 */
export const CodeSmellDecorationProvider: React.FC = () => {
  useCodeSmellDecorations();
  return null;
};

/**
 * 注入代码异味装饰器样式
 */
export const injectCodeSmellStyles = () => {
  if (typeof document === 'undefined') return;

  const styleId = 'code-smell-decoration-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* 行内波浪线效果 */
    .code-smell-error-line {
      text-decoration: wavy underline;
      text-decoration-color: rgba(239, 68, 68, 0.6);
      text-decoration-skip-ink: none;
    }

    .code-smell-warning-line {
      text-decoration: wavy underline;
      text-decoration-color: rgba(245, 158, 11, 0.6);
      text-decoration-skip-ink: none;
    }

    .code-smell-info-line {
      text-decoration: wavy underline;
      text-decoration-color: rgba(59, 130, 246, 0.6);
      text-decoration-skip-ink: none;
    }

    /* 行号旁图标 */
    .code-smell-error-glyph {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>') center/contain no-repeat;
      width: 16px !important;
      height: 16px !important;
    }

    .code-smell-warning-glyph {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>') center/contain no-repeat;
      width: 16px !important;
      height: 16px !important;
    }

    .code-smell-info-glyph {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>') center/contain no-repeat;
      width: 16px !important;
      height: 16px !important;
    }
  `;

  document.head.appendChild(style);
};
