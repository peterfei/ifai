import React from 'react';
import { AlertTriangle, FileText, CheckCircle } from 'lucide-react';
import { AccessTier } from '../../types/prompt';

interface OverrideConfirmDialogProps {
  isOpen: boolean;
  accessTier: AccessTier;
  promptName: string;
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
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isProtected = accessTier === AccessTier.Protected;
  const isPrivate = accessTier === AccessTier.Private;

  const getTitle = () => {
    if (isPrivate) return '专家模式编辑';
    if (isProtected) return '创建覆盖文件';
    return '编辑确认';
  };

  const getMessage = () => {
    if (isPrivate) {
      return (
        <div className="space-y-3">
          <p className="theme-text-muted text-sm">
            您正在以<span className="font-bold text-red-600">专家模式</span>编辑私有提示词 <span className="font-mono font-bold">{promptName}</span>
          </p>
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3">
            <p className="mb-1 text-xs font-semibold text-red-500">警告</p>
            <p className="text-xs text-red-500">
              私有提示词是系统核心组件，修改可能会影响 AI 行为。请确保您了解修改的影响。
            </p>
          </div>
        </div>
      );
    }

    if (isProtected) {
      return (
        <div className="space-y-3">
          <p className="theme-text-muted text-sm">
            您即将编辑受保护的提示词 <span className="font-mono font-bold">{promptName}</span>
          </p>
          <div className="rounded-md border border-blue-500/20 bg-blue-500/10 p-3">
            <p className="mb-1 text-xs font-semibold text-blue-500">覆盖机制</p>
            <p className="text-xs text-blue-500">
              系统将创建 <span className="rounded bg-blue-500/15 px-1 font-mono">{promptName}.override.md</span> 文件。
              原始提示词不会被修改，您的覆盖将在此项目中优先使用。
            </p>
          </div>
          <div className="theme-text-subtle flex items-start gap-2 text-xs">
            <FileText size={14} className="mt-0.5 flex-shrink-0" />
            <p>
              如需恢复原始提示词，只需删除覆盖文件即可。
            </p>
          </div>
        </div>
      );
    }

    return (
      <p className="theme-text-muted text-sm">
        确认要保存对提示词 <span className="font-mono font-bold">{promptName}</span> 的修改吗？
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
          <span>以专家模式保存</span>
        </button>
      );
    }

    return (
      <button
        onClick={onConfirm}
        className="theme-button-primary flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold shadow-sm transition-colors active:shadow-none"
      >
        <CheckCircle size={16} />
        <span>创建覆盖并保存</span>
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
            取消
          </button>
          {getConfirmButton()}
        </div>
      </div>
    </div>
  );
};
