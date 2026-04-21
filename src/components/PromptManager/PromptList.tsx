import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePromptStore } from '../../stores/promptStore';
import { useFileStore } from '../../stores/fileStore';
import { RefreshCw, AlertCircle, FileText, Eye, EyeOff, Download, Upload } from 'lucide-react';
import { AccessTierBadge } from './AccessTierBadge';
import { AccessTier } from '../../types/prompt';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';

const DEFAULT_PROMPT_VERSION = '1.0.0';

export const PromptList: React.FC = () => {
  const { t } = useTranslation();
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
            {t('promptManager.list.title')}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExportDialogOpen(true)}
              className="theme-button-ghost rounded p-1 transition-colors"
              title={t('promptManager.list.exportTitle')}
            >
              <Download size={14} />
            </button>
            <button
              onClick={() => setImportDialogOpen(true)}
              className="theme-button-ghost rounded p-1 transition-colors"
              title={t('promptManager.list.importTitle')}
            >
              <Upload size={14} />
            </button>
            <button
              onClick={() => loadPrompts()}
              disabled={isLoading}
              className="theme-button-ghost rounded p-1 transition-colors disabled:opacity-60"
              title={t('promptManager.list.refresh')}
            >
              <RefreshCw
                size={14}
                className={isLoading ? 'animate-spin theme-text-accent' : undefined}
              />
            </button>
          </div>
        </div>
        <button
          data-testid="expert-mode-toggle"
          onClick={toggleExpertMode}
          className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            expertMode
              ? 'theme-surface-danger theme-border theme-text shadow-sm'
              : 'theme-button-secondary border'
          }`}
          title={expertMode ? t('promptManager.list.disableExpertMode') : t('promptManager.list.enableExpertMode')}
        >
          {expertMode ? <Eye size={12} className="theme-text-danger" /> : <EyeOff size={12} />}
          <span>{expertMode ? t('promptManager.list.expertMode') : t('promptManager.list.normalMode')}</span>
        </button>
      </div>

      {error && (
        <div className="theme-surface-danger m-2 flex items-start gap-2 rounded p-3">
            <AlertCircle size={14} className="theme-text-danger mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="theme-text-danger text-xs font-medium">
                {t('promptManager.list.loadFailedTitle')}
              </div>
              <div className="theme-text-muted mt-1 text-[11px]">
                {t('promptManager.list.loadFailedDescription')}
              </div>
              <div className="theme-text-subtle mt-2 break-all text-[11px]">
                {t('promptManager.common.technicalDetails')}: {error}
              </div>
            </div>
        </div>
      )}

      <div data-testid="prompt-list" className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading && filteredPrompts.length === 0 && (
            <div className="theme-text-subtle p-8 text-center text-xs">{t('promptManager.list.loading')}</div>
        )}

        {!isLoading && filteredPrompts.length === 0 && !error && (
            <div className="p-8 text-center">
                <FileText size={28} className="theme-text-subtle mx-auto mb-2 opacity-30" />
                <div className="theme-text-muted text-xs font-medium">{t('promptManager.list.emptyTitle')}</div>
                <div className="theme-text-subtle mt-1 break-all text-[10px]">
                  {t('promptManager.list.directoryLabel', { path: rootPath ? `${rootPath}/.ifai/prompts` : '.ifai/prompts' })}
                </div>
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
                isSelected ? 'theme-selection-accent border-l-4 border-[var(--accent-color)] shadow-sm' : 'border-l-4 border-transparent'
              }`}
            >
              <div className="theme-text truncate text-sm font-medium" title={prompt.metadata.name}>
                  {prompt.metadata.name || t('promptManager.list.untitledPrompt')}
              </div>
              <div className="theme-text-subtle mt-0.5 truncate text-[11px]">
                  {prompt.metadata.description || t('promptManager.list.noDescription')}
              </div>
              <div className="mt-2 flex items-center justify-between">
                  <AccessTierBadge tier={tier} />
                  <span className="theme-text-subtle font-mono text-[10px]">v{prompt.metadata.version || DEFAULT_PROMPT_VERSION}</span>
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
          void msg;
          if (rootPath) loadPrompts();
        }}
      />
      <ImportDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        projectRoot={rootPath || ''}
        onSuccess={(result) => {
          void result;
          if (rootPath) loadPrompts();
        }}
      />
    </div>
  );
};
