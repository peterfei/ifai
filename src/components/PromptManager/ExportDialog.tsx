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
  const secondaryButtonClass = 'theme-button-secondary rounded-lg px-4 py-2 transition-colors';
  const primaryButtonClass = 'theme-button-primary flex items-center gap-2 rounded-lg px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50';
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
      <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-lg border p-6">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 text-yellow-500" size={48} />
            <h3 className="theme-text mb-2 text-lg font-semibold">
              请先打开项目
            </h3>
            <p className="theme-text-subtle mb-6 text-sm">
              导出提示词需要先打开一个项目文件夹。
            </p>
            <button
              onClick={onClose}
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
      <div className="theme-panel-elevated theme-border theme-shadow flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border">
        {/* 头部 */}
        <div className="theme-border flex items-center justify-between border-b p-6">
          <h2 className="theme-text text-xl font-semibold">导出提示词</h2>
          <button
            onClick={onClose}
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

          {step === 'select' && (
            <div>
              <div className="mb-4">
                <h3 className="theme-text mb-2 text-lg font-medium">选择提示词</h3>
                <p className="theme-text-subtle text-sm">
                  选择要导出的提示词（{selectedPaths.size} / {availablePrompts.length}）
                </p>
              </div>

              <div className="mb-4 flex justify-between items-center">
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-500 hover:text-blue-600"
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
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'theme-border hover:border-[var(--border-strong)]'
                        }
                      `}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {selectedPaths.has(prompt.path) ? (
                          <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center">
                            <Check size={14} className="text-white" />
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
                          <span className={`
                            text-xs px-2 py-0.5 rounded
                            ${prompt.access_tier === 'private' ? 'bg-red-500/10 text-red-500' :
                              prompt.access_tier === 'protected' ? 'bg-yellow-500/10 text-yellow-600' :
                              'bg-green-500/10 text-green-500'}
                          `}>
                            {prompt.access_tier}
                          </span>
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
                <h3 className="theme-text mb-2 text-lg font-medium">包信息</h3>
                <p className="theme-text-subtle text-sm">
                  填写导出包的元数据信息
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    包名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={packageInfo.name}
                    onChange={(e) => setPackageInfo({ ...packageInfo, name: e.target.value })}
                    className="theme-input-surface theme-border theme-text w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:outline-none"
                    placeholder="例如: my-prompts"
                  />
                </div>

                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    描述 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={packageInfo.description}
                    onChange={(e) => setPackageInfo({ ...packageInfo, description: e.target.value })}
                    rows={3}
                    className="theme-input-surface theme-border theme-text w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:outline-none"
                    placeholder="描述这个提示词包的用途和内容"
                  />
                </div>

                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    作者 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={packageInfo.author}
                    onChange={(e) => setPackageInfo({ ...packageInfo, author: e.target.value })}
                    className="theme-input-surface theme-border theme-text w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:outline-none"
                    placeholder="作者名称或组织"
                  />
                </div>

                <div>
                  <label className="theme-text-muted mb-1 block text-sm font-medium">
                    版本
                  </label>
                  <input
                    type="text"
                    value={packageInfo.version}
                    onChange={(e) => setPackageInfo({ ...packageInfo, version: e.target.value })}
                    className="theme-input-surface theme-border theme-text w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:outline-none"
                    placeholder="1.0.0"
                  />
                </div>

                <div className="theme-border border-t pt-4">
                  <p className="theme-text-subtle text-sm">
                    将导出 <strong>{selectedPaths.size}</strong> 个提示词
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
                取消
              </button>
              <button
                onClick={handleNext}
                disabled={selectedPaths.size === 0 || isLoading}
                className={primaryButtonClass}
              >
                下一步
              </button>
            </>
          )}

          {step === 'info' && (
            <>
              <button
                onClick={() => setStep('select')}
                className={secondaryButtonClass}
              >
                上一步
              </button>
              <button
                onClick={handleExport}
                disabled={isLoading || !packageInfo.name || !packageInfo.description || !packageInfo.author}
                className={primaryButtonClass}
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
