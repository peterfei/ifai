import React, { useEffect, useCallback, useRef } from 'react';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/useChatStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useInlineEditStore } from '../../stores/inlineEditStore';
import { shallow } from 'zustand/shallow';
import { WelcomeScreen } from './WelcomeScreen';
// 🔥 InlineEditWidget 已移至 App.tsx 全局渲染，避免重复订阅导致无限循环
// import { InlineEditWidget } from './InlineEditWidget';
import { setupSymbolCompletion } from './SymbolCompletionProvider';
import { symbolIndexer } from '../../core/indexer/SymbolIndexer';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { estimateTokens } from '../../utils/tokenCounter';
import * as monaco from 'monaco-editor';
import { debounce } from 'lodash-es';

// Configure monaco-editor to use local files instead of CDN to avoid 404 errors
loader.config({ monaco });

interface MonacoEditorProps {
  paneId: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({ paneId }) => {
  const { t } = useTranslation();
  const setEditorInstance = useEditorStore(state => state.setEditorInstance);
  const getEditorInstance = useEditorStore(state => state.getEditorInstance);

  // v0.2.9: Inline Edit Store
  const showInlineEdit = useInlineEditStore(state => state.showInlineEdit);

  // 🔥 修复无限循环：使用 shallow 比较避免不必要的重新渲染
  const openedFiles = useFileStore(state => state.openedFiles);
  const panes = useLayoutStore(state => state.panes);
  const setChatOpen = useLayoutStore(state => state.setChatOpen);
  const setActiveFileTokenCount = useEditorStore(state => state.setActiveFileTokenCount);

  const sendMessage = useChatStore(state => state.sendMessage);

  // 获取与此pane关联的文件
  const pane = panes.find(p => p.id === paneId);
  const fileId = pane?.fileId;
  const file = fileId ? openedFiles.find(f => f.id === fileId) : null;

  // 🔥 修复无限循环：使用 ref 存储稳定的值，避免依赖变化
  // 注意：fileRef.current 会在每次渲染时更新，这是安全的
  const fileRef = useRef<typeof file | null>(null);
  fileRef.current = file;

  // Sequence ID to prevent race conditions
  const lastRequestId = useRef(0);

  // 🔥 修复无限循环：使用 ref 存储编辑器实例，避免依赖 getEditorInstance
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Debounced token count update
  const updateTokenCount = useCallback(
    debounce(async (text: string) => {
      const requestId = ++lastRequestId.current;
      try {
        const count = await estimateTokens(text);
        // Only update if this is still the latest request
        if (requestId === lastRequestId.current) {
          setActiveFileTokenCount(count);
        } else {
          console.log('[MonacoEditor] Discarded stale token count result');
        }
      } catch (e) {
        if (requestId === lastRequestId.current) {
          console.error('[MonacoEditor] Failed to count tokens:', e);
        }
      }
    }, 500),
    [setActiveFileTokenCount]
  );

  // Initial count when file changes
  // 🔥 修复无限循环：使用 ref 存储 updateTokenCount 避免依赖变化
  const updateTokenCountRef = useRef(updateTokenCount);
  updateTokenCountRef.current = updateTokenCount;

  useEffect(() => {
    if (file?.content) {
      updateTokenCountRef.current(file.content);
    } else {
      setActiveFileTokenCount(0);
    }
  }, [file?.id, file?.content]); // 🔥 只依赖 file 值，不依赖函数

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    // 存储编辑器实例
    setEditorInstance(paneId, editor);
    editorRef.current = editor; // 🔥 同时存储到 ref

    // 🔥 v0.2.9: 设置全局编辑器实例（用于 Cmd+K 等功能）
    (window as any).__activeEditor = editor;

    // Add "Explain Code" Action
    editor.addAction({
      id: 'explain-code',
      label: t('editor.contextMenu.explain'),
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: async (ed) => {
        const selection = ed.getSelection();
        const text = selection ? ed.getModel()?.getValueInRange(selection) : '';
        if (text && text.trim().length > 0) {
          setChatOpen(true);
          const currentFile = fileRef.current;
          const prompt = `Explain the following code:\n\n\`\`\`${currentFile?.language || ''}\n${text}\n\`\`\``;
          const { currentProviderId, currentModel } = useSettingsStore.getState();
          await sendMessage(prompt, currentProviderId, currentModel);
        }
      }
    });

    // Add "Refactor Code" Action
    editor.addAction({
      id: 'refactor-code',
      label: t('editor.contextMenu.refactor'),
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.6,
      run: async (ed) => {
        const selection = ed.getSelection();
        const text = selection ? ed.getModel()?.getValueInRange(selection) : '';
        if (text && text.trim().length > 0) {
          setChatOpen(true);
          const currentFile = fileRef.current;
          const prompt = `Refactor the following code to be more efficient and readable:\n\n\`\`\`${currentFile?.language || ''}\n${text}\n\`\`\``;
          const { currentProviderId, currentModel } = useSettingsStore.getState();
          await sendMessage(prompt, currentProviderId, currentModel);
        }
      }
    });

    // ========================================================================
    // v0.2.9: 符号索引和补全系统
    // ========================================================================

    // 索引当前文件的符号
    const currentFile = fileRef.current;
    if (currentFile?.path && currentFile?.content) {
      symbolIndexer.indexFile(currentFile.path, currentFile.content).catch(console.error);
    }

    // 注册符号补全提供者
    const disposeSymbolCompletion = setupSymbolCompletion(monaco, currentFile?.path);

    // ========================================================================

    // Register Inline Completion Provider (applies to all languages)
    const completionProvider = monaco.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model, position, context, token) => {
        const { providers, currentProviderId, enableAutocomplete, useLocalModelForCompletion } = useSettingsStore.getState();
        if (!enableAutocomplete) return { items: [] };

        // Get Context
        const textBefore = model.getValueInRange({
          startLineNumber: Math.max(1, position.lineNumber - 50),
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const textAfter = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 20),
          endColumn: 1,
        });

