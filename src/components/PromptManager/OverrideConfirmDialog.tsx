import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileText, CheckCircle } from 'lucide-react';
import { AccessTier } from '../../types/prompt';

interface OverrideConfirmDialogProps {
  isOpen: boolean;
  accessTier: AccessTier;
  promptName: string;
  overrideFileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 覆盖确认对话框
 *
 * 当用户尝试编辑 Protected 或内置提示词时显示：
 * - Protected 提示词：创建 .override.md 文件
 * - 内置提示词：创建项目特定的覆盖
 */
export const OverrideConfirmDialog: React.FC<OverrideConfirmDialogProps> = ({
  isOpen,
  accessTier,
  promptName,
  overrideFileName,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const isProtected = accessTier === AccessTier.Protected;
  const isPrivate = accessTier === AccessTier.Private;

  const getTitle = () => {
    if (isPrivate) return t('promptManager.overrideDialog.expertTitle');
    if (isProtected) return t('promptManager.overrideDialog.protectedTitle');
    return t('promptManager.overrideDialog.defaultTitle');
  };

  const getMessage = () => {
    if (isPrivate) {
      return (
        <div className="space-y-3">
          <p className="theme-text-muted text-sm">
            {t('promptManager.overrideDialog.expertIntroPrefix')}{' '}
            <span className="font-mono font-bold">{promptName}</span>
            {' · '}
            <span className="theme-text-danger font-bold">{t('promptManager.overrideDialog.expertModeLabel')}</span>
          </p>
          <div className="theme-surface-danger rounded-md p-3">
            <p className="theme-text-danger mb-1 text-xs font-semibold">
              {t('promptManager.overrideDialog.expertWarningTitle')}
            </p>
            <p className="theme-text text-xs">{t('promptManager.overrideDialog.expertWarningBody')}</p>
          </div>
        </div>
      );
    }

    if (isProtected) {
      return (
        <div className="space-y-3">
          <p className="theme-text-muted text-sm">
            {t('promptManager.overrideDialog.protectedIntro')}{' '}
            <span className="font-mono font-bold">{promptName}</span>
          </p>
          <div className="theme-surface-accent rounded-md p-3">
            <p className="theme-text-accent mb-1 text-xs font-semibold">
              {t('promptManager.overrideDialog.overrideMechanismTitle')}
            </p>
            <p className="theme-text text-xs">
              {t('promptManager.overrideDialog.overrideMechanismPrefix')}{' '}
              <span className="theme-code-inline rounded px-1 font-mono">{overrideFileName}</span>
              {' '}
              {t('promptManager.overrideDialog.overrideMechanismSuffix')}
            </p>
          </div>
          <div className="theme-text-subtle flex items-start gap-2 text-xs">
            <FileText size={14} className="mt-0.5 flex-shrink-0" />
            <p>
              {t('promptManager.overrideDialog.restoreHint')}
            </p>
          </div>
        </div>
      );
    }

    return (
      <p className="theme-text-muted text-sm">
        {t('promptManager.overrideDialog.defaultMessage')}{' '}
        <span className="font-mono font-bold">{promptName}</span>
      </p>
    );
  };

  const getConfirmButton = () => {
    if (isPrivate) {
      return (
        <button
          onClick={onConfirm}
          className="theme-button-danger flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold shadow-sm transition-colors active:shadow-none"
        >
          <AlertTriangle size={16} />
          <span>{t('promptManager.overrideDialog.saveAsExpert')}</span>
        </button>
      );
    }

    return (
      <button
        onClick={onConfirm}
        className="theme-button-primary flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold shadow-sm transition-colors active:shadow-none"
      >
        <CheckCircle size={16} />
        <span>{t('promptManager.overrideDialog.createOverrideAndSave')}</span>
      </button>
    );
  };

  return (
    <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-lg border">
        {/* Header */}
        <div className="theme-border border-b px-6 py-4">
          <h3 className="theme-text text-lg font-bold">
            {getTitle()}
          </h3>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {getMessage()}
        </div>

        {/* Actions */}
        <div className="theme-panel-muted theme-border flex justify-end gap-3 rounded-b-lg border-t px-6 py-4">
          <button
            onClick={onCancel}
            className="theme-button-secondary rounded-md px-4 py-2 text-sm font-medium"
          >
            {t('common.cancel')}
          </button>
          {getConfirmButton()}
        </div>
      </div>
    </div>
  );
};
