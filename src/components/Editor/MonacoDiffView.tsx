import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { getMonacoTheme } from '../../utils/theme';

interface MonacoDiffViewProps {
  oldValue: string;
  newValue: string;
  language?: string;
  theme?: string;
  height?: string | number;
}

export const MonacoDiffView: React.FC<MonacoDiffViewProps> = ({ 
  oldValue, 
  newValue, 
  language = 'plaintext',
  theme = 'vs-dark',
  height = 300 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Create models
      const originalModel = monaco.editor.createModel(oldValue, language);
      const modifiedModel = monaco.editor.createModel(newValue, language);

      // Create Diff Editor
      const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
        originalEditable: false,
        readOnly: true,
        renderSideBySide: true,
        automaticLayout: true,
        theme: getMonacoTheme(theme as 'vs-dark' | 'light'),
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderIndicators: true,
        useInlineViewWhenSpaceIsLimited: true,
        scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
        }
      });

      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });

      // 🔥 自动跳转到第一个变更点
      const timer = setTimeout(() => {
        // 检查 editor 是否已被释放
        if (!editorRef.current) return;
        
        const changes = diffEditor.getLineChanges();
        if (changes && changes.length > 0) {
          const firstChange = changes[0];
          const lineNumber = firstChange.modifiedStartLineNumber;
          diffEditor.getModifiedEditor().revealLineInCenter(lineNumber, monaco.editor.ScrollType.Smooth);
        }
      }, 100);

      editorRef.current = diffEditor;

      return () => {
        clearTimeout(timer);
        const editor = editorRef.current;
        editorRef.current = null;
        
        if (editor) {
          try {
            // 1. 断开模型引用
            editor.setModel(null);
            // 2. 销毁编辑器
            editor.dispose();
          } catch (e) {}
        }

        // 3. 延迟销毁模型，彻底避开内部事件循环冲突
        setTimeout(() => {
          try {
            if (originalModel && !originalModel.isDisposed()) originalModel.dispose();
            if (modifiedModel && !modifiedModel.isDisposed()) modifiedModel.dispose();
          } catch (e) {}
        }, 100); // 增加到 100ms 缓冲区
      };
    }
  }, [oldValue, newValue, language, theme]);

  return (
    <div 
      ref={containerRef} 
      style={{ height, width: '100%', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }} 
    />
  );
};
