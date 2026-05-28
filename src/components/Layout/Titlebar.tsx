import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Sun, Moon, MessageSquare, Terminal, Settings, Sidebar, Shield } from 'lucide-react';
import clsx from 'clsx';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCodeSmellStore } from '../../stores/codeSmellStore';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory, writeFileContent, saveFileAs } from '../../utils/fileSystem';
import { openFileFromPath } from '../../utils/fileActions';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { detectLanguageFromPath } from '../../utils/languageDetection';
import { LayoutSwitcher } from './LayoutSwitcher';
import { HelpMenu } from '../Help/HelpMenu';
import { ModeSwitch } from './ModeSwitch';
import { GuiLayoutSwitcher } from '../../gui/layout';
import { formatKeybinding, isMac } from '../../utils/keyboard';

// v0.3.0: 工作区菜单分隔线组件
const MenuSeparator = () => <div className="theme-divider my-1 h-px" />;

interface TitlebarProps {
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  onToggleTerminal?: () => void;
  isTerminalOpen?: boolean;
}

export const Titlebar = ({ onToggleChat, isChatOpen, onToggleTerminal, isTerminalOpen }: TitlebarProps) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openFile, activeFileId, openedFiles, setFileDirty, fetchGitStatuses, addWorkspaceRoot, saveWorkspaceConfig, loadWorkspaceConfig } = useFileStore();
  const { toggleSettings, isSidebarOpen, toggleSidebar, guiMode } = useLayoutStore();
  const theme = useSettingsStore(state => state.theme);
  const setTheme = useSettingsStore(state => state.setTheme);
  // v0.3.0: Code Smell Store
  const { isPanelOpen: isCodeAnalysisOpen, setPanelOpen: setCodeAnalysisOpen } = useCodeSmellStore();
  const menuButtonClass = 'theme-button-ghost flex h-8 items-center rounded-[var(--radius-sm)] px-2.5 text-[12px] font-medium';
  const menuItemClass = 'theme-hoverable theme-text-muted cursor-pointer rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px]';
  const iconButtonBaseClass = 'theme-button-ghost flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)]';
  const sidebarShortcut = formatKeybinding('Mod+b');
  const terminalShortcut = formatKeybinding('Mod+j');
  const chatShortcut = formatKeybinding('Mod+l');

  const handleTitlebarMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a, summary, [role="button"], [role="menuitem"], [contenteditable="true"], [data-no-drag="true"]')) {
      return;
    }

    event.preventDefault();
    const appWindow = getCurrentWindow();

    if (event.detail === 2) {
      void appWindow.toggleMaximize().catch((error) => {
        console.warn('[Titlebar] Failed to toggle maximize:', error);
      });
      return;
    }

    void appWindow.startDragging().catch((error) => {
      console.warn('[Titlebar] Failed to start dragging:', error);
    });
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(!isMenuOpen);
  };

  const handleNewFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    openFile({
      id: uuidv4(),
      name: t('common.untitled'),
      path: '',
      content: '',
      isDirty: true,
      language: 'plaintext',
    });
  };

  const handleNewWindow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    try {
      await invoke('create_window', {
        label: `window-${uuidv4()}`,
        title: t('editor.welcome'),
        url: 'index.html'
      });
    } catch (error) {
      console.error('Failed to create new window:', error);
      toast.error(t('titlebar.createWindowFailed'));
    }
  };

  const handleOpenFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    try {
      const selected = await open({
        multiple: false,
      });

      if (selected && typeof selected === 'string') {
        await openFileFromPath(selected, {
          id: uuidv4(),
          name: selected.split('/').pop() || t('common.untitled'),
          language: getLanguageFromPath(selected),
        });
      }
    } catch (error) {
      console.error('Failed to open file:', error);
      toast.error(t('common.fileOpenFailed'));
    }
  };

  const handleSaveFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    const activeFile = openedFiles.find(f => f.id === activeFileId);
    if (activeFile && activeFile.isDirty) {
      try {
        if (activeFile.path) {
          await writeFileContent(activeFile.path, activeFile.content);
          setFileDirty(activeFile.id, false);
          toast.success(t('common.fileSaved'));
          fetchGitStatuses();
        } else {
          // If it's a new untitled file, use Save As
          await handleSaveFileAs(e);
        }
      } catch (error) {
        console.error('Failed to save file:', error);
        toast.error(t('common.fileSaveFailed'));
      }
    }
  };

  const handleSaveFileAs = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    const activeFile = openedFiles.find(f => f.id === activeFileId);
    if (activeFile) {
      try {
        const newPath = await saveFileAs(activeFile.content);
        if (newPath) {
          // Update the opened file with new path and name
          openFile({
            id: activeFile.id, // Keep same ID
            path: newPath,
            name: newPath.split('/').pop() || t('common.untitled'),
            content: activeFile.content,
            isDirty: false,
            language: getLanguageFromPath(newPath),
          });
          setFileDirty(activeFile.id, false);
          toast.success(t('common.fileSaved'));
          fetchGitStatuses();
        }
      } catch (error) {
        console.error('Failed to save file as:', error);
        toast.error(t('common.fileSaveFailed'));
      }
    }
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'vs-dark' ? 'light' : 'vs-dark');
  };

  const getLanguageFromPath = (path: string): string => {
    return detectLanguageFromPath(path);
  };

  // v0.3.0: 工作区管理处理函数
  const handleAddFolderToWorkspace = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    try {
      const tree = await openDirectory();
      if (tree) {
        await addWorkspaceRoot(tree.path);
        invoke('init_rag_index', { rootPath: tree.path }).catch(err => console.warn('RAG init warning:', err));
        toast.success(t('titlebar.folderAdded', { name: tree.name }));
      }
    } catch (err) {
      console.error('[Titlebar] Failed to add folder:', err);
      toast.error(t('titlebar.folderAddFailed', { error: String(err) }));
    }
  };

  const handleSaveWorkspace = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    try {
      const savedPath = await saveWorkspaceConfig();
      toast.success(t('titlebar.workspaceSaved', { path: savedPath }));
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) return;
      console.error('[Titlebar] Failed to save workspace:', err);
      toast.error(t('titlebar.workspaceSaveFailed', { error: String(err) }));
    }
  };

  const handleOpenWorkspace = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    try {
      const result = await loadWorkspaceConfig();
      toast.success(t('titlebar.workspaceLoaded', { count: result.rootsCount }));
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) return;
      console.error('[Titlebar] Failed to open workspace:', err);
      toast.error(t('titlebar.workspaceOpenFailed', { error: String(err) }));
    }
  };

  return (
    <div
      className="app-titlebar theme-panel-muted theme-border grid h-[var(--titlebar-height)] grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center border-b px-3 text-[color:var(--text-primary)] select-none transition-colors"
      onMouseDown={handleTitlebarMouseDown}
    >
      <div
        className={clsx(
          'flex min-w-0 items-center gap-2',
          isMac && 'pl-[var(--traffic-lights-offset)]'
        )}
      >
        <div className="theme-text-muted mr-2 flex h-full shrink-0 items-center text-[12px] font-semibold tracking-[0.04em] uppercase">
          IfAI
        </div>

        <div className="relative" ref={menuRef}>
          <button className={menuButtonClass} onClick={handleMenuToggle} data-no-drag="true">
            {t('menu.file')} <ChevronDown size={14} className="ml-1" />
          </button>
          {isMenuOpen && (
            <div
              data-no-drag="true"
              className="theme-panel-elevated theme-border theme-shadow absolute top-full left-0 z-50 mt-1 w-56 rounded border py-1"
            >
              <div className={menuItemClass} onClick={handleNewFile}>
                {t('menu.newFile')}
              </div>
              <div className={menuItemClass} onClick={handleNewWindow}>
                {t('menu.newWindow')}
              </div>
              <div className={menuItemClass} onClick={handleOpenFile}>
                {t('menu.openFile')}
              </div>
              <div className={menuItemClass} onClick={handleSaveFile}>
                {t('menu.save')}
              </div>
              <div className={menuItemClass} onClick={handleSaveFileAs}>
                {t('menu.saveAs')}
              </div>
              <MenuSeparator />
              {/* v0.3.0: 工作区管理菜单 */}
              <div className={clsx(menuItemClass, 'whitespace-nowrap')} onClick={handleAddFolderToWorkspace}>
                {t('menu.addFolderToWorkspace')}
              </div>
              <div className={clsx(menuItemClass, 'whitespace-nowrap')} onClick={handleSaveWorkspace}>
                {t('menu.saveWorkspaceAs')}
              </div>
              <div className={clsx(menuItemClass, 'whitespace-nowrap')} onClick={handleOpenWorkspace}>
                {t('menu.openWorkspace')}
              </div>
            </div>
          )}
        </div>

        {/* v0.3.0: 帮助菜单 */}
        <HelpMenu className="ml-2" />
      </div>

      <div className="h-full min-w-6" aria-hidden="true" />

      <div className="justify-self-center flex items-center gap-2" data-no-drag="true">
        <GuiLayoutSwitcher />
      </div>

      <div className="h-full min-w-6" aria-hidden="true" />

      <div className="flex items-center justify-self-end space-x-2" data-no-drag="true">
        {guiMode !== 'conversation' && (
          <>
        <button
          className={clsx(
            'rounded-[var(--radius-sm)] p-1 transition-colors',
            isSidebarOpen
              ? 'theme-selection-accent'
              : iconButtonBaseClass
          )}
          data-no-drag="true"
          onClick={toggleSidebar}
          title={`${t('titlebar.toggleSidebar')} (${sidebarShortcut})`}
        >
          <Sidebar size={16} />
        </button>
        {/* v0.3.0: 代码分析面板按钮 */}
        <button
          className={clsx(
            'rounded-[var(--radius-sm)] p-1 transition-colors',
            isCodeAnalysisOpen
              ? 'theme-selection-accent'
              : iconButtonBaseClass
          )}
          data-no-drag="true"
          onClick={() => setCodeAnalysisOpen(!isCodeAnalysisOpen)}
          title={t('titlebar.codeAnalysis')}
        >
          <Shield size={16} />
        </button>
        <button
          className={clsx(
            'rounded-[var(--radius-sm)] p-1 transition-colors',
            isTerminalOpen
              ? 'theme-selection-accent'
              : iconButtonBaseClass
          )}
          data-no-drag="true"
          onClick={onToggleTerminal}
          title={`${t('terminal.title')} (${terminalShortcut})`}
        >
          <Terminal size={16} />
        </button>
        <button
          className={clsx(
            'rounded p-1 transition-colors',
            isChatOpen
              ? 'theme-selection-accent'
              : iconButtonBaseClass
          )}
          data-no-drag="true"
          onClick={onToggleChat}
          title={`${t('chat.title')} (${chatShortcut})`}
        >
          <MessageSquare size={16} />
        </button>
        <button className={iconButtonBaseClass} data-no-drag="true" onClick={handleThemeToggle} title={t('titlebar.toggleTheme')}>
          {theme === 'vs-dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        </>
        )}
        <button className={iconButtonBaseClass} data-no-drag="true" onClick={toggleSettings} title={t('chat.settings')}>
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
};
