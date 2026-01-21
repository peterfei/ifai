import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Eye, Code, Columns } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { TabContextMenu } from './TabContextMenu';
import clsx from 'clsx';

export const TabBar = () => {
  // 🔥 修复无限循环：避免在 selector 中创建新数组
  // 直接订阅 openedFiles 数组，zustand 保证数组引用稳定
  const openedFiles = useFileStore(state => state.openedFiles);
  const activeFileId = useFileStore(state => state.activeFileId);
  const previewMode = useFileStore(state => state.previewMode);

  // 订阅方法（这些引用是稳定的）
  const setActiveFile = useFileStore(state => state.setActiveFile);
  const closeFile = useFileStore(state => state.closeFile);
  const togglePreviewMode = useFileStore(state => state.togglePreviewMode);

  const { activePaneId, assignFileToPane } = useLayoutStore();
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);

  // 🔥 使用 useMemo 创建稳定的元数据数组
  // 只有当 openedFiles 数组引用变化时才重新计算
  const tabsMetadata = useMemo(() =>
    openedFiles.map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      isDirty: f.isDirty,
      language: f.language
    })),
    [openedFiles]
  );

  // 获取当前活动文件
  const activeFile = useMemo(() =>
    tabsMetadata.find(f => f.id === activeFileId) || null,
    [tabsMetadata, activeFileId]
  );

  // 是否显示预览按钮（仅对 Markdown 文件显示）
  const showPreviewButton = useMemo(() =>
    activeFile?.language === 'markdown',
    [activeFile]
  );

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

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, fileId });
  };

  // 获取预览模式图标
  const getPreviewIcon = () => {
    switch (previewMode) {
      case 'editor':
        return <Code size={16} />;
      case 'preview':
        return <Eye size={16} />;
      case 'split':
        return <Columns size={16} />;
    }
  };

  // 获取预览模式提示文本
  const getPreviewTitle = () => {
    switch (previewMode) {
      case 'editor':
        return '当前：编辑器模式 (点击切换到分屏)';
      case 'preview':
        return '当前：预览模式 (点击切换到编辑器)';
      case 'split':
        return '当前：分屏模式 (点击切换到预览)';
    }
  };

  return (
    <div
        ref={tabBarRef}
        onWheel={handleWheel}
        className="flex bg-[#252526] h-9 items-center border-b border-[#1e1e1e]"
    >
      {/* 标签栏 - 可滚动区域 */}
      <div
        className="flex items-center flex-1 overflow-x-auto min-w-0 horizontal-scrollbar"
      >
        {tabsMetadata.map((file, index) => (
          <div
            key={`${file.path}-${index}`}
            className={clsx(
              "flex items-center px-3 h-full cursor-pointer select-none group border-r border-[#1e1e1e] transition-colors flex-shrink-0 max-w-[180px]",
              file.id === activeFileId
                ? "bg-[#1e1e1e] text-white border-b-2 border-blue-500" // Active tab styling
                : "bg-[#212121] text-gray-300 hover:bg-[#252526]"
            )}
            onClick={() => handleTabClick(file.id)}
            onContextMenu={(e) => handleContextMenu(e, file.id)}
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

      {/* v0.2.6 新增：Markdown 预览切换按钮 - 固定在右侧 */}
      {showPreviewButton && (
        <button
          className={clsx(
            "flex items-center gap-1.5 px-3 h-full text-xs transition-colors border-l border-[#1e1e1e] flex-shrink-0",
            previewMode === 'editor'
              ? "text-gray-400 hover:text-white hover:bg-[#2a2d2e]"
              : "text-blue-400 bg-[#1e1e1e]"
          )}
          onClick={togglePreviewMode}
          title={getPreviewTitle()}
        >
          {getPreviewIcon()}
          <span className="hidden sm:inline">
            {previewMode === 'editor' ? '编辑' : previewMode === 'preview' ? '预览' : '分屏'}
          </span>
        </button>
      )}

      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          fileId={contextMenu.fileId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};