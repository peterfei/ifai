import React, { useEffect, useCallback, useRef } from 'react';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/useChatStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { InlineEditWidget } from './InlineEditWidget';
import { WelcomeScreen } from './WelcomeScreen';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import * as monaco from 'monaco-editor';

// Configure monaco-editor to use local files instead of CDN to avoid 404 errors
loader.config({ monaco });

interface MonacoEditorProps {
  paneId: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({ paneId }) => {
  const { t } = useTranslation();
  const setEditorInstance = useEditorStore(state => state.setEditorInstance);
  const getEditorInstance = useEditorStore(state => state.getEditorInstance);
  const setInlineEdit = useEditorStore(state => state.setInlineEdit);
  
  const openedFiles = useFileStore(state => state.openedFiles);
  const panes = useLayoutStore(state => state.panes);
  const setChatOpen = useLayoutStore(state => state.setChatOpen);
  
  const sendMessage = useChatStore(state => state.sendMessage);

  // 获取与此pane关联的文件
  const pane = panes.find(p => p.id === paneId);
  const fileId = pane?.fileId;
  const file = fileId ? openedFiles.find(f => f.id === fileId) : null;

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    // 存储编辑器实例
    setEditorInstance(paneId, editor);

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
          const prompt = `Explain the following code:\n\n\`\`\`${file?.language || ''}\n${text}\n\`\`\``;
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
          const prompt = `Refactor the following code to be more efficient and readable:\n\n\`\`\`${file?.language || ''}\n${text}\n\`\`\``;
          const { currentProviderId, currentModel } = useSettingsStore.getState();
          await sendMessage(prompt, currentProviderId, currentModel);
        }
      }
    });

    // Register Inline Completion Provider
    const completionProvider = monaco.languages.registerInlineCompletionsProvider({ pattern: '**' }, {
      provideInlineCompletions: async (model, position, context, token) => {
        const { providers, currentProviderId, enableAutocomplete } = useSettingsStore.getState();
        if (!enableAutocomplete) return { items: [] };

        const currentProvider = providers.find(p => p.id === currentProviderId);
        if (!currentProvider || !currentProvider.apiKey || !currentProvider.enabled) return { items: [] };

        // Convert to backend format
        const backendProviderConfig = {
          provider: currentProvider.protocol,
          api_key: currentProvider.apiKey,
          base_url: currentProvider.baseUrl,
          models: currentProvider.models,
        };

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

        try {
          const messages = [{ role: 'user', content: prompt }];
          const result = await invoke<string>('ai_completion', {
            providerConfig: backendProviderConfig,
            messages
          });

          if (!result) return { items: [] };

          // Clean up result (remove markdown blocks if any)
          let cleanText = result.replace(/^```\w*\n/, '').replace(/\n```$/, '');

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
          console.error("Completion failed", e);
          return { items: [] };
        }
      },
      freeInlineCompletions(completions) {}
    });

    // Add Inline Edit Command (Cmd+K)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      const position = editor.getPosition();
      const selection = editor.getSelection();
      if (position && selection && !selection.isEmpty()) {
        setInlineEdit({
          isVisible: true,
          position: { lineNumber: position.lineNumber, column: position.column },
          selection: selection
        });
      }
    });

    // Cleanup on unmount
    return () => {
      completionProvider.dispose();
    };
  }, [paneId, file?.language, setEditorInstance, setChatOpen, sendMessage, setInlineEdit, t]);

  const handleChange = (value: string | undefined) => {
    if (fileId && value !== undefined) {
      useFileStore.getState().updateFileContent(fileId, value);
    }
  };

  const theme = useEditorStore(state => state.theme);
  const settings = useSettingsStore(); // Settings are stable enough, but could also be selected
  const isChatStreaming = useChatStore(state => state.isLoading);

  // Optimized options based on performance settings and file size
  const getOptimizedOptions = useCallback(() => {
    const isLargeFile = (file?.content?.length || 0) > 1024 * 1024; // > 1MB as large for optimization
    const isVeryLargeFile = (file?.content?.length || 0) > 10 * 1024 * 1024; // > 10MB
    
    // During chat streaming, we can temporarily disable expensive features to keep the UI responsive
    const isGenerating = isChatStreaming;

    const baseOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
      minimap: { enabled: settings.showMinimap && !isVeryLargeFile && !isGenerating },
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: settings.lineHeight,
      fontLigatures: settings.fontLigatures,
      cursorBlinking: isGenerating ? 'solid' : settings.cursorBlinking,
      cursorSmoothCaretAnimation: isGenerating ? 'off' : settings.cursorSmoothCaretAnimation,
      smoothScrolling: settings.smoothScrolling,
      bracketPairColorization: { enabled: settings.bracketPairColorization && !isLargeFile && !isGenerating },
      renderWhitespace: isGenerating ? 'none' : settings.renderWhitespace,
      lineNumbers: settings.showLineNumbers ? 'on' : 'off',
      tabSize: settings.tabSize,
      wordWrap: isVeryLargeFile ? 'off' : settings.wordWrap,
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
  }, [settings, file?.content?.length, isChatStreaming]);

  // Force update editor content when file changes (fix for tab switching issue)
  useEffect(() => {
    const editor = getEditorInstance(paneId);
    if (editor && file) {
        const currentContent = editor.getValue();
        if (currentContent !== file.content) {
            // Use executeEdits to preserve undo stack if needed, or setValue for full replacement
            // For tab switching, setValue is safer to ensure exact state match
            editor.setValue(file.content || '');
        }
    }
  }, [file?.id, file?.content, paneId, getEditorInstance]);

  if (!file) {
    return <WelcomeScreen />;
  }

  return (
    <div className="relative h-full w-full">
      <Editor
        height="100%"
        path={file?.path || `untitled-${paneId}`} // Unique key for model caching
        defaultLanguage={file?.language || 'plaintext'}
        language={file?.language || 'plaintext'}
        value={file?.content || ''}
        theme={theme}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={getOptimizedOptions()}
      />
      <InlineEditWidget />
    </div>
  );
};
