import React, { useEffect, useState } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { formatTokenCount } from '../../utils/tokenCounter';

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
    <div className="h-6 bg-blue-600 flex items-center px-4 text-xs text-white select-none justify-between overflow-hidden">
      <div className="flex items-center space-x-4 min-w-0 flex-1 mr-4">
        <span className="truncate block font-medium">{activeFile ? activeFile.path : 'No file open'}</span>
        
        {rootPath && (
          <div className="flex items-center space-x-2 bg-blue-700/50 px-2 py-0.5 rounded border border-blue-400/20">
            <span className={`whitespace-nowrap ${ragStatus.includes('...') ? 'animate-pulse' : ''}`}>
              RAG: {ragStatus}
            </span>
            {ragProgress !== null && (
              <span className="bg-blue-500 px-1.5 rounded-full text-[10px] font-bold">
                {ragProgress} files
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center space-x-4">
        <span>UTF-8</span>
        <span>{activeFile?.language || 'Plain Text'}</span>
        <span className="bg-blue-700/50 px-2 py-0.5 rounded border border-blue-400/20 tabular-nums">
          Tokens: {formatTokenCount(activeFileTokenCount)}
        </span>
      </div>
    </div>
  );
};