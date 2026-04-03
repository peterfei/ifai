import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, AlertTriangle, Info, X, CheckCircle } from 'lucide-react';

interface ValidationError {
  error_type: string;
  message: string;
  line: number | null;
  column: number | null;
  severity: 'Error' | 'Warning' | 'Info';
}

interface ValidationResult {
  is_valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface ValidationPanelProps {
  content: string;
  isVisible: boolean;
  onClose: () => void;
  onValidationComplete?: (result: ValidationResult) => void;
}

/**
 * ValidationPanel - 提示词实时验证面板
 *
 * 功能：
 * - 实时验证提示词语法
 * - 显示错误和警告
 * - YAML Front Matter 验证
 * - 花括号平衡检查
 * - 安全检查
 */
export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  content,
  isVisible,
  onClose,
  onValidationComplete,
}) => {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (!isVisible || !content) {
      setResult(null);
      return;
    }

    const validate = async () => {
      setIsValidating(true);
      try {
        const validation = await invoke<ValidationResult>('validate_prompt', {
          content,
        });
        setResult(validation);
        onValidationComplete?.(validation);
      } catch (err) {
        console.error('[ValidationPanel] Validation error:', err);
        setResult({
          is_valid: false,
          errors: [{
            error_type: 'system',
            message: String(err),
            line: null,
            column: null,
            severity: 'Error',
          }],
          warnings: [],
        });
      } finally {
        setIsValidating(false);
      }
    };

    // 防抖：500ms 后执行验证
    const timeoutId = setTimeout(validate, 500);
    return () => clearTimeout(timeoutId);
  }, [content, isVisible, onValidationComplete]);

  if (!isVisible) return null;

  const errorCount = result?.errors.length || 0;
  const warningCount = result?.warnings.length || 0;
  const isValid = result?.is_valid ?? false;

  return (
    <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-700 dark:text-gray-200">验证结果</h3>

          {isValidating ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span>验证中...</span>
            </div>
          ) : isValid ? (
            <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckCircle size={16} />
              <span>验证通过</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} />
              <span>验证失败</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 统计 */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {errorCount > 0 && (
              <span className="text-red-600 dark:text-red-400 mr-2">
                {errorCount} 错误
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-yellow-600 dark:text-yellow-400">
                {warningCount} 警告
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 结果列表 */}
      <div className="max-h-64 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {isValidating && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
            <span>正在验证提示词...</span>
          </div>
        )}

        {!isValidating && result && (
          <>
            {/* 错误列表 */}
            {result.errors.map((error, idx) => (
              <div
                key={`error-${idx}`}
                className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              >
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                      {error.error_type}
                    </span>
                    {error.line && (
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        行 {error.line}
                        {error.column && `:${error.column}`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
                </div>
              </div>
            ))}

            {/* 警告列表 */}
            {result.warnings.map((warning, idx) => (
              <div
                key={`warning-${idx}`}
                className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
              >
                <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200">
                      {warning.error_type}
                    </span>
                    {warning.line && (
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        行 {warning.line}
                        {warning.column && `:${warning.column}`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">{warning.message}</p>
                </div>
              </div>
            ))}

            {/* 无错误无警告 */}
            {result.errors.length === 0 && result.warnings.length === 0 && (
              <div className="flex items-center justify-center py-8 text-green-600 dark:text-green-400">
                <CheckCircle size={24} className="mr-2" />
                <span>提示词验证通过，没有发现错误或警告</span>
              </div>
            )}
          </>
        )}

        {!isValidating && !result && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Info size={24} className="mr-2" />
            <span>编辑提示词以开始验证</span>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          验证包括：YAML 格式、花括号平衡、Handlebars 语法、安全检查
        </p>
      </div>
    </div>
  );
};
