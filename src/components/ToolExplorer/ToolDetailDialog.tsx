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
import { useToolStore } from '../../stores/toolStore';
import type { ToolDescriptionResponse } from '../../types/tool';
import './ToolDetailDialog.css';

/**
 * 权限级别标签
 */
const permissionLabels: Record<string, string> = {
  ReadOnly: '只读',
  WorkspaceWrite: '写入',
  Prompt: '提示',
  DangerFullAccess: '危险',
  Allow: '允许',
};

/**
 * 工具详情对话框组件
 */
export const ToolDetailDialog: React.FC = () => {
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

  return (
    <div
      data-testid="tool-detail-dialog"
      className="tool-detail-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => selectTool(null)}
    >
      <div
        className="tool-detail-dialog bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div className="flex-1">
            {/* 工具名称和复制按钮 */}
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold font-mono">{tool.name}</h2>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="复制工具名称"
              >
                {copied ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} className="text-muted-foreground" />
                )}
              </button>
            </div>

            {/* 分类和权限 */}
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 bg-muted rounded">
                {tool.category}
              </span>
              <span className="text-muted-foreground">•</span>
              <span
                className={`
                  px-2 py-0.5 rounded
                  ${
                    tool.is_dangerous
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
                  }
                `}
              >
                {permissionLabels[tool.required_permission] || tool.required_permission}
              </span>
              {tool.is_dangerous && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle size={14} />
                    危险操作
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 关闭按钮 */}
          <button
            data-testid="tool-detail-close"
            onClick={() => selectTool(null)}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容（可滚动） */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 描述 */}
          <div>
            <h3 className="text-sm font-semibold mb-2">描述</h3>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
          </div>

          {/* 参数说明 */}
          {Object.keys(tool.parameter_descriptions).length > 0 && (
            <div data-testid="tool-parameters">
              <h3 className="text-sm font-semibold mb-2">参数说明</h3>
              <dl className="space-y-2">
                {Object.entries(tool.parameter_descriptions).map(
                  ([param, description]) => (
                    <div
                      key={param}
                      className="flex items-start gap-2 text-sm p-2 bg-muted/50 rounded"
                    >
                      <dt className="font-mono font-semibold text-primary shrink-0">
                        {param}
                      </dt>
                      <dd className="text-muted-foreground">{description}</dd>
                    </div>
                  )
                )}
              </dl>
            </div>
          )}

          {/* 输入 Schema */}
          <div data-testid="tool-input-schema">
            <h3 className="text-sm font-semibold mb-2">输入参数 JSON Schema</h3>
            <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
              <code>{JSON.stringify(tool.input_schema, null, 2)}</code>
            </pre>
          </div>

          {/* 示例用法 */}
          {tool.examples.length > 0 && (
            <div data-testid="tool-examples">
              <h3 className="text-sm font-semibold mb-2">示例用法</h3>
              <ul className="space-y-1">
                {tool.examples.map((example, index) => (
                  <li
                    key={index}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-primary">•</span>
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="p-4 border-t border-border bg-muted/30">
          <button
            onClick={() => selectTool(null)}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
