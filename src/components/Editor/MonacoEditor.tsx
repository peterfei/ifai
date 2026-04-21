import React, { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { Skeleton } from '../UI/Skeleton';
import { AgentDecorationProvider } from './AgentDecorationProvider';
import { InlineDiffZone } from './InlineDiffZone';
import { InlineAIWidget } from '../InlineEdit/InlineAIWidget';
import { openFileFromPath } from '../../utils/fileActions';
import '../../styles/monaco-decorations.css';
import { toast } from 'sonner';
import { PivoStage } from '../../stores/types';
import { getCurrentWindow } from '@tauri-apps/api/window';

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

  // 🧪 [DEVELOPER PREVIEW] Debug States
  const [debugWidgetVisible, setDebugWidgetVisible] = useState(false);
  const [debugStage, setDebugStage] = useState<PivoStage>('idle');
  const [debugTasks, setDebugTasks] = useState<any[]>([]);

  // v0.2.9: Inline Edit Store
  // 🔥 FIX: 使用 selector 避免订阅整个 store，防止无限循环
  const isInlineEditVisible = useInlineEditStore(state => state.isInlineEditVisible);
  const showInlineEdit = useInlineEditStore(state => state.showInlineEdit);
  const hideInlineEdit = useInlineEditStore(state => state.hideInlineEdit);
  const submitInstruction = useInlineEditStore(state => state.submitInstruction);
  const rejectDiff = useInlineEditStore(state => state.rejectDiff);
  const pivoStage = useInlineEditStore(state => state.pivoStage);
  const pivoTasks = useInlineEditStore(state => state.pivoTasks);
  const modifiedFiles = useInlineEditStore(state => state.modifiedFiles);
  const modifiedCode = useInlineEditStore(state => state.modifiedCode);
  const originalCode = useInlineEditStore(state => state.originalCode);

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

  // 🔥 FIX: 安全的 null 检查，防止 chatStore 未初始化时出错
  // 🔥 FIX 2: 先获取整个 store，再解构，避免选择器中的 null 问题
  const chatStoreState = useChatStore();
  const sendMessage = chatStoreState?.sendMessage ?? (() => Promise.resolve());

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
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const decorationProviderRef = useRef<AgentDecorationProvider | null>(null);
  const diffZoneRef = useRef<InlineDiffZone | null>(null);
  const contentWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const layoutTimeoutsRef = useRef<number[]>([]);

  // 组件卸载时的资源释放逻辑
  useEffect(() => {
    return () => {
      layoutTimeoutsRef.current.forEach(window.clearTimeout);
      layoutTimeoutsRef.current = [];
      const editor = editorRef.current;
      if (editor) {
        if (contentWidgetRef.current) {
          try { editor.removeContentWidget(contentWidgetRef.current); } catch (e) {}
        }
        decorationProviderRef.current?.clearAll();
        diffZoneRef.current?.hide();
      }
      contentWidgetRef.current = null;
      decorationProviderRef.current = null;
      diffZoneRef.current = null;
    };
  }, []);

  const scheduleEditorLayout = useCallback(() => {
    const relayout = () => {
      const editor = editorRef.current;
      const container = editorContainerRef.current;
      if (!editor || !container) {
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }

      monaco.editor.remeasureFonts();
      editor.layout({ width, height });
      editor.render(true);
      if (contentWidgetRef.current) {
        editor.layoutContentWidget(contentWidgetRef.current);
      }
    };

    layoutTimeoutsRef.current.forEach(window.clearTimeout);
    layoutTimeoutsRef.current = [];

    window.requestAnimationFrame(relayout);
    layoutTimeoutsRef.current.push(window.setTimeout(relayout, 80));
    layoutTimeoutsRef.current.push(window.setTimeout(relayout, 220));
  }, []);

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
    decorationProviderRef.current = new AgentDecorationProvider(editor);
    diffZoneRef.current = new InlineDiffZone(editor);

    // 🔥 v0.3.7: 注册内容小部件，使 Inline AI 面板随光标浮动
    const contentWidget: monaco.editor.IContentWidget = {
      getId: () => 'inline.ai.assistant.v2', // 使用新 ID 避免缓存冲突
      getDomNode: () => {
        // 🔥 修复 E2E 渲染竞态：优先获取 App.tsx 预置的全局 Portal 容器
        let node = document.getElementById('monaco-inline-ai-portal');
        if (!node) {
          // 容错：如果 App.tsx 还没渲染出此 ID，临时创建一个
          node = document.createElement('div');
          node.id = 'monaco-inline-ai-portal';
        }
        return node;
      },
      getPosition: () => {
        const state = useInlineEditStore.getState();
        if (!state.isInlineEditVisible && !(window as any).__DEBUG_AGENT_ACTIVE) {
          return null;
        }
        return {
          position: editor.getPosition(),
          preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
        };
      }
    };
    editor.addContentWidget(contentWidget);
    contentWidgetRef.current = contentWidget;
    
    // 监听光标移动，自动更新小部件位置
    editor.onDidChangeCursorPosition(() => {
      editor.layoutContentWidget(contentWidget);
    });

    // 🔥 [DEVELOPER PREVIEW] 调试入口：模拟 Agent 2.0 任务流
    (window as any).__DEBUG_AGENT_2 = (lineNumber: number) => {
      if (!decorationProviderRef.current) return;
      
      const updateFocus = (line: number) => {
        decorationProviderRef.current?.clearAll();
        decorationProviderRef.current?.updateActiveFocus(line);
      };
      
      setDebugWidgetVisible(true);
      setDebugStage('plan');
      updateFocus(lineNumber);
      
      setDebugTasks([
        { id: '1', description: 'Analyzing code structure...', status: 'running', stage: 'plan' }
      ]);

      // 模拟渐进式任务生长
      setTimeout(() => {
        setDebugStage('implement');
        updateFocus(lineNumber + 1);
        setDebugTasks(prev => [
          { ...prev[0], status: 'success' },
          { id: '2', description: 'Implementing optimized logic', status: 'running', stage: 'implement' }
        ]);
      }, 2000);

      setTimeout(() => {
        setDebugStage('verify');
        updateFocus(lineNumber + 2);
        setDebugTasks(prev => [
          prev[0],
          { ...prev[1], status: 'success' },
          { id: '3', description: 'Running unit tests', status: 'running', stage: 'verify' }
        ]);
      }, 4500);

      setTimeout(() => {
        setDebugStage('idle');
        setDebugTasks(prev => [
          prev[0],
          prev[1],
          { ...prev[2], status: 'success' }
        ]);
        toast.success('Agent 2.0 演示任务圆满完成！');
      }, 7000);
    };

    // 🔥 v0.2.9: 设置全局编辑器实例（用于 Cmd+K 等功能）
    (window as any).__activeEditor = editor;

    // 🔥 v0.3.7: 注册 Cmd+K / Ctrl+K Inline AI 快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      console.log('[MonacoEditor] Cmd+K command triggered!');
      const position = editor.getPosition();
      const selection = editor.getSelection();
      const selectedText = selection ? editor.getModel()?.getValueInRange(selection) : '';
      
      if (position) {
        console.log('[MonacoEditor] Calling showInlineEdit with:', { selectedText, position });
        showInlineEdit(selectedText || '', {
          lineNumber: position.lineNumber,
          column: position.column
        });
      }
    });

    // 同时保留 Action 供右键菜单使用
    editor.addAction({
      id: 'inline-ai-prompt',
      label: 'Inline AI Assistant',
      contextMenuGroupId: 'modification',
      run: () => editor.trigger('keyboard', 'inline-ai-prompt', {})
    });

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

          const fileName = definition.filePath.split('/').pop() || 'unknown';
          const opened = await openFileFromPath(definition.filePath, {
            initialLine: definition.line,
          });

          if (opened) {
            toast.success(`Opened ${fileName}:${definition.line}`);
          }
        } catch (e) {
          console.error('[MonacoEditor] Failed to open definition file:', e);
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
      // @ts-ignore
      freeInlineCompletions: (completions) => {
        // Called when completions are no longer needed
        // Can be used for cleanup
      },
      // Additional method for Monaco's internal disposal
      // @ts-ignore
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

  const theme = useSettingsStore(state => state.theme);
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
  // 🔥 FIX: 安全的 null 检查，防止 chatStore 未初始化时出错
  const isChatStreaming = useChatStore(state => state?.isLoading ?? false);

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
    if (editor) {
        // 🔥 为 E2E 始终保持最新的编辑器实例指向
        (window as any).__activeEditor = editor;

        if (file) {
            const currentValue = editor.getValue();
            const targetValue = file.content || '';

            // 🏆 PIVO 3.0: 极致物理同步 (排除用户活跃输入干扰)
            if (currentValue !== targetValue) {
                const noFocus = !editor.hasTextFocus();
                const isNotDirty = !file.isDirty;

                // 🔥 物理加固：如果不是 dirty，说明是外部同步（如 Agent 写入），强制刷新
                if (noFocus || isNotDirty) {
                    console.log('[MonacoEditor] 🔄 Mandatory Physical Sync:', { file: file.path });
                    editor.setValue(targetValue);
                }
            }
        }
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

  // 🔥 v0.3.7: 监听面板可见性，通知 Monaco 更新布局
  useEffect(() => {
    if (editorRef.current && contentWidgetRef.current) {
      editorRef.current.layoutContentWidget(contentWidgetRef.current);
    }
  }, [isInlineEditVisible]);

  useEffect(() => {
    const container = editorContainerRef.current;
    const handleWindowResize = () => {
      scheduleEditorLayout();
    };

    const resizeObserver = container
      ? new ResizeObserver(() => {
          scheduleEditorLayout();
        })
      : null;

    if (container && resizeObserver) {
      resizeObserver.observe(container);
    }

    let unlistenResize: (() => void) | undefined;
    void getCurrentWindow().onResized(() => {
      scheduleEditorLayout();
    }).then((cleanup) => {
      unlistenResize = cleanup;
    }).catch((error) => {
      console.warn('[MonacoEditor] Failed to subscribe window resize:', error);
    });

    window.addEventListener('resize', handleWindowResize);
    scheduleEditorLayout();

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver?.disconnect();
      unlistenResize?.();
      layoutTimeoutsRef.current.forEach(window.clearTimeout);
      layoutTimeoutsRef.current = [];
    };
  }, [scheduleEditorLayout]);

  useEffect(() => {
    scheduleEditorLayout();
  }, [scheduleEditorLayout, paneId, file?.id, theme]);

  // 🔥 v0.3.7: 监听修改代码的变化，自动展开内联 Diff 区域
  useEffect(() => {
    // 🚀 阶段+内容双驱动：进入实施阶段或已有内容时，立即展开
    const isImplementing = pivoStage === 'implement' || pivoStage === 'optimize';
    
    if (isInlineEditVisible && (isImplementing || modifiedCode) && editorRef.current) {
      if (!diffZoneRef.current) {
        diffZoneRef.current = new InlineDiffZone(editorRef.current);
      }
      
      const position = editorRef.current.getPosition();
      const model = editorRef.current.getModel();

      if (position && model) {
        // 🏆 PIVO 3.0: 物理智能几何适配逻辑
        const codeLines = modifiedCode ? modifiedCode.split('\n').length : 0;

        // 检测是否是"全量替换"模式 (包含关键声明且行数多)
        const isFullFile = (modifiedCode?.includes('package ') || modifiedCode?.includes('import ')) && codeLines > 30;

        // 计算物理高度：
        // 全量替换：占据约 50% 的编辑器视口
        // 局部建议：动态增长，最大 35 行
        let lineCount = 0;
        if (isFullFile) {
            lineCount = 25; // 提升至 25 行，为底部 Padding 留出物理空间
        } else {
            lineCount = Math.min(Math.max(codeLines + 6, 10), 35); // 增加缓冲区
        }

        const displayContent = modifiedCode || '✨ AI 正在构思并生成代码...';

        // 如果是全量替换且行数极多，锚定在第一行展示，防止在文件末尾重叠
        const targetLine = isFullFile ? 0 : position.lineNumber;

        diffZoneRef.current.show(targetLine, lineCount, displayContent);
      }
    } else {
      diffZoneRef.current?.hide();
    }
  }, [isInlineEditVisible, pivoStage, modifiedCode]);

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

  // 🔥 工业级加载反馈：当文件已选中但内容尚未加载完成时，展示骨架屏
  if (!file.content && !file.isDirty) {
    return (
      <div className="theme-panel flex flex-col h-full p-6 space-y-4" data-testid="editor-skeleton">
        <Skeleton className="h-6 w-1/3" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="pt-4 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={editorContainerRef}
      className="theme-panel flex-1 flex flex-col h-full w-full relative overflow-hidden"
      data-testid="monaco-editor-container"
    >
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
        loading={<div />}
      />

      {/* 🧪 Agent 2.0 Inline Assistant Portal */}
      {(isInlineEditVisible || debugWidgetVisible) && document.getElementById('monaco-inline-ai-portal') && createPortal(
        <div className="pointer-events-auto">
          <InlineAIWidget 
            stage={isInlineEditVisible ? pivoStage : debugStage} 
            isLoading={isInlineEditVisible ? pivoStage !== 'idle' : debugStage !== 'idle'}
            tasks={isInlineEditVisible ? pivoTasks : debugTasks}
            modifiedFiles={isInlineEditVisible ? modifiedFiles : []}
            selectedText={isInlineEditVisible ? useInlineEditStore.getState().selectedText : ''}
            currentFilePath={isInlineEditVisible ? useInlineEditStore.getState().currentFilePath : ''}
            onClose={() => {
              if (isInlineEditVisible) rejectDiff();
              setDebugWidgetVisible(false);
              decorationProviderRef.current?.clearAll();
            }}
            onSubmit={(v) => {
              if (isInlineEditVisible) {
                if (v === '__ACCEPT_ALL__') {
                  // 🔥 执行物理代码替换
                  const editor = editorRef.current;
                  if (editor && modifiedCode) {
                    const selection = editor.getSelection();
                    const range = selection || editor.getModel()?.getFullModelRange();
                    if (range) {
                      editor.executeEdits('inline-ai', [{
                        range: range,
                        text: modifiedCode,
                        forceMoveMarkers: true
                      }]);
                      toast.success('代码修改已应用');
                    }
                  }
                  hideInlineEdit();
                  decorationProviderRef.current?.clearAll();
                } else {
                  submitInstruction(v);
                }
              } else {
                toast.success('Submitted (Debug): ' + v);
              }
            }}
          />
        </div>,
        document.getElementById('monaco-inline-ai-portal')!
      )}

      {/* v0.2.9: Inline Edit Widget 已移至 App.tsx 全局渲染，避免重复订阅 */}
      {/* v0.3.0: Code Smell Decoration Provider */}
      <CodeSmellDecorationProvider />
    </div>
  );
};
