import React, { useEffect, Fragment, useState, Suspense } from 'react';
import clsx from 'clsx';
import { ModalSkeleton, MessageSkeleton } from './components/UI/Skeleton';
import { ensureTauriInitialized } from './utils/tauriInitializer';
const CommandPalette = React.lazy(() => import('./components/CommandPalette/CommandPalette').then(m => ({ default: m.CommandPalette })));
const CommandBar = React.lazy(() => import('./components/CommandBar').then(m => ({ default: m.CommandBar })));
const SettingsModal = React.lazy(() => import('./components/Settings/SettingsModal').then(m => ({ default: m.SettingsModal })));
const KeyboardShortcutsModal = React.lazy(() => import('./components/Help/KeyboardShortcutsModal').then(m => ({ default: m.KeyboardShortcutsModal })));
const GlobalAgentMonitor = React.lazy(() => import('./components/AIChat/GlobalAgentMonitor').then(m => ({ default: m.GlobalAgentMonitor })));
const PerformancePanel = React.lazy(() => import('./components/DevTools/PerformancePanel').then(m => ({ default: m.PerformancePanel })));
const CacheStatsPanel = React.lazy(() => import('./components/PerformanceMonitor/CacheStatsPanel').then(m => ({ default: m.CacheStatsPanel })));
// 🔥 FIX: 直接导入 WelcomeDialog 以避免延迟加载导致的 NotFoundError
import { WelcomeDialog, LocalModelDownload, APIKeyGuideDialog } from './components/Onboarding';
import { OnboardingTour } from './components/Onboarding/OnboardingTour';
const CodeReviewModal = React.lazy(() => import('./components/CodeReview').then(m => ({ default: m.CodeReviewModal })));
const ReviewHistoryPanel = React.lazy(() => import('./components/CodeReview').then(m => ({ default: m.ReviewHistoryPanel })));
const DiffEditorModal = React.lazy(() => import('./components/InlineEdit').then(m => ({ default: m.DiffEditorModal })));
const ToolClassificationTestPage = React.lazy(() => import('./components/Debug/ToolClassificationTestPage').then(m => ({ default: m.ToolClassificationTestPage })));
const CodeSmellPanel = React.lazy(() => import('./components/CodeAnalysis/CodeSmellPanel').then(m => ({ default: m.CodeSmellPanel })));
const RefactoringPreviewPanel = React.lazy(() => import('./components/Refactoring/RefactoringPreviewPanel').then(m => ({ default: m.RefactoringPreviewPanel })));
// P2: TodoWrite 任务面板
const TodoWritePanel = React.lazy(() => import('./components/TodoWrite').then(m => ({ default: m.TodoWritePanel })));
// 技能列表坞
const SkillsDock = React.lazy(() => import('./components/Skills/SkillsDock').then(m => ({ default: m.SkillsDock })));
// P3: 工具浏览器
const ToolExplorerPanel = React.lazy(() => import('./components/ToolExplorer').then(m => ({ default: m.ToolExplorerPanel })));
// P4: 多智能体工作流
const WorkflowsPage = React.lazy(() => import('./pages/workflows').then(m => ({ default: m.WorkflowsPage })));

import { Titlebar } from './components/Layout/Titlebar';
import { Sidebar } from './components/Layout/Sidebar';
import { Statusbar } from './components/Layout/Statusbar';
import { SplitPaneContainer } from './components/Layout/SplitPaneContainer';
import { TabBar } from './components/Editor/TabBar';
import { LayoutEngine, registerLayouts } from './gui/layout';
import { componentRegistry } from './gui/registry';
import { AIChat } from './components/AIChat/AIChat';
import { ApprovalToolbar } from './components/AIChat/ApprovalToolbar';


import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { PromptManager } from './components/PromptManager/PromptManager';
import { SkillsPanel } from './components/Skills/SkillsPanel';
import { SkillMarket } from './components/Skills/SkillMarket';
import { StorageQuotaBanner } from './components/Storage/StorageQuotaBanner';











// 🔥 E2E 检测：使用构建时环境变量，避免影响生产环境
const isE2EEnvironment = import.meta.env.VITE_TEST_ENV === 'e2e';
import { useFileStore } from './stores/fileStore';
import { useEditorStore } from './stores/editorStore';
import { useLayoutStore } from './stores/layoutStore';
import { useAgentStore } from './stores/agentStore';
import { useThreadStore } from './stores/threadStore';
import { useCodeReviewStore } from './stores/codeReviewStore';
import { useInlineEditStore } from './stores/inlineEditStore';
import { useHelpStore } from './stores/helpStore';
// v0.3.0: Code Analysis Panel
import { useCodeSmellStore } from './stores/codeSmellStore';

