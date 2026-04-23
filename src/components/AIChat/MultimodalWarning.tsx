/**
 * 多模态支持警告组件
 *
 * 当用户上传图片但当前模型不支持多模态时显示警告
 */

import React from 'react';
import { AlertCircle, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

export interface MultimodalWarningProps {
  /** 警告标题 */
  title: string;
  /** 警告消息 */
  message: string;
  /** 建议的操作 */
  suggestion: string;
  /** 推荐的模型（可选） */
  recommendedModel?: string;
  /** 关闭警告的回调 */
  onClose?: () => void;
  /** 是否显示切换模型按钮（暂时不实现，保留接口） */
  showSwitchButton?: boolean;
  /** 切换模型的回调 */
  onSwitchModel?: (model: string) => void;
}

/**
 * 多模态支持警告提示
 *
 * @example
 * ```tsx
 * <MultimodalWarning
 *   title="当前模型不支持图片识别"
 *   message="OpenAI 的 gpt-3.5-turbo 模型不支持图片识别。"
 *   suggestion="请切换到 gpt-4o 或删除图片后继续。"
 *   recommendedModel="gpt-4o"
 *   onClose={() => setShowWarning(false)}
 * />
 * ```
 */
export const MultimodalWarning: React.FC<MultimodalWarningProps> = ({
  title,
  message,
  suggestion,
  recommendedModel,
  onClose,
  showSwitchButton = false,
  onSwitchModel,
}) => {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        "relative overflow-hidden rounded-xl border",
        "bg-orange-500/10 dark:bg-orange-500/5",
        "border-orange-500/30 dark:border-orange-500/20",
        "p-3 mb-2"
      )}
    >
      {/* 背景渐变效果 */}
      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none" />

      <div className="relative flex items-start gap-3">
        {/* 图标 */}
        <div className="flex-shrink-0 mt-0.5">
          <div className={clsx(
            "flex items-center justify-center w-8 h-8 rounded-lg",
            "bg-orange-500/20 dark:bg-orange-500/10",
            "text-orange-600 dark:text-orange-400"
          )}>
            <AlertCircle size={16} strokeWidth={2} />
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-100">
              {title}
            </h4>
            {onClose && (
              <button
                onClick={onClose}
                className={clsx(
                  "flex-shrink-0 p-0.5 rounded-md transition-colors",
                  "hover:bg-orange-500/20 dark:hover:bg-orange-500/10",
                  "text-orange-700 dark:text-orange-300"
                )}
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>

          <p className="text-xs text-orange-800 dark:text-orange-200 mb-1.5">
            {message}
          </p>

          <p className="text-xs text-orange-700/80 dark:text-orange-300/80 flex items-start gap-1.5">
            <Sparkles size={12} className="flex-shrink-0 mt-0.5" strokeWidth={2} />
            <span>{suggestion}</span>
          </p>

          {/* 推荐模型标签（可选） */}
          {recommendedModel && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/10 border border-orange-500/20">
              <Sparkles size={10} className="text-orange-600 dark:text-orange-400" strokeWidth={2} />
              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                {t('multimodal.recommended')}: {recommendedModel}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default MultimodalWarning;
