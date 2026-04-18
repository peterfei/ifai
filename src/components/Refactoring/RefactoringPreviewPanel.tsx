/**
 * v0.3.0: 重构预览面板
 *
 * 显示重构操作的预览和确认
 */

import React, { useState } from 'react';
import { X, Check, AlertTriangle, File, Edit3, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRefactoringStore } from '../../stores/refactoringStore';

interface RefactoringPreviewPanelProps {
  onClose?: () => void;
}

export const RefactoringPreviewPanel: React.FC<RefactoringPreviewPanelProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const {
    currentPreview,
    isExecuting,
    error,
    executeRefactoring,
    clearPreview,
  } = useRefactoringStore();

  const [expandedEdits, setExpandedEdits] = useState<Set<number>>(new Set());

  if (!currentPreview) {
    return (
      <div className="theme-panel theme-text-subtle flex h-full flex-col items-center justify-center p-6 text-center">
        <Edit3 size={48} className="theme-text-accent mx-auto mb-4 opacity-40" />
        <p className="text-sm">{t('refactoring.preview.empty.title')}</p>
        <p className="mt-2 text-xs">{t('refactoring.preview.empty.description')}</p>
      </div>
    );
  }

  const toggleEditExpanded = (index: number) => {
    setExpandedEdits(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleExecute = async () => {
    const success = await executeRefactoring();
    if (success && onClose) {
      onClose();
    }
  };

  const getDiffMeta = (oldText: string, newText: string) => {
    if (!oldText) {
      return {
        className: 'border border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-color)]',
        label: t('refactoring.preview.diff.created'),
      };
    }
    if (!newText) {
      return {
        className: 'border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] text-[var(--danger-color)]',
        label: t('refactoring.preview.diff.deleted'),
      };
    }
    return {
      className: 'border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-color)]',
      label: t('refactoring.preview.diff.updated'),
    };
  };

  const formatFilePath = (filePath: string) => {
    return filePath.split('/').pop() || filePath;
  };

  return (
    <div className="theme-panel flex h-full flex-col">
      {/* 标题栏 */}
      <div className="theme-panel-elevated theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Edit3 size={18} className="theme-text-accent" />
          <h2 className="theme-text text-sm font-semibold">{t('refactoring.preview.title')}</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-1"
            title={t('common.close')}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 重构信息 */}
      <div className="theme-panel-muted theme-border border-b px-4 py-3">
        <h3 className="theme-text mb-1 text-sm font-medium">{currentPreview.name}</h3>
        <p className="theme-text-muted mb-2 text-xs">{currentPreview.description}</p>
        <div className="flex gap-4 text-xs">
          <span className="theme-text-subtle">
            {t('refactoring.preview.summary.filesChanged', { count: currentPreview.summary.filesChanged })}
          </span>
          <span className="theme-text-subtle">
            {t('refactoring.preview.summary.totalEdits', { count: currentPreview.summary.totalEdits })}
          </span>
        </div>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="theme-text-danger mt-0.5 flex-shrink-0" />
            <p className="theme-text-danger text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* 编辑列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {currentPreview.edits.map((edit, index) => (
          <div
            key={`${edit.filePath}-${index}`}
            className="theme-border mb-2 overflow-hidden rounded-lg border"
          >
            {/* 文件路径 */}
            <div
              className="theme-panel-muted theme-hoverable flex cursor-pointer items-center justify-between px-3 py-2"
              onClick={() => toggleEditExpanded(index)}
            >
              <div className="flex items-center gap-2">
                <File size={14} className="theme-text-subtle" />
                <span className="theme-text-muted text-xs">{formatFilePath(edit.filePath)}</span>
              </div>
              <span className="theme-text-subtle text-xs">
                L{edit.range.startLineNumber}
              </span>
            </div>

            {/* Diff 预览 */}
            {expandedEdits.has(index) && (
              <div className="theme-panel theme-border border-t p-3">
                <div className="grid grid-cols-[80px_1fr] gap-2 text-xs">
                  <div className="col-span-2 mb-1 flex justify-end">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getDiffMeta(edit.oldText, edit.newText).className}`}>
                      {getDiffMeta(edit.oldText, edit.newText).label}
                    </span>
                  </div>
                  {/* 原代码 */}
                  <div className="theme-text-subtle">{t('refactoring.preview.labels.original')}</div>
                  <div className="theme-code-surface theme-border theme-text break-all rounded border p-2 font-mono">
                    {edit.oldText || t('refactoring.preview.labels.emptyValue')}
                  </div>

                  {/* 新代码 */}
                  <div className="theme-text-subtle">{t('refactoring.preview.labels.updated')}</div>
                  <div
                    className={`break-all rounded p-2 font-mono ${getDiffMeta(edit.oldText, edit.newText).className}`}
                  >
                    {edit.newText || t('refactoring.preview.labels.deletedValue')}
                  </div>

                  {/* 位置信息 */}
                  <div className="theme-text-subtle">{t('refactoring.preview.labels.location')}</div>
                  <div className="theme-text-muted">
                    {edit.range.startLineNumber}:{edit.range.startColumn}
                    {edit.range.endLineNumber !== edit.range.startLineNumber &&
                      ` → ${edit.range.endLineNumber}:${edit.range.endColumn}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="theme-panel-elevated theme-border border-t p-3">
        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="theme-button-primary flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('refactoring.preview.actions.executing')}
              </>
            ) : (
              <>
                <Check size={16} />
                {t('refactoring.preview.actions.apply')}
              </>
            )}
          </button>
          <button
            onClick={clearPreview}
            className="theme-button-secondary rounded-lg px-4 py-2 text-sm"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
