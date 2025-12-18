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
import { useShortcuts } from './hooks/useShortcuts';

function App() {
  const { t } = useTranslation();
  const { activeFileId, openedFiles, setFileDirty, openFile, fetchGitStatuses } = useFileStore();
  const { isChatOpen, toggleChat, toggleCommandPalette, setCommandPaletteOpen, isTerminalOpen, toggleTerminal, chatWidth, setChatWidth } = useLayoutStore();
  const [isResizingChat, setIsResizingChat] = React.useState(false);

  useEffect(() => {
    // Validate layout on startup to ensure panes reference valid files
    useLayoutStore.getState().validateLayout();
  }, []);

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

  // Define shortcut handlers
  const shortcutHandlers = {
    'file.save': async (e: KeyboardEvent) => {
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
    },
    'editor.find': (e: KeyboardEvent) => {
      e.preventDefault();
      const activeEditor = useEditorStore.getState().getActiveEditor();
      if (activeEditor) {
        activeEditor.getAction('actions.find')?.run();
      }
    },
    'view.toggleChat': (e: KeyboardEvent) => {
      e.preventDefault();
      toggleChat();
    },
    'view.commandPalette': (e: KeyboardEvent) => {
      e.preventDefault();
      toggleCommandPalette();
    },
    'view.toggleTerminal': (e: KeyboardEvent) => {
      e.preventDefault();
      toggleTerminal();
    },
    'layout.splitVertical': (e: KeyboardEvent) => {
      e.preventDefault();
      useLayoutStore.getState().splitPane('vertical');
    },
    'layout.splitHorizontal': (e: KeyboardEvent) => {
      e.preventDefault();
      useLayoutStore.getState().splitPane('horizontal');
    },
    'layout.focusPane1': (e: KeyboardEvent) => {
      e.preventDefault();
      const { panes } = useLayoutStore.getState();
      if (panes.length > 0) useLayoutStore.getState().setActivePane(panes[0].id);
    },
    'layout.focusPane2': (e: KeyboardEvent) => {
      e.preventDefault();
      const { panes } = useLayoutStore.getState();
      if (panes.length > 1) useLayoutStore.getState().setActivePane(panes[1].id);
    },
    'layout.focusPane3': (e: KeyboardEvent) => {
      e.preventDefault();
      const { panes } = useLayoutStore.getState();
      if (panes.length > 2) useLayoutStore.getState().setActivePane(panes[2].id);
    },
    'layout.focusPane4': (e: KeyboardEvent) => {
      e.preventDefault();
      const { panes } = useLayoutStore.getState();
      if (panes.length > 3) useLayoutStore.getState().setActivePane(panes[3].id);
    },
    'layout.closePane': (e: KeyboardEvent) => {
      e.preventDefault();
      const { panes, activePaneId } = useLayoutStore.getState();
      if (panes.length > 1 && activePaneId) {
        useLayoutStore.getState().closePane(activePaneId);
      }
    }
  };

  useShortcuts(shortcutHandlers);

  const handleSelectFileFromPalette = async (path: string) => {
    try {
      const content = await readFileContent(path);
      const openedFileId = openFile({
        id: uuidv4(),
        path: path,
        name: path.split('/').pop() || t('common.untitled'),
        content: content,
        isDirty: false,
        language: 'plaintext', 
        initialLine: 1 
      });
      
      const { activePaneId, assignFileToPane } = useLayoutStore.getState();
      if (activePaneId) {
          assignFileToPane(activePaneId, openedFileId);
      }
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
      
      <Fragment>
        <CommandPalette onSelect={handleSelectFileFromPalette} />
        <SettingsModal />
        <Toaster position="bottom-right" theme="dark" />
      </Fragment>
    </div>
  );
}

export default App;