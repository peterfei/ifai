import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, ArrowRight, Plus, Minus } from 'lucide-react';

interface PromptVersion {
  version_id: string;
  timestamp: number;
  author: string;
  message: string;
  content_hash: string;
  git_status?: string;
}

interface VersionDiff {
  old_version: PromptVersion;
  new_version: PromptVersion;
  additions: number;
  deletions: number;
  diff_text: string;
}

interface VersionDiffViewerProps {
  promptPath: string;
  oldVersion: string;
  newVersion: string;
  onClose: () => void;
}

export const VersionDiffViewer: React.FC<VersionDiffViewerProps> = ({
  promptPath,
  oldVersion,
  newVersion,
  onClose
}) => {
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiff();
  }, [promptPath, oldVersion, newVersion]);

  const loadDiff = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await invoke<VersionDiff>('compare_prompt_versions', {
        projectRoot: '/Users/mac/project/aieditor/ifainew',
        promptPath: promptPath,
        oldVersion: oldVersion,
        newVersion: newVersion
      });
      setDiff(data);
    } catch (err) {
      console.error('Failed to load diff:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
  };

  const renderDiffLines = () => {
    if (!diff) return null;

    const lines = diff.diff_text.split('\n');
    return lines.map((line, index) => {
      if (line.startsWith('-')) {
        return (
          <div key={index} className="flex">
            <span className="w-8 text-red-400 text-right pr-2 select-none">-</span>
            <span className="flex-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-0.5">
              {line.substring(1)}
            </span>
          </div>
        );
      } else if (line.startsWith('+')) {
        return (
          <div key={index} className="flex">
            <span className="w-8 text-green-400 text-right pr-2 select-none">+</span>
            <span className="flex-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-0.5">
              {line.substring(1)}
            </span>
          </div>
        );
      } else {
        return (
          <div key={index} className="flex">
            <span className="w-8 text-gray-300 text-right pr-2 select-none"> </span>
            <span className="flex-1 px-2 py-0.5 text-gray-700 dark:text-gray-300">
              {line}
            </span>
          </div>
        );
      }
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm">正在加载版本对比...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md">
          <p className="text-red-600 dark:text-red-400">加载版本对比失败: {error}</p>
          <button
            onClick={onClose}
            className="mt-4 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  if (!diff) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-4 flex-1">
            {/* 旧版本 */}
            <div className="flex-1">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">旧版本</div>
              <code className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                {diff.old_version.version_id.substring(0, 7)}
              </code>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {formatDate(diff.old_version.timestamp)}
              </div>
            </div>

            {/* 箭头 */}
            <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />

            {/* 新版本 */}
            <div className="flex-1">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">新版本</div>
              <code className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                {diff.new_version.version_id.substring(0, 7)}
              </code>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {formatDate(diff.new_version.timestamp)}
              </div>
            </div>

            {/* 统计信息 */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {diff.additions > 0 && (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">{diff.additions}</span>
                </div>
              )}
              {diff.deletions > 0 && (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <Minus className="w-4 h-4" />
                  <span className="text-sm font-medium">{diff.deletions}</span>
                </div>
              )}
            </div>
          </div>

          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            data-testid="close-diff-viewer"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* 差异内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm leading-relaxed">
            {renderDiffLines()}
          </div>
        </div>

        {/* 底部 */}
        <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-between items-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-green-200 dark:bg-green-900/40 rounded"></span>
                添加的行
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-red-200 dark:bg-red-900/40 rounded"></span>
                删除的行
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
