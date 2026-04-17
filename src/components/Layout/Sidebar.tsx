import React, { useEffect } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { FileTree } from '../FileTree/FileTree';
import { useFileStore } from '../../stores/fileStore';
import { openDirectory, readDirectory } from '../../utils/fileSystem';
import { FolderOpen, Files, Search as SearchIcon, Cpu, Lock, Code2, ListChecks, Wrench } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { SearchPanel } from '../Search/SearchPanel';
import { SnippetManager } from '../SnippetManager/SnippetManager';
import { TaskMonitor } from '../TaskMonitor/TaskMonitor';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useLayoutStore } from '../../stores/layoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { IS_COMMERCIAL } from '../../config/edition';
import { FileNode } from '../../stores/types';
import { isDarkTheme } from '../../utils/theme';

export const Sidebar = () => {
  const { t } = useTranslation();
  const { setFileTree, rootPath, fileTree, setExpandedNodes } = useFileStore();
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  const {
    sidebarActiveTab,
    setSidebarActiveTab,
    isPromptManagerOpen,
    togglePromptManager,
    isToolExplorerOpen,
    toggleToolExplorer,
    sidebarWidth,
  } = useLayoutStore();

  useEffect(() => {
    // Restore file tree from rootPath if exists
    if (rootPath && !fileTree) {
      const loadRoot = async () => {
        try {
          const name = rootPath.split('/').pop() || 'Project';
          const children = await readDirectory(rootPath);
          const newTree = {
            id: uuidv4(),
            name,
            path: rootPath,
            kind: 'directory' as const,
            children
          };
          setFileTree(newTree);

          // 恢复展开状态
          const state = useFileStore.getState() as any;
          if (state.pendingExpandedPaths) {
            const newExpandedNodes = new Set<string>();
            const restoreExpandedNodes = (node: FileNode) => {
              if (state.pendingExpandedPaths.has(node.path) && node.kind === 'directory') {
                newExpandedNodes.add(node.id);
              }
              if (node.children) {
                node.children.forEach(restoreExpandedNodes);
              }
            };
            restoreExpandedNodes(newTree);
            setExpandedNodes(newExpandedNodes);
            delete state.pendingExpandedPaths;
          }

          // Init RAG
          invoke('init_rag_index', { rootPath }).catch(e => console.warn('RAG init warning:', e));

          // 初始化 Demo Proposal
          invoke('init_demo_proposal', { rootPath }).then(async (initialized) => {
            if (initialized) {
              const { useProposalStore } = await import('../../stores/proposalStore');
              await useProposalStore.getState().refreshIndex();
            }
          }).catch(e => console.warn('[Sidebar] Failed to initialize demo proposal:', e));
        } catch (e) {
          console.error("Failed to restore project:", e);
        }
      };
      loadRoot();
    }
  }, [rootPath, fileTree, setFileTree, setExpandedNodes]);

  const handleOpenFolder = async () => {
    try {
      const tree = await openDirectory();
      if (tree) {
        setFileTree(tree);
        invoke('init_rag_index', { rootPath: tree.path }).catch(e => console.warn('RAG init warning:', e));
        try {
          const initialized = await invoke('init_demo_proposal', { rootPath: tree.path });
          if (initialized) {
            const { useProposalStore } = await import('../../stores/proposalStore');
            await useProposalStore.getState().refreshIndex();
          }
        } catch (e) {
          console.warn('[Sidebar] Failed to initialize demo proposal:', e);
        }
      }
    } catch (e) {
      console.error('[Sidebar] Error in handleOpenFolder:', e);
    }
  };

  return (
    <div className={clsx(
      'theme-panel-muted theme-border relative flex h-full flex-shrink-0 border-r transition-colors'
    )}>
      {/* Activity Bar - Industrial Floating Capsule Design */}
      <div className="w-[64px] flex flex-col items-center py-4 bg-transparent relative z-20">
        <div 
          data-testid="activity-bar-capsule"
          className={clsx(
            'theme-glass theme-border theme-shadow absolute inset-y-4 left-2 right-2 flex flex-col items-center gap-4 rounded-full border py-4 backdrop-blur-xl'
          )}
        >
          {[
            { id: 'explorer', icon: Files, title: t('sidebar.explorer') },
            { id: 'search', icon: SearchIcon, title: t('sidebar.search') },
            { id: 'snippets', icon: Code2, title: t('sidebar.snippets') },
            { id: 'tasks', icon: ListChecks, title: t('sidebar.tasks') }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = sidebarActiveTab === tab.id && !isPromptManagerOpen;
            return (
              <button
                key={tab.id}
                className={clsx(
                  "relative p-2.5 rounded-full transition-all duration-300 group active:scale-90",
                  isActive
                    ? 'text-[var(--accent-color)]'
                    : 'theme-text-subtle hover:text-[var(--text-primary)]'
                )}
                onClick={() => {
                  setSidebarActiveTab(tab.id as any);
                  if (isPromptManagerOpen) togglePromptManager();
                }}
                title={String(tab.title)}
              >
                <Icon size={20} className="relative z-10" />
                {isActive && (
                  <motion.div
                    layoutId="activity-active-pill"
                    data-testid="activity-active-pill"
                    className="absolute inset-0 rounded-full border border-blue-500/25 bg-[var(--selected-bg)] shadow-[0_0_15px_rgba(37,99,235,0.18)]"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Tool Explorer Icon */}
          <button
            data-testid="tool-explorer-button"
            className={clsx(
              "relative p-2.5 rounded-full transition-all duration-300 group active:scale-90",
              isToolExplorerOpen
                ? 'text-[var(--accent-color)]'
                : 'theme-text-subtle hover:text-[var(--text-primary)]'
            )}
            onClick={() => toggleToolExplorer()}
            title={String(t('sidebar.tools') || 'Tools')}
          >
            <Wrench size={20} className="relative z-10" />
            {isToolExplorerOpen && (
              <motion.div
                layoutId="activity-active-pill"
                data-testid="activity-active-pill"
                className="absolute inset-0 rounded-full border border-blue-500/25 bg-[var(--selected-bg)] shadow-[0_0_15px_rgba(37,99,235,0.18)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>

          {/* Prompts / Settings Icon */}
          <button
            data-testid="prompt-manager-button"
            className={clsx(
              "relative p-2.5 rounded-full transition-all duration-300 group active:scale-90",
              isPromptManagerOpen
                ? 'text-[var(--accent-color)]'
                : 'theme-text-subtle hover:text-[var(--text-primary)]'
            )}
            onClick={() => {
              togglePromptManager();
              if (isToolExplorerOpen) toggleToolExplorer();
            }}
            title={`${String(t('sidebar.prompts'))}${!IS_COMMERCIAL ? ' (Community - Read Only)' : ''}`}
          >
            <div className="relative z-10">
              <Cpu size={20} />
              {!IS_COMMERCIAL && (
                <div className="theme-border absolute -top-1 -right-1 rounded-full border bg-amber-500 p-0.5 shadow-sm">
                  <Lock size={6} className="text-[var(--bg-primary)]" />
                </div>
              )}
            </div>
            {isPromptManagerOpen && (
              <motion.div
                layoutId="activity-active-pill"
                data-testid="activity-active-pill"
                className="absolute inset-0 rounded-full border border-blue-500/25 bg-[var(--selected-bg)] shadow-[0_0_15px_rgba(37,99,235,0.18)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Side Panel Content */}
      {!isPromptManagerOpen && (
        <div
          className={clsx(
            'theme-panel theme-border flex h-full flex-col border-l transition-colors'
          )}
          style={{ width: `${sidebarWidth}px` }}
        >
          {sidebarActiveTab === 'explorer' ? (
            <React.Fragment>
              <div
                className={clsx(
                  'theme-glass theme-border flex h-9 items-center justify-between border-b px-4 backdrop-blur-md'
                )}
                data-testid="sidebar-panel-header"
              >
                <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-[0.1em]">{String(t('sidebar.explorer'))}</span>
                <button
                  onClick={handleOpenFolder}
                  className="theme-hoverable theme-text-subtle rounded-md p-1 transition-colors"
                  title={String(t('editor.openFolder'))}
                >
                  <FolderOpen size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <FileTree />
              </div>
            </React.Fragment>
          ) : sidebarActiveTab === 'search' ? (
            <div className="flex flex-col h-full">
              <SearchPanel />
            </div>
          ) : sidebarActiveTab === 'snippets' ? (
            <div className="flex flex-col h-full">
              <SnippetManager />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <TaskMonitor showSummary={true} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
