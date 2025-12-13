import React, { useEffect } from 'react';
import { FileTree } from '../FileTree/FileTree';
import { useFileStore } from '../../stores/fileStore';
import { openDirectory, readDirectory } from '../../utils/fileSystem';
import { FolderOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const Sidebar = () => {
  const { setFileTree, rootPath, fileTree } = useFileStore();

  useEffect(() => {
    // Restore file tree from rootPath if exists
    if (rootPath && !fileTree) {
      const loadRoot = async () => {
        try {
          const name = rootPath.split('/').pop() || 'Project';
          // We manually reconstruct the root node to trigger lazy loading logic in FileTree or load first level
          const children = await readDirectory(rootPath);
          setFileTree({
            id: uuidv4(),
            name,
            path: rootPath,
            kind: 'directory',
            children
          });
        } catch (e) {
          console.error("Failed to restore project:", e);
        }
      };
      loadRoot();
    }
  }, [rootPath, fileTree, setFileTree]);

  const handleOpenFolder = async () => {
    const tree = await openDirectory();
    if (tree) {
      setFileTree(tree);
    }
  };

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-700 flex flex-col h-full">
      <div className="flex items-center justify-between p-2">
        <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Explorer</span>
        <button 
          onClick={handleOpenFolder} 
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          title="Open Folder"
        >
          <FolderOpen size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <FileTree />
      </div>
    </div>
  );
};
