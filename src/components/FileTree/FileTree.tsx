import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { FileNode, GitStatus } from '../../stores/types';
import { readFileContent, readDirectory, openDirectory } from '../../utils/fileSystem';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from './ContextMenu';
import { VirtualFileTree, useVirtualization } from './VirtualFileTree';

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode | null;
}

interface FileTreeItemProps {
    node: FileNode;
    level: number;
    onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
    onReload: () => void;
    selectedNodeId: string | null;
    onNodeSelect: (nodeId: string) => void;
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

const FileTreeItem = ({ node, level, onContextMenu, onReload, selectedNodeId, onNodeSelect, onNodeActivate, expandedNodes, onToggleExpand, onChildrenLoaded }: FileTreeItemProps) => {
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children);
  const [forceUpdate, setForceUpdate] = useState(0);
  const { openFile, gitStatuses } = useFileStore();
  const { activePaneId, assignFileToPane } = useLayoutStore();
  const itemRef = useRef<HTMLDivElement>(null);
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;

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

  const handleClick = async () => {
    onNodeSelect(node.id);
    if (node.kind === 'directory') {
      if (!isExpanded) {
        if (!children) {
            await loadChildren();
        }
      }
      onToggleExpand(node.id);
    } else {
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
                selectedNodeId={selectedNodeId}
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

const getLanguageFromPath = (path: string): string => {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
  if (path.endsWith('.rs')) return 'rust';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  return 'plaintext';
};

export const FileTree = () => {
  const { fileTree, refreshFileTree, refreshFileTreePreserveExpanded, rootPath, setGitStatuses, gitStatuses, openFile, setFileTree, expandedNodes, toggleExpandedNode, setExpandedNodes } = useFileStore();
  const { activePaneId, assignFileToPane } = useLayoutStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, node: null });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
            } catch (e) {
                console.error("Failed to fetch Git status:", e);
            }
        };
        fetchGitStatus();
    }
  }, [rootPath, setGitStatuses]);

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

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if context menu is open or input is focused
      if (contextMenu.node || document.activeElement instanceof HTMLInputElement) {
        return;
      }

      if (!fileTree || visibleNodes.length === 0) return;

      const currentIndex = selectedNodeId
        ? visibleNodes.findIndex(n => n.id === selectedNodeId)
        : -1;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex + 1;
          if (nextIndex < visibleNodes.length) {
            const nextNode = visibleNodes[nextIndex];
            setSelectedNodeId(nextNode.id);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex - 1;
          if (prevIndex >= 0) {
            const prevNode = visibleNodes[prevIndex];
            setSelectedNodeId(prevNode.id);
          } else if (selectedNodeId === null && visibleNodes.length > 0) {
            // Select first item if nothing selected
            setSelectedNodeId(visibleNodes[0].id);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (selectedNodeId && currentIndex >= 0) {
            const currentNode = visibleNodes[currentIndex];
            if (currentNode.kind === 'directory') {
              if (!expandedNodes.has(currentNode.id)) {
                // Expand directory - FileTreeItem will auto-load children
                toggleExpandedNode(currentNode.id);
              } else if (currentNode.children && currentNode.children.length > 0) {
                // Move to first child if already expanded and has children
                setSelectedNodeId(currentNode.children[0].id);
              }
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (selectedNodeId && currentIndex >= 0) {
            const currentNode = visibleNodes[currentIndex];
            if (currentNode.kind === 'directory' && expandedNodes.has(currentNode.id)) {
              // Collapse directory
              toggleExpandedNode(currentNode.id);
            } else {
              // Move to parent
              const parentPath = currentNode.path.substring(0, currentNode.path.lastIndexOf('/'));
              const parentNode = visibleNodes.find(n => n.path === parentPath);
              if (parentNode) {
                setSelectedNodeId(parentNode.id);
              }
            }
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (selectedNodeId && currentIndex >= 0) {
            const currentNode = visibleNodes[currentIndex];
            activateNode(currentNode);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setSelectedNodeId(null);
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fileTree, visibleNodes, selectedNodeId, expandedNodes, contextMenu]);

  const activateNode = async (node: FileNode) => {
    if (node.kind === 'directory') {
      toggleExpandedNode(node.id);
    } else {
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
  };

  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

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
    setSelectedNodeId(node.id);
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ x: 0, y: 0, node: null });
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshFileTree();
  }, [refreshFileTree]);

  // Use the preserve-expanded version for context menu actions
  const handleRefreshForAction = useCallback(async () => {
    await handleRefreshPreserveExpanded();
  }, [handleRefreshPreserveExpanded]);

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
      className="py-2 h-full focus:outline-none"
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
    >
      {shouldVirtualize ? (
        // Use virtual scrolling for large trees (>500 nodes)
        <VirtualFileTree
          visibleNodes={visibleNodes}
          renderNode={(node, index) => {
            const level = getLevelFromPath(node.path, rootPath);
            const isSelected = selectedNodeId === node.id;
            const isExpanded = expandedNodes.has(node.id);

            return (
              <div
                key={node.id}
                className={`flex items-center py-1 px-2 cursor-pointer text-sm select-none transition-colors ${
                  isSelected ? 'bg-blue-600/30 text-white' : 'hover:bg-gray-800 text-gray-300'
                }`}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={() => {
                  handleNodeSelect(node.id);
                  activateNode(node);
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
          selectedNodeId={selectedNodeId}
          onNodeSelect={handleNodeSelect}
          onNodeActivate={activateNode}
          expandedNodes={expandedNodes}
          onToggleExpand={handleToggleExpand}
          onChildrenLoaded={handleChildrenLoaded}
        />
      )}

      {contextMenu.node && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={handleCloseContextMenu}
          onRefresh={handleRefreshForAction}
          rootPath={rootPath}
        />
      )}
    </div>
  );
};