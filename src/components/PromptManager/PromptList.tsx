import React, { useEffect, useMemo, useState } from 'react';
import { usePromptStore } from '../../stores/promptStore';
import { useFileStore } from '../../stores/fileStore';
import { RefreshCw, AlertCircle, FileText, Eye, EyeOff, Download, Upload } from 'lucide-react';
import { AccessTierBadge } from './AccessTierBadge';
import { AccessTier } from '../../types/prompt';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';

export const PromptList: React.FC = () => {
  const { prompts, loadPrompts, selectPrompt, selectedPrompt, isLoading, error, expertMode, toggleExpertMode } = usePromptStore();
  const rootPath = useFileStore(state => state.rootPath);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // 根据 expertMode 过滤提示词
  const filteredPrompts = useMemo(() => {
    if (expertMode) {
      return prompts; // 专家模式显示所有提示词
    }
    return prompts.filter(p => p.metadata.access_tier !== AccessTier.Private);
  }, [prompts, expertMode]);

  useEffect(() => {
    if (rootPath) {
        loadPrompts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath]);

  return (
    <div className="theme-panel-muted theme-border flex h-full w-64 flex-col border-r">
      <div className="theme-border p-4 border-b">
        <div className="flex justify-between items-center mb-2">
          <h2 className="theme-text flex items-center gap-2 font-semibold">
            <FileText size={16} />
            Prompts
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExportDialogOpen(true)}
              className="theme-button-ghost rounded p-1 transition-colors"
              title="导出提示词"
            >
              <Download size={14} />
            </button>
            <button
              onClick={() => setImportDialogOpen(true)}
              className="theme-button-ghost rounded p-1 transition-colors"
              title="导入提示词"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={() => loadPrompts()}
              disabled={isLoading}
              className={`rounded p-1 transition-colors ${isLoading ? 'animate-spin text-blue-500' : 'theme-button-ghost'}`}
              title="刷新"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <button
          data-testid="expert-mode-toggle"
          onClick={toggleExpertMode}
          className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            expertMode
              ? 'border border-purple-500/30 bg-purple-500/10 text-purple-500'
              : 'theme-button-secondary border'
          }`}
          title={expertMode ? '关闭专家模式' : '开启专家模式'}
        >
          {expertMode ? <Eye size={12} /> : <EyeOff size={12} />}
          <span>{expertMode ? '专家模式' : '普通模式'}</span>
        </button>
      </div>

      {error && (
        <div className="m-2 flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 p-3">
            <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="break-all text-xs text-red-500">{error}</div>
        </div>
      )}

      <div data-testid="prompt-list" className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading && filteredPrompts.length === 0 && (
            <div className="theme-text-subtle p-8 text-center text-xs">Loading prompts...</div>
        )}

        {!isLoading && filteredPrompts.length === 0 && !error && (
            <div className="p-8 text-center">
                <FileText size={28} className="theme-text-subtle mx-auto mb-2 opacity-30" />
                <div className="theme-text-subtle text-xs">No prompts found</div>
                <div className="theme-text-subtle mt-1 break-all text-[10px]">{rootPath}/.ifai/prompts</div>
            </div>
        )}

        {filteredPrompts.map((prompt, idx) => {
          // Safety check for prompt structure
          if (!prompt || !prompt.metadata) return null;

          const path = prompt.path || `unknown-${idx}`;
          const isSelected = selectedPrompt?.path === path;
          const tier: AccessTier = prompt.metadata.access_tier || AccessTier.Public;

          return (
            <div
              key={path}
              data-testid="prompt-item"
              data-prompt-access-tier={tier}
              onClick={() => prompt.path && selectPrompt(prompt.path)}
              className={`p-3 cursor-pointer transition-all ${
                'theme-border border-b theme-soft-hover'
              } ${
                isSelected ? 'border-l-4 border-blue-500 bg-blue-500/10 shadow-sm' : 'border-l-4 border-transparent'
              }`}
            >
              <div className="theme-text truncate text-sm font-medium" title={prompt.metadata.name}>
                  {prompt.metadata.name || 'Untitled Prompt'}
              </div>
              <div className="theme-text-subtle mt-0.5 truncate text-[11px]">
                  {prompt.metadata.description || 'No description'}
              </div>
              <div className="mt-2 flex items-center justify-between">
                  <AccessTierBadge tier={tier} />
                  <span className="theme-text-subtle font-mono text-[10px]">v{prompt.metadata.version || '1.0.0'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 导入导出对话框 - 始终渲染，内部检查 rootPath */}
      <ExportDialog
        isOpen={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        projectRoot={rootPath || ''}
        onSuccess={(msg) => {
          console.log('[ExportDialog] Success:', msg);
          if (rootPath) loadPrompts();
        }}
      />
      <ImportDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        projectRoot={rootPath || ''}
        onSuccess={(result) => {
          console.log('[ImportDialog] Success:', result);
          if (rootPath) loadPrompts();
        }}
      />
    </div>
  );
};
