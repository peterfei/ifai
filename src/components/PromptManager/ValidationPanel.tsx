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
    <div className="theme-panel theme-border border-t">
      {/* 头部 */}
      <div className="theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="theme-text font-semibold">验证结果</h3>

          {isValidating ? (
            <div className="theme-text-subtle flex items-center gap-2 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span>验证中...</span>
            </div>
          ) : isValid ? (
            <div className="flex items-center gap-1 text-sm text-green-500">
              <CheckCircle size={16} />
              <span>验证通过</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-sm text-red-500">
              <AlertCircle size={16} />
              <span>验证失败</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 统计 */}
          <div className="theme-text-subtle text-sm">
            {errorCount > 0 && (
              <span className="mr-2 text-red-500">
                {errorCount} 错误
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-yellow-500">
                {warningCount} 警告
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-1 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 结果列表 */}
      <div className="max-h-64 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {isValidating && (
          <div className="theme-text-subtle flex items-center justify-center py-8">
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
                className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3"
              >
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded bg-red-500/15 px-2 py-0.5 font-mono text-xs text-red-500">
                      {error.error_type}
                    </span>
                    {error.line && (
                      <span className="theme-text-subtle text-xs">
                        行 {error.line}
                        {error.column && `:${error.column}`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-red-500">{error.message}</p>
                </div>
              </div>
            ))}

            {/* 警告列表 */}
            {result.warnings.map((warning, idx) => (
              <div
                key={`warning-${idx}`}
                className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3"
              >
                <AlertTriangle className="mt-0.5 flex-shrink-0 text-yellow-500" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded bg-yellow-500/15 px-2 py-0.5 font-mono text-xs text-yellow-600">
                      {warning.error_type}
                    </span>
                    {warning.line && (
                      <span className="theme-text-subtle text-xs">
                        行 {warning.line}
                        {warning.column && `:${warning.column}`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-yellow-600">{warning.message}</p>
                </div>
              </div>
            ))}

            {/* 无错误无警告 */}
            {result.errors.length === 0 && result.warnings.length === 0 && (
              <div className="flex items-center justify-center py-8 text-green-500">
                <CheckCircle size={24} className="mr-2" />
                <span>提示词验证通过，没有发现错误或警告</span>
              </div>
            )}
          </>
        )}

        {!isValidating && !result && (
          <div className="theme-text-subtle flex items-center justify-center py-8">
            <Info size={24} className="mr-2" />
            <span>编辑提示词以开始验证</span>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="theme-panel-muted theme-border border-t px-4 py-2">
        <p className="theme-text-subtle text-xs">
          验证包括：YAML 格式、花括号平衡、Handlebars 语法、安全检查
        </p>
      </div>
    </div>
  );
};
