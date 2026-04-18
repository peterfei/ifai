/**
 * Tool Detail Dialog Component
 *
 * P3: 通用工具系统 UI - 工具详情对话框组件
 *
 * 显示工具的完整信息：
 * - 基本信息（名称、描述、分类、权限）
 * - 输入参数 schema
 * - 参数说明
 * - 示例用法
 */

import React, { useEffect } from 'react';
import { X, AlertTriangle, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToolStore } from '../../stores/toolStore';
import type { ToolDescriptionResponse } from '../../types/tool';
import {
  getLocalizedToolCategoryLabel,
  getLocalizedToolDescription,
  getLocalizedToolExamples,
  getLocalizedToolInputSchema,
  getLocalizedToolName,
  getLocalizedToolParameterDescriptions,
  getLocalizedToolPermissionLabel,
  getToolCategoryClass,
  getToolPermissionClass,
} from '../../utils/toolExplorerI18n';
import './ToolDetailDialog.css';

/**
 * 工具详情对话框组件
 */
export const ToolDetailDialog: React.FC = () => {
  const { t } = useTranslation();
  const { selectedTool, selectTool } = useToolStore();
  const [copied, setCopied] = React.useState(false);

  // 关闭对话框（按 ESC 键）
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectTool(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectTool]);

  // 复制工具名称
  const handleCopy = async () => {
    if (selectedTool) {
      await navigator.clipboard.writeText(selectedTool.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 如果没有选中工具，不显示对话框
  if (!selectedTool) {
    return null;
  }

  const tool = selectedTool as ToolDescriptionResponse;
  const toolName = getLocalizedToolName(tool, t);
  const permissionLabel = getLocalizedToolPermissionLabel(tool.required_permission, t);
  const categoryLabel = getLocalizedToolCategoryLabel(tool.category, t);
  const description = getLocalizedToolDescription(tool, t);
  const examples = getLocalizedToolExamples(tool, t);
  const inputSchema = getLocalizedToolInputSchema(tool, t);
  const parameterDescriptions = getLocalizedToolParameterDescriptions(tool, t);
  const permissionClass = getToolPermissionClass(tool.required_permission);
  const categoryClass = getToolCategoryClass(tool.category);

  return (
    <div
      data-testid="tool-detail-dialog"
      className="tool-detail-dialog-overlay theme-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => selectTool(null)}
    >
      <div
        className="tool-detail-dialog theme-panel-elevated theme-border theme-shadow flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="theme-border flex items-start justify-between border-b p-6">
          <div className="flex-1">
            {/* 工具名称和复制按钮 */}
            <div className="flex items-center gap-2 mb-2">
              <h2 className="theme-text text-2xl font-bold font-mono">{toolName}</h2>
              <button
                onClick={handleCopy}
                className="theme-button-ghost rounded p-1 transition-colors"
                title={t('toolExplorer.copyToolName')}
              >
                {copied ? (
                  <Check size={16} className="theme-text-success" />
                ) : (
                  <Copy size={16} className="theme-text-subtle" />
                )}
              </button>
            </div>

            {/* 分类和权限 */}
            <div className="flex items-center gap-2 text-sm">
              <span className={`rounded border px-2 py-0.5 ${categoryClass}`}>
                {categoryLabel}
              </span>
              <span className="theme-text-subtle">•</span>
              <span className={`rounded px-2 py-0.5 ${permissionClass}`}>
                {permissionLabel}
              </span>
              {tool.is_dangerous && (
                <>
                  <span className="theme-text-subtle">•</span>
                  <span className="theme-text-danger flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {t('toolExplorer.dangerousAction')}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 关闭按钮 */}
          <button
            data-testid="tool-detail-close"
            onClick={() => selectTool(null)}
            className="theme-button-ghost rounded p-1 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容（可滚动） */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 描述 */}
          <div>
            <h3 className="theme-text text-sm font-semibold mb-2">{t('toolExplorer.description')}</h3>
            <p className="theme-text-subtle text-sm">{description}</p>
          </div>

          {/* 参数说明 */}
          {Object.keys(parameterDescriptions).length > 0 && (
            <div data-testid="tool-parameters">
              <h3 className="theme-text text-sm font-semibold mb-2">{t('toolExplorer.parameterDescriptions')}</h3>
              <dl className="space-y-2">
                {Object.entries(parameterDescriptions).map(
                  ([param, description]) => (
                    <div
                      key={param}
                      className="theme-panel-muted theme-border flex items-start gap-2 rounded border p-2 text-sm"
                    >
                      <dt className="theme-text-accent shrink-0 font-mono font-semibold">
                        {param}
                      </dt>
                      <dd className="theme-text-subtle">{description}</dd>
                    </div>
                  )
                )}
              </dl>
            </div>
          )}

          {/* 输入 Schema */}
          <div data-testid="tool-input-schema">
            <h3 className="theme-text text-sm font-semibold mb-2">{t('toolExplorer.inputSchema')}</h3>
            <pre className="theme-code-surface theme-border overflow-x-auto rounded border p-3 text-xs">
              <code>{JSON.stringify(inputSchema, null, 2)}</code>
            </pre>
          </div>

          {/* 示例用法 */}
          {examples.length > 0 && (
            <div data-testid="tool-examples">
              <h3 className="theme-text text-sm font-semibold mb-2">{t('toolExplorer.examples')}</h3>
              <ul className="space-y-1">
                {examples.map((example, index) => (
                  <li
                    key={index}
                    className="theme-text-subtle flex items-start gap-2 text-sm"
                  >
                    <span className="theme-text-accent">•</span>
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="theme-panel-muted theme-border border-t p-4">
          <button
            onClick={() => selectTool(null)}
            className="theme-button-primary w-full rounded px-4 py-2"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
