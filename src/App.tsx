import React, { useEffect, Fragment, useState } from 'react';
import { Titlebar } from './components/Layout/Titlebar';
import { Sidebar } from './components/Layout/Sidebar';
import { Statusbar } from './components/Layout/Statusbar';
import { SplitPaneContainer } from './components/Layout/SplitPaneContainer';
import { TabBar } from './components/Editor/TabBar';
import { AIChat } from './components/AIChat/AIChat';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { PromptManager } from './components/PromptManager/PromptManager';
import { SettingsModal } from './components/Settings/SettingsModal';
import { GlobalAgentMonitor } from './components/AIChat/GlobalAgentMonitor';
import { PerformanceMonitor } from './components/PerformanceMonitor/PerformanceMonitor';
import { CacheStatsPanel } from './components/PerformanceMonitor/CacheStatsPanel';
import { WelcomeDialog, LocalModelDownload } from './components/Onboarding';
import { useFileStore } from './stores/fileStore';
import { useEditorStore } from './stores/editorStore';
import { useLayoutStore } from './stores/layoutStore';
import { useAgentStore } from './stores/agentStore';
import { writeFileContent, readFileContent } from './utils/fileSystem';
import { Toaster, toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { useShortcuts } from './hooks/useShortcuts';
import { openFileFromPath } from './utils/fileActions';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useChatStore } from './stores/useChatStore';
import { useSettingsStore } from './stores/settingsStore';

function App() {
  const { t } = useTranslation();
  const { activeFileId, openedFiles, setFileDirty, fetchGitStatuses } = useFileStore();
  const { isChatOpen, toggleChat, toggleCommandPalette, setCommandPaletteOpen, isTerminalOpen, toggleTerminal, chatWidth, setChatWidth, isPromptManagerOpen } = useLayoutStore();
  const [isResizingChat, setIsResizingChat] = React.useState(false);
  const [showCacheStats, setShowCacheStats] = useState(false);

  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState<'welcome' | 'download' | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      // Defer initialization to ensure DOM and Vite preamble are settled
      await new Promise(resolve => setTimeout(resolve, 150));

      // Initialize sync
      const { initializeSync } = await import('./utils/sync');
      cleanup = await initializeSync();

      // Initialize thread persistence (restore from IndexedDB)
      try {
        const { initThreadPersistence } = await import('./stores/persistence/threadPersistence');
        await initThreadPersistence();
        console.log('[App] ✅ Thread persistence initialized');
      } catch (error) {
        console.error('[App] ❌ Failed to initialize thread persistence:', error);
      }

      // Initialize project config language watcher
      try {
        const { watchProjectConfigLanguage } = await import('./i18n/config');
        watchProjectConfigLanguage();
        console.log('[App] ✅ Project config language watcher initialized');
      } catch (error) {
        console.error('[App] ❌ Failed to initialize language watcher:', error);
      }

      // Show window after initialization to prevent splash screen issues
      try {
        await getCurrentWindow().show();
        console.log('[App] ✅ Window shown');
      } catch (error) {
        console.error('[App] ❌ Failed to show window:', error);
      }
    };

    init();

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    useLayoutStore.getState().validateLayout();

    // Initialize agent event listeners (async)
    console.log('[App] 🚀 Starting to initialize agent event listeners...');
    let cleanupFn: (() => void) | undefined;

    useAgentStore.getState().initEventListeners().then((cleanup) => {
        console.log('[App] ✅ Agent event listeners initialization complete!');
        cleanupFn = cleanup;
    }).catch((error) => {
        console.error('[App] ❌ Failed to initialize agent event listeners:', error);
    });

    // NOTE: The duplicate agent:result listener in App.tsx is now REMOVED
    // because agentStore.ts already handles this event properly.
    // This eliminates duplicate message injection.
    
    return () => {
        if (cleanupFn) {
            console.log('[App] 🧹 Cleaning up agent event listeners...');
            cleanupFn();
        }
    };
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
    'view.togglePerformanceMonitor': (e: KeyboardEvent) => {
      e.preventDefault();
      const { showPerformanceMonitor, updateSettings } = useSettingsStore.getState();
      updateSettings({ showPerformanceMonitor: !showPerformanceMonitor });
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
    },
    'perf.toggleCacheStats': (e: KeyboardEvent) => {
      e.preventDefault();
      setShowCacheStats(prev => !prev);
    }
  };

  useShortcuts(shortcutHandlers);

  const handleSelectFileFromPalette = async (path: string) => {
    const success = await openFileFromPath(path);
    if (success) {
      setCommandPaletteOpen(false);
    }
  };

  // Onboarding handlers
  const handleWelcomeChoice = (choice: 'download' | 'remind' | 'skip') => {
    if (choice === 'download') {
      setOnboardingStep('download');
    } else {
      // remind or skip - close onboarding
      setOnboardingStep(null);
    }
  };

  const handleDownloadComplete = () => {
    setOnboardingStep(null);
  };

  const handleDownloadCancel = () => {
    setOnboardingStep(null);
  };

  const handleDownloadError = (error: string) => {
    console.error('[App] Download error:', error);
    setOnboardingStep(null);
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
            {isPromptManagerOpen ? (
              <PromptManager />
            ) : (
              <SplitPaneContainer className="split-pane-container" />
            )}
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
        <GlobalAgentMonitor />
        <PerformanceMonitor />
        {showCacheStats && <CacheStatsPanel onClose={() => setShowCacheStats(false)} />}
        <Toaster position="bottom-right" theme="dark" />

        {/* Onboarding */}
        <WelcomeDialog
          onChoice={handleWelcomeChoice}
          onClose={() => setOnboardingStep(null)}
        />
        {onboardingStep === 'download' && (
          <LocalModelDownload
            onComplete={handleDownloadComplete}
            onCancel={handleDownloadCancel}
            onError={handleDownloadError}
          />
        )}
      </Fragment>
    </div>
  );
}

export default App;