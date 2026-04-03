import React, { useState, useEffect } from 'react';
import { X, Download, Check, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

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
  const [availablePrompts, setAvailablePrompts] = useState<PromptExportMetadata[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [packageInfo, setPackageInfo] = useState<PackageInfo>({
    name: '',
    description: '',
    author: '',
    version: '1.0.0',
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
      setError('请至少选择一个提示词');
      return;
    }
    setStep('info');
  };

  const handleExport = async () => {
    // 验证包信息
    if (!packageInfo.name || !packageInfo.description || !packageInfo.author) {
      setError('请填写完整的包信息');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 选择保存路径
      const outputPath = await save({
        defaultPath: `${packageInfo.name}-prompts.json`,
        filters: [
          {
            name: 'JSON',
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 text-yellow-500" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              请先打开项目
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              导出提示词需要先打开一个项目文件夹。
            </p>
            <button
              onClick={onClose}
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold dark:text-white">导出提示词</h2>
          <button
            onClick={onClose}
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

          {step === 'select' && (
            <div>
              <div className="mb-4">
                <h3 className="text-lg font-medium dark:text-white mb-2">选择提示词</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  选择要导出的提示词（{selectedPaths.size} / {availablePrompts.length}）
                </p>
              </div>

              <div className="mb-4 flex justify-between items-center">
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {selectedPaths.size === availablePrompts.length ? '取消全选' : '全选'}
                </button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
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
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }
                      `}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {selectedPaths.has(prompt.path) ? (
                          <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center">
                            <Check size={14} className="text-white" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {prompt.name}
                          </span>
                          <span className={`
                            text-xs px-2 py-0.5 rounded
                            ${prompt.access_tier === 'private' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                              prompt.access_tier === 'protected' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}
                          `}>
                            {prompt.access_tier}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
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
                <h3 className="text-lg font-medium dark:text-white mb-2">包信息</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  填写导出包的元数据信息
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    包名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={packageInfo.name}
                    onChange={(e) => setPackageInfo({ ...packageInfo, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例如: my-prompts"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    描述 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={packageInfo.description}
                    onChange={(e) => setPackageInfo({ ...packageInfo, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="描述这个提示词包的用途和内容"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    作者 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={packageInfo.author}
                    onChange={(e) => setPackageInfo({ ...packageInfo, author: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="作者名称或组织"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    版本
                  </label>
                  <input
                    type="text"
                    value={packageInfo.version}
                    onChange={(e) => setPackageInfo({ ...packageInfo, version: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1.0.0"
                  />
                </div>

                <div className="pt-4 border-t dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    将导出 <strong>{selectedPaths.size}</strong> 个提示词
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 p-6 border-t dark:border-gray-700">
          {step === 'select' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleNext}
                disabled={selectedPaths.size === 0 || isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                下一步
              </button>
            </>
          )}

          {step === 'info' && (
            <>
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                上一步
              </button>
              <button
                onClick={handleExport}
                disabled={isLoading || !packageInfo.name || !packageInfo.description || !packageInfo.author}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    导出中...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    导出
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
