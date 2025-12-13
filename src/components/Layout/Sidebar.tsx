import React from 'react';
import { FileTree } from '../FileTree/FileTree';
import { useFileStore } from '../../stores/fileStore';
import { openDirectory } from '../../utils/fileSystem';
import { FolderOpen } from 'lucide-react';

export const Sidebar = () => {
  const { setFileTree } = useFileStore();

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
