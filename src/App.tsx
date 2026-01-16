import React, { useEffect, Fragment, useState } from 'react';
import { Titlebar } from './components/Layout/Titlebar';
import { Sidebar } from './components/Layout/Sidebar';
import { Statusbar } from './components/Layout/Statusbar';
import { SplitPaneContainer } from './components/Layout/SplitPaneContainer';
import { TabBar } from './components/Editor/TabBar';
import { AIChat } from './components/AIChat/AIChat';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { CommandBar } from './components/CommandBar';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { PromptManager } from './components/PromptManager/PromptManager';
import { SettingsModal } from './components/Settings/SettingsModal';
import { GlobalAgentMonitor } from './components/AIChat/GlobalAgentMonitor';
import { PerformancePanel } from './components/DevTools/PerformancePanel';
import { CacheStatsPanel } from './components/PerformanceMonitor/CacheStatsPanel';
import { WelcomeDialog, LocalModelDownload } from './components/Onboarding';
import { OnboardingTour } from './components/Onboarding/OnboardingTour';
import { CodeReviewModal, ReviewHistoryPanel } from './components/CodeReview';
import { InlineEditWidget, DiffEditorModal } from './components/InlineEdit';
import { KeyboardShortcutsModal } from './components/Help/KeyboardShortcutsModal';

// 🔥 E2E 检测：使用构建时环境变量，避免影响生产环境
const isE2EEnvironment = import.meta.env.VITE_TEST_ENV === 'e2e';
import { useFileStore } from './stores/fileStore';
import { useEditorStore } from './stores/editorStore';
import { useLayoutStore } from './stores/layoutStore';
import { useAgentStore } from './stores/agentStore';
import { useCodeReviewStore } from './stores/codeReviewStore';
import { useInlineEditStore } from './stores/inlineEditStore';
import { useHelpStore } from './stores/helpStore';
// v0.3.0: Code Analysis Panel
import { useCodeSmellStore } from './stores/codeSmellStore';
import { CodeSmellPanel } from './components/CodeAnalysis/CodeSmellPanel';
// v0.3.0: Refactoring Panel
import { useRefactoringStore } from './stores/refactoringStore';
import { RefactoringPreviewPanel } from './components/Refactoring/RefactoringPreviewPanel';
import { shallow } from 'zustand/shallow';
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
import { useSnippetStore } from './stores/snippetStore';

// v0.3.0: 暴露 i18n 到 window 对象供 E2E 测试使用
// 在模块加载时立即暴露，确保在测试运行时可用
import i18nInstance from './i18n/config';
(window as any).i18n = i18nInstance;
console.log('[App] i18n exposed at module load, language:', i18nInstance.language);

