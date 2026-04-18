import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { X, ArrowRight, Plus, Minus } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';

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
  const { t, i18n } = useTranslation();
  const rootPath = useFileStore(state => state.rootPath);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiff();
  }, [promptPath, oldVersion, newVersion, rootPath]);

  const loadDiff = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await invoke<VersionDiff>('compare_prompt_versions', {
        projectRoot: rootPath || '',
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
    return date.toLocaleString(i18n.language);
  };

  const renderDiffLines = () => {
    if (!diff) return null;

    const lines = diff.diff_text.split('\n');
    return lines.map((line, index) => {
      if (line.startsWith('-')) {
        return (
          <div key={index} className="flex">
            <span className="theme-text-danger w-8 select-none pr-2 text-right">-</span>
            <span className="theme-text flex-1 bg-[var(--danger-soft-bg)] px-2 py-0.5">
              {line.substring(1)}
            </span>
          </div>
        );
      } else if (line.startsWith('+')) {
        return (
          <div key={index} className="flex">
            <span className="theme-text-success w-8 select-none pr-2 text-right">+</span>
            <span className="theme-text flex-1 bg-[var(--success-soft-bg)] px-2 py-0.5">
              {line.substring(1)}
            </span>
          </div>
        );
      } else {
        return (
          <div key={index} className="flex">
            <span className="theme-text-subtle w-8 select-none pr-2 text-right"> </span>
            <span className="theme-text-muted flex-1 px-2 py-0.5">
              {line}
            </span>
          </div>
        );
      }
    });
  };

  if (isLoading) {
    return (
      <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow rounded-lg border p-8">
          <div className="theme-text-accent h-8 w-8 animate-spin rounded-full border-2 border-current border-b-transparent"></div>
          <p className="theme-text-subtle mt-4 text-sm">{t('promptManager.versionDiff.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-lg border p-8">
          <p className="theme-text-danger text-sm font-medium">{t('promptManager.versionDiff.errorTitle')}</p>
          <p className="theme-text-muted mt-1 text-sm">{t('promptManager.versionDiff.loadFailedDescription')}</p>
          <p className="theme-text-subtle mt-2 break-all text-xs">
            {t('promptManager.common.technicalDetails')}: {error}
          </p>
          <button
            onClick={onClose}
            className="theme-button-secondary mt-4 w-full rounded-lg px-4 py-2 text-sm"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  if (!diff) return null;

  return (
    <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="theme-panel-elevated theme-border theme-shadow flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border">
        {/* 头部 */}
        <div className="theme-border flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-4 flex-1">
            {/* 旧版本 */}
            <div className="flex-1">
              <div className="theme-text-subtle mb-1 text-xs">{t('promptManager.versionDiff.oldVersion')}</div>
              <code className="theme-input-surface theme-border rounded border px-2 py-1 text-sm font-mono">
                {diff.old_version.version_id.substring(0, 7)}
              </code>
              <div className="theme-text-subtle mt-1 text-xs">
                {formatDate(diff.old_version.timestamp)}
              </div>
            </div>

            {/* 箭头 */}
            <ArrowRight className="theme-text-subtle h-5 w-5 flex-shrink-0" />

            {/* 新版本 */}
            <div className="flex-1">
              <div className="theme-text-subtle mb-1 text-xs">{t('promptManager.versionDiff.newVersion')}</div>
              <code className="theme-input-surface theme-border rounded border px-2 py-1 text-sm font-mono">
                {diff.new_version.version_id.substring(0, 7)}
              </code>
              <div className="theme-text-subtle mt-1 text-xs">
                {formatDate(diff.new_version.timestamp)}
              </div>
            </div>

            {/* 统计信息 */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {diff.additions > 0 && (
                <div className="theme-text-success flex items-center gap-1">
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">{diff.additions}</span>
                </div>
              )}
              {diff.deletions > 0 && (
                <div className="theme-text-danger flex items-center gap-1">
                  <Minus className="w-4 h-4" />
                  <span className="text-sm font-medium">{diff.deletions}</span>
                </div>
              )}
            </div>
          </div>

          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-2 transition-colors"
            data-testid="close-diff-viewer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 差异内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="theme-code-surface theme-border rounded-lg border p-4 font-mono text-sm leading-relaxed">
            {renderDiffLines()}
          </div>
        </div>

        {/* 底部 */}
        <div className="theme-panel-muted theme-border flex items-center justify-between border-t p-4">
          <div className="theme-text-subtle text-xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded bg-[var(--success-soft-bg)]"></span>
                {t('promptManager.versionDiff.addedLines')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded bg-[var(--danger-soft-bg)]"></span>
                {t('promptManager.versionDiff.deletedLines')}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="theme-button-primary rounded-lg px-4 py-2 text-sm"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
