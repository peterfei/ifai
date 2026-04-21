import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { formatTokenCount } from '../../utils/tokenCounter';
import { ensureTauriInitialized } from '../../utils/tauriInitializer';

export const Statusbar = () => {
  const { t } = useTranslation();
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
      className="theme-panel-muted theme-border theme-text flex h-[var(--statusbar-height)] items-center justify-between overflow-hidden border-t px-3 text-[11px] select-none transition-colors"
    >
      <div className="flex items-center space-x-4 min-w-0 flex-1 mr-4">
        <span className="block truncate font-medium">{activeFile ? activeFile.path : t('statusbar.noFileOpen')}</span>
        
        {rootPath && (
          <div className={clsx(
            'theme-panel theme-border flex items-center space-x-2 rounded-[var(--radius-sm)] border px-2 py-0.5'
          )}>
            <span className={`whitespace-nowrap ${ragStatus.includes('...') ? 'animate-pulse' : ''}`}>
              RAG: {ragStatus === 'Ready' ? t('statusbar.ready') : ragStatus}
            </span>
            {ragProgress !== null && (
              <span className="theme-selection-accent rounded-full px-1.5 text-[10px] font-semibold">
                {t('statusbar.filesCount', { count: ragProgress })}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center space-x-4">
        <span>UTF-8</span>
        <span>{activeFile?.language || t('statusbar.plainText')}</span>
        <span 
          data-testid="statusbar-token-count"
          className="theme-panel theme-border rounded-[var(--radius-sm)] border px-2 py-0.5 tabular-nums"
        >
          {t('statusbar.tokens')}: {formatTokenCount(activeFileTokenCount)}
        </span>
      </div>
    </div>
  );
};
