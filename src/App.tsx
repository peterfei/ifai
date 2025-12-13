import React, { useEffect } from 'react';
import { Titlebar } from './components/Layout/Titlebar';
import { Sidebar } from './components/Layout/Sidebar';
import { Statusbar } from './components/Layout/Statusbar';
import { MonacoEditor } from './components/Editor/MonacoEditor';
import { TabBar } from './components/Editor/TabBar';
import { AIChat } from './components/AIChat/AIChat';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { useFileStore } from './stores/fileStore';
import { useEditorStore } from './stores/editorStore';
import { useLayoutStore } from './stores/layoutStore';
import { writeFileContent, readFileContent } from './utils/fileSystem';
import { Toaster, toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const { activeFileId, openedFiles, setFileDirty, openFile } = useFileStore();
  const { editorInstance } = useEditorStore();
  const { isChatOpen, toggleChat, toggleCommandPalette, setCommandPaletteOpen, isTerminalOpen, toggleTerminal } = useLayoutStore();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const activeFile = openedFiles.find(f => f.id === activeFileId);
        if (activeFile) {
          try {
            await writeFileContent(activeFile.path, activeFile.content);
            setFileDirty(activeFile.id, false);
            toast.success('File saved');
          } catch (error) {
            console.error('Failed to save file:', error);
            toast.error('Failed to save file');
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (editorInstance) {
          editorInstance.getAction('actions.find')?.run();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        toggleChat();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'p') { // Cmd+P for Command Palette
        e.preventDefault();
        toggleCommandPalette();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'j') { // Cmd+J for Terminal
        e.preventDefault();
        toggleTerminal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFileId, openedFiles, setFileDirty, editorInstance, toggleChat, toggleCommandPalette, toggleTerminal]);

  const handleSelectFileFromPalette = async (path: string) => {
    try {
      const content = await readFileContent(path);
      openFile({
        id: uuidv4(),
        path: path,
        name: path.split('/').pop() || 'Untitled',
        content: content,
        isDirty: false,
        language: 'plaintext', // Simplification
      });
      setCommandPaletteOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to open file from palette');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden">
      <Toaster position="bottom-right" theme="dark" />
      <Titlebar onToggleChat={toggleChat} isChatOpen={isChatOpen} onToggleTerminal={toggleTerminal} isTerminalOpen={isTerminalOpen} />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] overflow-hidden">
          <TabBar />
          <div className="flex-1 relative overflow-hidden">
            <MonacoEditor />
          </div>
          {isTerminalOpen && (
            <div className="h-64 border-t border-gray-700 relative">
              <TerminalPanel onClose={toggleTerminal} />
            </div>
          )}
        </div>

        {isChatOpen && <AIChat />}
      </div>
      
      <Statusbar />
      <CommandPalette onSelect={handleSelectFileFromPalette} />
    </div>
  );
}

export default App;