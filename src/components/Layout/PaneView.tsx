import React from 'react';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { Pane } from '../../stores/layoutStore';
import { useDrag, useDrop } from 'react-dnd';
import { useTranslation } from 'react-i18next';

interface PaneViewProps {
  pane: Pane;
  isActive: boolean;
  splitDirection: 'horizontal' | 'vertical';
  onResize: (paneId: string, delta: number) => void;
  onClick: () => void;
  index: number;
}

export const PaneView: React.FC<PaneViewProps> = ({
  pane,
  isActive,
  splitDirection,
  onResize,
  onClick,
  index,
}) => {
  const { t } = useTranslation();
  const paneStyle: React.CSSProperties = {
    width: splitDirection === 'horizontal' ? `${pane.size}%` : '100%',
    height: splitDirection === 'vertical' ? `${pane.size}%` : '100%',
    display: 'flex',
    flexDirection: 'column',
    border: isActive ? '2px solid #60a5fa' : '1px solid #374151',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onClick();
  };

  // 处理拖拽调整大小
  const handleMouseMove = (e: MouseEvent) => {
    if (splitDirection === 'horizontal') {
      onResize(pane.id, e.movementX);
    } else {
      onResize(pane.id, e.movementY);
    }
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = splitDirection === 'horizontal' ? 'ew-resize' : 'ns-resize';
  };

  return (
    <div
      className={`pane-container ${isActive ? 'active' : ''}`}
      style={paneStyle}
      onMouseDown={handleMouseDown}
    >
      {/* 窗格头部 */}
      <div className="pane-header bg-[#252526] px-2 py-1 flex items-center justify-between border-b border-gray-700 select-none">
        <div className="pane-title text-xs text-gray-400 truncate">
          {pane.fileId ? `File ${index + 1}` : t('common.emptyPane')}
        </div>
        <div className="pane-actions flex gap-1">
          <button
            className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: 实现分屏菜单
            }}
            title={t('editor.splitPane')}
          >
            ⊕
          </button>
          {index > 0 && (
            <button
              className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: 关闭窗格
              }}
              title={t('editor.closePane')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="pane-editor flex-1 relative">
        <MonacoEditor paneId={pane.id} />
      </div>

      {/* 调整大小的手柄 */}
      {(splitDirection === 'horizontal' && index < 4 - 1) && (
        <div
          className="resize-handle cursor-ew-resise absolute right-0 top-0 bottom-0 w-1 hover:bg-blue-500"
          onMouseDown={handleMouseDownResize}
        />
      )}
      {(splitDirection === 'vertical' && index < 4 - 1) && (
        <div
          className="resize-handle cursor-ns-resize absolute left-0 right-0 bottom-0 h-1 hover:bg-blue-500"
          onMouseDown={handleMouseDownResize}
        />
      )}
    </div>
  );
};
