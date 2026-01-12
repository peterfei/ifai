import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { ChevronRight, ChevronDown, File, Folder, FolderPlus, Layers } from 'lucide-react';
import { FileNode, GitStatus, WorkspaceRoot } from '../../stores/types';
import { readFileContent, readDirectory, openDirectory } from '../../utils/fileSystem';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from './ContextMenu';
import { VirtualFileTree, useVirtualization } from './VirtualFileTree';
import { detectLanguageFromPath } from '../../utils/languageDetection';

// v0.3.0: 根目录项组件
interface WorkspaceRootItemProps {
  root: WorkspaceRoot;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent, root: WorkspaceRoot) => void;
}

const WorkspaceRootItem: React.FC<WorkspaceRootItemProps> = ({ root, isActive, onClick, onContextMenu }) => {
  return (
    <div
      data-testid="workspace-root"
      data-active={isActive}
      data-root-id={root.id}
      className={`flex items-center py-2 px-3 cursor-pointer text-sm select-none transition-colors border-b border-gray-800 ${
        isActive ? 'bg-blue-600/20 text-white' : 'hover:bg-gray-800 text-gray-400'
      }`}
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, root)}
    >
      <Layers size={16} className="mr-2" />
      <span className="font-medium">{root.name}</span>
      <span className="ml-auto text-xs text-gray-600">{root.path}</span>
    </div>
  );
};

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode | null;
  root: WorkspaceRoot | null;  // v0.3.0: 支持根目录菜单
}

interface FileTreeItemProps {
    node: FileNode;
    level: number;
    onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
    onReload: () => void;
    selectedNodeIds: string[];
    onNodeSelect: (nodeId: string, ctrlKey: boolean, shiftKey: boolean) => void;
    onNodeActivate: (node: FileNode) => void;
    expandedNodes: Set<string>;
    onToggleExpand: (nodeId: string) => void;
    onChildrenLoaded?: () => void;
}

// Flatten tree to list for keyboard navigation
const flattenVisibleNodes = (node: FileNode, expandedNodes: Set<string>): FileNode[] => {
    const nodes: FileNode[] = [node];
    if (node.kind === 'directory' && expandedNodes.has(node.id) && node.children) {
        node.children.forEach(child => {
            nodes.push(...flattenVisibleNodes(child, expandedNodes));
        });
    }
    return nodes;
};

