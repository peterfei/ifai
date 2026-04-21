import React, { useEffect } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { FileTree } from '../FileTree/FileTree';
import { useFileStore } from '../../stores/fileStore';
import { openDirectory, readDirectory } from '../../utils/fileSystem';
import { FolderOpen, Files, Search as SearchIcon, Cpu, Lock, Code2, ListChecks, Wrench, Puzzle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { SearchPanel } from '../Search/SearchPanel';
import { SnippetManager } from '../SnippetManager/SnippetManager';
import { TaskMonitor } from '../TaskMonitor/TaskMonitor';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useLayoutStore } from '../../stores/layoutStore';
import { IS_COMMERCIAL } from '../../config/edition';
import { FileNode } from '../../stores/types';

export const Sidebar = () => {
  const { t } = useTranslation();
  const { setFileTree, rootPath, fileTree, setExpandedNodes } = useFileStore();
  const {
    sidebarActiveTab,
    setSidebarActiveTab,
    isPromptManagerOpen,
    togglePromptManager,
    isToolExplorerOpen,
    toggleToolExplorer,
    isSkillsPanelOpen,
    toggleSkillsPanel,
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
    <div className="flex h-full border-r border-gray-700 bg-gray-900 flex-shrink-0 relative">
      {/* Activity Bar - Industrial Floating Capsule Design */}
      <div className="w-[64px] flex flex-col items-center py-4 bg-transparent relative z-20">
        <div 
          data-testid="activity-bar-capsule"
          className="absolute inset-y-4 left-2 right-2 rounded-full bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 shadow-2xl flex flex-col items-center py-4 gap-4"
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
                  isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
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
                    className="absolute inset-0 bg-blue-600/20 rounded-full border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
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
              isToolExplorerOpen ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
            )}
            onClick={() => toggleToolExplorer()}
            title={String(t('sidebar.tools') || 'Tools')}
          >
            <Wrench size={20} className="relative z-10" />
            {isToolExplorerOpen && (
              <motion.div
                layoutId="activity-active-pill"
                data-testid="activity-active-pill"
                className="absolute inset-0 bg-blue-600/20 rounded-full border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>

          {/* Skills Icon */}
          <button
            data-testid="skills-panel-button"
            className={clsx(
              "relative p-2.5 rounded-full transition-all duration-300 group active:scale-90",
              isSkillsPanelOpen ? "text-purple-400" : "text-gray-500 hover:text-gray-300"
            )}
            onClick={() => {
              toggleSkillsPanel();
              if (isPromptManagerOpen) togglePromptManager();
              if (isToolExplorerOpen) toggleToolExplorer();
            }}
            title="技能"
          >
            <Puzzle size={20} className="relative z-10" />
            {isSkillsPanelOpen && (
              <motion.div
                layoutId="activity-active-pill"
                data-testid="activity-active-pill"
                className="absolute inset-0 bg-purple-600/20 rounded-full border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>

          {/* Prompts / Settings Icon */}
          <button
            data-testid="prompt-manager-button"
            className={clsx(
              "relative p-2.5 rounded-full transition-all duration-300 group active:scale-90",
              isPromptManagerOpen ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
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
                <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[#1e1e1e]">
                  <Lock size={6} className="text-white" />
                </div>
              )}
            </div>
            {isPromptManagerOpen && (
              <motion.div
                layoutId="activity-active-pill"
                data-testid="activity-active-pill"
                className="absolute inset-0 bg-blue-600/20 rounded-full border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Side Panel Content */}
      {!isPromptManagerOpen && !isSkillsPanelOpen && !isToolExplorerOpen && (
        <div className="flex flex-col h-full bg-gray-900 border-l border-white/5" style={{ width: `${sidebarWidth}px` }}>
          {sidebarActiveTab === 'explorer' ? (
            <React.Fragment>
              <div className="flex items-center justify-between px-4 h-9 border-b border-white/5 bg-gray-900/40 backdrop-blur-md" data-testid="sidebar-panel-header">
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.1em]">{String(t('sidebar.explorer'))}</span>
                <button
                  onClick={handleOpenFolder}
                  className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
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
