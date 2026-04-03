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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 text-yellow-500" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              请先打开项目
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              导入提示词需要先打开一个项目文件夹。
            </p>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold dark:text-white">导入提示词</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          {step === 'file' && (
            <div>
              <div className="mb-6">
                <h3 className="text-lg font-medium dark:text-white mb-2">选择提示词包</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  选择之前导出的提示词包文件（.json）
                </p>
              </div>

              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center">
                <Upload className="mx-auto mb-4 text-gray-400" size={48} />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  点击下方按钮选择文件
                </p>
                <button
                  onClick={handleSelectFile}
                  disabled={isLoading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? '加载中...' : '选择文件'}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && packageData && (
            <div>
              <div className="mb-6">
                <h3 className="text-lg font-medium dark:text-white mb-2">
                  {packageData.package_info.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {packageData.package_info.description}
                </p>
              </div>

              {/* 包信息卡片 */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">作者：</span>
                    <span className="text-gray-900 dark:text-white ml-2">
                      {packageData.package_info.author}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">版本：</span>
                    <span className="text-gray-900 dark:text-white ml-2">
                      {packageData.package_info.version}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">IfAI 版本：</span>
                    <span className="text-gray-900 dark:text-white ml-2">
                      {packageData.package_info.ifai_version}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">提示词数量：</span>
                    <span className="text-gray-900 dark:text-white ml-2">
                      {packageData.prompts.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* 提示词列表 */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  包含的提示词
                </h4>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                  {packageData.prompts.map((prompt, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                    >
                      <FileText size={16} className="text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {prompt.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {prompt.path}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 覆盖选项 */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="mt-1 w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      覆盖已存在的提示词
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
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
                  <h3 className="text-xl font-semibold text-green-700 dark:text-green-300 mb-2">
                    导入成功！
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    成功导入 {importResult.imported.length} 个提示词
                  </p>
                </div>
              ) : (
                <div>
                  <AlertCircle className="mx-auto mb-4 text-yellow-500" size={64} />
                  <h3 className="text-xl font-semibold text-yellow-700 dark:text-yellow-300 mb-2 text-center">
                    导入完成（有警告）
                  </h3>
                </div>
              )}

              {/* 导入结果详情 */}
              <div className="space-y-4 mt-6">
                {importResult.imported.length > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                      已导入 ({importResult.imported.length})
                    </h4>
                    <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                      {importResult.imported.map((name, idx) => (
                        <li key={idx} className="truncate">• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.skipped.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                      已跳过 ({importResult.skipped.length})
                    </h4>
                    <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                      {importResult.skipped.map((name, idx) => (
                        <li key={idx} className="truncate">• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.warnings.length > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-2">
                      警告 ({importResult.warnings.length})
                    </h4>
                    <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                      {importResult.warnings.map((msg, idx) => (
                        <li key={idx} className="truncate">• {msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {importResult.errors.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                      错误 ({importResult.errors.length})
                    </h4>
                    <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
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
        <div className="flex justify-end gap-3 p-6 border-t dark:border-gray-700">
          {step === 'file' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              取消
            </button>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('file')}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                上一步
              </button>
              <button
                onClick={handleImport}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
