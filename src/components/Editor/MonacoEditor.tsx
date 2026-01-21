import React, { useEffect, useCallback, useRef, useState } from 'react';
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
import { setupDefinitionProvider } from './DefinitionProvider';
import { setupReferencesProvider } from './ReferencesProvider';
import { symbolIndexer } from '../../core/indexer/SymbolIndexer';
import { useTranslation } from 'react-i18next';
// v0.3.0: Code Analysis integration
import { useCodeSmellStore } from '../../stores/codeSmellStore';
import { CodeSmellDecorationProvider } from '../CodeAnalysis/CodeSmellDecorations';
import { injectCodeSmellStyles } from '../CodeAnalysis/CodeSmellDecorations';
// v0.3.0: Refactoring integration
import { useRefactoringStore } from '../../stores/refactoringStore';
import { invoke } from '@tauri-apps/api/core';
import { estimateTokens } from '../../utils/tokenCounter';
import * as monaco from 'monaco-editor';
import { debounce } from 'lodash-es';

// ============================================================================
// Windows 平台检测 - 用于性能优化
// ============================================================================
const isWindowsPlatform = typeof window !== 'undefined' &&
  (window.navigator.platform.includes('Win') || window.navigator.userAgent.includes('Windows'));

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

  // 🔥 优化：使用更具体的选择器，只订阅当前 Pane 的 fileId 和对应的文件
  const pane = useLayoutStore(
    useCallback(state => state.panes.find(p => p.id === paneId), [paneId])
  );
  const fileId = pane?.fileId;
  
  const file = useFileStore(
    useCallback(state => fileId ? state.openedFiles.find(f => f.id === fileId) : null, [fileId])
  );

  const setChatOpen = useLayoutStore(state => state.setChatOpen);
  const setActiveFileTokenCount = useEditorStore(state => state.setActiveFileTokenCount);

  const sendMessage = useChatStore(state => state.sendMessage);

  // 🔥 修复无限循环：使用 ref 存储稳定的值，避免依赖变化
  // 注意：fileRef.current 会在每次渲染时更新，这是安全的
  const fileRef = useRef<typeof file | null>(null);
  fileRef.current = file;

  // Sequence ID to prevent race conditions
  const lastRequestId = useRef(0);

  // Handles for providers to update path
  const symbolCompletionHandleRef = useRef<{ dispose: () => void; updatePath: (path: string | undefined) => void } | null>(null);
  const definitionProviderHandleRef = useRef<{ dispose: () => void; updatePath: (path: string | undefined) => void } | null>(null);
  const referencesProviderHandleRef = useRef<{ dispose: () => void; updatePath: (path: string | undefined) => void } | null>(null);

  // 🔥 修复无限循环：使用 ref 存储编辑器实例，避免依赖 getEditorInstance
  // ⚠️ 必须在所有 useEffect 之前声明所有 hooks
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // 🔥 内联补全防抖 refs - 必须在组件顶层声明
  type CompletionRequest = {
    model: monaco.editor.ITextModel;
    position: monaco.Position;
    resolve: (result: monaco.languages.InlineCompletions<monaco.languages.InlineCompletion>) => void;
  };
  const pendingCompletionRef = useRef<CompletionRequest | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔥 Token 计数和内容更新防抖常量
  const TOKEN_COUNT_DEBOUNCE_MS = isWindowsPlatform ? 1000 : 500;
  const CODE_ANALYSIS_DEBOUNCE_MS = isWindowsPlatform ? 2000 : 1000;
  const SYMBOL_INDEX_DEBOUNCE_MS = isWindowsPlatform ? 1500 : 500;
  const CONTENT_UPDATE_DEBOUNCE_MS = isWindowsPlatform ? 1000 : 300;

  // 🔥 内容更新防抖 ref - 必须在组件顶层声明
  const debouncedUpdateRef = useRef(
    debounce((id: string, value: string) => {
      useFileStore.getState().updateFileContent(id, value);
    }, CONTENT_UPDATE_DEBOUNCE_MS)
  );

  // 🔥 文件大小缓存 refs - 必须在组件顶层声明
  const fileSizeRef = useRef(0);
  const lastFilePath = useRef(file?.path);

  // 🔥 Token count ref - 必须在组件顶层声明
  const updateTokenCountRef = useRef<((text: string) => void) | null>(null);

  // 🔥 修复：当文件切换时更新提供者的当前路径
  useEffect(() => {
    const path = file?.path;
    symbolCompletionHandleRef.current?.updatePath(path);
    definitionProviderHandleRef.current?.updatePath(path);
    referencesProviderHandleRef.current?.updatePath(path);
  }, [file?.path]);

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
    }, TOKEN_COUNT_DEBOUNCE_MS),
    [setActiveFileTokenCount]
  );

  // Initial count when file changes
  // 🔥 修复无限循环：使用 ref 存储 updateTokenCount 避免依赖变化
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
    // v0.3.0: 结构化重构命令
    // ========================================================================

    // 重命名符号
    editor.addAction({
      id: 'refactor.rename',
      label: '重命名符号',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1.5,
      run: async (ed) => {
        const position = ed.getPosition();
        const model = ed.getModel();
        if (!position || !model) return;

        const wordAtPos = model.getWordAtPosition(position);
        if (!wordAtPos) return;

        const word = wordAtPos.word;
        const currentFile = fileRef.current;
        if (!currentFile?.path) return;

        // 简化版：使用 prompt 获取新名称
        // TODO: 实现内联重命名 UI
        const newName = prompt(`重命名 "${word}" 为:`, word);
        if (!newName || newName === word) return;

        const { previewRename } = useRefactoringStore.getState();
        await previewRename({
          filePath: currentFile.path,
          oldName: word,
          newName,
          kind: 'variable', // TODO: 检测实际类型
        });
      }
    });

    // 提取函数
    editor.addAction({
      id: 'refactor.extractFunction',
      label: '提取函数',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1.6,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
      run: async (ed) => {
        const selection = ed.getSelection();
        const model = ed.getModel();
        if (!selection || !model || selection.isEmpty()) return;

        const selectedText = model.getValueInRange(selection);
        if (!selectedText || selectedText.trim().length < 10) {
          // TODO: 显示提示
          return;
        }

        const currentFile = fileRef.current;
        if (!currentFile?.path) return;

        // 简化版：使用 prompt 获取函数名
        const functionName = prompt('新函数名称:', 'extractedFunction');
        if (!functionName) return;

        const { previewExtractFunction } = useRefactoringStore.getState();
        await previewExtractFunction({
          filePath: currentFile.path,
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          },
          functionName,
        });
      }
    });

    // ========================================================================
    // v0.2.9: 符号索引和补全系统
    // ========================================================================

    // 索引当前文件的符号
    const currentFile = fileRef.current;

    // 注册符号补全提供者
    const symbolCompletionHandle = setupSymbolCompletion(monaco, currentFile?.path);
    symbolCompletionHandleRef.current = symbolCompletionHandle;

    // ========================================================================
    // v0.3.0: Go to Definition 支持
    // ========================================================================

    // 注册定义提供者（支持跨文件跳转）
    const definitionProviderHandle = setupDefinitionProvider(
      monaco,
      currentFile?.path,
      // 跨文件跳转回调
      async (definition) => {
        try {
          console.log('[MonacoEditor] Cross-file definition jump:', definition);

          // 读取目标文件内容
          const { readFileContent } = await import('../../utils/fileSystem');
          const content = await readFileContent(definition.filePath);

          // 提取文件名和语言
          const fileName = definition.filePath.split('/').pop() || 'unknown';
          const language = (window as any).__detectLanguageFromPath?.(definition.filePath) ||
            monaco.languages.getEncodedLanguageId?.(definition.filePath) ||
            'plaintext';

          // 打开文件（使用 fileStore）
          const { useFileStore } = await import('../../stores/fileStore');
          const { openFile, setActiveFile } = useFileStore.getState();

          const fileId = openFile({
            id: `file-${definition.filePath}-${Date.now()}`,
            path: definition.filePath,
            name: fileName,
            content: content,
            isDirty: false,
            language: language,
            initialLine: definition.line, // 设置初始行号
          });

          // 激活文件
          setActiveFile(fileId);

          // 显示提示
          const { toast } = await import('sonner');
          toast.success(`Opened ${fileName}:${definition.line}`);
        } catch (e) {
          console.error('[MonacoEditor] Failed to open definition file:', e);
          const { toast } = await import('sonner');
          toast.error(`Failed to open definition: ${String(e)}`);
        }
      }
    );
    definitionProviderHandleRef.current = definitionProviderHandle;

    // ========================================================================
    // v0.3.0: Find References 支持
    // ========================================================================

    // 注册引用提供者（支持跨文件引用查找）
    const referencesProviderHandle = setupReferencesProvider(
      monaco,
      currentFile?.path
    );
    referencesProviderHandleRef.current = referencesProviderHandle;

    // ========================================================================

    // ========================================================================
    // 🔥 性能优化：带防抖的内联补全提供者
    // Windows 平台下 CPU 飙升问题修复
    // ========================================================================

    // 实际执行补全的函数
    const executeCompletion = async (model: monaco.editor.ITextModel, position: monaco.Position) => {
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

      // 🔥 Windows 平台优化：禁用本地模型（避免 CPU 飙升）
      const shouldUseLocal = useLocalModelForCompletion && !isWindowsPlatform;

      // Try local model first if enabled
      if (shouldUseLocal) {
        try {
          console.log('[Completion] Trying local model (FIM)...');
          const localResult = await invoke<string>('local_model_fim', {
            prefix: textBefore,
            suffix: textAfter,
            maxTokens: 128,
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
    };

    // 🔥 防抖延迟：Windows 平台使用更长的延迟
    const COMPLETION_DEBOUNCE_MS = isWindowsPlatform ? 500 : 300;

    // 注册带防抖的内联补全提供者
    const completionProvider = monaco.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model, position, context, token) => {
        // 取消之前的请求
        if (completionTimerRef.current) {
          clearTimeout(completionTimerRef.current);
        }

        // 返回一个 Promise，在防抖延迟后执行
        return new Promise((resolve) => {
          // 保存当前请求
          pendingCompletionRef.current = { model, position, resolve };

          // 设置防抖延迟
          completionTimerRef.current = setTimeout(async () => {
            // 检查是否有待处理的请求
            const request = pendingCompletionRef.current;
            if (!request) {
              resolve({ items: [] });
              return;
            }

            // 执行补全
            const result = await executeCompletion(request.model, request.position);
            request.resolve(result);
            pendingCompletionRef.current = null;
          }, COMPLETION_DEBOUNCE_MS);
        });
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
        // 取消待处理的请求
        if (completionTimerRef.current) {
          clearTimeout(completionTimerRef.current);
        }
        pendingCompletionRef.current = null;
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
      // 取消待处理的补全请求
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }
      pendingCompletionRef.current = null;
      completionProvider.dispose();
      symbolCompletionHandleRef.current?.dispose();
      definitionProviderHandleRef.current?.dispose();
      referencesProviderHandleRef.current?.dispose();
    };
  }, [paneId, setEditorInstance, setChatOpen, sendMessage, showInlineEdit, t]); // 🔥 修复无限循环：移除 file?.path, file?.content, file?.language 依赖（使用 fileRef.current 代替）

  // 清理防抖函数（组件卸载时）
  useEffect(() => {
    return () => {
      debouncedUpdateRef.current.cancel();
    };
  }, []);

  const handleChange = (value: string | undefined) => {
    if (fileId && value !== undefined) {
      // 1. 立即标记为 dirty，保证 UI 响应（如 Tab 上的小圆点）
      // 从 store 获取最新状态，避免使用闭包中的旧值
      const currentFile = useFileStore.getState().openedFiles.find(f => f.id === fileId);
      if (currentFile && !currentFile.isDirty) {
        useFileStore.getState().setFileDirty(fileId, true);
      }

      // 2. 防抖更新完整内容，避免全应用重渲染
      debouncedUpdateRef.current(fileId, value);

      // Token 计数已有自己的防抖逻辑
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
      // 🔥 v0.2.9: 多行编辑需要按住 Win/Cmd 键，避免左键误触
      multiCursorModifier: 'ctrlCmd',
      multiCursorPaste: 'spread',
      selectionClipboard: true,
      // 🔥 禁用列选择，避免意外触发多光标
      columnSelection: false,
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

  // v0.3.0: 代码异味自动分析
  const analyzeFile = useCodeSmellStore(state => state.analyzeFile);
  const autoAnalyze = useCodeSmellStore(state => state.autoAnalyze);

  // 注入代码异味装饰器样式
  useEffect(() => {
    injectCodeSmellStyles();
  }, []);

  // 当文件内容变化时触发分析（防抖）
  useEffect(() => {
    if (!file?.path || !file?.content || !autoAnalyze) return;

    const timer = setTimeout(async () => {
      try {
        await analyzeFile(file.path, file.content, file.language || 'plaintext');
        console.log('[MonacoEditor] Code analysis completed for:', file.path);
      } catch (error) {
        console.error('[MonacoEditor] Code analysis failed:', error);
      }
    }, CODE_ANALYSIS_DEBOUNCE_MS); // 🔥 Windows 平台使用更长延迟

    return () => clearTimeout(timer);
  }, [file?.id, file?.content, file?.language, analyzeFile, autoAnalyze]);

  // 当文件内容或路径变化时触发符号索引（防抖）
  useEffect(() => {
    if (!file?.path || !file?.content) return;

    const timer = setTimeout(async () => {
      try {
        await symbolIndexer.indexFile(file.path, file.content);
        console.log('[MonacoEditor] Symbol indexing completed for:', file.path);
      } catch (error) {
        console.error('[MonacoEditor] Symbol indexing failed:', error);
      }
    }, SYMBOL_INDEX_DEBOUNCE_MS); // 🔥 Windows 平台使用更长延迟

    return () => clearTimeout(timer);
  }, [file?.id, file?.content, file?.path]);

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
      {/* v0.3.0: Code Smell Decoration Provider */}
      <CodeSmellDecorationProvider />
    </div>
  );
};
