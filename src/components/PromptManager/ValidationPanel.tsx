import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
            error_type: t('promptManager.validation.systemErrorType'),
            message: t('promptManager.validation.systemErrorMessage'),
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
  }, [content, isVisible, onValidationComplete, t]);

  if (!isVisible) return null;

  const errorCount = result?.errors.length || 0;
  const warningCount = result?.warnings.length || 0;
  const isValid = result?.is_valid ?? false;

  return (
    <div className="theme-panel theme-border border-t">
      {/* 头部 */}
      <div className="theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="theme-text font-semibold">{t('promptManager.validation.title')}</h3>

          {isValidating ? (
            <div className="theme-text-subtle flex items-center gap-2 text-sm">
              <div className="theme-text-accent h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent"></div>
              <span>{t('promptManager.validation.validating')}</span>
            </div>
          ) : isValid ? (
            <div className="theme-badge-success flex items-center gap-1 rounded-full px-2 py-0.5 text-sm">
              <CheckCircle size={16} />
              <span>{t('promptManager.validation.passed')}</span>
            </div>
          ) : (
            <div className="theme-badge-danger flex items-center gap-1 rounded-full px-2 py-0.5 text-sm">
              <AlertCircle size={16} />
              <span>{t('promptManager.validation.failed')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 统计 */}
          <div className="theme-text-subtle text-sm">
            {errorCount > 0 && (
              <span className="theme-text-danger mr-2">
                {t('promptManager.validation.errorCount', { count: errorCount })}
              </span>
            )}
            {warningCount > 0 && (
              <span className="theme-text-warning">
                {t('promptManager.validation.warningCount', { count: warningCount })}
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
            <div className="theme-text-accent mr-3 h-6 w-6 animate-spin rounded-full border-2 border-current border-b-transparent"></div>
            <span>{t('promptManager.validation.validatingPrompt')}</span>
          </div>
        )}

        {!isValidating && result && (
          <>
            {/* 错误列表 */}
            {result.errors.map((error, idx) => (
              <div
                key={`error-${idx}`}
                className="theme-surface-danger flex items-start gap-3 rounded-lg p-3"
              >
                <AlertCircle className="theme-text-danger mt-0.5 flex-shrink-0" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="theme-panel theme-border theme-text-danger rounded border px-2 py-0.5 font-mono text-xs">
                      {error.error_type}
                    </span>
                    {error.line && (
                      <span className="theme-text-subtle text-xs">
                        {error.column
                          ? t('promptManager.validation.lineWithColumn', { line: error.line, column: error.column })
                          : t('promptManager.validation.line', { line: error.line })}
                      </span>
                    )}
                  </div>
                  <p className="theme-text text-sm">{error.message}</p>
                </div>
              </div>
            ))}

            {/* 警告列表 */}
            {result.warnings.map((warning, idx) => (
              <div
                key={`warning-${idx}`}
                className="theme-surface-warning flex items-start gap-3 rounded-lg p-3"
              >
                <AlertTriangle className="theme-text-warning mt-0.5 flex-shrink-0" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="theme-panel theme-border theme-text-warning rounded border px-2 py-0.5 font-mono text-xs">
                      {warning.error_type}
                    </span>
                    {warning.line && (
                      <span className="theme-text-subtle text-xs">
                        {warning.column
                          ? t('promptManager.validation.lineWithColumn', { line: warning.line, column: warning.column })
                          : t('promptManager.validation.line', { line: warning.line })}
                      </span>
                    )}
                  </div>
                  <p className="theme-text text-sm">{warning.message}</p>
                </div>
              </div>
            ))}

            {/* 无错误无警告 */}
            {result.errors.length === 0 && result.warnings.length === 0 && (
              <div className="theme-surface-success flex items-center justify-center gap-2 rounded-lg py-8">
                <CheckCircle size={24} className="theme-text-success mr-2" />
                <span className="theme-text">{t('promptManager.validation.noIssues')}</span>
              </div>
            )}
          </>
        )}

        {!isValidating && !result && (
          <div className="theme-text-subtle flex items-center justify-center py-8">
            <Info size={24} className="mr-2" />
            <span>{t('promptManager.validation.editToValidate')}</span>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="theme-panel-muted theme-border border-t px-4 py-2">
        <p className="theme-text-subtle text-xs">
          {t('promptManager.validation.footer')}
        </p>
      </div>
    </div>
  );
};
