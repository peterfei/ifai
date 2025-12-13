import React from 'react';
import { useFileStore } from '../../stores/fileStore';

export const Statusbar = () => {
  const { activeFileId, openedFiles } = useFileStore();
  const activeFile = openedFiles.find(f => f.id === activeFileId);

  return (
    <div className="h-6 bg-blue-600 flex items-center px-4 text-xs text-white select-none justify-between">
      <div className="flex items-center space-x-4">
        <span>{activeFile ? activeFile.path : 'No file open'}</span>
      </div>
      <div className="flex items-center space-x-4">
        <span>UTF-8</span>
        <span>{activeFile?.language || 'Plain Text'}</span>
      </div>
    </div>
  );
};
