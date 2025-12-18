import React, { useRef } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import clsx from 'clsx';

export const TabBar = () => {
  const { openedFiles, activeFileId, setActiveFile, closeFile } = useFileStore();
  const { activePaneId, assignFileToPane } = useLayoutStore();
  const tabBarRef = useRef<HTMLDivElement>(null);

  if (openedFiles.length === 0) return null;

  const handleTabClick = (fileId: string) => {
    setActiveFile(fileId);
    if (activePaneId) {
        assignFileToPane(activePaneId, fileId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (tabBarRef.current && e.deltaY !== 0) {
        // Convert vertical scroll (wheel) to horizontal scroll
        tabBarRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div 
        ref={tabBarRef}
        onWheel={handleWheel}
        className="flex bg-[#252526] overflow-x-auto h-9 items-center border-b border-[#1e1e1e] px-2 horizontal-scrollbar"
    >
      {openedFiles.map(file => (
        <div
          key={file.id}
          className={clsx(
            "flex items-center px-3 h-full cursor-pointer select-none group border-r border-[#1e1e1e] transition-colors flex-shrink-0 max-w-[200px]",
            file.id === activeFileId 
              ? "bg-[#1e1e1e] text-white border-b-2 border-blue-500" // Active tab styling
              : "bg-[#212121] text-gray-300 hover:bg-[#252526]"
          )}
          onClick={() => handleTabClick(file.id)}
          title={file.path}
        >
          <span className="flex-1 truncate mr-1 text-xs">{file.name}</span>
          {file.isDirty && (
            <div className="w-2 h-2 rounded-full bg-blue-400 mr-2 flex-shrink-0" title="Unsaved Changes" />
          )}
          <div 
            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              closeFile(file.id);
            }}
          >
            {/* Close Icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
};
