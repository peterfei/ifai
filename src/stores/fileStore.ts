import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PersistenceManager } from '../services/storage/PersistenceManager';
import { 
 invoke } from '@tauri-apps/api/core';
import { v4 as uuidv4 } from 'uuid';
import { debounce } from 'lodash-es';
import { FileNode, OpenedFile, GitStatus, WorkspaceRoot } from './types';
import { readFileContent, readDirectory } from '../utils/fileSystem';
import { useProjectConfigStore } from './projectConfigStore';

interface FileState {
  // v0.3.0: 多工作区支持
  workspaceRoots: WorkspaceRoot[];
  activeRootId: string | null;

  // 向后兼容: 单目录模式 (deprecated)
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

  // v0.3.5 新增：全量文件路径索引 (用于 @ 引用)
  allFilePaths: string[];

  // v0.3.0: 多工作区操作
  addWorkspaceRoot: (path: string) => Promise<WorkspaceRoot>;
  removeWorkspaceRoot: (rootId: string) => void;
  setActiveRoot: (rootId: string) => void;
  getActiveRoot: () => WorkspaceRoot | null;
  refreshRoot: (rootId: string) => Promise<void>;
  getRootByPath: (path: string) => WorkspaceRoot | null;

  // v0.3.0: 工作区配置管理
  saveWorkspaceConfig: (filePath?: string) => Promise<string>;
  loadWorkspaceConfig: (filePath?: string) => Promise<{ rootsCount: number; activeRootId: string | null }>;

  // 向后兼容: 单目录操作
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
  isHydrating: boolean; // 🏆 PIVO 3.0: 异步加载状态
  // v0.2.6 新增：设置预览模式
  setPreviewMode: (mode: 'editor' | 'preview' | 'split') => void;
  togglePreviewMode: () => void;
}

// Helper to recursively update git status in file tree
// NOTE: This is now optimized - we don't traverse the tree since UI uses Map-based O(1) lookup

// v0.3.5: 递归展平文件树
const flattenPaths = (node: any, acc: string[] = []): string[] => {
  if (!node) return acc;
  if (node.kind === 'file') {
    acc.push(node.path);
  }
  if (node.children) {
    node.children.forEach((child: any) => flattenPaths(child, acc));
  }
  return acc;
};

