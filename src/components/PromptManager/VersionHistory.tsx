import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { GitCommit, GitBranch, Eye, Undo } from 'lucide-react';
import { toast } from 'sonner';
import { useFileStore } from '../../stores/fileStore';

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
  const { t, i18n } = useTranslation();
  const rootPath = useFileStore(state => state.rootPath);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [pendingRollback, setPendingRollback] = useState<PromptVersion | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  useEffect(() => {
    loadVersions();
  }, [promptPath, rootPath]);

  const loadVersions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await invoke<PromptVersion[]>('get_prompt_versions', {
        projectRoot: rootPath || '',
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

  const handleRollback = async () => {
    if (!pendingRollback) {
      return;
    }

    try {
      setIsRollingBack(true);
      await invoke('rollback_prompt', {
        projectRoot: rootPath || '',
        promptPath: promptPath,
        versionId: pendingRollback.version_id
      });

      if (onRollback) {
        onRollback(pendingRollback.version_id);
      }
      setPendingRollback(null);
    } catch (err) {
      console.error('Failed to rollback:', err);
      toast.error(t('promptManager.versionHistory.rollbackFailed', { error: String(err) }));
    } finally {
      setIsRollingBack(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString(i18n.language);
  };

  const getCommitIcon = () => {
    return <GitCommit className="theme-text-subtle h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div
          aria-label={t('promptManager.versionHistory.loading')}
          className="theme-text-accent h-8 w-8 animate-spin rounded-full border-2 border-current border-b-transparent"
        ></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="theme-surface-danger rounded-lg p-4">
        <p className="theme-text-danger text-sm font-medium">{t('promptManager.versionHistory.errorTitle')}</p>
        <p className="theme-text-muted mt-1 text-sm">{t('promptManager.versionHistory.loadFailedDescription')}</p>
        <p className="theme-text-subtle mt-2 break-all text-xs">
          {t('promptManager.common.technicalDetails')}: {error}
        </p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="theme-text-subtle p-4 text-center text-sm">
        <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="theme-text-muted font-medium">{t('promptManager.versionHistory.emptyTitle')}</p>
        <p className="text-xs mt-1">{t('promptManager.versionHistory.emptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="theme-panel-elevated theme-border theme-shadow rounded-lg border">
      {/* 头部 */}
      <div className="theme-border flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <GitBranch className="theme-text-subtle h-5 w-5" />
          <h3 className="theme-text text-lg font-semibold">
            {t('promptManager.versionHistory.title')}
          </h3>
        </div>
        {selectedVersions.size === 2 && (
          <button
            onClick={() => {
              const [v1, v2] = Array.from(selectedVersions);
              if (onCompare) onCompare(v1, v2);
            }}
            className="theme-button-primary flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"
          >
            <Eye className="w-4 h-4" />
            {t('promptManager.versionHistory.compareSelected')}
          </button>
        )}
      </div>

      {/* 版本列表 */}
      <div className="max-h-[600px] overflow-y-auto">
        {versions.map((version, index) => {
          const isSelected = selectedVersions.has(version.version_id);
          const isLatest = index === 0;

          return (
            <div
              key={version.version_id}
              className={`p-4 transition-colors ${
                'theme-border border-b theme-soft-hover'
              } ${
                isSelected ? 'theme-selection-accent' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* 版本选择复选框 */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleVersionSelect(version.version_id)}
                  className="theme-checkbox-input mt-1 h-4 w-4 rounded"
                  data-testid={`version-checkbox-${index}`}
                />

                {/* 版本信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getCommitIcon()}
                    <code className="theme-input-surface theme-border theme-text-subtle rounded border px-1.5 py-0.5 text-xs">
                      {version.version_id.substring(0, 7)}
                    </code>
                    {isLatest && (
                      <span className="theme-panel theme-border theme-text-success rounded px-2 py-0.5 text-xs font-medium">
                        {t('promptManager.versionHistory.latest')}
                      </span>
                    )}
                  </div>

                  <p className="theme-text mb-1 text-sm font-medium">
                    {version.message || t('promptManager.versionHistory.noCommitMessage')}
                  </p>

                  <div className="theme-text-subtle flex items-center gap-3 text-xs">
                    <span>{formatDate(version.timestamp)}</span>
                    <span>•</span>
                    <span>{version.author}</span>
                    <span>•</span>
                    <code className="theme-input-surface theme-border rounded border px-1 py-0.5 text-xs">
                      {version.content_hash.substring(0, 8)}
                    </code>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPendingRollback(version)}
                    className="theme-button-ghost theme-soft-hover-accent rounded p-2 transition-colors"
                    title={t('promptManager.versionHistory.rollback')}
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
      <div className="theme-panel-muted theme-border theme-text-subtle border-t p-3 text-center text-xs">
        {t('promptManager.versionHistory.footer', { count: versions.length })}
      </div>

      {pendingRollback && (
        <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-lg border">
            <div className="theme-border border-b px-6 py-4">
              <h4 className="theme-text text-base font-semibold">
                {t('promptManager.versionHistory.rollback')}
              </h4>
            </div>
            <div className="px-6 py-4">
              <p className="theme-text-muted text-sm">
                {t('promptManager.versionHistory.rollbackConfirm')}
              </p>
              <div className="theme-panel-muted theme-border mt-4 rounded-lg border px-3 py-2 text-xs">
                <div className="theme-text font-mono">{pendingRollback.version_id.substring(0, 7)}</div>
                <div className="theme-text-subtle mt-1">{formatDate(pendingRollback.timestamp)}</div>
              </div>
            </div>
            <div className="theme-panel-muted theme-border flex justify-end gap-3 rounded-b-lg border-t px-6 py-4">
              <button
                onClick={() => setPendingRollback(null)}
                className="theme-button-secondary rounded-md px-4 py-2 text-sm font-medium"
                disabled={isRollingBack}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRollback}
                className="theme-button-danger rounded-md px-4 py-2 text-sm font-medium"
                disabled={isRollingBack}
              >
                {isRollingBack ? t('common.loading') : t('promptManager.versionHistory.rollback')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
