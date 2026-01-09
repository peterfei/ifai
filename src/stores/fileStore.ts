import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { debounce } from 'lodash-es';
import { FileNode, OpenedFile, GitStatus } from './types';
import { readFileContent, readDirectory } from '../utils/fileSystem';
import { useProjectConfigStore } from './projectConfigStore';

interface FileState {
  fileTree: FileNode | null;
  rootPath: string | null;
  openedFiles: OpenedFile[];
  activeFileId: string | null;
  gitStatuses: Map<string, GitStatus>;
  expandedNodes: Set<string>;
  selectedNodeIds: string[];
  lastSelectedNodeId: string | null;
  // v0.2.6 新增：Markdown 预览模式
  previewMode: 'editor' | 'preview' | 'split';

  setFileTree: (tree: FileNode) => void;
  setRootPath: (path: string | null) => Promise<void>;
  openFile: (file: OpenedFile) => string;
  closeFile: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  setActiveFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  setFileDirty: (id: string, isDirty: boolean) => void;
  setGitStatuses: (statuses: Map<string, GitStatus>) => void;
  fetchGitStatuses: () => Promise<void>;
  reloadFileContent: (id: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  refreshFileTreeDebounced: () => void;
  refreshFileTreePreserveExpanded: (expandedNodes: Set<string>) => Promise<Set<string>>;
  toggleExpandedNode: (nodeId: string) => void;
  setExpandedNodes: (nodes: Set<string>) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setLastSelectedNodeId: (id: string | null) => void;
  syncState: (state: Partial<FileState>) => void;
  // v0.2.6 新增：设置预览模式
  setPreviewMode: (mode: 'editor' | 'preview' | 'split') => void;
  togglePreviewMode: () => void;
}

// Helper to recursively update git status in file tree
// NOTE: This is now optimized - we don't traverse the tree since UI uses Map-based O(1) lookup
const updateGitStatusRecursive = (node: FileNode, statuses: Map<string, GitStatus>): FileNode => {
    // Simply return the node as-is - UI will use gitStatuses Map for O(1) lookup
    // This avoids O(n) tree traversal on every git status update
    return node;
};

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      fileTree: null,
      rootPath: null,
      openedFiles: [],
      activeFileId: null,
      gitStatuses: new Map(),
      expandedNodes: new Set(),
      selectedNodeIds: [],
      lastSelectedNodeId: null,
      // v0.2.6 新增：默认预览模式
      previewMode: 'editor',

      syncState: (newState) => set((state) => ({ ...state, ...newState })),

      toggleExpandedNode: (nodeId: string) => set((state) => {
        const newExpanded = new Set(state.expandedNodes);
        if (newExpanded.has(nodeId)) {
          newExpanded.delete(nodeId);
        } else {
          newExpanded.add(nodeId);
        }
        return { expandedNodes: newExpanded };
      }),

      setExpandedNodes: (nodes: Set<string>) => set({ expandedNodes: nodes }),

      setSelectedNodeIds: (ids: string[]) => set({ selectedNodeIds: ids }),

      setLastSelectedNodeId: (id: string | null) => set({ lastSelectedNodeId: id }),

      setFileTree: (tree) => {
        const treeWithStatus = tree ? updateGitStatusRecursive(tree, get().gitStatuses) : null;
        const newRootPath = tree ? tree.path : null;

        set((state) => ({
          fileTree: treeWithStatus,
          rootPath: newRootPath,
        }));

        // Load project config asynchronously (don't block or fail on error)
        if (newRootPath) {
          useProjectConfigStore.getState().loadConfig(newRootPath)
            .then(() => console.log('[FileStore] Config loaded successfully'))
            .catch((e) => console.error('[FileStore] Failed to load config:', e));
        } else {
          useProjectConfigStore.getState().clearConfig();
        }

        // 🔥 修复文件选中状态:恢复展开的节点和选中的节点
        if (tree) {
          const state = get();

          // 恢复展开的节点
          if ((state as any).pendingExpandedPaths) {
            const expandedPaths = (state as any).pendingExpandedPaths as Set<string>;
            const newExpandedNodes = new Set<string>();
            const collectExpandedNodes = (node: FileNode) => {
              if (expandedPaths.has(node.path) && node.kind === 'directory') {
                newExpandedNodes.add(node.id);
              }
              if (node.children) {
                node.children.forEach(collectExpandedNodes);
              }
            };
            collectExpandedNodes(tree);
            set({ expandedNodes: newExpandedNodes });
            delete (state as any).pendingExpandedPaths;
            console.log(`[FileStore] Restored ${newExpandedNodes.size} expanded nodes`);
          }

          // 🔥 恢复选中的节点:根据 activeFileId 在文件树中查找并选中
          if (state.activeFileId) {
            const activeFile = state.openedFiles.find(f => f.id === state.activeFileId);
            if (activeFile && activeFile.path) {
              console.log(`[FileStore] 🔍 Looking for active file: ${activeFile.path}`);
              const newSelectedIds: string[] = [];

              const findAndSelectNode = (node: FileNode): boolean => {
                if (node.path === activeFile.path) {
                  newSelectedIds.push(node.id);
                  console.log(`[FileStore] ✅ Found active file node: ${node.path} -> ${node.id}`);
                  return true;
                }
                if (node.children) {
                  for (const child of node.children) {
                    if (findAndSelectNode(child)) {
                      return true;
                    }
                  }
                }
                return false;
              };
              findAndSelectNode(tree);

              if (newSelectedIds.length > 0) {
                set({
                  selectedNodeIds: newSelectedIds,
                  lastSelectedNodeId: newSelectedIds[0]
                });
                console.log(`[FileStore] ✅ Selected active file: ${newSelectedIds[0]}`);
              } else {
                console.warn(`[FileStore] ⚠️ Active file not found in tree: ${activeFile.path}`);
              }
            }
          }
        }
      },
      
