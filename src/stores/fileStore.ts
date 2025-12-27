import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { FileNode, OpenedFile, GitStatus } from './types';
import { readFileContent, readDirectory } from '../utils/fileSystem';

interface FileState {
  fileTree: FileNode | null;
  rootPath: string | null;
  openedFiles: OpenedFile[];
  activeFileId: string | null;
  gitStatuses: Map<string, GitStatus>;
  
  setFileTree: (tree: FileNode) => void;
  setRootPath: (path: string | null) => Promise<void>;
  openFile: (file: OpenedFile) => string;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  setFileDirty: (id: string, isDirty: boolean) => void;
  setGitStatuses: (statuses: Map<string, GitStatus>) => void;
  fetchGitStatuses: () => Promise<void>;
  reloadFileContent: (id: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  refreshFileTreePreserveExpanded: (expandedNodes: Set<string>) => Promise<Set<string>>;
  syncState: (state: Partial<FileState>) => void;
}

// Helper to recursively update git status in file tree
const updateGitStatusRecursive = (node: FileNode, statuses: Map<string, GitStatus>): FileNode => {
    const newNode = { ...node, gitStatus: statuses.get(node.path) };
    if (newNode.children) {
        newNode.children = newNode.children.map(child => updateGitStatusRecursive(child, statuses));
    }
    return newNode;
};

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      fileTree: null,
      rootPath: null,
      openedFiles: [],
      activeFileId: null,
      gitStatuses: new Map(),

      syncState: (newState) => set((state) => ({ ...state, ...newState })),

      setFileTree: (tree) => set((state) => {
        const treeWithStatus = tree ? updateGitStatusRecursive(tree, state.gitStatuses) : null;
        return { fileTree: treeWithStatus, rootPath: tree ? tree.path : null };
      }),
      
      setRootPath: async (path) => {
        set({ rootPath: path });

        // Auto-initialize RAG index when project is opened
        if (path) {
          // Import settingsStore dynamically to avoid circular dependency
          const { useSettingsStore } = await import('./settingsStore');
          const settings = useSettingsStore.getState();

          if (settings.enableAutoRAG !== false) {
            // Delay 1 second to avoid blocking UI
            setTimeout(async () => {
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('init_rag_index', { rootPath: path });
                console.log('[RAG] Auto-initialized for project:', path);
              } catch (e) {
                console.warn('[RAG] Auto-initialization failed (manual /index may be needed):', e);
              }
            }, 1000);
          }
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
        const { rootPath, gitStatuses } = get();
        if (rootPath) {
            try {
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
                set({ fileTree: treeWithStatus });
            } catch (e) {
                console.error("Failed to refresh file tree:", e);
            }
        }
      },

      // Refresh file tree while preserving expanded nodes
      refreshFileTreePreserveExpanded: async (expandedNodes: Set<string>) => {
        const { rootPath, gitStatuses } = get();
        if (rootPath) {
            try {
                // Collect paths of expanded directories
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
                set({ fileTree: treeWithStatus });

                // Return the expanded paths so caller can restore them
                return expandedPaths;
            } catch (e) {
                console.error("Failed to refresh file tree:", e);
                return new Set();
            }
        }
        return new Set();
      },
    }),
    {
      name: 'file-storage',
      partialize: (state) => ({
        openedFiles: state.openedFiles.map(f => ({ ...f, content: '' })),
        activeFileId: state.activeFileId,
        rootPath: state.rootPath
      }),
      onRehydrateStorage: () => (state) => {
        // Reload file contents after rehydration from localStorage
        if (state) {
            state.openedFiles.forEach(file => {
                if (file.path) {
                    state.reloadFileContent(file.id);
                }
            });
        }
      },
    }
  )
);
