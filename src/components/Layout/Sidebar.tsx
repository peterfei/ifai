import React, { useEffect } from 'react';
import { FileTree } from '../FileTree/FileTree';
import { useFileStore } from '../../stores/fileStore';
import { openDirectory, readDirectory } from '../../utils/fileSystem';
import { FolderOpen, Files, Search as SearchIcon, Cpu, Lock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { SearchPanel } from '../Search/SearchPanel';
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
    // v0.2.6 新增：使用动态宽度
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
      }
    } catch (e) {
      console.error('[Sidebar] Error in handleOpenFolder:', e);
    }
  };

  return (
    <div className="flex h-full border-r border-gray-700 bg-gray-900 flex-shrink-0">
      {/* Activity Bar */}
      <div className="w-12 flex flex-col items-center py-2 border-r border-gray-700 bg-[#1e1e1e]">
        <button
          className={`p-2 mb-2 rounded ${sidebarActiveTab === 'explorer' && !isPromptManagerOpen ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
          onClick={() => {
            setSidebarActiveTab('explorer');
            if (isPromptManagerOpen) togglePromptManager();
          }}
          title={t('sidebar.explorer')}
        >
          <Files size={24} />
        </button>
        <button
          className={`p-2 mb-2 rounded ${sidebarActiveTab === 'search' && !isPromptManagerOpen ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
          onClick={() => {
            setSidebarActiveTab('search');
            if (isPromptManagerOpen) togglePromptManager();
          }}
          title={t('sidebar.search')}
        >
          <SearchIcon size={24} />
        </button>
        <div className="flex-1" />
        <button
          className={`p-2 mb-2 rounded ${isPromptManagerOpen ? 'text-blue-400 bg-blue-900/20' : 'text-gray-500 hover:text-gray-300'}`}
          onClick={() => togglePromptManager()}
          title={`${t('sidebar.prompts')}${!IS_COMMERCIAL ? ' (Community - Read Only)' : ''}`}
        >
          <div className="relative">
            <Cpu size={24} />
            {!IS_COMMERCIAL && (
              <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[#1e1e1e]">
                <Lock size={8} className="text-white" />
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Side Panel Content */}
      {!isPromptManagerOpen && (
        <div className="flex flex-col h-full bg-gray-900" style={{ width: `${sidebarWidth}px` }}>
          {sidebarActiveTab === 'explorer' ? (
            <>
              <div className="flex items-center justify-between p-2">
                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">{t('sidebar.explorer')}</span>
                <button
                  onClick={handleOpenFolder}
                  className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                  title={t('editor.openFolder')}
                >
                  <FolderOpen size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <FileTree />
              </div>
            </>
          ) : (
            <div className="flex flex-col h-full">
              <SearchPanel />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
