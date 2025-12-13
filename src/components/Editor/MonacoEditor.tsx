import React, { useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileStore } from '../../stores/fileStore';
import { useChatStore } from '../../stores/useChatStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { FilePlus, FolderOpen, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory, readFileContent } from '../../utils/fileSystem';

export const MonacoEditor = () => {
  const { setEditorInstance, theme } = useEditorStore();
  const { activeFileId, openedFiles, updateFileContent, openFile, setFileTree } = useFileStore();
  const { sendMessage } = useChatStore();
  const { setChatOpen, toggleChat } = useLayoutStore();

  const activeFile = openedFiles.find(f => f.id === activeFileId);

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
      const selected = await window.__TAURI_INTERNALS__.plugins.dialog.open({
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

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setEditorInstance(editor);

    // Add "Explain Code" Action
    editor.addAction({
        id: 'explain-code',
        label: 'AI: Explain Code',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: async (ed) => {
            const selection = ed.getSelection();
            const text = selection ? ed.getModel()?.getValueInRange(selection) : '';
            if (text && text.trim().length > 0) {
                setChatOpen(true);
                const prompt = `Explain the following code:\n\n\`\`\`${activeFile?.language || ''}\n${text}\n\`\`\``;
                await sendMessage(prompt);
            }
        }
    });

    // Add "Refactor Code" Action
    editor.addAction({
        id: 'refactor-code',
        label: 'AI: Refactor Code',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.6,
        run: async (ed) => {
            const selection = ed.getSelection();
            const text = selection ? ed.getModel()?.getValueInRange(selection) : '';
            if (text && text.trim().length > 0) {
                setChatOpen(true);
                const prompt = `Refactor the following code to be more efficient and readable:\n\n\`\`\`${activeFile?.language || ''}\n${text}\n\`\`\``;
                await sendMessage(prompt);
            }
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

        <div className="mt-12 text-xs text-gray-600">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <span>Show All Commands</span> <span>Cmd+Shift+P</span>
            <span>Go to File</span> <span>Cmd+P</span>
            <span>Find in Files</span> <span>Cmd+Shift+F</span>
            <span>Toggle AI Chat</span> <span>Cmd+L</span>
          </div>
        </div>
      </div>
    );
  }

  return (
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
      }}
    />
  );
};
