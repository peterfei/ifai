import React, { useEffect, Fragment } from 'react';
import { Titlebar } from './components/Layout/Titlebar';
import { Sidebar } from './components/Layout/Sidebar';
import { Statusbar } from './components/Layout/Statusbar';
import { SplitPaneContainer } from './components/Layout/SplitPaneContainer';
import { TabBar } from './components/Editor/TabBar';
import { AIChat } from './components/AIChat/AIChat';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { SettingsModal } from './components/Settings/SettingsModal';
import { useFileStore } from './stores/fileStore';
import { useEditorStore } from './stores/editorStore';
import { useLayoutStore } from './stores/layoutStore';
import { writeFileContent, readFileContent } from './utils/fileSystem';
import { Toaster, toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';

function App() {
  const { t } = useTranslation();
  const { activeFileId, openedFiles, setFileDirty, openFile, fetchGitStatuses } = useFileStore();
  const { isChatOpen, toggleChat, toggleCommandPalette, setCommandPaletteOpen, isTerminalOpen, toggleTerminal, chatWidth, setChatWidth } = useLayoutStore();
  const [isResizingChat, setIsResizingChat] = React.useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingChat) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < 1000) {
            setChatWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingChat(false);
    };

    if (isResizingChat) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
    } else {
      document.body.style.cursor = 'default';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isResizingChat, setChatWidth]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const activeFile = openedFiles.find(f => f.id === activeFileId);
        if (activeFile) {
          try {
            await writeFileContent(activeFile.path, activeFile.content);
            setFileDirty(activeFile.id, false);
            toast.success(t('common.fileSaved'));
            fetchGitStatuses();
          } catch (error) {
            console.error('Failed to save file:', error);
            toast.error(t('common.fileSaveFailed'));
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        const activeEditor = useEditorStore.getState().getActiveEditor();
        if (activeEditor) {
          activeEditor.getAction('actions.find')?.run();
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
      } else if ((e.metaKey || e.ctrlKey) && e.key === '\\') { // Cmd+\ for Split Pane
        e.preventDefault();
        if (e.shiftKey) {
          // Cmd+Shift+\ - Vertical split
          useLayoutStore.getState().splitPane('vertical');
        } else {
          // Cmd+\ - Horizontal split
          useLayoutStore.getState().splitPane('horizontal');
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '4') {
        // Cmd+1/2/3/4 - Focus pane by number
        e.preventDefault();
        const paneIndex = parseInt(e.key) - 1;
        const { panes } = useLayoutStore.getState();
        if (paneIndex < panes.length) {
          useLayoutStore.getState().setActivePane(panes[paneIndex].id);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        // Cmd+W - Close active pane (if more than one)
        e.preventDefault();
        const { panes, activePaneId } = useLayoutStore.getState();
        if (panes.length > 1 && activePaneId) {
          useLayoutStore.getState().closePane(activePaneId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFileId, openedFiles, setFileDirty, toggleChat, toggleCommandPalette, toggleTerminal, fetchGitStatuses, t]);

  const handleSelectFileFromPalette = async (path: string) => {
    try {
      const content = await readFileContent(path);
      openFile({
        id: uuidv4(),
        path: path,
        name: path.split('/').pop() || t('common.untitled'),
        content: content,
        isDirty: false,
        language: 'plaintext', 
        initialLine: 1 
      });
      setCommandPaletteOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(t('common.fileOpenFailed'));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden">
      <Titlebar onToggleChat={toggleChat} isChatOpen={isChatOpen} onToggleTerminal={toggleTerminal} isTerminalOpen={isTerminalOpen} />
      
      {/* Main content area: Sidebar + Editor/Terminal + AIChat */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] overflow-hidden">
          <TabBar />
          <div className="flex-1 relative overflow-hidden">
            <SplitPaneContainer className="split-pane-container" />
          </div>
          {isTerminalOpen && (
            <div className="h-64 border-t border-gray-700 relative">
              <TerminalPanel onClose={toggleTerminal} />
            </div>
          )}
          <Statusbar />
        </div>

        {isChatOpen && <AIChat width={chatWidth} onResizeStart={() => setIsResizingChat(true)} />}
      </div>
      
      {/* Floating modals and toaster, they are mounted as direct children of the root app div. */}
      {/* React Fragment is used to group them without adding an extra DOM node to the layout flow. */}
      <Fragment>
        <CommandPalette onSelect={handleSelectFileFromPalette} />
        <SettingsModal />
        <Toaster position="bottom-right" theme="dark" />
      </Fragment>
    </div>
  );
}

export default App;