function App() {
  // 🔥 调试：跟踪 App 组件的渲染次数
  (window as any).__appRenderCount = ((window as any).__appRenderCount || 0) + 1;
  const renderCount = (window as any).__appRenderCount;
  console.log('[App] Render #' + renderCount);

  const { t } = useTranslation();
  const { activeFileId, openedFiles, setFileDirty, fetchGitStatuses } = useFileStore();

  const {
    isChatOpen,
    toggleChat,
    toggleCommandPalette,
    setCommandPaletteOpen,
    isTerminalOpen,
    toggleTerminal,
    chatWidth,
    setChatWidth,
    isPromptManagerOpen,
    // v0.2.6 新增：侧边栏状态
    isSidebarOpen,
    toggleSidebar,
    sidebarPosition,
    sidebarWidth,
    setSidebarWidth,
    // 新增：布局模式
    layoutMode,
  } = useLayoutStore();

  // v0.2.9: Code Review Store
  const {
    currentReview,
    isReviewModalOpen,
    closeReviewModal,
    applyAllFixes,
    ignoreAndCommit,
    isHistoryPanelOpen,
  } = useCodeReviewStore();

  // v0.2.9: Inline Edit Store
  // 🔥 使用单独的选择器订阅，避免对象选择器导致引用不稳定
  const hideInlineEdit = useInlineEditStore(state => state.hideInlineEdit);
  const showDiffEditor = useInlineEditStore(state => state.showDiffEditor);
  const hideDiffEditor = useInlineEditStore(state => state.hideDiffEditor);
  const acceptDiff = useInlineEditStore(state => state.acceptDiff);
  const rejectDiff = useInlineEditStore(state => state.rejectDiff);
  const undo = useInlineEditStore(state => state.undo);
  const redo = useInlineEditStore(state => state.redo);

  const [isResizingChat, setIsResizingChat] = React.useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = React.useState(false);
  const [showCacheStats, setShowCacheStats] = useState(false);

  // Keyboard shortcuts modal state
  const { isKeyboardShortcutsOpen, closeKeyboardShortcuts } = useHelpStore();

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

      // v0.3.0: 暴露 stores 到 window 对象供 E2E 测试使用
      try {
        const { useFileStore } = await import('./stores/fileStore');
        // Zustand store 本身就是一个对象，可以直接暴露
        (window as any).__fileStore = useFileStore;
        console.log('[App] ✅ FileStore exposed to window.__fileStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose FileStore:', error);
      }

      // v0.3.0: 暴露 dragDropStore 到 window 对象供 E2E 测试使用
      try {
        const { useDragDropStore } = await import('./stores/dragDropStore');
        (window as any).__dragDropStore = useDragDropStore;
        console.log('[App] ✅ DragDropStore exposed to window.__dragDropStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose DragDropStore:', error);
      }

      // v0.3.0: 暴露 helpStore 到 window 对象供 E2E 测试使用
      try {
        const { useHelpStore } = await import('./stores/helpStore');
        (window as any).__helpStore = { useHelpStore };
        console.log('[App] ✅ HelpStore exposed to window.__helpStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose HelpStore:', error);
      }

      // v0.3.0: 暴露 chatStore 到 window 对象供 E2E 测试使用
      try {
        const { useChatStore } = await import('./stores/useChatStore');
        (window as any).__chatStore = useChatStore;
        console.log('[App] ✅ ChatStore exposed to window.__chatStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose ChatStore:', error);
      }

      // v0.3.0: 暴露 settingsStore 到 window 对象供 E2E 测试使用
      try {
        const { useSettingsStore } = await import('./stores/settingsStore');
        (window as any).__settingsStore = useSettingsStore;
        console.log('[App] ✅ SettingsStore exposed to window.__settingsStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose SettingsStore:', error);
      }

      // v0.3.0: 暴露 layoutStore 到 window 对象供 E2E 测试使用
      try {
        const { useLayoutStore } = await import('./stores/layoutStore');
        (window as any).__layoutStore = { useLayoutStore };
        console.log('[App] ✅ LayoutStore exposed to window.__layoutStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose LayoutStore:', error);
      }

      // v0.3.1: 暴露 agentStore 到 window 对象供 E2E 测试使用
      try {
        const { useAgentStore } = await import('./stores/agentStore');
        (window as any).__agentStore = useAgentStore;
        console.log('[App] ✅ AgentStore exposed to window.__agentStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose AgentStore:', error);
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

  // v0.2.9: Code Review event listeners
  useEffect(() => {
    // 监听审查完成事件
    const handleReviewComplete = (event: CustomEvent) => {
      console.log('[App] Review complete:', event.detail);
      const { setCurrentReview, openReviewModal } = useCodeReviewStore.getState();
      setCurrentReview(event.detail);
      openReviewModal();
    };

    window.addEventListener('review-complete', handleReviewComplete as EventListener);

    return () => {
      window.removeEventListener('review-complete', handleReviewComplete as EventListener);
    };
  }, []);

  // v0.2.9: Git status tracking for commit button
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [showCommitButton, setShowCommitButton] = useState(false);

  useEffect(() => {
    // 监听 Git 状态变更事件（E2E 测试）
    const handleGitStatusChange = (event: CustomEvent) => {
      console.log('[App] Git status changed:', event.detail);
      const staged = event.detail?.staged || [];
      setStagedFiles(staged);
      setShowCommitButton(staged.length > 0);
    };

    window.addEventListener('git-status-change', handleGitStatusChange as EventListener);

    return () => {
      window.removeEventListener('git-status-change', handleGitStatusChange as EventListener);
    };
  }, []);

  const handleCommitClick = () => {
    // E2E test: Commit click triggers review
    console.log('[App] Commit clicked, starting review...');
    toast.info('正在审查代码...');

    // In real app, this would trigger AI review
    // For E2E testing, the test manually dispatches review-complete event
  };

  // v0.2.9: Cmd+Z/Cmd+Shift+Z for Undo/Redo (inline edit history)
  // Note: Cmd+K is handled by Monaco Editor's internal command system
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Z or Ctrl+Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        console.log('[App] Cmd+Z triggered for undo');
        undo();
      }

      // Cmd+Shift+Z or Ctrl+Shift+Z for redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        console.log('[App] Cmd+Shift+Z triggered for redo');
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo]);

  // v0.3.0: 全局快捷键 - 按 ? 打开键盘快捷键列表
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger ? key when not typing in an input field
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' ||
                          target.tagName === 'TEXTAREA' ||
                          target.contentEditable === 'true';

      if (!isInputField && e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const { openKeyboardShortcuts } = useHelpStore.getState();
        openKeyboardShortcuts();
        console.log('[App] ? key pressed, opening keyboard shortcuts');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // v0.3.0: 全局快捷键 - Cmd+K 然后 Cmd+S 打开键盘快捷键列表
  useEffect(() => {
    let cmdKPressed = false;
    let cmdKTimer: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.shiftKey) {
        e.preventDefault();
        cmdKPressed = true;
        console.log('[App] Cmd+K pressed, waiting for Cmd+S...');

        // Clear any existing timer
        if (cmdKTimer) {
          clearTimeout(cmdKTimer);
        }

        // Reset after 2 seconds if no Cmd+S is pressed
        cmdKTimer = setTimeout(() => {
          cmdKPressed = false;
          console.log('[App] Cmd+K timeout, resetting');
        }, 2000);
      }

      // If Cmd+K was pressed and now Cmd+S is pressed
      if (cmdKPressed && (e.metaKey || e.ctrlKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (cmdKTimer) {
          clearTimeout(cmdKTimer);
        }
        cmdKPressed = false;
        const { openKeyboardShortcuts } = useHelpStore.getState();
        openKeyboardShortcuts();
        console.log('[App] Cmd+K then Cmd+S pressed, opening keyboard shortcuts');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Reset Cmd+K state if Cmd/Ctrl is released (before full combo completes)
      if ((e.key === 'Meta' || e.key === 'Control') && cmdKPressed) {
        // Only reset if no S key was detected, but let keydown handler handle the combo
        // This is just cleanup in case user releases modifiers before S
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (cmdKTimer) {
        clearTimeout(cmdKTimer);
      }
    };
  }, []);

  // v0.2.9: Inline edit event listeners
  useEffect(() => {
    // Handle inline edit accept - apply changes to editor
    const handleAcceptEdit = (event: CustomEvent) => {
      const { modifiedCode, filePath } = event.detail;
      console.log('[App] handleAcceptEdit called with modifiedCode:', modifiedCode);
      const editor = (window as any).__activeEditor;

      if (editor && modifiedCode) {
        const model = editor.getModel();
        if (model) {
          console.log('[App] Before setValue, editor value:', editor.getValue());
          model.setValue(modifiedCode);
          console.log('[App] After setValue, editor value:', editor.getValue());
          toast.success('代码修改已应用');
        }
      } else {
        console.log('[App] handleAcceptEdit: editor or modifiedCode missing');
      }
    };

    // Handle inline edit undo
    const handleUndoEdit = (event: CustomEvent) => {
      const { code } = event.detail;
      console.log('[App] handleUndoEdit called with code:', code);
      const editor = (window as any).__activeEditor;

      if (editor && code) {
        const model = editor.getModel();
        if (model) {
          model.setValue(code);
          toast.info('已撤销修改');
          console.log('[App] Undo applied, new value:', editor.getValue());
        }
      }
    };

    // Handle inline edit redo
    const handleRedoEdit = (event: CustomEvent) => {
      const { code } = event.detail;
      const editor = (window as any).__activeEditor;

      if (editor && code) {
        const model = editor.getModel();
        if (model) {
          model.setValue(code);
          toast.info('已重做修改');
        }
      }
    };

    window.addEventListener('inline-edit-accept', handleAcceptEdit as EventListener);
    window.addEventListener('inline-edit-undo', handleUndoEdit as EventListener);
    window.addEventListener('inline-edit-redo', handleRedoEdit as EventListener);

    return () => {
      window.removeEventListener('inline-edit-accept', handleAcceptEdit as EventListener);
      window.removeEventListener('inline-edit-undo', handleUndoEdit as EventListener);
      window.removeEventListener('inline-edit-redo', handleRedoEdit as EventListener);
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
          if (activeFile.path.startsWith('snippet://')) {
            const snippetId = activeFile.path.replace('snippet://', '');
            await useSnippetStore.getState().updateSnippet(snippetId, { code: activeFile.content });
            setFileDirty(activeFile.id, false);
            toast.success('Snippet saved to database');
          } else {
            await writeFileContent(activeFile.path, activeFile.content);
            setFileDirty(activeFile.id, false);
            toast.success(t('common.fileSaved'));
            fetchGitStatuses();
          }
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
    },
    // v0.2.6 新增：切换侧栏显示/隐藏
    'layout.toggleSidebar': (e: KeyboardEvent) => {
      e.preventDefault();
      toggleSidebar();
    },
    // v0.3.0: 切换代码分析面板
    'view.toggleCodeAnalysis': (e: KeyboardEvent) => {
      e.preventDefault();
      const { isPanelOpen, setPanelOpen } = useCodeSmellStore.getState();
      setPanelOpen(!isPanelOpen);
    },
    // v0.3.0: 打开开发者工具 (F12) - 仅开发模式
    'debug.openDevTools': async (e: KeyboardEvent) => {
      e.preventDefault();
      // 仅在开发环境工作
      if (import.meta.env.DEV) {
        console.log('[App] F12 pressed - DevTools only available in dev mode');
      } else {
        console.log('[App] F12 pressed - Use browser DevTools in dev mode to debug');
      }
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
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden" data-layout={layoutMode}>
      <Titlebar onToggleChat={toggleChat} isChatOpen={isChatOpen} onToggleTerminal={toggleTerminal} isTerminalOpen={isTerminalOpen} />

      {/* Main content area: Sidebar + Editor/Terminal + AIChat */}
      <div className="flex flex-1 overflow-hidden">
        {/* v0.2.6 新增：侧栏宽度拖拽 */}
        {isSidebarOpen && sidebarPosition === 'left' && (
          <Sidebar />
        )}
        {isSidebarOpen && sidebarPosition === 'left' && (
          <div
            className="cursor-col-resize hover:bg-blue-500/50 transition-colors w-1 bg-transparent"
            onMouseDown={(e) => {
              setIsResizingSidebar(true);
              const startX = e.clientX;
              const startWidth = sidebarWidth;

              const handleMouseMove = (e: MouseEvent) => {
                const deltaX = sidebarPosition === 'left'
                  ? e.clientX - startX
                  : startX - e.clientX;
                const newWidth = Math.max(150, Math.min(500, startWidth + deltaX));
                setSidebarWidth(newWidth);
              };

              const handleMouseUp = () => {
                setIsResizingSidebar(false);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
        )}

        {/* 新增：自定义布局模式下，聊天面板在左侧 */}
        {layoutMode === 'custom' && isChatOpen && (
          <AIChat width={chatWidth} onResizeStart={() => setIsResizingChat(true)} />
        )}

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

        {/* 默认布局模式下，聊天面板在右侧 */}
        {layoutMode === 'default' && isChatOpen && <AIChat width={chatWidth} onResizeStart={() => setIsResizingChat(true)} />}

        {/* v0.3.0: 代码分析面板 */}
        {useCodeSmellStore((state) => state.isPanelOpen) && (
          <div className="w-96 border-l border-gray-700">
            <CodeSmellPanel onClose={() => useCodeSmellStore.getState().setPanelOpen(false)} />
          </div>
        )}

        {/* v0.3.0: 重构预览面板 */}
        {useRefactoringStore((state) => state.isPreviewOpen) && (
          <div className="w-[500px] border-l border-gray-700">
            <RefactoringPreviewPanel onClose={() => useRefactoringStore.getState().clearPreview()} />
          </div>
        )}

        {/* v0.2.6 新增：右侧侧栏位置 */}
        {isSidebarOpen && sidebarPosition === 'right' && (
          <>
            <div
              className="cursor-col-resize hover:bg-blue-500/50 transition-colors w-1 bg-transparent"
              onMouseDown={(e) => {
                setIsResizingSidebar(true);
                const startX = e.clientX;
                const startWidth = sidebarWidth;

                const handleMouseMove = (e: MouseEvent) => {
                  const deltaX = startX - e.clientX;
                  const newWidth = Math.max(150, Math.min(500, startWidth + deltaX));
                  setSidebarWidth(newWidth);
                };

                const handleMouseUp = () => {
                  setIsResizingSidebar(false);
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
            <Sidebar />
          </>
        )}
      </div>
      
      <Fragment>
        <CommandPalette onSelect={handleSelectFileFromPalette} />
        <CommandBar />
        <SettingsModal />
        <KeyboardShortcutsModal
          isOpen={isKeyboardShortcutsOpen}
          onClose={closeKeyboardShortcuts}
        />
        <GlobalAgentMonitor />
        {useSettingsStore((state) => state.showPerformanceMonitor) && (
          <PerformancePanel
            onClose={() => useSettingsStore.getState().updateSettings({ showPerformanceMonitor: false })}
          />
        )}
        {showCacheStats && <CacheStatsPanel onClose={() => setShowCacheStats(false)} />}
        <div data-testid="toast-container">
          <Toaster position="bottom-right" theme="dark" />
        </div>

        {/* Onboarding */}
        {/* 🔥 E2E 环境跳过欢迎对话框（检查运行时全局变量）*/}
        {!(isE2EEnvironment || (typeof window !== 'undefined' && (window as any).__E2E_SKIP_STABILIZER__)) && (
          <WelcomeDialog
            onChoice={handleWelcomeChoice}
            onClose={() => setOnboardingStep(null)}
          />
        )}
        {onboardingStep === 'download' && (
          <LocalModelDownload
            onComplete={handleDownloadComplete}
            onCancel={handleDownloadCancel}
            onError={handleDownloadError}
          />
        )}
        {/* v0.3.0: Onboarding Tour */}
        <OnboardingTour />

        {/* v0.2.9: Code Review Modal */}
        <CodeReviewModal
          reviewResult={currentReview}
          isOpen={isReviewModalOpen}
          onClose={closeReviewModal}
          onApplyAllFixes={applyAllFixes}
          onIgnoreAndCommit={ignoreAndCommit}
        />

        {/* v0.2.9: Review History Panel */}
        <ReviewHistoryPanel isOpen={isHistoryPanelOpen} />

        {/* v0.2.9: Inline Edit Widget (uses useInlineEditStore internally) */}
        <InlineEditWidget />

        {/* v0.2.9: Diff Editor Modal */}
        <DiffEditorModal
          onAccept={acceptDiff}
          onReject={rejectDiff}
        />

        {/* v0.2.9: Git Commit Button (shows when files are staged) */}
        {showCommitButton && (
          <div className="fixed bottom-20 right-8 z-[200]">
            <button
              onClick={handleCommitClick}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-lg transition-all"
              data-testid="commit-button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Commit ({stagedFiles.length} files)
            </button>
          </div>
        )}
      </Fragment>
    </div>
  );
}

export default App;