import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { formatTokenCount } from '../../utils/tokenCounter';
import { ensureTauriInitialized } from '../../utils/tauriInitializer';

export const Statusbar = () => {
  const rootPath = useFileStore(state => state.rootPath);
  const activeFileId = useFileStore(state => state.activeFileId);
  const openedFiles = useFileStore(state => state.openedFiles);
  const activeFileTokenCount = useEditorStore(state => state.activeFileTokenCount);
  const activeFile = openedFiles.find(f => f.id === activeFileId);
  const [ragStatus, setRagStatus] = useState('Ready');
  const [ragProgress, setRagProgress] = useState<number | null>(null);

  useEffect(() => {
    let unlistenStatus: any;
    let unlistenProgress: any;

    const setupListeners = async () => {
      try {
        // 🔥 FIX: 确保 Tauri bridge 已初始化
        await ensureTauriInitialized();

        const { listen } = await import('@tauri-apps/api/event');
        
        unlistenStatus = await listen<string>('rag-status', (event) => {
          console.log("[Statusbar] RAG Status:", event.payload);
          setRagStatus(event.payload);
          if (event.payload.includes('Ready')) {
            setTimeout(() => setRagProgress(null), 5000);
          }
        });

        unlistenProgress = await listen<number>('rag-progress', (event) => {
          console.log("[Statusbar] RAG Progress:", event.payload);
          setRagProgress(event.payload);
        });
      } catch (e) {
        console.error("Failed to setup RAG listeners:", e);
      }
    };

    setupListeners();

    return () => {
      if (unlistenStatus) unlistenStatus();
      if (unlistenProgress) unlistenProgress();
    };
  }, []);

  return (
    <div
      className="theme-panel-elevated theme-border theme-text flex h-6 items-center justify-between overflow-hidden border-t px-4 text-xs select-none transition-colors"
    >
      <div className="flex items-center space-x-4 min-w-0 flex-1 mr-4">
        <span className="truncate block font-medium">{activeFile ? activeFile.path : 'No file open'}</span>
        
        {rootPath && (
          <div className={clsx(
            'theme-panel theme-border flex items-center space-x-2 rounded border px-2 py-0.5'
          )}>
            <span className={`whitespace-nowrap ${ragStatus.includes('...') ? 'animate-pulse' : ''}`}>
              RAG: {ragStatus}
            </span>
            {ragProgress !== null && (
              <span className="rounded-full bg-[var(--selected-bg)] px-1.5 text-[10px] font-bold text-[var(--accent-color)]">
                {ragProgress} files
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center space-x-4">
        <span>UTF-8</span>
        <span>{activeFile?.language || 'Plain Text'}</span>
        <span 
          data-testid="statusbar-token-count"
          className="theme-panel theme-border rounded border px-2 py-0.5 tabular-nums"
        >
          Tokens: {formatTokenCount(activeFileTokenCount)}
        </span>
      </div>
    </div>
  );
};