        const prompt = `You are a code completion engine. Output only the code to complete the cursor location. Do not output markdown.
Context:
${textBefore}[CURSOR]${textAfter}
`;

        // Try local model first if enabled
        if (useLocalModelForCompletion) {
          try {
            console.log('[Completion] Trying local model...');
            const localResult = await invoke<string>('local_code_completion', {
              prompt,
              maxTokens: 50,
            });

            if (localResult && localResult.trim().length > 0) {
              console.log('[Completion] ✓ Local model succeeded');
              return {
                items: [{
                  insertText: localResult,
                  range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column
                  )
                }]
              };
            }
          } catch (e) {
            console.log('[Completion] Local model failed, falling back to cloud:', e);
            // Fall through to cloud API
          }
        }

        // Fallback to cloud API
        const currentProvider = providers.find(p => p.id === currentProviderId);
        if (!currentProvider || !currentProvider.apiKey || !currentProvider.enabled) return { items: [] };

        // Convert to backend format
        const backendProviderConfig = {
          id: currentProvider.id,
          name: currentProvider.name,
          protocol: currentProvider.protocol,
          apiKey: currentProvider.apiKey,
          baseUrl: currentProvider.baseUrl,
          models: currentProvider.models,
          enabled: currentProvider.enabled,
        };

        try {
          console.log('[Completion] Using cloud API...');
          const messages = [{ role: 'user', content: prompt }];
          const result = await invoke<string>('ai_completion', {
            providerConfig: backendProviderConfig,
            messages
          });

          if (!result) return { items: [] };

          // Clean up result (remove markdown blocks if any)
          let cleanText = result.replace(/^```\w*\n/, '').replace(/\n```$/, '');

          console.log('[Completion] ✓ Cloud API succeeded');
          return {
            items: [{
              insertText: cleanText,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              )
            }]
          };
        } catch (e) {
          console.error('[Completion] Cloud API failed:', e);
          return { items: [] };
        }
      },
      handleItemDidShow: (completions, item) => {
        // Called when an inline completion item is shown to the user
      },
      freeInlineCompletions: (completions) => {
        // Called when completions are no longer needed
        // Can be used for cleanup
      },
      // Additional method for Monaco's internal disposal
      disposeInlineCompletions: (completions, reason) => {
        // Handle Monaco's internal disposal
      }
    });

    // ========================================================================
    // v0.2.9: Cmd+K Inline Edit Command
    // ========================================================================
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      console.log('[MonacoEditor] Cmd+K command triggered!');
      const position = editor.getPosition();
      const selection = editor.getSelection();
      const model = editor.getModel();

      if (!position || !model) {
        console.log('[MonacoEditor] No position or model, skipping Cmd+K');
        return;
      }

      // Get selected text if any
      let selectedText = '';
      if (selection && !selection.isEmpty()) {
        selectedText = model.getValueInRange(selection);
      }

      console.log('[MonacoEditor] Calling showInlineEdit with:', {
        selectedText,
        position: { lineNumber: position.lineNumber, column: position.column }
      });

      showInlineEdit(selectedText, {
        lineNumber: position.lineNumber,
        column: position.column,
      });
    });

    // Cleanup on unmount
    return () => {
      completionProvider.dispose();
      disposeSymbolCompletion?.();
    };
  }, [paneId, setEditorInstance, setChatOpen, sendMessage, showInlineEdit, t]); // 🔥 修复无限循环：移除 file?.path, file?.content, file?.language 依赖（使用 fileRef.current 代替）

  const handleChange = (value: string | undefined) => {
    if (fileId && value !== undefined) {
      useFileStore.getState().updateFileContent(fileId, value);
      updateTokenCount(value);
    }
  };

  const theme = useEditorStore(state => state.theme);
  // Select only specific settings to avoid unnecessary re-renders
  const showMinimap = useSettingsStore(state => state.showMinimap);
  const fontSize = useSettingsStore(state => state.fontSize);
  const fontFamily = useSettingsStore(state => state.fontFamily);
  const lineHeight = useSettingsStore(state => state.lineHeight);
  const fontLigatures = useSettingsStore(state => state.fontLigatures);
  const cursorBlinking = useSettingsStore(state => state.cursorBlinking);
  const cursorSmoothCaretAnimation = useSettingsStore(state => state.cursorSmoothCaretAnimation);
  const smoothScrolling = useSettingsStore(state => state.smoothScrolling);
  const bracketPairColorization = useSettingsStore(state => state.bracketPairColorization);
  const renderWhitespace = useSettingsStore(state => state.renderWhitespace);
  const showLineNumbers = useSettingsStore(state => state.showLineNumbers);
  const tabSize = useSettingsStore(state => state.tabSize);
  const wordWrap = useSettingsStore(state => state.wordWrap);
  const isChatStreaming = useChatStore(state => state.isLoading);

  // Cache file size to avoid re-computing on every keystroke
  // Only update when file actually changes (not on every character typed)
  const fileSizeRef = useRef(0);
  const lastFilePath = useRef(file?.path);

  // Update file size only when file path changes (new file loaded)
  if (file?.path !== lastFilePath.current) {
    lastFilePath.current = file?.path;
    fileSizeRef.current = file?.content?.length || 0;
  }

  // Optimized options based on performance settings and file size
  const getOptimizedOptions = useCallback(() => {
    const isLargeFile = fileSizeRef.current > 1024 * 1024; // > 1MB as large for optimization
    const isVeryLargeFile = fileSizeRef.current > 10 * 1024 * 1024; // > 10MB
    const isGenerating = isChatStreaming;

    const baseOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
      // Inline Suggest - Enable AI code completion
      inlineSuggest: {
        enabled: true,
        showToolbar: 'onHover',
        keepOnBlur: false,
      },
      // Core navigation features (v0.2.6 fixes)
      links: true,
      contextmenu: true,
      definitionLinkOpensInPeek: true,
      // Enable standard suggestions for navigation/symbols
      quickSuggestions: {
        other: !isVeryLargeFile,
        comments: false,
        strings: !isVeryLargeFile,
      },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      minimap: { enabled: showMinimap && !isVeryLargeFile && !isGenerating },
      fontSize: fontSize,
      fontFamily: fontFamily,
      lineHeight: lineHeight,
      fontLigatures: fontLigatures,
      cursorBlinking: isGenerating ? 'solid' : cursorBlinking,
      cursorSmoothCaretAnimation: isGenerating ? 'off' : cursorSmoothCaretAnimation,
      smoothScrolling: smoothScrolling,
      bracketPairColorization: { enabled: bracketPairColorization && !isLargeFile && !isGenerating },
      renderWhitespace: isGenerating ? 'none' : renderWhitespace,
      lineNumbers: showLineNumbers ? 'on' : 'off',
      tabSize: tabSize,
      wordWrap: isVeryLargeFile ? 'off' : wordWrap,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      multiCursorModifier: 'ctrlCmd',
      multiCursorPaste: 'spread',
      selectionClipboard: true,
      columnSelection: true,
      stickyScroll: { enabled: !isLargeFile && !isGenerating },
      unicodeHighlight: { nonBasicASCII: false },
      // Performance specific
      renderLineHighlight: (isLargeFile || isGenerating) ? 'none' : 'all',
      scrollbar: {
        useShadows: false,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      fixedOverflowWidgets: true,
      renderValidationDecorations: (isVeryLargeFile || isGenerating) ? 'off' : 'on',
      hideCursorInOverviewRuler: true,
      overviewRulerLanes: (isLargeFile || isGenerating) ? 0 : 2,
      glyphMargin: !isVeryLargeFile && !isGenerating,
      folding: !isVeryLargeFile && !isGenerating,
    };

    return baseOptions;
  }, [showMinimap, fontSize, fontFamily, lineHeight, fontLigatures, cursorBlinking, cursorSmoothCaretAnimation, smoothScrolling, bracketPairColorization, renderWhitespace, showLineNumbers, tabSize, wordWrap, isChatStreaming]); // Stable primitive dependencies

  // Update editor content when file changes (without remounting)
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && file) {
      const currentValue = editor.getValue();
      // Only update if content is different (avoid overwriting user edits)
      if (currentValue !== (file.content || '')) {
        editor.setValue(file.content || '');
      }
      // Ensure editor is focused when switching files to keep keyboard shortcuts active
      editor.focus();
    }
  }, [file?.id, paneId]); // 🔥 修复无限循环：移除 getEditorInstance 依赖，使用 ref 代替

  // Jump to initial line when specified (for search results, file tree clicks, etc.)
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && file && file.initialLine && file.initialLine > 0) {
      // Reveal the line in center and move cursor there
      editor.revealLineInCenter(file.initialLine);
      editor.setPosition({
        lineNumber: file.initialLine,
        column: 1
      });
      // Focus the editor
      editor.focus();
      console.log('[MonacoEditor] Jumped to line:', file.initialLine, 'for file:', file.path);
    }
  }, [file?.initialLine, file?.id, paneId]); // 🔥 修复无限循环：移除 getEditorInstance 依赖，使用 ref 代替

  // 🔥 E2E: 符号级智能补全测试需要真实的 Monaco Editor
  // 只有在没有打开文件时才显示 WelcomeScreen
  // E2E 模式检测用于跳过一些不必要的初始化，但不影响编辑器渲染
  const isE2E = import.meta.env.VITE_TEST_ENV === 'e2e';

  if (!file) {
    if (isE2E) {
      console.log('[MonacoEditor] E2E mode detected (build-time), no file open, returning WelcomeScreen');
    }
    return <WelcomeScreen />;
  }

  if (isE2E) {
    console.log('[MonacoEditor] E2E mode detected (build-time), but rendering Monaco Editor for testing');
  }

  return (
    <div className="relative h-full w-full" data-testid="monaco-editor-container">
      <Editor
        height="100%"
        path={file?.path || `untitled-${paneId}-${file?.id}`} // Guarantee uniqueness
        defaultLanguage={file?.language || 'plaintext'}
        language={file?.language || 'plaintext'}
        // Use defaultValue instead of value to avoid controlled component issues
        defaultValue={file?.content || ''}
        theme={theme}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={getOptimizedOptions()}
      />
      {/* v0.2.9: Inline Edit Widget 已移至 App.tsx 全局渲染，避免重复订阅 */}
    </div>
  );
};
