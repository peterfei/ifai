import React, { useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useFileStore } from '../../stores/fileStore';

export const MonacoEditor = () => {
  const { setEditorInstance, theme } = useEditorStore();
  const { activeFileId, openedFiles, updateFileContent } = useFileStore();

  const activeFile = openedFiles.find(f => f.id === activeFileId);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setEditorInstance(editor);
  };

  const handleChange = (value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      updateFileContent(activeFileId, value);
    }
  };

  if (!activeFile) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-[#1e1e1e]">
        <div className="text-center">
          <p className="mb-2">No file is open</p>
          <p className="text-xs">Use Cmd+O to open a file</p>
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