      setRootPath: async (path) => {
        set({ rootPath: path });

        // Auto-initialize RAG index when project is opened
        if (path) {
          // Load project-level configuration
          try {
            await useProjectConfigStore.getState().loadConfig(path);
          } catch (e) {
            console.error('[FileStore] Failed to load project config:', e);
          }

          // Import settingsStore dynamically to avoid circular dependency
          const { useSettingsStore } = await import('./settingsStore');
          const settings = useSettingsStore.getState();

          if (settings.enableAutoRAG !== false) {
            // Delay 1 second to avoid blocking UI
            setTimeout(async () => {
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('init_rag_index', { rootPath: path });
              } catch (e) {
                console.warn('[RAG] Auto-initialization failed (manual /index may be needed):', e);
              }
            }, 1000);
          }
        } else {
          // Clear project config when project is closed
          useProjectConfigStore.getState().clearConfig();
        }
      },

      openFile: (file) => {
        let fileIdToActivate = file.id;

        set((state) => {
          const existing = state.openedFiles.find(f => f.path === file.path);

          if (existing) {
            fileIdToActivate = existing.id;
            const shouldUpdateContent = file.content !== undefined && (!existing.isDirty || !file.isDirty);

            const updatedFiles = state.openedFiles.map(f => {
              if (f.id === existing.id) {
                return {
                  ...f,
                  initialLine: file.initialLine,
                  language: file.language || f.language, // 更新语言类型
                  ...(shouldUpdateContent ? { content: file.content, isDirty: file.isDirty } : {})
                };
              }
              return f;
            });

            return { openedFiles: updatedFiles, activeFileId: fileIdToActivate };
          }

          // If not existing, add it
          const newFiles = [...state.openedFiles, file];
          return { openedFiles: newFiles, activeFileId: fileIdToActivate };
        });

        // 🔥 修复文件选中状态:在文件树中自动选中打开的文件
        const state = get();
        if (state.fileTree) {
          const findAndSelectNode = (node: FileNode): boolean => {
            if (node.path === file.path) {
              set({
                selectedNodeIds: [node.id],
                lastSelectedNodeId: node.id
              });
              return true;
            }
            if (node.children) {
              for (const child of node.children) {
                if (findAndSelectNode(child)) {
                  return true;
                }
              }
            }
            return false;
          };
          findAndSelectNode(state.fileTree);
        }

        return fileIdToActivate;
      },

      closeFile: (id) => set((state) => {
        const newFiles = state.openedFiles.filter(f => f.id !== id);
        let newActiveId = state.activeFileId;
        if (state.activeFileId === id) {
          newActiveId = newFiles.length > 0 ? newFiles[newFiles.length - 1].id : null;
        }
        return {
          openedFiles: newFiles,
          activeFileId: newActiveId,
        };
      }),

      closeOthers: (id) => set((state) => {
        const newFiles = state.openedFiles.filter(f => f.id === id);
        return {
          openedFiles: newFiles,
          activeFileId: id,
        };
      }),

      closeAll: () => set({
        openedFiles: [],
        activeFileId: null,
      }),

      setActiveFile: (id) => set({ activeFileId: id }),

      updateFileContent: (id, content) => set((state) => ({
        openedFiles: state.openedFiles.map(f => 
          f.id === id ? { ...f, content, isDirty: true } : f
        ),
      })),

      setFileDirty: (id, isDirty) => set((state) => ({
        openedFiles: state.openedFiles.map(f => 
          f.id === id ? { ...f, isDirty } : f
        ),
      })),

      setGitStatuses: (statuses) => set((state) => {
        const updatedTree = state.fileTree ? updateGitStatusRecursive(state.fileTree, statuses) : null;
        return { gitStatuses: statuses, fileTree: updatedTree };
      }),

      fetchGitStatuses: async () => {
        const { rootPath } = get();
        if (!rootPath) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const statuses = await invoke<Record<string, GitStatus>>('get_git_statuses', { repoPath: rootPath });
            const statusMap = new Map(Object.entries(statuses));
            get().setGitStatuses(statusMap);
        } catch (e) {
            console.error("Failed to fetch Git status:", e);
        }
      },

      reloadFileContent: async (id: string) => {
        const file = get().openedFiles.find(f => f.id === id);
        if (file && file.path && !file.isDirty) {
            try {
                const content = await readFileContent(file.path);
                set((state) => ({
                    openedFiles: state.openedFiles.map(f => 
                        f.id === id ? { ...f, content, isDirty: false } : f
                    ),
                }));
            } catch (e) {
                console.error(`Failed to reload file ${file.path}:`, e);
            }
        }
      },

      refreshFileTree: async () => {
        // Use refreshFileTreePreserveExpanded to maintain expanded state
        // This prevents file tree from collapsing when refreshing (e.g., after approving file write)
        const { expandedNodes } = get();
        await get().refreshFileTreePreserveExpanded(expandedNodes);
      },

      // Debounced version of refreshFileTree - useful for rapid successive refreshes
      refreshFileTreeDebounced: (() => {
        // Create debounced function that will be bound to store instance
        let debouncedFn: (() => void) | null = null;

        return () => {
          if (!debouncedFn) {
            // Initialize on first call with access to store
            debouncedFn = debounce(async () => {
              const { refreshFileTree } = get();
              await refreshFileTree();
            }, 300);
          }
          debouncedFn();
        };
      })(),

      // Refresh file tree while preserving expanded nodes
      refreshFileTreePreserveExpanded: async (expandedNodes: Set<string>) => {
        const { rootPath, gitStatuses } = get();
        if (rootPath) {
            try {
                // Collect paths of expanded directories BEFORE refreshing
                const expandedPaths = new Set<string>();
                const collectExpandedPaths = (node: FileNode) => {
                    if (expandedNodes.has(node.id) && node.kind === 'directory') {
                        expandedPaths.add(node.path);
                    }
                    if (node.children) {
                        node.children.forEach(collectExpandedPaths);
                    }
                };

                const { fileTree } = get();
                if (fileTree) {
                    collectExpandedPaths(fileTree);
                }

                // Refresh the tree
                const children = await readDirectory(rootPath);
                const rootName = rootPath.split('/').pop() || 'Project';
                const newTree: FileNode = {
                    id: uuidv4(),
                    name: rootName,
                    path: rootPath,
                    kind: 'directory',
                    children
                };
                const treeWithStatus = updateGitStatusRecursive(newTree, gitStatuses);

                // Restore expanded nodes by path matching
                const newExpandedNodes = new Set<string>();
                const restoreExpandedNodes = (node: FileNode) => {
                    if (expandedPaths.has(node.path) && node.kind === 'directory') {
                        newExpandedNodes.add(node.id);
                    }
                    if (node.children) {
                        node.children.forEach(restoreExpandedNodes);
                    }
                };
                restoreExpandedNodes(treeWithStatus);

                // Update both fileTree and expandedNodes atomically
                set({ fileTree: treeWithStatus, expandedNodes: newExpandedNodes });

                return expandedPaths;
            } catch (e) {
                console.error("Failed to refresh file tree:", e);
                return new Set();
            }
        }
        return new Set();
      },

      // v0.2.6 新增：设置预览模式
      setPreviewMode: (mode: 'editor' | 'preview' | 'split') => {
        set({ previewMode: mode });
      },

      // v0.2.6 新增：切换预览模式（循环切换：editor -> split -> preview -> editor）
      togglePreviewMode: () => {
        set((state) => {
          const modeCycle: Array<'editor' | 'preview' | 'split'> = ['editor', 'split', 'preview'];
          const currentIndex = modeCycle.indexOf(state.previewMode);
          const nextIndex = (currentIndex + 1) % modeCycle.length;
          return { previewMode: modeCycle[nextIndex] };
        });
      },
    }),
    {
      name: 'file-storage',
      version: 1,
      partialize: (state) => ({
        // 🔥 修复编辑器持久化:保留文件内容(限制100KB以内的小文件)
        openedFiles: state.openedFiles.map(f => {
          // 保留小文件内容用于持久化,避免重新加载时丢失
          const contentSize = f.content?.length || 0;
          const shouldKeepContent = contentSize > 0 && contentSize < 100000; // 100KB

          return {
            ...f,
            content: shouldKeepContent ? f.content : '',
            // 标记是否保存了内容
            _hasPersistedContent: shouldKeepContent,
          };
        }),
        activeFileId: state.activeFileId,
        rootPath: state.rootPath,
        // v0.2.6 新增：持久化预览模式
        previewMode: state.previewMode,
        // 🔥 修复文件选中状态:持久化选中的节点ID和最后选中的节点
        selectedNodeIds: state.selectedNodeIds,
        lastSelectedNodeId: state.lastSelectedNodeId,
        // 存储展开的路径而不是 ID，因为 ID 每次重新加载都会变化
        expandedPaths: Array.from(
          (() => {
            const paths = new Set<string>();
            const collectPaths = (node: FileNode) => {
              if (state.expandedNodes.has(node.id) && node.kind === 'directory') {
                paths.add(node.path);
              }
              if (node.children) {
                node.children.forEach(collectPaths);
              }
            };
            if (state.fileTree) {
              collectPaths(state.fileTree);
            }
            return paths;
          })()
        ),
      }),

      onRehydrateStorage: () => (state) => {
        // 🔥 临时:清空旧缓存以强制重新持久化新字段
        // 检测旧缓存:没有 selectedNodeIds 字段
        if (state && !(state as any).selectedNodeIds && state.openedFiles.length > 0) {
          // 检查是否已经清空过,避免无限刷新
          if (!sessionStorage.getItem('file-storage-cleared')) {
            console.warn('[FileStore] Old cache detected, clearing localStorage');
            localStorage.removeItem('file-storage');
            sessionStorage.setItem('file-storage-cleared', 'true');
            location.reload();
            return;
          } else {
            // 已经清空过但仍然是旧结构,清除标记继续运行
            sessionStorage.removeItem('file-storage-cleared');
          }
        } else {
          // 新缓存正常,清除标记
          sessionStorage.removeItem('file-storage-cleared');
        }

        // 🔥 修复编辑器持久化:优先使用持久化的内容,避免不必要的重新加载
        if (state) {
            // 将 expandedPaths 转换回临时的 expandedPaths 变量
            // 稍后在文件树加载完成后使用路径匹配恢复 expandedNodes
            if (Array.isArray((state as any).expandedPaths)) {
              (state as any).pendingExpandedPaths = new Set((state as any).expandedPaths);
              delete (state as any).expandedPaths;
            }

            // 只对没有持久化内容的文件尝试重新加载
            state.openedFiles.forEach(file => {
              const hasPersistedContent = (file as any)._hasPersistedContent;

              if (!hasPersistedContent && file.path && !file.isDirty) {
                // 只有干净的文件才重新加载(避免覆盖用户的未保存更改)
                state.reloadFileContent(file.id);
              } else if (hasPersistedContent) {
                console.log(`[FileStore] Restored content from persistence for: ${file.name}`);
              }
            });

            // 清理临时标记
            state.openedFiles.forEach(file => {
              delete (file as any)._hasPersistedContent;
            });

            // 🔥 修复文件选中状态:同步 activeFileId 到 layoutStore 的窗格
            if (state.activeFileId) {
              try {
                // 延迟执行以确保 layoutStore 已经初始化
                setTimeout(() => {
                  import('./layoutStore').then(({ useLayoutStore }) => {
                    const layoutStore = useLayoutStore.getState();
                    const panes = layoutStore.panes;

                    if (panes.length > 0) {
                      // 找到当前活动的窗格,如果没有则使用第一个窗格
                      const targetPaneId = layoutStore.activePaneId || panes[0].id;
                      const targetPane = panes.find(p => p.id === targetPaneId);

                      // 只有当窗格没有关联文件时才重新关联
                      if (targetPane && !targetPane.fileId) {
                        console.log(`[FileStore] Assigning active file ${state.activeFileId} to pane ${targetPaneId}`);
                        layoutStore.assignFileToPane(targetPaneId, state.activeFileId);
                      }
                    }
                  }).catch((e) => {
                    console.warn('[FileStore] Failed to import layoutStore:', e);
                  });
                }, 100);
              } catch (e) {
                console.warn('[FileStore] Failed to sync activeFileId to layoutStore:', e);
              }
            }
        }
      },
      migrate: (persistedState: any, version: number) => {
        console.log(`[FileStore] Migrating from version ${version} to 1`);
        return persistedState;
      },
    }
  )
);

// @ts-ignore
if (typeof window !== 'undefined') {
  (window as any).__fileStore = useFileStore;
}
