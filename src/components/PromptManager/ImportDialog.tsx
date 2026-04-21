import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';

interface ImportResult {
  imported: string[];
  skipped: string[];
  errors: string[];
  warnings: string[];
}

interface PromptPackage {
  package_info: {
    name: string;
    description: string;
    author: string;
    version: string;
    ifai_version: string;
  };
  prompts: Array<{
    name: string;
    path: string;
  }>;
  exported_at: string;
  version: string;
}

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string;
  onSuccess?: (result: ImportResult) => void;
}

/**
 * ImportDialog - 提示词导入对话框
 *
 * 功能：
 * - 选择提示词包文件
 * - 预览包内容
 * - 选择覆盖策略
 * - 执行导入
 */
export const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  onClose,
  projectRoot,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const secondaryButtonClass = 'theme-button-secondary rounded-lg px-4 py-2 transition-colors';
  const primaryButtonClass = 'theme-button-primary flex items-center gap-2 rounded-lg px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const [step, setStep] = useState<'file' | 'preview' | 'import'>('file');
  const [packagePath, setPackagePath] = useState<string>('');
  const [packageData, setPackageData] = useState<PromptPackage | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleSelectFile = async () => {
    setError(null);
    try {
      const selected = await open({
        title: t('promptManager.importDialog.openDialogTitle'),
        multiple: false,
        filters: [
          {
            name: t('promptManager.importDialog.jsonFileFilter'),
            extensions: ['json'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        setPackagePath(selected);
        await loadPackagePreview(selected);
      }
    } catch (err) {
      setError(err as string);
    }
  };

  const loadPackagePreview = async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // 使用 Tauri fs 插件读取文件
      const content = await readTextFile(path);

      const pkg: PromptPackage = JSON.parse(content);
      setPackageData(pkg);
      setStep('preview');
    } catch (err) {
      setError(t('promptManager.importDialog.loadPackageFailed', { error: String(err) }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!packagePath) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<ImportResult>('import_prompts', {
        projectRoot,
        packagePath,
        overwrite,
      });

      setImportResult(result);
      setStep('import');

      // 显示成功结果
      if (result.errors.length === 0) {
        setTimeout(() => {
          onSuccess?.(result);
          handleClose();
        }, 2000);
      }
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('file');
    setPackagePath('');
    setPackageData(null);
    setOverwrite(false);
    setError(null);
    setImportResult(null);
    onClose();
  };

  if (!isOpen) return null;

  // 检查是否有项目路径
  if (!packagePath && !projectRoot) {
    return (
      <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-lg border p-6">
          <div className="text-center">
            <AlertCircle className="theme-text-warning mx-auto mb-4" size={48} />
            <h3 className="theme-text mb-2 text-lg font-semibold">
              {t('promptManager.importDialog.openProjectFirstTitle')}
            </h3>
            <p className="theme-text-subtle mb-6 text-sm">
              {t('promptManager.importDialog.openProjectFirstDescription')}
            </p>
            <button
              onClick={handleClose}
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
      <div className="theme-panel-elevated theme-border theme-shadow flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border">
        {/* 头部 */}
        <div className="theme-border flex items-center justify-between border-b p-6">
          <h2 className="theme-text text-xl font-semibold">{t('promptManager.importDialog.title')}</h2>
          <button
            onClick={handleClose}
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
                  {t('promptManager.importDialog.errorTitle')}
                </p>
                <p className="theme-text-muted mt-1 text-sm">
                  {t('promptManager.importDialog.errorDescription')}
                </p>
                <p className="theme-text-subtle mt-2 break-all text-xs">
                  {t('promptManager.common.technicalDetails')}: {error}
                </p>
              </div>
            </div>
          )}

          {step === 'file' && (
            <div>
              <div className="mb-6">
                <h3 className="theme-text mb-2 text-lg font-medium">{t('promptManager.importDialog.fileStepTitle')}</h3>
                <p className="theme-text-subtle text-sm">
                  {t('promptManager.importDialog.fileStepDescription')}
                </p>
              </div>

              <div className="theme-panel-muted theme-border rounded-lg border-2 border-dashed p-12 text-center">
                <Upload className="theme-text-subtle mx-auto mb-4" size={48} />
                <p className="theme-text-subtle mb-4">
                  {t('promptManager.importDialog.dropzoneHint')}
                </p>
                <button
                  onClick={handleSelectFile}
                  disabled={isLoading}
                  className="theme-button-primary rounded-lg px-6 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? t('promptManager.importDialog.loadingFile') : t('promptManager.importDialog.chooseFile')}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && packageData && (
            <div>
              <div className="mb-6">
                <h3 className="theme-text mb-2 text-lg font-medium">
                  {packageData.package_info.name}
                </h3>
                <p className="theme-text-subtle text-sm">
                  {packageData.package_info.description}
                </p>
              </div>

              {/* 包信息卡片 */}
              <div className="theme-panel-muted theme-border mb-6 rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="theme-text-subtle">{t('promptManager.importDialog.author')}:</span>
                    <span className="theme-text ml-2">
                      {packageData.package_info.author}
                    </span>
                  </div>
                  <div>
                    <span className="theme-text-subtle">{t('promptManager.importDialog.version')}:</span>
                    <span className="theme-text ml-2">
                      {packageData.package_info.version}
                    </span>
                  </div>
                  <div>
                    <span className="theme-text-subtle">{t('promptManager.importDialog.ifaiVersion')}:</span>
                    <span className="theme-text ml-2">
                      {packageData.package_info.ifai_version}
                    </span>
                  </div>
                  <div>
                    <span className="theme-text-subtle">{t('promptManager.importDialog.promptCount')}:</span>
                    <span className="theme-text ml-2">
                      {packageData.prompts.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* 提示词列表 */}
              <div className="mb-6">
                <h4 className="theme-text-muted mb-3 text-sm font-medium">
                  {t('promptManager.importDialog.packageContents')}
                </h4>
                <div className="theme-border max-h-64 overflow-y-auto rounded-lg border">
                  {packageData.prompts.map((prompt, idx) => (
                    <div
                      key={idx}
                      className="theme-border flex items-center gap-3 border-b p-3 last:border-b-0"
                    >
                      <FileText size={16} className="theme-text-subtle flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="theme-text truncate text-sm font-medium">
                          {prompt.name}
                        </p>
                        <p className="theme-text-subtle truncate text-xs">
                          {prompt.path}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 覆盖选项 */}
              <div className="theme-surface-warning rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="theme-checkbox-input mt-1 h-4 w-4 rounded"
                  />
                  <div>
                    <p className="theme-text text-sm font-medium">
                      {t('promptManager.importDialog.overwriteTitle')}
                    </p>
                    <p className="theme-text-subtle mt-1 text-xs">
                      {t('promptManager.importDialog.overwriteDescription')}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 'import' && importResult && (
            <div>
              {importResult.errors.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="theme-text-success mx-auto mb-4" size={64} />
                  <h3 className="theme-text-success mb-2 text-xl font-semibold">
                    {t('promptManager.importDialog.successTitle')}
                  </h3>
                  <p className="theme-text-subtle mb-6">
                    {t('promptManager.importDialog.successDescription', { count: importResult.imported.length })}
                  </p>
                </div>
              ) : (
                <div>
                  <AlertCircle className="theme-text-warning mx-auto mb-4" size={64} />
                  <h3 className="theme-text-warning mb-2 text-center text-xl font-semibold">
                    {t('promptManager.importDialog.warningTitle')}
                  </h3>
                </div>
              )}

              {/* 导入结果详情 */}
              <div className="space-y-4 mt-6">
                {importResult.imported.length > 0 && (
                  <div className="theme-surface-success rounded-lg p-4">
                    <h4 className="theme-text-success mb-2 text-sm font-medium">
                      {t('promptManager.importDialog.imported', { count: importResult.imported.length })}
                    </h4>
                    <ul className="theme-text space-y-1 text-sm">
                      {importResult.imported.map((name, idx) => (
                        <li key={idx} className="truncate">• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.skipped.length > 0 && (
                  <div className="theme-surface-warning rounded-lg p-4">
                    <h4 className="theme-text-warning mb-2 text-sm font-medium">
                      {t('promptManager.importDialog.skipped', { count: importResult.skipped.length })}
                    </h4>
                    <ul className="theme-text space-y-1 text-sm">
                      {importResult.skipped.map((name, idx) => (
                        <li key={idx} className="truncate">• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.warnings.length > 0 && (
                  <div className="theme-surface-warning rounded-lg p-4">
                    <h4 className="theme-text-warning mb-2 text-sm font-medium">
                      {t('promptManager.importDialog.warnings', { count: importResult.warnings.length })}
                    </h4>
                    <ul className="theme-text space-y-1 text-sm">
                      {importResult.warnings.map((msg, idx) => (
                        <li key={idx} className="truncate">• {msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.errors.length > 0 && (
                  <div className="theme-surface-danger rounded-lg p-4">
                    <h4 className="theme-text-danger mb-2 text-sm font-medium">
                      {t('promptManager.importDialog.errors', { count: importResult.errors.length })}
                    </h4>
                    <ul className="theme-text space-y-1 text-sm">
                      {importResult.errors.map((msg, idx) => (
                        <li key={idx} className="truncate">• {msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="theme-panel-muted theme-border flex justify-end gap-3 border-t p-6">
          {step === 'file' && (
            <button
              onClick={handleClose}
              className={secondaryButtonClass}
            >
              {t('common.cancel')}
            </button>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('file')}
                className={secondaryButtonClass}
              >
                {t('promptManager.exportDialog.back')}
              </button>
              <button
                onClick={handleImport}
                disabled={isLoading}
                className={primaryButtonClass}
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent"></div>
                    {t('promptManager.importDialog.importing')}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    {t('promptManager.importDialog.startImport')}
                  </>
                )}
              </button>
            </>
          )}

          {step === 'import' && (
            <button
              onClick={handleClose}
              className="theme-button-primary rounded-lg px-4 py-2"
            >
              {t('promptManager.importDialog.done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
