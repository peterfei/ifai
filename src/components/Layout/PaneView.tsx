import React, { useState, useEffect } from 'react';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { MarkdownPreview } from '../Editor/MarkdownPreview';
import { Pane, useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
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
  const { openedFiles, previewMode, activeFileId } = useFileStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, visible: false });

  // Find the file associated with this pane
  const associatedFile = pane.fileId ? openedFiles.find(f => f.id === pane.fileId) : null;

  // v0.2.6 新增：检查是否应该显示 Markdown 预览
  const isMarkdownFile = associatedFile?.language === 'markdown';
  const isActiveFile = associatedFile?.id === activeFileId;
  const shouldShowPreview = isMarkdownFile && isActiveFile;

  // 渲染编辑器区域内容
  const renderEditorContent = () => {
    if (!associatedFile) {
      return <div className="h-full w-full"><MonacoEditor paneId={pane.id} /></div>;
    }

    if (!shouldShowPreview) {
      // 非 Markdown 文件或非活动文件，仅显示编辑器
      return <div className="h-full w-full"><MonacoEditor paneId={pane.id} /></div>;
    }

    // Markdown 文件且是活动文件，根据预览模式渲染
    switch (previewMode) {
      case 'editor':
        return <div className="h-full w-full"><MonacoEditor paneId={pane.id} /></div>;

      case 'preview':
        return (
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
            <div className="p-6">
              <MarkdownPreview content={associatedFile.content} />
            </div>
          </div>
        );

      case 'split':
        return (
          <div className="absolute inset-0 flex">
            {/* 编辑器 */}
            <div className="flex-1 h-full border-r border-gray-700">
              <MonacoEditor paneId={pane.id} />
            </div>
            {/* 预览 */}
            <div className="flex-1 h-full overflow-y-auto overflow-x-hidden bg-[#1e1e1e]">
              <div className="p-6">
                <MarkdownPreview content={associatedFile.content} />
              </div>
            </div>
          </div>
        );
    }
  };

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

      {/* v0.2.6 编辑器/预览区域 */}
      <div className="pane-editor flex-1 relative bg-[#1e1e1e]">
        {renderEditorContent()}
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
                <span className="mr-2">◫</span> {t('editor.splitRight')}
            </div>
            <div
                className="px-3 py-2 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center"
                onClick={() => splitPane('vertical', pane.id)}
            >
                <span className="mr-2">⊟</span> {t('editor.splitDown')}
            </div>
             {panes.length > 1 && (
                <>
                    <div className="h-px bg-[#454545] my-1" />
                    <div
                        className="px-3 py-2 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center text-red-400"
                        onClick={() => closePane(pane.id)}
                    >
                        <span className="mr-2">✕</span> {t('editor.closePane')}
                    </div>
                </>
             )}
        </div>
      )}
    </div>
  );
};