const FileTreeItem = ({ node, level, onContextMenu, onReload, selectedNodeIds, onNodeSelect, onNodeActivate, expandedNodes, onToggleExpand, onChildrenLoaded }: FileTreeItemProps) => {
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children);
  const [forceUpdate, setForceUpdate] = useState(0);
  const { openFile, gitStatuses } = useFileStore();
  const { activePaneId, assignFileToPane } = useLayoutStore();
  const itemRef = useRef<HTMLDivElement>(null);
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeIds.includes(node.id);

  const loadChildren = async () => {
    try {
        const loadedChildren = await readDirectory(node.path);
        setChildren(loadedChildren);
        node.children = loadedChildren;
        // Notify parent that children were loaded
        onChildrenLoaded?.();
    } catch (e) {
        console.error("Failed to load children", e);
        toast.error(`Failed to open ${node.name}: ${String(e)}`);
    }
  };

  // Sync children from node.children, using forceUpdate to trigger refresh
  useEffect(() => {
    if (node.children && node.children !== children) {
      setChildren(node.children);
    }
  }, [node.children, forceUpdate]);

  // Load children when directory is expanded and has no children yet
  useEffect(() => {
    if (isExpanded && node.kind === 'directory' && !children) {
      loadChildren();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  const handleClick = async (e: React.MouseEvent) => {
    onNodeSelect(node.id, e.ctrlKey || e.metaKey, e.shiftKey);
    if (node.kind === 'directory') {
      // Only toggle expansion if no modifier keys are pressed, 
      // or if it's a simple click (standard behavior)
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (!isExpanded) {
          if (!children) {
              await loadChildren();
          }
        }
        onToggleExpand(node.id);
      }
    } else {
      // Only activate file if no modifier keys are pressed
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        try {
          const content = await readFileContent(node.path);
          const openedId = openFile({
            id: node.id,
            path: node.path,
            name: node.name,
            content: content,
            isDirty: false,
            language: getLanguageFromPath(node.path)
          });

          if (activePaneId) {
              assignFileToPane(activePaneId, openedId);
          }
        } catch (e) {
          console.error("Failed to read file", e);
          toast.error(`Failed to read file: ${String(e)}`);
        }
      }
    }
  };

  // Auto-scroll to selected item
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  const getStatusColorClass = (path: string) => {
    const status = gitStatuses.get(path);
    switch (status) {
      case GitStatus.Added:
      case GitStatus.Untracked:
        return 'text-green-500';
      case GitStatus.Modified:
        return 'text-yellow-500';
      case GitStatus.Deleted:
      case GitStatus.Conflicted:
        return 'text-red-500';
      case GitStatus.Renamed:
      case GitStatus.TypeChange:
        return 'text-blue-400';
      case GitStatus.Ignored:
        return 'text-gray-500 opacity-50';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div>
      <div
        ref={itemRef}
        data-testid="file-tree-item"
        data-node-id={node.id}
        data-selected={isSelected}
        className={`flex items-center py-1 px-2 cursor-pointer text-sm select-none transition-colors ${
          isSelected ? 'bg-blue-600/30 text-white' : 'hover:bg-gray-800 text-gray-300'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="mr-1 text-gray-500">
          {node.kind === 'directory' && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          {node.kind === 'file' && <File size={14} />}
        </span>
        {node.kind === 'directory' && !isExpanded && <Folder size={14} className="mr-1" />}
        <span className={`truncate ${getStatusColorClass(node.path)}`}>{node.name}</span>
      </div>
      {isExpanded && children && (
        <div>
          {children.map(child => (
            <FileTreeItem
                key={child.id}
                node={child}
                level={level + 1}
                onContextMenu={onContextMenu}
                onReload={loadChildren}
                selectedNodeIds={selectedNodeIds}
                onNodeSelect={onNodeSelect}
                onNodeActivate={onNodeActivate}
                expandedNodes={expandedNodes}
                onToggleExpand={onToggleExpand}
                onChildrenLoaded={onChildrenLoaded}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// v0.2.6: 使用统一的语言检测工具
const getLanguageFromPath = (path: string): string => {
  return detectLanguageFromPath(path);
};

export const FileTree = () => {
  // v0.3.0: 多工作区支持
  const {
    fileTree,
    refreshFileTree,
    refreshFileTreePreserveExpanded,
    rootPath,
    setGitStatuses,
    gitStatuses,
    openFile,
    setFileTree,
    setRootPath,
    expandedNodes,
    toggleExpandedNode,
    setExpandedNodes,
    openedFiles,
    setActiveFile,
    selectedNodeIds,
    setSelectedNodeIds,
    lastSelectedNodeId,
    setLastSelectedNodeId,
    workspaceRoots,
    activeRootId,
    addWorkspaceRoot,
    removeWorkspaceRoot,
    setActiveRoot,
    refreshRoot,
  } = useFileStore();
  const { activePaneId, assignFileToPane } = useLayoutStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, node: null, root: null });
  const [nodesUpdateTrigger, setNodesUpdateTrigger] = useState(0);
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevExpandedNodesRef = useRef<Set<string>>(new Set());
  const cachedVisibleNodesRef = useRef<FileNode[]>([]);

  // Function to refresh file tree while preserving expanded state
  const handleRefreshPreserveExpanded = useCallback(async () => {
    const expandedPaths = await refreshFileTreePreserveExpanded(expandedNodes);

    // Wait for tree to update, then restore expanded nodes by path
    setTimeout(() => {
      const { fileTree: newTree } = useFileStore.getState();
      if (!newTree) return;

      const restoreExpandedNodes = (node: FileNode): Set<string> => {
        const restored = new Set<string>();

        const checkNode = (n: FileNode) => {
          if (expandedPaths.has(n.path) && n.kind === 'directory') {
            restored.add(n.id);
          }
          if (n.children) {
            n.children.forEach(checkNode);
          }
        };

        checkNode(node);
        return restored;
      };

      setExpandedNodes(restoreExpandedNodes(newTree));
    }, 50);
  }, [expandedNodes, refreshFileTreePreserveExpanded]);

  // Load Git Status when rootPath changes
  useEffect(() => {
    if (rootPath) {
        const fetchGitStatus = async () => {
            try {
                const statuses = await invoke<Record<string, GitStatus>>('get_git_statuses', { repoPath: rootPath });
                setGitStatuses(new Map(Object.entries(statuses)));
            } catch (e: any) {
                // 如果路径不存在或不是 Git 仓库，清空 rootPath
                if (e?.message?.includes('could not find repository') || e?.code === 'NotFound') {
                    console.warn(`Git repository not found at ${rootPath}, clearing rootPath`);
                    setRootPath(null);
                } else {
                    console.error("Failed to fetch Git status:", e);
                }
            }
        };
        fetchGitStatus();
    }
  }, [rootPath, setGitStatuses, setRootPath]);

  // Get flattened list of visible nodes for keyboard navigation
  // Optimized: cache flattened nodes and only recalculate when necessary
  const visibleNodes = useMemo(() => {
    if (!fileTree) {
      cachedVisibleNodesRef.current = [];
      return [];
    }

    // Check if expanded nodes actually changed (meaningful change detection)
    const prevExpanded = prevExpandedNodesRef.current;
    const expandedChanged =
      expandedNodes.size !== prevExpanded.size ||
      ![...expandedNodes].every(id => prevExpanded.has(id));

    // Only recalculate if expanded changed, children loaded, or tree changed
    if (expandedChanged || nodesUpdateTrigger > 0) {
      prevExpandedNodesRef.current = new Set(expandedNodes);
      const flattened = flattenVisibleNodes(fileTree, expandedNodes);
      cachedVisibleNodesRef.current = flattened;
      return flattened;
    }

    // Return cached result - avoids unnecessary recalculation
    return cachedVisibleNodesRef.current;
  }, [fileTree, expandedNodes, nodesUpdateTrigger]);

  // Find node by ID in the tree
  const findNodeById = useCallback((node: FileNode, id: string): FileNode | null => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const activateNode = async (node: FileNode) => {
    if (node.kind === 'directory') {
      toggleExpandedNode(node.id);
    } else {
      try {
        // Check if file is already open and not dirty
        const existingFile = openedFiles.find(f => f.path === node.path);
        if (existingFile && !existingFile.isDirty) {
          // File already open and clean, just activate it
          const fileId = existingFile.id;
          setActiveFile(fileId);
          if (activePaneId) {
            assignFileToPane(activePaneId, fileId);
          }
          return;
        }

        // File not open or dirty, need to read content
        const content = await readFileContent(node.path);
        const openedId = openFile({
          id: node.id,
          path: node.path,
          name: node.name,
          content: content,
          isDirty: false,
          language: getLanguageFromPath(node.path)
        });
        if (activePaneId) {
          assignFileToPane(activePaneId, openedId);
        }
      } catch (e) {
        console.error("Failed to read file", e);
        toast.error(`Failed to read file: ${String(e)}`);
      }
    }
  };

  const handleNodeSelect = useCallback((nodeId: string, ctrlKey: boolean, shiftKey: boolean) => {
    if (shiftKey && lastSelectedNodeId && visibleNodes.length > 0) {
      // Find indices of last and current selection in the flattened visible nodes
      const lastIndex = visibleNodes.findIndex(n => n.id === lastSelectedNodeId);
      const currentIndex = visibleNodes.findIndex(n => n.id === nodeId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = visibleNodes.slice(start, end + 1).map(n => n.id);
        
        // Combine with existing selection if Ctrl is also pressed
        if (ctrlKey) {
          setSelectedNodeIds(Array.from(new Set([...selectedNodeIds, ...rangeIds])));
        } else {
          setSelectedNodeIds(rangeIds);
        }
        setLastSelectedNodeId(nodeId);
        return;
      }
    }
    
    if (ctrlKey) {
      if (selectedNodeIds.includes(nodeId)) {
        setSelectedNodeIds(selectedNodeIds.filter(id => id !== nodeId));
        // Update lastSelected if we just deselected it
        if (lastSelectedNodeId === nodeId) {
          setLastSelectedNodeId(selectedNodeIds.length > 1 ? selectedNodeIds.find(id => id !== nodeId) || null : null);
        }
      } else {
        setSelectedNodeIds([...selectedNodeIds, nodeId]);
        setLastSelectedNodeId(nodeId);
      }
    } else {
      setSelectedNodeIds([nodeId]);
      setLastSelectedNodeId(nodeId);
    }
  }, [selectedNodeIds, lastSelectedNodeId, visibleNodes, setSelectedNodeIds, setLastSelectedNodeId]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if context menu is open or input/textarea is focused
      if (contextMenu.node) {
        return;
      }

      // Check if focus is in an editable element (Monaco Editor, textarea, input, etc.)
      const activeElement = document.activeElement;
      if (activeElement) {
        const isEditable =
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement.getAttribute('contenteditable') === 'true' ||
          activeElement.classList.contains('monaco-mouse-cursor-text') ||
          activeElement.closest('.monaco-editor') !== null;

        if (isEditable) {
          return; // Don't intercept keyboard events when editing
        }
      }

      if (!fileTree || visibleNodes.length === 0) return;

      const currentIndex = lastSelectedNodeId
        ? visibleNodes.findIndex(n => n.id === lastSelectedNodeId)
        : -1;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex + 1;
          if (nextIndex < visibleNodes.length) {
            const nextNode = visibleNodes[nextIndex];
            if (e.shiftKey) {
              handleNodeSelect(nextNode.id, false, true);
            } else {
              setSelectedNodeIds([nextNode.id]);
              setLastSelectedNodeId(nextNode.id);
            }
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex - 1;
          if (prevIndex >= 0) {
            const prevNode = visibleNodes[prevIndex];
            if (e.shiftKey) {
              handleNodeSelect(prevNode.id, false, true);
            } else {
              setSelectedNodeIds([prevNode.id]);
              setLastSelectedNodeId(prevNode.id);
            }
          } else if (lastSelectedNodeId === null && visibleNodes.length > 0) {
            // Select first item if nothing selected
            setSelectedNodeIds([visibleNodes[0].id]);
            setLastSelectedNodeId(visibleNodes[0].id);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (lastSelectedNodeId && currentIndex >= 0) {
            const currentNode = visibleNodes[currentIndex];
            if (currentNode.kind === 'directory') {
              if (!expandedNodes.has(currentNode.id)) {
                // Expand directory - FileTreeItem will auto-load children
                toggleExpandedNode(currentNode.id);
              } else if (currentNode.children && currentNode.children.length > 0) {
                // Move to first child if already expanded and has children
                setSelectedNodeIds([currentNode.children[0].id]);
                setLastSelectedNodeId(currentNode.children[0].id);
              }
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (lastSelectedNodeId && currentIndex >= 0) {
            const currentNode = visibleNodes[currentIndex];
            if (currentNode.kind === 'directory' && expandedNodes.has(currentNode.id)) {
              // Collapse directory
              toggleExpandedNode(currentNode.id);
            } else {
              // Move to parent
              const parentPath = currentNode.path.substring(0, currentNode.path.lastIndexOf('/'));
              const parentNode = visibleNodes.find(n => n.path === parentPath);
              if (parentNode) {
                setSelectedNodeIds([parentNode.id]);
                setLastSelectedNodeId(parentNode.id);
              }
            }
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (lastSelectedNodeId && currentIndex >= 0) {
            const currentNode = visibleNodes[currentIndex];
            activateNode(currentNode);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setSelectedNodeIds([]);
          setLastSelectedNodeId(null);
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fileTree, visibleNodes, lastSelectedNodeId, selectedNodeIds, expandedNodes, contextMenu, handleNodeSelect, setSelectedNodeIds, setLastSelectedNodeId]);

  const handleToggleExpand = useCallback((nodeId: string) => {
    toggleExpandedNode(nodeId);
  }, [toggleExpandedNode]);

  const handleChildrenLoaded = useCallback(() => {
    // Trigger re-calculation of visibleNodes when children are loaded
    setNodesUpdateTrigger(prev => prev + 1);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();

    // If the node is not already part of the selection, select only this node
    if (!selectedNodeIds.includes(node.id)) {
      setSelectedNodeIds([node.id]);
      setLastSelectedNodeId(node.id);
    }

    setContextMenu({ x: e.clientX, y: e.clientY, node, root: null });
  };

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ x: 0, y: 0, node: null, root: null });
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshFileTree();
  }, [refreshFileTree]);

  // Use the preserve-expanded version for context menu actions
  const handleRefreshForAction = useCallback(async () => {
    await handleRefreshPreserveExpanded();
  }, [handleRefreshPreserveExpanded]);

  // ============================================================
  // v0.3.0: 多工作区操作
  // ============================================================

  // 添加新目录到工作区
  const handleAddFolder = useCallback(async () => {
    try {
      const tree = await openDirectory();
      if (tree) {
        await addWorkspaceRoot(tree.path);
        invoke('init_rag_index', { rootPath: tree.path }).catch(e => console.warn('RAG init warning:', e));
        toast.success(`Added folder: ${tree.name}`);
      }
    } catch (e) {
      console.error('[FileTree] Failed to add folder:', e);
      toast.error(`Failed to add folder: ${String(e)}`);
    }
  }, [addWorkspaceRoot]);

  // 移除工作区根目录
  const handleRemoveFolder = useCallback(async (rootId: string) => {
    try {
      const root = workspaceRoots.find(r => r.id === rootId);
      if (root) {
        removeWorkspaceRoot(rootId);
        toast.success(`Removed folder: ${root.name}`);
      }
    } catch (e) {
      console.error('[FileTree] Failed to remove folder:', e);
      toast.error(`Failed to remove folder: ${String(e)}`);
    }
  }, [workspaceRoots, removeWorkspaceRoot]);

  // 点击根目录切换活动状态
  const handleRootClick = useCallback((rootId: string) => {
    try {
      setActiveRoot(rootId);
    } catch (e) {
      console.error('[FileTree] Failed to switch root:', e);
      toast.error(`Failed to switch folder: ${String(e)}`);
    }
  }, [setActiveRoot]);

  // 根目录右键菜单
  const handleRootContextMenu = useCallback((e: React.MouseEvent, root: WorkspaceRoot) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node: null, root });
  }, []);

  // Determine if virtualization should be used (for large trees)
  const shouldVirtualize = useVirtualization(visibleNodes.length, 500);

  // Helper function to compute node level from path
  const getLevelFromPath = (path: string, rootPath: string | null): number => {
    if (!rootPath) return 0;
    const relativePath = path.replace(new RegExp(`^${rootPath}/?`), '');
    return relativePath.split('/').length;
  };

  // Helper function to get status color (inline for virtual rendering)
  const getStatusColorClassInline = (path: string): string => {
    const status = gitStatuses.get(path);
    switch (status) {
      case GitStatus.Added:
      case GitStatus.Untracked:
        return 'text-green-500';
      case GitStatus.Modified:
        return 'text-yellow-500';
      case GitStatus.Deleted:
      case GitStatus.Conflicted:
        return 'text-red-500';
      case GitStatus.Renamed:
      case GitStatus.TypeChange:
        return 'text-blue-400';
      case GitStatus.Ignored:
        return 'text-gray-500 opacity-50';
      default:
        return 'text-gray-300';
    }
  };

  // v0.3.0: 判断是否有多工作区
  const hasMultiWorkspace = workspaceRoots.length > 0;

  if (!fileTree) return (
    <div className="p-4 text-gray-500 text-sm text-center flex flex-col items-center gap-4">
      <p className="text-gray-400">No folder open</p>
      <button
        onClick={async () => {
          try {
            const tree = await openDirectory();
            if (tree) {
              setFileTree(tree);
              invoke('init_rag_index', { rootPath: tree.path }).catch(e => console.warn('RAG init warning:', e));
            }
          } catch (e) {
            console.error('[FileTree] Failed to open directory:', e);
          }
        }}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2 transition-colors"
      >
        <Folder size={16} />
        <span>Open Folder</span>
      </button>
      <p className="text-xs text-gray-600">Or click the folder icon in the title bar above</p>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="h-full focus:outline-none flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
    >
      {/* v0.3.0: 多工作区根目录列表 */}
      {hasMultiWorkspace && (
        <div className="border-b border-gray-700">
          {workspaceRoots.map(root => (
            <WorkspaceRootItem
              key={root.id}
              root={root}
              isActive={root.id === activeRootId}
              onClick={() => handleRootClick(root.id)}
              onContextMenu={handleRootContextMenu}
            />
          ))}
          {/* Add Folder 按钮 */}
          <button
            data-testid="add-folder-btn"
            onClick={handleAddFolder}
            className="w-full flex items-center py-2 px-3 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors border-t border-gray-800"
          >
            <FolderPlus size={16} className="mr-2" />
            <span>Add Folder</span>
          </button>
        </div>
      )}

      {/* 文件树内容 */}
      <div className="flex-1 overflow-auto py-2">
        {shouldVirtualize ? (
          // Use virtual scrolling for large trees (>500 nodes)
          <VirtualFileTree
            visibleNodes={visibleNodes}
            renderNode={(node, index) => {
              const level = getLevelFromPath(node.path, rootPath);
              const isSelected = selectedNodeIds.includes(node.id);
              const isExpanded = expandedNodes.has(node.id);

              return (
                <div
                  key={node.id}
                  data-testid="file-tree-item"
                  data-node-id={node.id}
                  data-selected={isSelected}
                  className={`flex items-center py-1 px-2 cursor-pointer text-sm select-none transition-colors ${
                    isSelected ? 'bg-blue-600/30 text-white' : 'hover:bg-gray-800 text-gray-300'
                  }`}
                  style={{ paddingLeft: `${level * 12 + 8}px` }}
                  onClick={(e) => {
                    handleNodeSelect(node.id, e.ctrlKey || e.metaKey, e.shiftKey);
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                      activateNode(node);
                    }
                  }}
                  onContextMenu={(e) => handleContextMenu(e, node)}
                >
                  <span className="mr-1 text-gray-500">
                    {node.kind === 'directory' && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                    {node.kind === 'file' && <File size={14} />}
                  </span>
                  {node.kind === 'directory' && !isExpanded && <Folder size={14} className="mr-1" />}
                  <span className={`truncate ${getStatusColorClassInline(node.path)}`}>{node.name}</span>
                </div>
              );
            }}
          />
        ) : (
          // Use regular rendering for small trees
          <FileTreeItem
            node={fileTree}
            level={0}
            onContextMenu={handleContextMenu}
            onReload={() => {}}
            selectedNodeIds={selectedNodeIds}
            onNodeSelect={handleNodeSelect}
            onNodeActivate={activateNode}
            expandedNodes={expandedNodes}
            onToggleExpand={handleToggleExpand}
            onChildrenLoaded={handleChildrenLoaded}
          />
        )}
      </div>

      {/* 上下文菜单 */}
      {(contextMenu.node || contextMenu.root) && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          root={contextMenu.root}
          onClose={handleCloseContextMenu}
          onRefresh={handleRefreshForAction}
          onRemoveFolder={contextMenu.root ? () => handleRemoveFolder(contextMenu.root!.id) : undefined}
          rootPath={rootPath}
        />
      )}
    </div>
  );
};