const updateGitStatusRecursive = (node: FileNode, statuses: Map<string, GitStatus>): FileNode => {
    // Simply return the node as-is - UI will use gitStatuses Map for O(1) lookup
    // This avoids O(n) tree traversal on every git status update
    return node;
};

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      // v0.3.0: 多工作区支持
      workspaceRoots: [],
      activeRootId: null,

      // 向后兼容: 单目录模式
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
      allFilePaths: [],
      isHydrating: true, // 默认开启加载态

      syncState: (newState) => set((state) => ({ ...state, ...newState })),

      // ============================================================
      // v0.3.0: 多工作区操作
      // ============================================================

      /**
       * 添加工作区根目录
       */
      addWorkspaceRoot: async (path: string) => {
        // 检查路径是否已存在
        const existing = get().workspaceRoots.find(r => r.path === path);
        if (existing) {
          throw new Error(`Path already exists in workspace: ${path}`);
        }

        // 提取目录名
        const name = path.split('/').filter(Boolean).pop() || path;

        // 创建新的工作区根目录
        const root: WorkspaceRoot = {
          id: `root-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          path,
          name,
          fileTree: null,
          isActive: get().workspaceRoots.length === 0, // 第一个自动设为活动
          indexedAt: null,
        };

        // 读取文件树
        try {
          const children = await readDirectory(path);
          root.fileTree = {
            id: root.id,
            name,
            path,
            kind: 'directory',
            children
          };
          root.indexedAt = new Date();
        } catch (e) {
          console.warn(`Failed to read directory ${path}:`, e);
          // 即使读取失败也添加根目录（fileTree 为 null）
        }

        set((state) => {
          const newRoots = [...state.workspaceRoots, root];
          const isFirstRoot = newRoots.length === 1;
          // 🔥 FIX: 新添加的根目录自动成为活动根目录
          const newActiveId = root.id;

          // 更新所有根目录的 isActive 状态
          newRoots.forEach((r, i) => {
            r.isActive = (r.id === newActiveId);
          });

          return {
            workspaceRoots: newRoots,
            activeRootId: newActiveId,
            // 🔥 FIX: 同时更新 rootPath 和 fileTree，确保新添加的工作区立即生效
            rootPath: path,
            fileTree: root.fileTree,
          };
        });

        // 初始化 RAG 索引
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('init_rag_index', { rootPath: path });
        } catch (e) {
          console.warn('[Workspace] RAG initialization failed:', e);
        }

        // 加载项目配置
        try {
          await useProjectConfigStore.getState().loadConfig(path);
        } catch (e) {
          console.error('[Workspace] Failed to load config:', e);
        }

        return root;
      },

      /**
       * 移除工作区根目录
       */
      removeWorkspaceRoot: (rootId: string) => {
        set((state) => {
          const index = state.workspaceRoots.findIndex(r => r.id === rootId);
          if (index === -1) {
            throw new Error(`Workspace root not found: ${rootId}`);
          }

          const newRoots = state.workspaceRoots.filter(r => r.id !== rootId);
          let newActiveId = state.activeRootId;

          // 如果移除的是活动根目录，切换到另一个
          if (state.activeRootId === rootId) {
            newActiveId = newRoots.length > 0 ? newRoots[0].id : null;

            // 更新所有根目录的 isActive 状态
            newRoots.forEach((r, i) => {
              r.isActive = (i === 0);
            });
          }

          return {
            workspaceRoots: newRoots,
            activeRootId: newActiveId,
          };
        });
      },

      /**
       * 设置活动根目录
       */
      setActiveRoot: (rootId: string) => {
        set((state) => {
          const root = state.workspaceRoots.find(r => r.id === rootId);
          if (!root) {
            throw new Error(`Workspace root not found: ${rootId}`);
          }

          // 更新所有根目录的 isActive 状态
          const updatedRoots = state.workspaceRoots.map(r => ({
            ...r,
            isActive: r.id === rootId
          }));

          return {
            activeRootId: rootId,
            workspaceRoots: updatedRoots,
            // v0.3.0: 同时更新全局 fileTree 为活动根目录的 fileTree
            fileTree: root.fileTree,
            rootPath: root.path,
          };
        });
      },

      /**
       * 获取当前活动根目录
       */
      getActiveRoot: () => {
        const { activeRootId, workspaceRoots } = get();
        if (!activeRootId) return null;
        return workspaceRoots.find(r => r.id === activeRootId) || null;
      },

      /**
       * 刷新根目录的文件树
       */
      refreshRoot: async (rootId: string) => {
        const root = get().workspaceRoots.find(r => r.id === rootId);
        if (!root) {
          throw new Error(`Workspace root not found: ${rootId}`);
        }

        try {
          const children = await readDirectory(root.path);
          const newTree: FileNode = {
            id: root.id,
            name: root.name,
            path: root.path,
            kind: 'directory',
            children
          };

          set((state) => ({
            workspaceRoots: state.workspaceRoots.map(r =>
              r.id === rootId ? { ...r, fileTree: newTree, indexedAt: new Date() } : r
            ),
          }));
        } catch (e) {
          console.error(`Failed to refresh root ${rootId}:`, e);
          throw e;
        }
      },

      /**
       * 根据路径查找根目录
       */
      getRootByPath: (path: string) => {
        return get().workspaceRoots.find(r => r.path === path) || null;
      },

      // ============================================================
      // v0.3.0: 工作区配置管理
      // ============================================================

      /**
       * 保存工作区配置到文件
       * @param filePath 保存路径（可选，默认弹出保存对话框）
       */
      saveWorkspaceConfig: async (filePath?: string) => {
        const { workspaceRoots, activeRootId, expandedNodes } = get();

        // 导入 saveWorkspaceFile 函数
        const { saveWorkspaceFile } = await import('../utils/workspaceConfig');

        // 使用第一个根目录的名称作为工作区名称
        const workspaceName = workspaceRoots.length > 0
          ? workspaceRoots[0].name
          : 'My Workspace';

        // 转换为配置格式
        const config = {
          version: '1.0.0',
          name: workspaceName,
          description: `Workspace with ${workspaceRoots.length} folder(s)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          roots: workspaceRoots.map(root => ({
            path: root.path,
            name: root.name,
            index: {
              enabled: true,
              lastIndexedAt: root.indexedAt
                ? typeof root.indexedAt === 'string'
                  ? root.indexedAt
                  : root.indexedAt.toISOString()
                : undefined
            }
          })),
          settings: {
            activeRootId,
            expandedPaths: Array.from(expandedNodes)
          }
        };

        const savedPath = await saveWorkspaceFile(config, filePath);
        console.log('[FileStore] Workspace config saved to:', savedPath);
        return savedPath;
      },

      /**
       * 从文件加载工作区配置
       * @param filePath 配置文件路径（可选，默认弹出打开对话框）
       */
      loadWorkspaceConfig: async (filePath?: string) => {
        // 导入 loadWorkspaceFile 函数
        const { loadWorkspaceFile } = await import('../utils/workspaceConfig');

        const config = await loadWorkspaceFile(filePath);
        console.log('[FileStore] Loading workspace config:', config);

        // 清除现有工作区
        set({
          workspaceRoots: [],
          activeRootId: null,
          fileTree: null,
          rootPath: null,
        });

        // 加载每个根目录
        const loadedRoots: WorkspaceRoot[] = [];
        let newActiveRootId: string | null = null;

        for (const rootConfig of config.roots) {
          try {
            // 读取目录内容
            const { readDirectory } = await import('../utils/fileSystem');
            const children = await readDirectory(rootConfig.path);

            const root: WorkspaceRoot = {
              id: `root-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              path: rootConfig.path,
              name: rootConfig.name || rootConfig.path.split('/').filter(Boolean).pop() || 'Project',
              fileTree: {
                id: `root-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: rootConfig.name || rootConfig.path.split('/').filter(Boolean).pop() || 'Project',
                path: rootConfig.path,
                kind: 'directory',
                children
              },
              isActive: false,
              indexedAt: rootConfig.index?.lastIndexedAt ? new Date(rootConfig.index.lastIndexedAt) : new Date(),
            };

            loadedRoots.push(root);
          } catch (e) {
            console.error(`[FileStore] Failed to load root: ${rootConfig.path}`, e);
          }
        }

        // 设置活动根目录
        if (config.settings?.activeRootId) {
          // 尝试匹配原有的 activeRootId
          const matchedRoot = loadedRoots.find(r => r.path === config.settings.activeRootId);
          if (matchedRoot) {
            newActiveRootId = matchedRoot.id;
            loadedRoots.forEach(r => r.isActive = (r.id === newActiveRootId));
          } else {
            // 如果匹配失败，使用第一个根目录
            if (loadedRoots.length > 0) {
              newActiveRootId = loadedRoots[0].id;
              loadedRoots[0].isActive = true;
            }
          }
        } else if (loadedRoots.length > 0) {
          // 如果没有指定活动根目录，使用第一个
          newActiveRootId = loadedRoots[0].id;
          loadedRoots[0].isActive = true;
        }

        // 更新状态
        set({
          workspaceRoots: loadedRoots,
          activeRootId: newActiveRootId,
          fileTree: loadedRoots.find(r => r.id === newActiveRootId)?.fileTree || null,
          rootPath: loadedRoots.find(r => r.id === newActiveRootId)?.path || null,
        });

        // 恢复展开的节点
        if (config.settings?.expandedPaths) {
          set({ expandedNodes: new Set(config.settings.expandedPaths) });
        }

        console.log('[FileStore] Workspace config loaded successfully');
        return { rootsCount: loadedRoots.length, activeRootId: newActiveRootId };
      },

      // ============================================================
      // 向后兼容: 单目录操作
      // ============================================================

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

        set((state) => {
          const newState = {
            fileTree: treeWithStatus,
            rootPath: newRootPath,
          };

          // v0.3.0: 向后兼容 - 同步更新 workspaceRoots
          if (treeWithStatus && newRootPath) {
            // 检查是否已存在该路径的工作区根目录
            const existingRoot = state.workspaceRoots.find(r => r.path === newRootPath);

            if (!existingRoot) {
              // 不存在则创建新的工作区根目录
              const name = newRootPath.split('/').filter(Boolean).pop() || 'Project';
              const root: WorkspaceRoot = {
                id: `root-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                path: newRootPath,
                name,
                fileTree: treeWithStatus,
                isActive: true,
                indexedAt: new Date(),
              };

              // 如果有其他根目录，将它们的 isActive 设为 false
              const updatedRoots = state.workspaceRoots.map(r => ({ ...r, isActive: false }));

              return {
                ...newState,
                workspaceRoots: [...updatedRoots, root],
                activeRootId: root.id,
              };
            } else {
              // 已存在则更新该根目录的 fileTree
              const updatedRoots = state.workspaceRoots.map(r =>
                r.path === newRootPath
                  ? { ...r, fileTree: treeWithStatus, indexedAt: new Date() }
                  : r
              );

              return {
                ...newState,
                workspaceRoots: updatedRoots,
              };
            }
          }

          return newState;
        });

        // Load project config asynchronously (don't block or fail on error)
        if (newRootPath) {
          // 🔥 v0.3.7 新增：物理级 PIVO 资产检查与补全 (针对打包后分发)
          invoke('pivo_init_assets', { projectRoot: newRootPath })
            .catch(e => console.error('[PIVO] Asset init failed:', e));

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

        // 🔥 处理沉浸式审批预览联动
        if (file.previewDiff) {
          import('./editorStore').then(({ useEditorStore }) => {
            useEditorStore.getState().setApprovalPreview({
              isVisible: true,
              filePath: file.path,
              oldContent: file.previewDiff!.oldContent,
              newContent: file.previewDiff!.newContent,
              toolCallId: file.previewDiff!.toolCallId
            });
          });
        } else {
          // 如果不是预览模式，确保关闭之前的预览（或者由 UI 决定）
          import('./editorStore').then(({ useEditorStore }) => {
            if (useEditorStore.getState().approvalPreview.isVisible) {
              useEditorStore.getState().closeApprovalPreview();
            }
          });
        }

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

          // v0.3.0: 确保不会添加重复路径的文件
          const hasDuplicatePath = state.openedFiles.some(f => f.path === file.path);
          if (hasDuplicatePath) {
            console.warn('[fileStore] Attempted to add duplicate file path:', file.path);
            // 使用已存在文件的 ID
            const existingFile = state.openedFiles.find(f => f.path === file.path);
            fileIdToActivate = existingFile!.id;
            return { openedFiles: state.openedFiles, activeFileId: fileIdToActivate };
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

                // Update file tree and allFilePaths index atomically
                const allPaths = flattenPaths(treeWithStatus);
                if (typeof window !== "undefined") { (window as any).__IFAI_ALL_FILES__ = allPaths; }
                set({ fileTree: treeWithStatus, expandedNodes: newExpandedNodes, allFilePaths: allPaths });

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
        // v0.3.0: 多工作区支持
        workspaceRoots: state.workspaceRoots,
        activeRootId: state.activeRootId,
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
      storage: createJSONStorage(() => PersistenceManager.getInstance()),

      onRehydrateStorage: () => {
        console.log('[FileStore] ⏳ Starting hydration...');
        return (state, error) => {
          if (error) {
            console.error('[FileStore] ❌ Hydration failed:', error);
          }
          
          if (state) {
            state.syncState({ isHydrating: false });
            console.log('[FileStore] ✅ Hydration complete');

            // 🔥 临时:清空旧缓存以强制重新持久化新字段
            // 检测旧缓存:没有 selectedNodeIds 字段
            if (!(state as any).selectedNodeIds && state.openedFiles.length > 0) {
              if (!sessionStorage.getItem('file-storage-cleared')) {
                console.warn('[FileStore] Old cache detected, clearing localStorage');
                localStorage.removeItem('file-storage');
                sessionStorage.setItem('file-storage-cleared', 'true');
                location.reload();
                return;
              } else {
                sessionStorage.removeItem('file-storage-cleared');
              }
            } else {
              sessionStorage.removeItem('file-storage-cleared');
            }

            // 🔥 修复编辑器持久化:优先使用持久化的内容
            if (Array.isArray((state as any).expandedPaths)) {
              (state as any).pendingExpandedPaths = new Set((state as any).expandedPaths);
              delete (state as any).expandedPaths;
            }

            state.openedFiles.forEach(file => {
              const hasPersistedContent = (file as any)._hasPersistedContent;
              if (!hasPersistedContent && file.path && !file.isDirty) {
                state.reloadFileContent(file.id);
              }
              delete (file as any)._hasPersistedContent;
            });

            // 🔥 修复文件选中状态:同步 activeFileId 到 layoutStore
            if (state.activeFileId) {
              setTimeout(() => {
                import('./layoutStore').then(({ useLayoutStore }) => {
                  const layoutStore = useLayoutStore.getState();
                  const panes = layoutStore.panes;
                  if (panes.length > 0) {
                    const targetPaneId = layoutStore.activePaneId || panes[0].id;
                    const targetPane = panes.find(p => p.id === targetPaneId);
                    if (targetPane && !targetPane.fileId) {
                      layoutStore.assignFileToPane(targetPaneId, state.activeFileId!);
                    }
                  }
                }).catch(() => {});
              }, 100);
            }
          } else {
            setTimeout(() => {
              useFileStore.setState({ isHydrating: false });
              console.log('[FileStore] 🛡️ Hydration fallback release');
            }, 100);
          }
        };
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
