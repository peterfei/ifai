import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download, Check, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { AccessTierBadge } from './AccessTierBadge';
import { AccessTier } from '../../types/prompt';

interface PromptExportMetadata {
  name: string;
  path: string;
  description: string;
  version: string;
  author?: string;
  access_tier: string;
  variables: string[];
  tools: string[];
}

interface PackageInfo {
  name: string;
  description: string;
  author: string;
  version: string;
  ifai_version: string;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string;
  onSuccess?: (message: string) => void;
}

/**
 * ExportDialog - 提示词导出对话框
 *
 * 功能：
 * - 显示可导出的提示词列表
 * - 选择要导出的提示词
 * - 填写包信息
 * - 导出为 JSON 文件
 */
export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  projectRoot,
  onSuccess,
}) => {
  const defaultPackageVersion = '1.0.0';
  const { t } = useTranslation();
  const secondaryButtonClass = 'theme-button-secondary rounded-lg px-4 py-2 transition-colors';
  const primaryButtonClass = 'theme-button-primary flex items-center gap-2 rounded-lg px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const [availablePrompts, setAvailablePrompts] = useState<PromptExportMetadata[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [packageInfo, setPackageInfo] = useState<PackageInfo>({
    name: '',
    description: '',
    author: '',
    version: defaultPackageVersion,
    ifai_version: '0.3.0',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'info' | 'export'>('select');

  // 加载可导出的提示词
  useEffect(() => {
    if (isOpen && step === 'select') {
      loadAvailablePrompts();
    }
  }, [isOpen, step]);

  const loadAvailablePrompts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const prompts = await invoke<PromptExportMetadata[]>('list_exportable_prompts', {
        projectRoot,
      });
      setAvailablePrompts(prompts);
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePromptSelection = (path: string) => {
    const newSelected = new Set(selectedPaths);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedPaths(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedPaths.size === availablePrompts.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(availablePrompts.map(p => p.path)));
    }
  };

  const handleNext = () => {
    if (selectedPaths.size === 0) {
      setError(t('promptManager.exportDialog.selectAtLeastOneError'));
      return;
    }
    setStep('info');
  };

  const handleExport = async () => {
    // 验证包信息
    if (!packageInfo.name || !packageInfo.description || !packageInfo.author) {
      setError(t('promptManager.exportDialog.requiredError'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 选择保存路径
      const outputPath = await save({
        title: t('promptManager.exportDialog.saveDialogTitle'),
        defaultPath: t('promptManager.exportDialog.defaultFileName', { name: packageInfo.name }),
        filters: [
          {
            name: t('promptManager.exportDialog.jsonFileFilter'),
            extensions: ['json'],
          },
        ],
      });

      if (!outputPath) {
        setIsLoading(false);
        return;
      }

      // 调用导出命令
      const result = await invoke<string>('export_prompts', {
        projectRoot,
        promptPaths: Array.from(selectedPaths),
        packageInfo,
        outputPath,
      });

      onSuccess?.(result);
      onClose();
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // 检查是否有项目路径
  if (!projectRoot) {
    return (
      <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-lg border p-6">
          <div className="text-center">
            <AlertCircle className="theme-text-warning mx-auto mb-4" size={48} />
            <h3 className="theme-text mb-2 text-lg font-semibold">
              {t('promptManager.exportDialog.openProjectFirstTitle')}
            </h3>
            <p className="theme-text-subtle mb-6 text-sm">
              {t('promptManager.exportDialog.openProjectFirstDescription')}
            </p>
            <button
              onClick={onClose}
              className="theme-button-primary rounded-lg px-4 py-2 transition-colors"
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="theme-panel-elevated theme-border theme-shadow flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border">
        {/* 头部 */}
        <div className="theme-border flex items-center justify-between border-b p-6">
          <h2 className="theme-text text-xl font-semibold">{t('promptManager.exportDialog.title')}</h2>
          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-1"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="theme-surface-danger mb-4 flex items-start gap-3 rounded-lg p-4">
              <AlertCircle className="theme-text-danger flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="theme-text-danger text-sm font-medium">
                  {t('promptManager.exportDialog.errorTitle')}
                </p>
                <p className="theme-text-muted mt-1 text-sm">
                  {t('promptManager.exportDialog.errorDescription')}
                </p>
                <p className="theme-text-subtle mt-2 break-all text-xs">
                  {t('promptManager.common.technicalDetails')}: {error}
                </p>
              </div>
            </div>
          )}

          {step === 'select' && (
            <div>
              <div className="mb-4">
                <h3 className="theme-text mb-2 text-lg font-medium">{t('promptManager.exportDialog.selectTitle')}</h3>
                <p className="theme-text-subtle text-sm">
                  {t('promptManager.exportDialog.selectDescription', {
                    selected: selectedPaths.size,
                    total: availablePrompts.length,
                  })}
                </p>
              </div>

              <div className="mb-4 flex justify-between items-center">
                <button
                  onClick={handleSelectAll}
                  className="theme-text-accent theme-soft-hover-accent rounded px-2 py-1 text-sm transition-colors"
                >
                  {selectedPaths.size === availablePrompts.length
                    ? t('promptManager.exportDialog.clearSelection')
                    : t('promptManager.exportDialog.selectAll')}
                </button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div
                    aria-label={t('promptManager.exportDialog.loadingPrompts')}
                    className="theme-text-accent h-8 w-8 animate-spin rounded-full border-2 border-current border-b-transparent"
                  ></div>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availablePrompts.map((prompt) => (
                    <div
                      key={prompt.path}
                      data-testid={`prompt-export-item-${prompt.path}`}
                      onClick={() => togglePromptSelection(prompt.path)}
                      className={`
                        flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors
                        ${selectedPaths.has(prompt.path)
                          ? 'theme-selection-accent shadow-sm'
                          : 'theme-panel theme-border theme-soft-hover hover:border-[var(--border-strong)]'
                        }
                      `}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {selectedPaths.has(prompt.path) ? (
                          <div className="theme-panel theme-border flex h-5 w-5 items-center justify-center rounded border">
                            <Check size={14} className="theme-text-accent" />
                          </div>
                        ) : (
                          <div className="theme-border h-5 w-5 rounded border-2" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="theme-text font-medium">
                            {prompt.name}
                          </span>
                          <AccessTierBadge tier={prompt.access_tier as AccessTier} />
                        </div>
                        <p className="theme-text-subtle line-clamp-2 text-sm">
                          {prompt.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'info' && (
            <div>
              <div className="mb-6">
                <h3 className="theme-text mb-2 text-lg font-medium">{t('promptManager.exportDialog.packageInfoTitle')}</h3>
                <p className="theme-text-subtle text-sm">
                  {t('promptManager.exportDialog.packageInfoDescription')}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    {t('promptManager.exportDialog.packageName')} <span className="theme-text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={packageInfo.name}
                    onChange={(e) => setPackageInfo({ ...packageInfo, name: e.target.value })}
                    className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-lg border px-3 py-2"
                    placeholder={t('promptManager.exportDialog.namePlaceholder')}
                  />
                </div>

                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    {t('promptManager.exportDialog.description')} <span className="theme-text-danger">*</span>
                  </label>
                  <textarea
                    value={packageInfo.description}
                    onChange={(e) => setPackageInfo({ ...packageInfo, description: e.target.value })}
                    rows={3}
                    className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-lg border px-3 py-2"
                    placeholder={t('promptManager.exportDialog.descriptionPlaceholder')}
                  />
                </div>

                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    {t('promptManager.exportDialog.author')} <span className="theme-text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={packageInfo.author}
                    onChange={(e) => setPackageInfo({ ...packageInfo, author: e.target.value })}
                    className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-lg border px-3 py-2"
                    placeholder={t('promptManager.exportDialog.authorPlaceholder')}
                  />
                </div>

                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    {t('promptManager.exportDialog.version')}
                  </label>
                  <input
                    type="text"
                    value={packageInfo.version}
                    onChange={(e) => setPackageInfo({ ...packageInfo, version: e.target.value })}
                    className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-lg border px-3 py-2"
                    placeholder={defaultPackageVersion}
                  />
                </div>

                <div className="theme-border border-t pt-4">
                  <p className="theme-text-subtle text-sm">
                    {t('promptManager.exportDialog.exportSummary', { count: selectedPaths.size })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="theme-panel-muted theme-border flex justify-end gap-3 border-t p-6">
          {step === 'select' && (
            <>
              <button
                onClick={onClose}
                className={secondaryButtonClass}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleNext}
                disabled={selectedPaths.size === 0 || isLoading}
                className={primaryButtonClass}
              >
                {t('promptManager.exportDialog.next')}
              </button>
            </>
          )}

          {step === 'info' && (
            <>
              <button
                onClick={() => setStep('select')}
                className={secondaryButtonClass}
              >
                {t('promptManager.exportDialog.back')}
              </button>
              <button
                onClick={handleExport}
                disabled={isLoading || !packageInfo.name || !packageInfo.description || !packageInfo.author}
                className={primaryButtonClass}
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent"></div>
                    {t('promptManager.exportDialog.exporting')}
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    {t('promptManager.exportDialog.export')}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
