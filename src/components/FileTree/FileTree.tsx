import React, { useState, useEffect } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { FileNode } from '../../stores/types';
import { readFileContent, readDirectory, renameFile, deleteFile } from '../../utils/fileSystem';
import { toast } from 'sonner';

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode | null;
}

const FileTreeItem = ({ node, level, onContextMenu, onReload }: { 
    node: FileNode, 
    level: number, 
    onContextMenu: (e: React.MouseEvent, node: FileNode) => void,
    onReload: () => void 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children);
  const { openFile } = useFileStore();

  const loadChildren = async () => {
    try {
        const loadedChildren = await readDirectory(node.path);
        setChildren(loadedChildren);
        node.children = loadedChildren; // Update store ref mostly for persistence if we had it
    } catch (e) {
        console.error("Failed to load children", e);
        toast.error(`Failed to open ${node.name}: ${String(e)}`);
    }
  };

  const handleClick = async () => {
    if (node.kind === 'directory') {
      if (!expanded) {
        if (!children) {
            await loadChildren();
        }
      }
      setExpanded(!expanded);
    } else {
      try {
        const content = await readFileContent(node.path);
        openFile({
          id: node.id,
          path: node.path,
          name: node.name,
          content: content,
          isDirty: false,
          language: getLanguageFromPath(node.path)
        });
      } catch (e) {
        console.error("Failed to read file", e);
        toast.error(`Failed to read file: ${String(e)}`);
      }
    }
  };

  useEffect(() => {
    // If external reload is requested (e.g. after rename/delete in sibling), 
    // we might need a way to trigger reload. 
    // For MVP, simplistic reload: if expanded, re-fetch.
    if (expanded && node.kind === 'directory') {
        loadChildren();
    }
  }, [expanded]); // simplistic dependency

  return (
    <div>
      <div 
        className="flex items-center py-1 px-2 hover:bg-gray-800 cursor-pointer text-gray-300 text-sm select-none"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="mr-1 text-gray-500">
          {node.kind === 'directory' && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          {node.kind === 'file' && <File size={14} />}
        </span>
        {node.kind === 'directory' && !expanded && <Folder size={14} className="mr-1" />}
        <span className="truncate">{node.name}</span>
      </div>
      {expanded && children && (
        <div>
          {children.map(child => (
            <FileTreeItem 
                key={child.id} 
                node={child} 
                level={level + 1} 
                onContextMenu={onContextMenu} 
                onReload={loadChildren}
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
  const { fileTree, setFileTree } = useFileStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, node: null });
  const [renamingNode, setRenamingNode] = useState<FileNode | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu({ x: 0, y: 0, node: null });
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleRename = () => {
    if (contextMenu.node) {
        setRenamingNode(contextMenu.node);
        setRenameInput(contextMenu.node.name);
        // Logic to show input dialog (using simple prompt for MVP for now or custom UI)
        // For better UX, let's use a native prompt for simplicity in this iteration, 
        // as custom inline input requires more complex state management.
        // Or actually, let's just use window.prompt for the MVP to save UI work.
        const newName = window.prompt("Rename to:", contextMenu.node.name);
        if (newName && newName !== contextMenu.node.name) {
             performRename(contextMenu.node, newName);
        }
    }
  };

  const performRename = async (node: FileNode, newName: string) => {
    try {
        const pathParts = node.path.split('/');
        pathParts.pop();
        const newPath = [...pathParts, newName].join('/');
        await renameFile(node.path, newPath);
        toast.success(`Renamed to ${newName}`);
        // Ideally reload parent. For MVP, we might need to reload the whole tree or implement finer reload.
        // Let's just reload the root for simplicity if possible, or user has to collapse/expand.
        // A full refresh of the tree structure is complex without a robust file watcher.
        // For now, prompt user to refresh or collapse/expand.
    } catch (e) {
        console.error("Rename failed", e);
        toast.error("Rename failed");
    }
  };

  const handleDelete = async () => {
    if (contextMenu.node) {
        if (window.confirm(`Delete ${contextMenu.node.name}?`)) {
            try {
                await deleteFile(contextMenu.node.path);
                toast.success("Deleted");
                // Same reload issue.
            } catch (e) {
                console.error("Delete failed", e);
                toast.error("Delete failed");
            }
        }
    }
  };

  if (!fileTree) return (
    <div className="p-4 text-gray-500 text-sm text-center">
      Click folder icon to open
    </div>
  );

  return (
    <div className="py-2 h-full" onContextMenu={(e) => e.preventDefault()}>
      <FileTreeItem node={fileTree} level={0} onContextMenu={handleContextMenu} onReload={() => {}} />

      {contextMenu.node && (
        <div 
            className="fixed bg-gray-800 border border-gray-600 rounded shadow-xl z-50 py-1 w-32"
            style={{ top: contextMenu.y, left: contextMenu.x }}
        >
            <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
                onClick={handleRename}
            >
                Rename
            </div>
            <div 
                className="px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 cursor-pointer"
                onClick={handleDelete}
            >
                Delete
            </div>
        </div>
      )}
    </div>
  );
};
