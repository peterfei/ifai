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
    if (isPrivate) return '🔒 专家模式编辑';
    if (isProtected) return '🛡️ 创建覆盖文件';
    return 'ℹ️ 编辑确认';
  };

  const getMessage = () => {
    if (isPrivate) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            您正在以<span className="font-bold text-red-600">专家模式</span>编辑私有提示词 <span className="font-mono font-bold">{promptName}</span>
          </p>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
            <p className="text-xs text-red-700 dark:text-red-400 font-semibold mb-1">⚠️ 警告</p>
            <p className="text-xs text-red-600 dark:text-red-400">
              私有提示词是系统核心组件，修改可能会影响 AI 行为。请确保您了解修改的影响。
            </p>
          </div>
        </div>
      );
    }

    if (isProtected) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            您即将编辑受保护的提示词 <span className="font-mono font-bold">{promptName}</span>
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
            <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold mb-1">📁 覆盖机制</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              系统将创建 <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">{promptName}.override.md</span> 文件。
              原始提示词不会被修改，您的覆盖将在此项目中优先使用。
            </p>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
            <FileText size={14} className="mt-0.5 flex-shrink-0" />
            <p>
              如需恢复原始提示词，只需删除覆盖文件即可。
            </p>
          </div>
        </div>
      );
    }

    return (
      <p className="text-sm text-gray-700 dark:text-gray-300">
        确认要保存对提示词 <span className="font-mono font-bold">{promptName}</span> 的修改吗？
      </p>
    );
  };

  const getConfirmButton = () => {
    if (isPrivate) {
      return (
        <button
          onClick={onConfirm}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-md shadow-sm active:shadow-none transition-colors flex items-center gap-2"
        >
          <AlertTriangle size={16} />
          <span>以专家模式保存</span>
        </button>
      );
    }

    return (
      <button
        onClick={onConfirm}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-md shadow-sm active:shadow-none transition-colors flex items-center gap-2"
      >
        <CheckCircle size={16} />
        <span>创建覆盖并保存</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {getTitle()}
          </h3>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {getMessage()}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            取消
          </button>
          {getConfirmButton()}
        </div>
      </div>
    </div>
  );
};