// v0.3.0: Refactoring Panel
import { useRefactoringStore } from './stores/refactoringStore';

import { shallow } from 'zustand/shallow';
// v0.3.3: Debug panels
import { useDebugStore } from './stores/debugStore';
import { writeFileContent, readFileContent } from './utils/fileSystem';
// P2: TodoWrite 任务面板
import { useTodoWriteStore } from './stores/todoWriteStore';
import { Toaster, toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { useShortcuts } from './hooks/useShortcuts';
import { openFileFromPath } from './utils/fileActions';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
// 🔥 FIX: 使用 CoreStoreProxy 的代理版本，确保工作流意图识别生效
import { useChatStore } from './stores/chat/CoreStoreProxy';
import { useSettingsStore } from './stores/settingsStore';
import { useSnippetStore } from './stores/snippetStore';

// v0.3.0: 暴露 i18n 到 window 对象供 E2E 测试使用
// 在模块加载时立即暴露，确保在测试运行时可用
import i18nInstance from './i18n/config';
(window as any).i18n = i18nInstance;
console.log('[App] i18n exposed at module load, language:', i18nInstance.language);

/** TodoWrite 面板三态包装器（full/collapsed/hidden） */
function TodoWritePanelWrapper() {
  const panelState = useTodoWriteStore((s) => s.panelState);
  if (panelState === 'hidden') return null;
  return (
    <div className={`border-l border-gray-700 transition-all duration-300 ease-in-out overflow-hidden ${
      panelState === 'collapsed' ? 'w-10' : 'w-96'
    }`}>
      <Suspense fallback={null}>
        <TodoWritePanel onClose={() => useTodoWriteStore.getState().setPanelState('hidden')} />
      </Suspense>
    </div>
  );
}

function App() {
  // 🔥 Refactor Phase 6: Final Entrance Locking
  if (typeof window !== 'undefined') {
      (window as any).__chatStore = useChatStore;
      (window as any).__layoutStore = useLayoutStore; // P3: 暴露 layoutStore 给 E2E 测试

      // 🏆 暴露总线与控制器，用于 TDD 仿真和调试
      import('./stores/chat/eventBus/ChatEventBus').then(({ chatEventBus }) => {
          (window as any).__chatEventBus = chatEventBus;
      });
      import('./stores/chat/sendMessage/SendMessageOrchestrator').then(({ sendMessageOrchestrator }) => {
          (window as any).__sendMessageOrchestrator = sendMessageOrchestrator;
      });
      import('./stores/chat/generateResponse/StreamingResponseController').then(({ streamingResponseController }) => {
          (window as any).__streamingResponseController = streamingResponseController;
      });
  }

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
    isSkillsPanelOpen,
    isSkillMarketOpen,
    isToolExplorerOpen, // P3: 工具浏览器
    toggleToolExplorer, // P3: 工具浏览器
    isWorkflowsOpen, // P4: 多智能体工作流
    toggleWorkflows, // P4: 多智能体工作流
    // v0.2.6 新增：侧边栏状态
    isSidebarOpen,
    toggleSidebar,
    sidebarPosition,
    sidebarWidth,
    setSidebarWidth,
    // 新增：布局模式
    layoutMode,
    // 🔥 v0.5.0: 双模引擎状态
    editorMode,
    // GUI 布局模式
    guiMode,
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
  const [onboardingStep, setOnboardingStep] = useState<'welcome' | 'download' | 'apikey' | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      // Defer initialization to ensure DOM and Vite preamble are settled
      await new Promise(resolve => setTimeout(resolve, 150));

      console.log('[App] 🚀 Initializing app...');

      // 🔥 CRITICAL FIX: 等待 useChatStore persist hydrate 完成
      // 避免 IndexedDB 恢复的消息被 persist 的空 localStorage 数据覆盖
      const { useChatStore } = await import('./stores/useChatStore');
      if (!useChatStore.persist.hasHydrated()) {
        console.log('[App] ⏳ Waiting for useChatStore persist to hydrate...');
        await new Promise<void>((resolve) => {
          const unsub = useChatStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
          // Safety timeout: 如果 persist 始终不 hydrate（如 SSR），最多等 3 秒
          setTimeout(() => {
            unsub();
            resolve();
          }, 3000);
        });
        console.log('[App] ✅ useChatStore persist hydrated');
      }

      // 🔥 CRITICAL FIX: 优先恢复 thread，不管其他初始化是否成功
      try {
        console.log('[App] 📦 About to initialize thread persistence...');
        const { initThreadPersistence } = await import('./stores/persistence/threadPersistence');
        await initThreadPersistence();
        console.log('[App] ✅ Thread persistence initialized');

        // restoreFromStorage() 已内部调用 switchThread() 恢复消息，无需重复调用
      } catch (error) {
        console.error('[App] ❌ Thread restoration failed:', error);
      }

      // Initialize sync
      try {
        const { initializeSync } = await import('./utils/sync');
        cleanup = await initializeSync();
      } catch (error) {
        console.error('[App] ❌ Sync initialization failed:', error);
      }

      // 🔥 Refactor Phase 2: Initialize the new Transactional Persistence Manager
      try {
        const { persistenceManager } = await import('./stores/chat/persistence/PersistenceManager');
        (window as any).__persistenceManager = persistenceManager; // 显式暴露用于调试
        console.log('[App] 🧠 Transactional Persistence Manager ready');
      } catch (error) {
        console.error('[App] ❌ Persistence Manager initialization failed:', error);
      }

      // 🔥 Refactor Phase 3: Expose Orchestrator for E2E validation
      try {
        const { sendMessageOrchestrator } = await import('./stores/chat/sendMessage/SendMessageOrchestrator');
        (window as any).__sendMessageOrchestrator = sendMessageOrchestrator;
        const { chatEventBus } = await import('./stores/chat/eventBus/ChatEventBus');
        (window as any).__chatEventBus = chatEventBus;
      } catch (error) {
        console.error('[App] ❌ Orchestrator initialization failed:', error);
      }

      // 🔥 Refactor Phase 4: Expose Stream Controller for E2E validation
      try {
        const { streamingResponseController } = await import('./stores/chat/generateResponse/StreamingResponseController');
        (window as any).__streamingResponseController = streamingResponseController;
      } catch (error) {
        console.error('[App] ❌ Stream Controller initialization failed:', error);
      }

      // 🏆 FIX: StoreMapper 已在 useChatStore.ts 中初始化，避免重复初始化
      (window as any).__storeMapper = { init: true };

      // 🔥 Refactor Phase 4.2: Initialize ToolCallManager
      // 它监听 EventBus 上的工具信号并管理其全生命周期
      try {
        const { toolCallManager } = await import('./stores/chat/generateResponse/ToolCallManager');
        (window as any).__toolCallManager = toolCallManager;
      } catch (error) {
        console.error('[App] ❌ ToolCallManager initialization failed:', error);
      }

      // 桥接 Tauri 信号，用于 TDD 仿真
      try {
        if ((window as any).VITE_TEST_ENV === 'e2e') {
          // 🔥 FIX: 确保 Tauri bridge 已初始化
          await ensureTauriInitialized();

          const { emit } = await import('@tauri-apps/api/event');
          (window as any).__TAURI_EMIT__ = emit;
        }

        console.log('[App] 🚀 Orchestrator, EventBus & StreamController exposed');
      } catch (error) {
        console.error('[App] ❌ Tauri bridge initialization failed:', error);
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
      // 🔥 FIX: 使用 CoreStoreProxy 的代理版本，确保工作流意图识别生效
      try {
        const { useChatStore } = await import('./stores/chat/CoreStoreProxy');
        (window as any).__chatStore = useChatStore;
        console.log('[App] ✅ ChatStore (from CoreStoreProxy) exposed to window.__chatStore');
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
        (window as any).__layoutStore = useLayoutStore;
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

      // v0.3.1: 暴露 inlineEditStore 到 window 对象供 E2E 测试使用
      try {
        const { useInlineEditStore } = await import('./stores/inlineEditStore');
        (window as any).__inlineEditStore = useInlineEditStore;
        console.log('[App] ✅ InlineEditStore exposed to window.__inlineEditStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose InlineEditStore:', error);
      }

      // v0.3.1: 暴露 formatToolResultToMarkdown 到 window 对象供 E2E 测试使用
      try {
        const { formatToolResultToMarkdown } = await import('./utils/toolResultFormatter');
        (window as any).__formatToolResultToMarkdown = formatToolResultToMarkdown;
        console.log('[App] ✅ formatToolResultToMarkdown exposed to window.__formatToolResultToMarkdown');
      } catch (error) {
        console.error('[App] ❌ Failed to expose formatToolResultToMarkdown:', error);
      }

      // P2: 暴露 todoWriteStore 到 window 对象供 E2E 测试使用
      try {
        const { useTodoWriteStore } = await import('./stores/todoWriteStore');
        (window as any).__todoWriteStore = useTodoWriteStore;
        console.log('[App] ✅ TodoWriteStore exposed to window.__todoWriteStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose TodoWriteStore:', error);
      }

      // P2: 暴露 promptStore 到 window 对象供 E2E 测试使用
      try {
        const { usePromptStore } = await import('./stores/promptStore');
        // Zustand store 可以直接调用 setState
        (window as any).__promptStore = {
          setState: usePromptStore.setState,
          getState: usePromptStore.getState,
        };
        console.log('[App] ✅ PromptStore exposed to window.__promptStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose PromptStore:', error);
      }

      // 技能 Store
      try {
        const { useSkillStore } = await import('./stores/skillStore.enhanced');
        (window as any).__skillStore = useSkillStore;
        console.log('[App] ✅ SkillStore exposed to window.__skillStore');
      } catch (error) {
        console.error('[App] ❌ Failed to expose SkillStore:', error);
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
            // 🔥 FIX: 添加错误处理，避免清理失败导致应用崩溃
            try {
                cleanupFn();
            } catch (error) {
                console.error('[App] ❌ Error cleaning up agent event listeners:', error);
            }
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
      // 🔥 优化：从 getState() 获取最新状态，避免在 App 组件中订阅频繁变化的数据
      const { openedFiles, activeFileId, setFileDirty } = useFileStore.getState();
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
    },
    // v0.3.3: 打开工具分类测试页面
    'debug.openToolClassificationTest': (e: KeyboardEvent) => {
      e.preventDefault();
      const { toggleToolClassificationTest } = useDebugStore.getState();
      toggleToolClassificationTest();
    }
  };

  useShortcuts(shortcutHandlers);

  // P3: 监听 URL 变化，支持 /tools 路由
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/tools' && !isToolExplorerOpen) {
        toggleToolExplorer();
      } else if (path === '/' && isToolExplorerOpen) {
        // 🔥 FIX: 只有在用户手动导航时才关闭，不在程序化设置时关闭
        // 检查是否是 E2E 测试环境
        const isE2E = (window as any).__E2E__;
        if (!isE2E) {
          toggleToolExplorer();
        }
      }
    };

    // 初始检查（但不关闭已打开的工具浏览器）
    const path = window.location.pathname;
    if (path === '/tools' && !isToolExplorerOpen) {
      toggleToolExplorer();
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isToolExplorerOpen, toggleToolExplorer]);

  // P4: 监听 URL 变化，支持 /workflows 路由
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/workflows' && !isWorkflowsOpen) {
        toggleWorkflows();
      } else if (path === '/' && isWorkflowsOpen) {
        const isE2E = (window as any).__E2E__;
        if (!isE2E) {
          toggleWorkflows();
        }
      }
    };

    // 初始检查
    const path = window.location.pathname;
    if (path === '/workflows' && !isWorkflowsOpen) {
      toggleWorkflows();
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isWorkflowsOpen, toggleWorkflows]);

  useEffect(() => {
    (window as any).__APP_READY__ = true;
    console.log('[App] 🏁 Ready signal emitted for E2E tests');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[App] 🏁 Ready signal emitted for E2E tests');
      (window as any).__APP_READY__ = true;
    }, 2000); // 宽延时间
    return () => clearTimeout(timer);
  }, []);
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
      // remind or skip - go to API key guide
      setOnboardingStep('apikey');
    }
  };

  const handleDownloadComplete = () => {
    // Download complete, now show API key guide
    setOnboardingStep('apikey');
  };

  const handleDownloadCancel = () => {
    // User cancelled download, still show API key guide
    setOnboardingStep('apikey');
  };

  const handleAPIKeyComplete = () => {
    setOnboardingStep(null);
  };

  const handleAPIKeySkip = () => {
    setOnboardingStep(null);
  };

  const handleDownloadError = (error: string) => {
    console.error('[App] Download error:', error);
    setOnboardingStep(null);
  };

    return (

      <div 

        className={clsx(

          "flex flex-col h-screen text-white overflow-hidden transition-all duration-1000",

          editorMode === 'vibe' ? "bg-[#1e1e1e]" : "bg-[#0f172a]"

        )}

        data-layout={layoutMode}

        data-editor-mode={editorMode}

      >

  
      <Titlebar onToggleChat={toggleChat} isChatOpen={isChatOpen} onToggleTerminal={toggleTerminal} isTerminalOpen={isTerminalOpen} />
      <StorageQuotaBanner />

      {/* Main content area: GUI LayoutEngine or legacy layout */}
      {/* 新布局引擎：guiMode 非 split 时显示，覆盖在旧布局上方 */}
      {guiMode !== 'split' && (
        <LayoutEngine
          mode={guiMode}
          paneRenderer={(id) => {
            const Component = componentRegistry.get(id);
            return Component ? <Component /> : <div>Unknown: {id}</div>;
          }}
        />
      )}
      {/* 旧布局始终渲染（保证 hooks 不被跳过），guiMode 非 split 时隐藏 */}
      <div className="flex flex-1 overflow-hidden" style={guiMode !== 'split' ? { display: 'none' } : undefined}>
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

        {/* 自定义布局模式下，聊天面板在左侧（仅 split 模式） */}
        {layoutMode === 'custom' && isChatOpen && guiMode === 'split' && (
          <AIChat width={chatWidth} onResizeStart={() => setIsResizingChat(true)} />
        )}

        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] overflow-hidden">
          <TabBar />
          <ApprovalToolbar />
          <div className="flex-1 relative overflow-hidden">

            {isSkillMarketOpen ? (
              <SkillMarket onClose={() => {
                const { setSkillMarketOpen } = useLayoutStore.getState();
                setSkillMarketOpen(false);
              }} />
            ) : isSkillsPanelOpen ? (
              <SkillsPanel />
            ) : isPromptManagerOpen ? (
              <PromptManager />
            ) : isToolExplorerOpen ? (
              <Suspense fallback={<ModalSkeleton />}>
                <ToolExplorerPanel />
              </Suspense>
            ) : isWorkflowsOpen ? (
              <Suspense fallback={<ModalSkeleton />}>
                <WorkflowsPage />
              </Suspense>
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

        {/* 默认布局模式下，聊天面板在右侧（仅 split 模式） */}
        {layoutMode === 'default' && isChatOpen && guiMode === 'split' && <AIChat width={chatWidth} onResizeStart={() => setIsResizingChat(true)} />}

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

        {/* P2: TodoWrite 任务面板（三态：full/collapsed/hidden） */}
        <TodoWritePanelWrapper />

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
        <Suspense fallback={null}><CommandPalette onSelect={handleSelectFileFromPalette} /></Suspense>
        <Suspense fallback={null}><CommandBar /></Suspense>
        <Suspense fallback={<ModalSkeleton />}><SettingsModal /></Suspense>
        <KeyboardShortcutsModal
          isOpen={isKeyboardShortcutsOpen}
          onClose={closeKeyboardShortcuts}
        />
        {/* 🏆 PIVO 3.0: 工作流内嵌监控器 - 在聊天消息流中显示（集成在 AIChat 组件内） */}
        {useSettingsStore((state) => state.showPerformanceMonitor) && (
          <PerformancePanel
            onClose={() => useSettingsStore.getState().updateSettings({ showPerformanceMonitor: false })}
          />
        )}
        {showCacheStats && <CacheStatsPanel onClose={() => setShowCacheStats(false)} />}

        {/* v0.3.3: 工具分类测试页面 */}
        {useDebugStore((state) => state.isToolClassificationTestOpen) && <ToolClassificationTestPage />}

        <div data-testid="toast-container">
          <Toaster position="bottom-right" theme="dark" />
        </div>

        {/* Onboarding */}
        {/* 🔥 逐步排查：先注释 WelcomeDialog */}
        {/* {!(isE2EEnvironment || (typeof window !== 'undefined' && (window as any).__E2E_SKIP_STABILIZER__)) && (
          <WelcomeDialog
            onChoice={handleWelcomeChoice}
            onClose={() => setOnboardingStep(null)}
          />
        )} */}
        {onboardingStep === 'download' && (
          <LocalModelDownload
            onComplete={handleDownloadComplete}
            onCancel={handleDownloadCancel}
            onError={handleDownloadError}
          />
        )}
        {onboardingStep === 'apikey' && (
          <APIKeyGuideDialog
            onComplete={handleAPIKeyComplete}
            onSkip={handleAPIKeySkip}
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

        {/* v0.2.9: Diff Editor Modal */}
        <DiffEditorModal
          onAccept={acceptDiff}
          onReject={rejectDiff}
        />

        {/* 🧪 Agent 2.0 Inline Assistant Global Portal Container */}
        <div id="monaco-inline-ai-portal" className="fixed inset-0 pointer-events-none z-[280]" />

        {/* 技能列表坞 - 左下角 (已隐藏，使用侧边栏技能面板代替) */}
        {/* <Suspense fallback={null}><SkillsDock /></Suspense> */}

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

// 🔥 ErrorBoundary 包装器：捕获应用崩溃
import { ErrorBoundary } from './components/ErrorBoundary';

// 保留原始 App 组件的导出（用于测试）
export { App };

// 默认导出带有错误边界的版本
export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}