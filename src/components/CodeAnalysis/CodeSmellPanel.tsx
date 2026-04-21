/**
 * v0.3.0: 代码异味面板
 *
 * 显示检测到的代码问题和建议
 */

import React, { useMemo } from 'react';
import { X, AlertTriangle, AlertCircle, Info, Search, FileCode, Zap, Shield } from 'lucide-react';
import { useCodeSmellStore } from '../../stores/codeSmellStore';
import { useTranslation } from 'react-i18next';

interface CodeSmellPanelProps {
  onClose?: () => void;
}

export const CodeSmellPanel: React.FC<CodeSmellPanelProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const {
    results,
    activeFilePath,
    isAnalyzing,
    selectedSmell,
    setSelectedSmell,
    getAllResults,
    getSummary,
  } = useCodeSmellStore();

  const summary = useMemo(() => getSummary(), [results]);
  const allResults = useMemo(() => getAllResults(), [results]);
  // 获取严重程度图标
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={16} className="text-[var(--danger-color)] flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-[var(--warning-color)] flex-shrink-0" />;
      case 'info':
        return <Info size={16} className="text-[var(--info-color)] flex-shrink-0" />;
      default:
        return <Info size={16} className="theme-text-subtle flex-shrink-0" />;
    }
  };

  // 获取类型图标和标签
  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'long-function':
        return { icon: <FileCode size={14} />, label: t('codeAnalysisPanel.types.longFunction'), color: 'text-[var(--warning-color)]' };
      case 'complex-function':
        return { icon: <Zap size={14} />, label: t('codeAnalysisPanel.types.complexFunction'), color: 'text-[var(--accent-color)]' };
      case 'duplicate-code':
        return { icon: <Search size={14} />, label: t('codeAnalysisPanel.types.duplicateCode'), color: 'text-[var(--info-color)]' };
      case 'magic-number':
        return { icon: <Shield size={14} />, label: t('codeAnalysisPanel.types.magicNumber'), color: 'text-[var(--accent-color)]' };
      case 'deep-nesting':
        return { icon: <AlertTriangle size={14} />, label: t('codeAnalysisPanel.types.deepNesting'), color: 'text-[var(--warning-color)]' };
      default:
        return { icon: <Info size={14} />, label: type, color: 'theme-text-subtle' };
    }
  };

  const handleSmellClick = (smell: any) => {
    setSelectedSmell(smell);
    // TODO: 跳转到编辑器对应位置
    const editor = (window as any).__activeEditor;
    if (editor) {
      editor.revealLineInCenter(smell.line);
      editor.setSelection({
        startLineNumber: smell.line,
        startColumn: smell.column,
        endLineNumber: smell.endLine || smell.line,
        endColumn: smell.endColumn || smell.column,
      });
    }
  };

  return (
    <div className="theme-panel flex h-full flex-col border-l theme-border">
      {/* 标题栏 */}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-[var(--accent-color)]" />
          <h2 className="theme-text text-sm font-semibold">{t('codeAnalysisPanel.title')}</h2>
          {isAnalyzing && (
            <span className="theme-text-subtle text-xs">({t('codeAnalysisPanel.analyzing')})</span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-1"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 统计摘要 */}
      <div className="theme-panel-muted theme-border border-b px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="theme-text-subtle text-xs">{t('codeAnalysisPanel.total')}</span>
          <span className="theme-text text-sm font-medium">{summary.total}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center gap-1">
            <AlertCircle size={12} className="text-[var(--danger-color)]" />
            <span className="theme-text-muted text-xs">{summary.error}</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle size={12} className="text-[var(--warning-color)]" />
            <span className="theme-text-muted text-xs">{summary.warning}</span>
          </div>
          <div className="flex items-center gap-1">
            <Info size={12} className="text-[var(--info-color)]" />
            <span className="theme-text-muted text-xs">{summary.info}</span>
          </div>
        </div>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto">
        {allResults.length === 0 ? (
          <div className="theme-text-subtle flex h-full flex-col items-center justify-center">
            <Shield size={48} className="mb-4 opacity-50" />
            <p className="text-sm">{t('codeAnalysisPanel.empty')}</p>
            <p className="text-xs mt-2">{t('codeAnalysisPanel.emptyHint')}</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {allResults.map((result) => (
              <div
                key={result.filePath}
                className={`rounded-lg overflow-hidden transition-colors ${
                  activeFilePath === result.filePath
                    ? 'theme-panel-elevated ring-1 ring-[var(--accent-soft-border)]'
                    : 'theme-panel-muted'
                }`}
              >
                {/* 文件标题 */}
                <div className="theme-hoverable flex cursor-pointer items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileCode size={14} className="theme-text-subtle flex-shrink-0" />
                    <span className="theme-text-muted truncate text-sm">
                      {result.filePath.split('/').pop()}
                    </span>
                  </div>
                  <span className="theme-text-subtle flex-shrink-0 text-xs">
                    {t('codeAnalysisPanel.issueCount', { count: result.summary.total })}
                  </span>
                </div>

                {/* 异味列表 */}
                <div className="theme-border border-t divide-y">
                  {result.smells.map((smell, idx) => {
                    const typeInfo = getTypeInfo(smell.type);
                    // 使用 filePath + smell.id + 确保唯一性
                    const uniqueKey = `${result.filePath}-${smell.id}-${idx}`;
                    return (
                      <div
                        key={uniqueKey}
                        onClick={() => handleSmellClick(smell)}
                        className={`px-3 py-2 cursor-pointer transition-colors ${selectedSmell?.id === smell.id ? 'bg-[var(--selected-bg)]' : 'theme-hoverable'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">
                            {getSeverityIcon(smell.severity)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs flex items-center gap-1 ${typeInfo.color}`}>
                                {typeInfo.icon}
                                {typeInfo.label}
                              </span>
                              <span className="theme-text-subtle text-xs">
                                L{smell.line}
                              </span>
                            </div>
                            <p className="theme-text-muted mb-1 text-xs">{smell.message}</p>
                            {smell.suggestion && (
                              <p className="theme-text-subtle text-xs italic">
                                {smell.suggestion}
                              </p>
                            )}
                            {smell.metrics && (
                              <div className="flex gap-2 mt-1">
                                {smell.metrics.complexity !== undefined && (
                                  <span className="theme-input-surface theme-text-subtle rounded px-1.5 py-0.5 text-xs">
                                    {t('codeAnalysisPanel.metrics.complexity', { count: smell.metrics.complexity })}
                                  </span>
                                )}
                                {smell.metrics.length !== undefined && (
                                  <span className="theme-input-surface theme-text-subtle rounded px-1.5 py-0.5 text-xs">
                                    {t('codeAnalysisPanel.metrics.length', { count: smell.metrics.length })}
                                  </span>
                                )}
                                {smell.metrics.nestingLevel !== undefined && (
                                  <span className="theme-input-surface theme-text-subtle rounded px-1.5 py-0.5 text-xs">
                                    {t('codeAnalysisPanel.metrics.nesting', { count: smell.metrics.nestingLevel })}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
