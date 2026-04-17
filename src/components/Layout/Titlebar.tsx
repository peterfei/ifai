import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Sun, Moon, MessageSquare, Terminal, Settings, Sidebar, Shield } from 'lucide-react';
import clsx from 'clsx';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCodeSmellStore } from '../../stores/codeSmellStore';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory, readFileContent, writeFileContent, saveFileAs } from '../../utils/fileSystem';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { detectLanguageFromPath } from '../../utils/languageDetection';
import { LayoutSwitcher } from './LayoutSwitcher';
import { HelpMenu } from '../Help/HelpMenu';
import { ModeSwitch } from './ModeSwitch';
import { isDarkTheme } from '../../utils/theme';

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
  const { openFile, activeFileId, openedFiles, updateFileContent, setFileDirty, fetchGitStatuses, addWorkspaceRoot, saveWorkspaceConfig, loadWorkspaceConfig } = useFileStore();
  const { toggleSettings, isSidebarOpen, toggleSidebar } = useLayoutStore();
  const theme = useSettingsStore(state => state.theme);
  const setTheme = useSettingsStore(state => state.setTheme);
  // v0.3.0: Code Smell Store
  const { isPanelOpen: isCodeAnalysisOpen, setPanelOpen: setCodeAnalysisOpen } = useCodeSmellStore();
  const dark = isDarkTheme(theme);
  const menuButtonClass = 'theme-button-ghost flex items-center rounded px-2 py-1 text-sm';
  const menuItemClass = 'theme-hoverable theme-text-muted cursor-pointer px-3 py-1.5 text-sm';
  const iconButtonBaseClass = 'theme-button-ghost rounded p-1';

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
        title: 'IfAI Editor',
        url: 'index.html'
      });
    } catch (error) {
      console.error('Failed to create new window:', error);
      toast.error('Failed to create new window');
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
        const content = await readFileContent(selected);
        openFile({
          id: uuidv4(),
          path: selected,
          name: selected.split('/').pop() || t('common.untitled'),
          content: content,
          isDirty: false,
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
        toast.success(`Added folder: ${tree.name}`);
      }
    } catch (err) {
      console.error('[Titlebar] Failed to add folder:', err);
      toast.error(`Failed to add folder: ${String(err)}`);
    }
  };

  const handleSaveWorkspace = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    try {
      const savedPath = await saveWorkspaceConfig();
      toast.success(`Workspace saved to: ${savedPath}`);
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) return;
      console.error('[Titlebar] Failed to save workspace:', err);
      toast.error(`Failed to save workspace: ${String(err)}`);
    }
  };

  const handleOpenWorkspace = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    try {
      const result = await loadWorkspaceConfig();
      toast.success(`Workspace loaded: ${result.rootsCount} folder(s)`);
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) return;
      console.error('[Titlebar] Failed to open workspace:', err);
      toast.error(`Failed to open workspace: ${String(err)}`);
    }
  };

  return (
    <div
      className="theme-panel-muted theme-border flex h-8 items-center justify-between border-b px-4 text-[color:var(--text-primary)] select-none transition-colors"
    >
      <div className="flex items-center">
        <div className="theme-text-muted mr-4 text-sm font-medium">IfAI Editor</div>

        <div className="relative" ref={menuRef}>
          <button className={menuButtonClass} onClick={handleMenuToggle}>
            {t('menu.file')} <ChevronDown size={14} className="ml-1" />
          </button>
          {isMenuOpen && (
            <div
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

      {/* 🚀 v0.5.0: 震撼人心的中央模式切换器 */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <ModeSwitch />
      </div>

      <div className="flex items-center space-x-2">
        <LayoutSwitcher />
        <button
          className={clsx(
            'rounded p-1 transition-colors',
            isSidebarOpen
              ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]'
              : iconButtonBaseClass
          )}
          onClick={toggleSidebar}
          title={t('titlebar.toggleSidebar') + ' (Cmd+B)'}
        >
          <Sidebar size={16} />
        </button>
        {/* v0.3.0: 代码分析面板按钮 */}
        <button
          className={clsx(
            'rounded p-1 transition-colors',
            isCodeAnalysisOpen
              ? 'bg-amber-500/15 text-amber-400'
              : iconButtonBaseClass
          )}
          onClick={() => setCodeAnalysisOpen(!isCodeAnalysisOpen)}
          title={t('titlebar.codeAnalysis')}
        >
          <Shield size={16} />
        </button>
        <button className={iconButtonBaseClass} onClick={toggleSettings} title={t('chat.settings')}>
          <Settings size={16} />
        </button>
        <button
          className={clsx(
            'rounded p-1 transition-colors',
            isTerminalOpen
              ? 'bg-green-500/15 text-green-400'
              : iconButtonBaseClass
          )}
          onClick={onToggleTerminal}
          title={t('terminal.title') + " (Cmd+J)"}
        >
          <Terminal size={16} />
        </button>
        <button
          className={clsx(
            'rounded p-1 transition-colors',
            isChatOpen
              ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]'
              : iconButtonBaseClass
          )}
          onClick={onToggleChat}
          title={t('chat.title') + " (Cmd+L)"}
        >
          <MessageSquare size={16} />
        </button>
        <button className={iconButtonBaseClass} onClick={handleThemeToggle} title={t('titlebar.toggleTheme')}>
          {theme === 'vs-dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
};
