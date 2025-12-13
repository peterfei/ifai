import React, { useState, useEffect } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { FileNode } from '../../stores/types';
import { readFileContent, readDirectory } from '../../utils/fileSystem';

const FileTreeItem = ({ node, level }: { node: FileNode, level: number }) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children);
  const { openFile } = useFileStore();

  const handleClick = async () => {
    if (node.kind === 'directory') {
      if (!expanded && !children) {
        // Load children
        const loadedChildren = await readDirectory(node.path);
        setChildren(loadedChildren);
        // Update store if needed, but local state is fine for now for display
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
      }
    }
  };

  return (
    <div>
      <div 
        className="flex items-center py-1 px-2 hover:bg-gray-800 cursor-pointer text-gray-300 text-sm select-none"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
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
            <FileTreeItem key={child.id} node={child} level={level + 1} />
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
  const { fileTree } = useFileStore();

  if (!fileTree) return (
    <div className="p-4 text-gray-500 text-sm text-center">
      Click folder icon to open
    </div>
  );

  return (
    <div className="py-2">
      <FileTreeItem node={fileTree} level={0} />
    </div>
  );
};
