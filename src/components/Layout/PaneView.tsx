import React, { useState, useEffect } from 'react';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { Pane, useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore'; // Import useFileStore
import { useTranslation } from 'react-i18next';

interface PaneViewProps {
  pane: Pane;
  isActive: boolean;
  splitDirection: 'horizontal' | 'vertical';
  onClick: () => void;
  index: number;
}

interface ContextMenuState {
    x: number;
    y: number;
    visible: boolean;
}

export const PaneView: React.FC<PaneViewProps> = ({
  pane,
  isActive,
  splitDirection,
  onClick,
  index,
}) => {
  const { t } = useTranslation();
  const { splitPane, closePane, panes } = useLayoutStore();
  const { openedFiles } = useFileStore(); // Get openedFiles from useFileStore
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, visible: false });

  // Find the file associated with this pane
  const associatedFile = pane.fileId ? openedFiles.find(f => f.id === pane.fileId) : null;

  // Only show active border if there are multiple panes
  const showActiveBorder = isActive && panes.length > 1;

  const paneStyle: React.CSSProperties = {
    width: splitDirection === 'horizontal' ? `${pane.size}%` : '100%',
    height: splitDirection === 'vertical' ? `${pane.size}%` : '100%',
    display: 'flex',
    flexDirection: 'column',
    // Cleaner look: no border for single pane, highlight for active multi-pane
    border: showActiveBorder ? '1px solid #3b82f6' : '1px solid #333', 
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // allow clicking on header/border to activate pane
    onClick();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  };

  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });

  useEffect(() => {
      if (contextMenu.visible) {
          window.addEventListener('click', closeContextMenu);
          return () => window.removeEventListener('click', closeContextMenu);
      }
  }, [contextMenu.visible]);

  return (
    <div
      className={`pane-container group ${isActive ? 'active' : ''}`}
      style={paneStyle}
      onMouseDown={handleMouseDown}
    >
      {/* 窗格头部 - Refined Styling */}
      <div 
        className={`pane-header flex items-center justify-between px-3 py-1.5 select-none border-b border-[#2b2b2b]
            ${isActive ? 'bg-[#1e1e1e] text-white' : 'bg-[#181818] text-gray-500'}`}
        onContextMenu={handleContextMenu}
      >
        <div className="pane-title text-xs truncate flex-1">
          {associatedFile ? associatedFile.name : t('common.emptyPane')}
        </div>
        
        {/* Buttons: Hidden by default, visible on hover */}
        <div className="pane-actions flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              splitPane('horizontal', pane.id);
            }}
            title={t('editor.splitRight')}
          >
            {/* Split Icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>
          
          <button
            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
            onClick={(e) => {
                e.stopPropagation();
                closePane(pane.id);
            }}
            title={t('editor.closePane')}
            disabled={panes.length <= 1}
            style={{ opacity: panes.length <= 1 ? 0.3 : 1, cursor: panes.length <= 1 ? 'default' : 'pointer' }}
          >
             {/* Close Icon */}
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="pane-editor flex-1 relative bg-[#1e1e1e]">
        <MonacoEditor paneId={pane.id} />
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div 
            className="fixed z-50 bg-[#252526] border border-[#454545] rounded-md shadow-xl py-1 w-40 text-xs text-gray-300"
            style={{ top: contextMenu.y, left: contextMenu.x }}
        >
            <div 
                className="px-3 py-2 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center"
                onClick={() => splitPane('horizontal', pane.id)}
            >
                <span className="mr-2">◫</span> Split Right
            </div>
            <div 
                className="px-3 py-2 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center"
                onClick={() => splitPane('vertical', pane.id)}
            >
                <span className="mr-2">⊟</span> Split Down
            </div>
             {panes.length > 1 && (
                <>
                    <div className="h-px bg-[#454545] my-1" />
                    <div 
                        className="px-3 py-2 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center text-red-400"
                        onClick={() => closePane(pane.id)}
                    >
                        <span className="mr-2">✕</span> Close Pane
                    </div>
                </>
             )}
        </div>
      )}
    </div>
  );
};
