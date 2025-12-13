import React from 'react';
import { useFileStore } from '../../stores/fileStore';
import { X } from 'lucide-react';
import clsx from 'clsx';

export const TabBar = () => {
  const { openedFiles, activeFileId, setActiveFile, closeFile } = useFileStore();

  if (openedFiles.length === 0) return null;

  return (
    <div className="flex bg-[#252526] overflow-x-auto h-9 items-center border-b border-[#1e1e1e]">
      {openedFiles.map(file => (
        <div
          key={file.id}
          className={clsx(
            "flex items-center px-3 h-full min-w-[120px] max-w-[200px] text-sm cursor-pointer select-none group border-r border-[#1e1e1e]",
            file.id === activeFileId 
              ? "bg-[#1e1e1e] text-white" 
              : "bg-[#2d2d2d] text-gray-400 hover:bg-[#2d2d2d]"
          )}
          onClick={() => setActiveFile(file.id)}
        >
          <span className="flex-1 truncate mr-2">{file.name}</span>
          {file.isDirty && (
            <div className="w-2 h-2 rounded-full bg-white mr-2 group-hover:hidden" />
          )}
          <div 
            className={clsx(
              "p-0.5 rounded-md hover:bg-gray-700",
              file.isDirty ? "hidden group-hover:block" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
              closeFile(file.id);
            }}
          >
            <X size={14} />
          </div>
        </div>
      ))}
    </div>
  );
};
