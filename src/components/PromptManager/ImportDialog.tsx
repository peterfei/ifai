import React, { useState, useRef } from 'react';
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
  const secondaryButtonClass = 'theme-button-secondary rounded-lg px-4 py-2 transition-colors';
  const primaryButtonClass = 'theme-button-primary flex items-center gap-2 rounded-lg px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const [step, setStep] = useState<'file' | 'preview' | 'import'>('file');
  const [packagePath, setPackagePath] = useState<string>('');
  const [packageData, setPackageData] = useState<PromptPackage | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectFile = async () => {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'JSON',
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
      setError(`无法加载包文件: ${err}`);
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
            <AlertCircle className="mx-auto mb-4 text-yellow-500" size={48} />
            <h3 className="theme-text mb-2 text-lg font-semibold">
              请先打开项目
            </h3>
            <p className="theme-text-subtle mb-6 text-sm">
              导入提示词需要先打开一个项目文件夹。
            </p>
            <button
              onClick={handleClose}
              className="theme-button-primary rounded-lg px-4 py-2 transition-colors"
            >
              确定
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
          <h2 className="theme-text text-xl font-semibold">导入提示词</h2>
          <button
            onClick={handleClose}
            className="theme-button-ghost rounded p-1"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            </div>
          )}

          {step === 'file' && (
            <div>
              <div className="mb-6">
                <h3 className="theme-text mb-2 text-lg font-medium">选择提示词包</h3>
                <p className="theme-text-subtle text-sm">
                  选择之前导出的提示词包文件（.json）
                </p>
              </div>

              <div className="theme-panel-muted theme-border rounded-lg border-2 border-dashed p-12 text-center">
                <Upload className="theme-text-subtle mx-auto mb-4" size={48} />
                <p className="theme-text-subtle mb-4">
                  点击下方按钮选择文件
                </p>
                <button
                  onClick={handleSelectFile}
                  disabled={isLoading}
                  className="theme-button-primary rounded-lg px-6 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? '加载中...' : '选择文件'}
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
              <div className="theme-panel-muted mb-6 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="theme-text-subtle">作者：</span>
                    <span className="theme-text ml-2">
                      {packageData.package_info.author}
                    </span>
                  </div>
                  <div>
                    <span className="theme-text-subtle">版本：</span>
                    <span className="theme-text ml-2">
                      {packageData.package_info.version}
                    </span>
                  </div>
                  <div>
                    <span className="theme-text-subtle">IfAI 版本：</span>
                    <span className="theme-text ml-2">
                      {packageData.package_info.ifai_version}
                    </span>
                  </div>
                  <div>
                    <span className="theme-text-subtle">提示词数量：</span>
                    <span className="theme-text ml-2">
                      {packageData.prompts.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* 提示词列表 */}
              <div className="mb-6">
                <h4 className="theme-text-muted mb-3 text-sm font-medium">
                  包含的提示词
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
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="theme-checkbox-input mt-1 h-4 w-4 rounded focus:ring-yellow-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-yellow-600">
                      覆盖已存在的提示词
                    </p>
                    <p className="mt-1 text-xs text-yellow-600">
                      如果勾选，导入时会覆盖同名的提示词文件。否则将跳过已存在的提示词。
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
                  <CheckCircle className="mx-auto mb-4 text-green-500" size={64} />
                  <h3 className="mb-2 text-xl font-semibold text-green-500">
                    导入成功！
                  </h3>
                  <p className="theme-text-subtle mb-6">
                    成功导入 {importResult.imported.length} 个提示词
                  </p>
                </div>
              ) : (
                <div>
                  <AlertCircle className="mx-auto mb-4 text-yellow-500" size={64} />
                  <h3 className="mb-2 text-center text-xl font-semibold text-yellow-600">
                    导入完成（有警告）
                  </h3>
                </div>
              )}

              {/* 导入结果详情 */}
              <div className="space-y-4 mt-6">
                {importResult.imported.length > 0 && (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                    <h4 className="mb-2 text-sm font-medium text-green-500">
                      已导入 ({importResult.imported.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-green-500">
                      {importResult.imported.map((name, idx) => (
                        <li key={idx} className="truncate">• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.skipped.length > 0 && (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                    <h4 className="mb-2 text-sm font-medium text-yellow-600">
                      已跳过 ({importResult.skipped.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-yellow-600">
                      {importResult.skipped.map((name, idx) => (
                        <li key={idx} className="truncate">• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.warnings.length > 0 && (
                  <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-4">
                    <h4 className="mb-2 text-sm font-medium text-orange-500">
                      警告 ({importResult.warnings.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-orange-500">
                      {importResult.warnings.map((msg, idx) => (
                        <li key={idx} className="truncate">• {msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.errors.length > 0 && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                    <h4 className="mb-2 text-sm font-medium text-red-500">
                      错误 ({importResult.errors.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-red-500">
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
              取消
            </button>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('file')}
                className={secondaryButtonClass}
              >
                上一步
              </button>
              <button
                onClick={handleImport}
                disabled={isLoading}
                className={primaryButtonClass}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    导入中...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    开始导入
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
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
