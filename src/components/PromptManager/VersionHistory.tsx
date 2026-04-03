import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitCommit, GitBranch, GitMerge, GitPullRequest, Eye, Undo } from 'lucide-react';

interface PromptVersion {
  version_id: string;
  timestamp: number;
  author: string;
  message: string;
  content_hash: string;
  git_status?: string;
}

interface VersionHistoryProps {
  promptPath: string;
  onCompare?: (oldVersion: string, newVersion: string) => void;
  onRollback?: (versionId: string) => void;
  onClose?: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  promptPath,
  onCompare,
  onRollback,
  onClose
}) => {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadVersions();
  }, [promptPath]);

  const loadVersions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await invoke<PromptVersion[]>('get_prompt_versions', {
        projectRoot: '/Users/mac/project/aieditor/ifainew',
        promptPath: promptPath,
        limit: 20
      });
      setVersions(data);
    } catch (err) {
      console.error('Failed to load versions:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVersionSelect = (versionId: string) => {
    const newSelected = new Set(selectedVersions);
    if (newSelected.has(versionId)) {
      newSelected.delete(versionId);
    } else {
      if (newSelected.size >= 2) {
        // 只允许选择2个版本进行对比
        const first = Array.from(newSelected)[0];
        newSelected.clear();
        newSelected.add(first);
      }
      newSelected.add(versionId);
    }
    setSelectedVersions(newSelected);

    // 当选择了2个版本时，触发对比
    if (newSelected.size === 2 && onCompare) {
      const [v1, v2] = Array.from(newSelected);
      onCompare(v1, v2);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!confirm('确定要回滚到此版本吗？此操作将覆盖当前文件内容。')) {
      return;
    }

    try {
      await invoke('rollback_prompt', {
        projectRoot: '/Users/mac/project/aieditor/ifainew',
        promptPath: promptPath,
        versionId: versionId
      });

      if (onRollback) {
        onRollback(versionId);
      }
    } catch (err) {
      console.error('Failed to rollback:', err);
      alert(`回滚失败: ${err}`);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
  };

  const getCommitIcon = () => {
    return <GitCommit className="w-4 h-4 text-gray-400" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600 text-sm">加载版本历史失败: {error}</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>暂无版本历史</p>
        <p className="text-xs mt-1">提示词未提交到 Git</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            版本历史
          </h3>
        </div>
        {selectedVersions.size === 2 && (
          <button
            onClick={() => {
              const [v1, v2] = Array.from(selectedVersions);
              if (onCompare) onCompare(v1, v2);
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
          >
            <Eye className="w-4 h-4" />
            对比选中版本
          </button>
        )}
      </div>

      {/* 版本列表 */}
      <div className="divide-y dark:divide-gray-700 max-h-[600px] overflow-y-auto">
        {versions.map((version, index) => {
          const isSelected = selectedVersions.has(version.version_id);
          const isLatest = index === 0;

          return (
            <div
              key={version.version_id}
              className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* 版本选择复选框 */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleVersionSelect(version.version_id)}
                  className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  data-testid={`version-checkbox-${index}`}
                />

                {/* 版本信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getCommitIcon()}
                    <code className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {version.version_id.substring(0, 7)}
                    </code>
                    {isLatest && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
                        最新
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {version.message || '无提交信息'}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatDate(version.timestamp)}</span>
                    <span>•</span>
                    <span>{version.author}</span>
                    <span>•</span>
                    <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">
                      {version.content_hash.substring(0, 8)}
                    </code>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRollback(version.version_id)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="回滚到此版本"
                    data-testid={`rollback-button-${index}`}
                  >
                    <Undo className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部信息 */}
      <div className="p-3 bg-gray-50 dark:bg-gray-700/30 border-t dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-center">
        共 {versions.length} 个版本 • 最多显示最近 20 个版本
      </div>
    </div>
  );
};
