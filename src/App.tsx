import React, { useEffect } from 'react';
import { Titlebar } from './components/Layout/Titlebar';
import { Sidebar } from './components/Layout/Sidebar';
import { Statusbar } from './components/Layout/Statusbar';
import { MonacoEditor } from './components/Editor/MonacoEditor';
import { TabBar } from './components/Editor/TabBar';
import { useFileStore } from './stores/fileStore';
import { useEditorStore } from './stores/editorStore';
import { writeFileContent } from './utils/fileSystem';

function App() {
  const { activeFileId, openedFiles, setFileDirty } = useFileStore();
  const { editorInstance } = useEditorStore();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const activeFile = openedFiles.find(f => f.id === activeFileId);
        if (activeFile) {
          try {
            await writeFileContent(activeFile.path, activeFile.content);
            setFileDirty(activeFile.id, false);
            console.log('File saved:', activeFile.path);
          } catch (error) {
            console.error('Failed to save file:', error);
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (editorInstance) {
          editorInstance.getAction('actions.find')?.run();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFileId, openedFiles, setFileDirty, editorInstance]);

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden">
      <Titlebar />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
          <TabBar />
          <div className="flex-1 relative">
            <MonacoEditor />
          </div>
        </div>
      </div>
      
      <Statusbar />
    </div>
  );
}

export default App;