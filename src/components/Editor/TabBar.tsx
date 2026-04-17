import React, { useRef, useMemo, useState } from 'react';
import { Eye, Code, Columns, X } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { TabContextMenu } from './TabContextMenu';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { isDarkTheme } from '../../utils/theme';

export const TabBar = () => {
  const openedFiles = useFileStore(state => state.openedFiles);
  const activeFileId = useFileStore(state => state.activeFileId);
  const previewMode = useFileStore(state => state.previewMode);
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);

  const setActiveFile = useFileStore(state => state.setActiveFile);
  const closeFile = useFileStore(state => state.closeFile);
  const togglePreviewMode = useFileStore(state => state.togglePreviewMode);

  const { activePaneId, assignFileToPane } = useLayoutStore();
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);

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

  const activeFile = useMemo(() =>
    tabsMetadata.find(f => f.id === activeFileId) || null,
    [tabsMetadata, activeFileId]
  );

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
        tabBarRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, fileId });
  };

  const getPreviewIcon = () => {
    switch (previewMode) {
      case 'editor': return <Code size={14} />;
      case 'preview': return <Eye size={14} />;
      case 'split': return <Columns size={14} />;
    }
  };

  return (
    <div
        data-testid="tab-bar-container"
        ref={tabBarRef}
        onWheel={handleWheel}
        className="theme-panel theme-border relative flex h-11 items-center gap-2 overflow-hidden border-b px-4 transition-colors"
    >
      {/* Precision Blur Background */}
      <div className="theme-glass absolute inset-0 -z-10 backdrop-blur-xl" />

      {/* 标签栏 - 可滚动区域 */}
      <div
        className="flex items-center flex-1 gap-1.5 overflow-x-auto min-w-0 scrollbar-hide py-1"
      >
        <AnimatePresence mode="popLayout">
          {tabsMetadata.map((file) => {
            const isActive = file.id === activeFileId;
            return (
              <motion.div
                layout
                key={file.id}
                data-testid="editor-tab"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className={clsx(
                  "relative flex items-center px-3.5 py-1.5 cursor-pointer select-none group rounded-full transition-all duration-300 flex-shrink-0 max-w-[200px] border border-transparent",
                  isActive 
                    ? 'theme-text'
                    : 'theme-text-subtle hover:text-[var(--text-primary)] hover:bg-[var(--hover-soft)]'
                )}
                onClick={() => handleTabClick(file.id)}
                onContextMenu={(e) => handleContextMenu(e, file.id)}
                title={file.path}
              >
                {/* 选中态物理指示器 (Active Pill) */}
                {isActive && (
                  <motion.div
                    layoutId="tab-active-pill"
                    data-testid="tab-active-pill"
                    className="absolute inset-0 bg-blue-600/10 rounded-full border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}

                <span className="relative z-10 truncate text-[11px] font-bold tracking-tight">
                  {file.name}
                </span>

                {file.isDirty && (
                  <span className="relative z-10 ml-2 w-1.5 h-1.5 rounded-full bg-blue-400/80 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
                )}

                <button
                  className={clsx(
                    'relative z-10 ml-2.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity',
                    'theme-button-ghost'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.id);
                  }}
                >
                  <X size={10} strokeWidth={3} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Markdown Preview Controls - Capsule Style */}
      {showPreviewButton && (
        <div className="theme-panel-muted theme-border ml-2 flex items-center rounded-full border p-0.5">
          <button
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black transition-all",
              previewMode !== 'editor'
                ? 'bg-blue-500/10 text-blue-400 shadow-sm'
                : 'theme-button-ghost'
            )}
            onClick={togglePreviewMode}
          >
            {getPreviewIcon()}
            <span className="hidden sm:inline uppercase tracking-widest">
              {previewMode === 'editor' ? 'VIBE' : previewMode === 'preview' ? 'EYE' : 'SPLIT'}
            </span>
          </button>
        </div>
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
