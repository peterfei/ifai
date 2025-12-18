import React, { useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/useChatStore';

import { useLayoutStore } from '../../stores/layoutStore';
import { useSettingsStore } from '../../stores/settingsStore'; // Import settings store
import { FilePlus, FolderOpen, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory, readFileContent } from '../../utils/fileSystem';
import { open } from '@tauri-apps/plugin-dialog';
import { InlineEditWidget } from './InlineEditWidget';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
// import { useLsp } from '../../hooks/useLsp';

export const MonacoEditor = () => {
  const { t } = useTranslation();
  // Initialize LSP for TypeScript (requires 'npm i -g typescript-language-server typescript')
  // useLsp('typescript', 'typescript-language-server', ['--stdio']);
  
  const { editorInstance, setEditorInstance, theme, setInlineEdit } = useEditorStore();
  const { activeFileId, openedFiles, updateFileContent, openFile, setFileTree, reloadFileContent } = useFileStore();
  const { sendMessage } = useChatStore();
  const { setChatOpen, toggleChat } = useLayoutStore();

  const activeFile = openedFiles.find(f => f.id === activeFileId);

  // Auto-reload content if empty (due to persistence not saving content)
  useEffect(() => {
    if (activeFile && activeFile.path && !activeFile.content && !activeFile.isDirty) {
        reloadFileContent(activeFile.id);
    }
  }, [activeFile?.id, activeFile?.path, activeFile?.content, activeFile?.isDirty, reloadFileContent]);

  const handleNewFile = () => {
    openFile({
      id: uuidv4(),
      name: 'Untitled',
      path: '',
      content: '',
      isDirty: true,
      language: 'plaintext',
    });
  };

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        const content = await readFileContent(selected);
        openFile({
          id: uuidv4(),
          path: selected,
          name: selected.split('/').pop() || 'Untitled',
          content: content,
          isDirty: false,
          language: 'plaintext', // Simplification
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenFolder = async () => {
    const tree = await openDirectory();
    if (tree) setFileTree(tree);
  };

  useEffect(() => {
    if (activeFile?.initialLine && editorInstance) {
      editorInstance.revealLineInCenter(activeFile.initialLine);
      editorInstance.setPosition({ lineNumber: activeFile.initialLine, column: 1 });
      editorInstance.focus();
    }
  }, [activeFile?.id, activeFile?.initialLine, editorInstance]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setEditorInstance(editor);
    if (activeFile?.initialLine) {
        editor.revealLineInCenter(activeFile.initialLine);
        editor.setPosition({ lineNumber: activeFile.initialLine, column: 1 });
    }

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
                const prompt = `Explain the following code:\n\n\`\`\`${activeFile?.language || ''}\n${text}\n\`\`\``;
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
                const prompt = `Refactor the following code to be more efficient and readable:\n\n\`\`\`${activeFile?.language || ''}\n${text}\n\`\`\``;
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

            // Debounce or context check? Monaco handles debounce somewhat, 
            // but we might want to ensure we don't spam.
            // For now, let's trust Monaco's trigger logic or user manual trigger.
            // Actually, inline completion triggers automatically.
            
            // Get Context
            const textBefore = model.getValueInRange({
                startLineNumber: Math.max(1, position.lineNumber - 50),
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            });
            
            const textAfter = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 20),
                endColumn: 1
            });

            const prompt = `You are a code completion engine. Output only the code to complete the cursor location. Do not output markdown.
Context:
${textBefore}[CURSOR]${textAfter}
`;

            try {
                // We use a shorter timeout for completions to avoid hanging UI
                // But invoke is async.
                const messages = [{ role: 'user', content: prompt }];
                const result = await invoke<string>('ai_completion', { 
                    providerConfig: currentProvider, 
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

    // Cleanup provider on unmount
    // monaco.languages.register... returns a disposable.
    // However, saving it to ref for cleanup is tricky in functional component without ref.
    // Let's attach it to editor instance or just ignore for now (React strict mode might register twice).
    // Better: use a ref to store disposable.
    
    // ... inside handleEditorDidMount
    // Store disposable somewhere?
    
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
  };

  const handleChange = (value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      updateFileContent(activeFileId, value);
    }
  };

  if (!activeFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-[#1e1e1e] select-none">
        <div className="mb-8 text-2xl font-light text-gray-300">IfAI Editor</div>
        
        <div className="flex flex-col space-y-2 w-64">
          <button onClick={handleNewFile} className="flex items-center text-left text-sm hover:text-blue-400 group">
            <FilePlus size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
            New File
          </button>
          <button onClick={handleOpenFile} className="flex items-center text-left text-sm hover:text-blue-400 group">
            <FolderOpen size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
            Open File...
          </button>
          <button onClick={handleOpenFolder} className="flex items-center text-left text-sm hover:text-blue-400 group">
            <FolderOpen size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
            Open Folder...
          </button>
          <button onClick={toggleChat} className="flex items-center text-left text-sm hover:text-blue-400 group">
            <MessageSquare size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
            Toggle AI Chat
          </button>
        </div>

        <div className="mt-8 text-xs text-gray-600">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 max-w-md">
            <span>{t('editor.shortcuts.showCommands')}</span> <span>Cmd+Shift+P</span>
            <span>{t('editor.shortcuts.goToFile')}</span> <span>Cmd+P</span>
            <span>{t('editor.shortcuts.findInFiles')}</span> <span>Cmd+Shift+F</span>
            <span>{t('editor.shortcuts.toggleChat')}</span> <span>Cmd+L</span>
            <span>{t('editor.shortcuts.inlineEdit')}</span> <span>Cmd+K</span>
          </div>
        </div>
        <div className="mt-4 text-xs text-gray-600 border-t border-gray-700 pt-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 max-w-md">
            <span>{t('editor.shortcuts.addCursorAbove')}</span> <span>Cmd+Alt+↑</span>
            <span>{t('editor.shortcuts.addCursorBelow')}</span> <span>Cmd+Alt+↓</span>
            <span>{t('editor.shortcuts.addCursorToNextFindMatch')}</span> <span>Cmd+D</span>
            <span>{t('editor.shortcuts.selectAllOccurrences')}</span> <span>Cmd+Shift+L</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-full w-full">
      <Editor
        height="100%"
        path={activeFile.path} // Unique key for model caching
        defaultLanguage={activeFile.language || 'plaintext'}
        language={activeFile.language}
        value={activeFile.content}
        theme={theme}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          multiCursorModifier: 'ctrlCmd',
          multiCursorPaste: 'spread',
          selectionClipboard: true,
          columnSelection: true,
        }}
      />
      <InlineEditWidget />
    </div>
  );
};
