/**
 * Section 5.3: 会话笔记组件
 *
 * 显示和编辑会话笔记的 React 组件
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationStore } from '../../stores/conversationStore';
import type { SessionNotesData, TechConcept, FileChange, ErrorFix, TodoTask } from '../../types/conversation';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Download,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface SessionNotesProps {
  sessionId: string;
  projectRoot: string;
  messages?: any[]; // 🔥 FIX: 添加 messages 属性以自动提取笔记
}

/**
 * 分类标签组件
 */
function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    concept: 'bg-blue-500/10 text-blue-500',
    pattern: 'bg-fuchsia-500/10 text-fuchsia-500',
    algorithm: 'bg-green-500/10 text-green-500',
    framework: 'bg-orange-500/10 text-orange-500',
  };

  const colorClass = colors[category] || colors.concept;

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {category}
    </span>
  );
}

/**
 * 优先级标签组件
 */
function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: 'theme-panel-elevated theme-text-muted',
    medium: 'bg-yellow-500/10 text-yellow-500',
    high: 'bg-red-500/10 text-red-500',
  };

  const colorClass = colors[priority] || colors.medium;

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {priority}
    </span>
  );
}

/**
 * 可折叠区域组件
 */
function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="theme-panel theme-border mb-4 rounded-lg border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="theme-hoverable flex w-full items-center justify-between px-4 py-3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="theme-text-subtle h-4 w-4" />
          <span className="theme-text font-medium">{title}</span>
          {count !== undefined && (
            <span className="theme-text-subtle text-sm">({count})</span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="theme-text-subtle h-4 w-4" />
        ) : (
          <ChevronDown className="theme-text-subtle h-4 w-4" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * 主组件
 */
export function SessionNotesPanel({ sessionId, projectRoot, messages }: SessionNotesProps) {
  const { t } = useTranslation();
  const {
    sessionNotes,
    isLoading,
    error,
    createNotes,
    extractNotesFromMessages,
    generateNotesSummary,
    saveNotes,
    exportNotesToMarkdown,
    exportNotesToJSON,
    clearError,
    reset
  } = useConversationStore();

  // 🔥 FIX: 使用传入的 messages 或默认为空数组
  const currentMessages = messages || [];

  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');

  // 初始化笔记并自动提取内容
  useEffect(() => {
    if (sessionId && projectRoot) {
      createNotes(sessionId, projectRoot);
    }

    return () => {
      reset();
    };
  }, [sessionId, projectRoot]);

  // 🔥 FIX: 自动从消息中提取笔记内容
  useEffect(() => {
    const extractNotes = async () => {
      if (currentMessages.length > 0 && sessionNotes) {
        try {
          await extractNotesFromMessages(currentMessages);
          console.log('[SessionNotesPanel] ✅ Extracted notes from', currentMessages.length, 'messages');
        } catch (error) {
          console.error('[SessionNotesPanel] ❌ Failed to extract notes from messages:', error);
        }
      }
    };

    // 使用防抖避免频繁提取
    const timeoutId = setTimeout(extractNotes, 2000);
    return () => clearTimeout(timeoutId);
  }, [currentMessages, sessionNotes, extractNotesFromMessages]);

  // 处理导出
  const handleExport = async () => {
    if (!sessionNotes) return;

    let content = '';
    if (exportFormat === 'markdown') {
      content = await exportNotesToMarkdown();
    } else {
      content = await exportNotesToJSON();
    }

    if (content) {
      const blob = new Blob([content], {
        type: exportFormat === 'markdown' ? 'text/markdown' : 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-notes-${sessionId}.${exportFormat === 'markdown' ? 'md' : 'json'}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // 处理生成摘要
  const handleGenerateSummary = async () => {
    await generateNotesSummary();
  };

  // 处理保存
  const handleSave = async () => {
    await saveNotes();
  };

  // 加载状态
  if (isLoading && !sessionNotes) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="theme-text-subtle h-6 w-6 animate-spin" />
        <span className="theme-text-subtle ml-2">{t('conversation.notes.loading')}</span>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
        <div className="flex items-start">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-red-500">
              {t('conversation.notes.error')}
            </h3>
            <p className="mt-1 text-sm text-red-500">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="ml-4 rounded p-1 text-red-500 transition-colors hover:bg-red-500/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 无笔记状态
  if (!sessionNotes) {
    return (
      <div className="theme-text-subtle p-8 text-center">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{t('conversation.notes.noNotes')}</p>
      </div>
    );
  }

  return (
    <div className="theme-panel flex h-full flex-col">
      {/* 头部 */}
      <div className="theme-border border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="theme-text text-lg font-semibold">
            {t('conversation.notes.title')}
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'markdown' | 'json')}
              className="theme-input-surface theme-border theme-text rounded border px-2 py-1 text-sm"
            >
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
            </select>
            <button
              onClick={handleExport}
              className="theme-button-ghost rounded p-2"
              title={t('conversation.notes.export')}
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleGenerateSummary}
              className="theme-button-ghost rounded p-2"
              title={t('conversation.notes.generateSummary')}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {/* 🔥 新增：手动触发笔记提取按钮 */}
            <button
              onClick={async () => {
                if (currentMessages.length > 0) {
                  await extractNotesFromMessages(currentMessages);
                  console.log('[SessionNotesPanel] 🔄 Manual extraction triggered');
                }
              }}
              className="rounded p-2 text-blue-500 transition-colors hover:bg-blue-500/10"
              title="从消息中重新提取笔记"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              className="theme-button-ghost rounded p-2"
              title={t('conversation.notes.save')}
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 会话信息 */}
        <div className="theme-text-subtle flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>
              {new Date(sessionNotes.started_at * 1000).toLocaleString()}
            </span>
          </div>
          <span>•</span>
          <span>技术概念: {sessionNotes.tech_concepts.length}</span>
          <span>•</span>
          <span>文件变更: {sessionNotes.file_changes.length}</span>
          <span>•</span>
          <span>待办任务: {sessionNotes.todo_tasks.length}</span>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* 技术概念 */}
        <CollapsibleSection
          title={t('conversation.notes.techConcepts')}
          icon={FileText}
          count={sessionNotes.tech_concepts.length}
        >
          <div className="space-y-2">
            {sessionNotes.tech_concepts.map((concept, index) => (
              <div
                key={index}
                className="theme-panel-muted flex items-start justify-between rounded p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="theme-text font-medium">
                      {concept.name}
                    </span>
                    <CategoryBadge category={concept.category} />
                  </div>
                  <p className="theme-text-muted text-sm">
                    {concept.description}
                  </p>
                </div>
                <span className="theme-text-subtle ml-2 text-xs">
                  {t('conversation.notes.mentions')}: {concept.mentions}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* 文件变更 */}
        <CollapsibleSection
          title={t('conversation.notes.fileChanges')}
          icon={FileText}
          count={sessionNotes.file_changes.length}
        >
          <div className="space-y-2">
            {sessionNotes.file_changes.map((change, index) => (
              <div
                key={index}
                className="theme-panel-muted rounded p-3"
              >
                <div className="flex items-start justify-between mb-1">
                  <code className="theme-text text-sm font-mono">
                    {change.path}
                  </code>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    change.action === 'created'
                      ? 'bg-green-500/10 text-green-500'
                      : change.action === 'deleted'
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-blue-500/10 text-blue-500'
                  }`}>
                    {change.action}
                  </span>
                </div>
                <p className="theme-text-muted text-sm">
                  {change.reason}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* 错误修复 */}
        <CollapsibleSection
          title={t('conversation.notes.errorFixes')}
          icon={AlertCircle}
          count={sessionNotes.error_fixes.length}
        >
          <div className="space-y-3">
            {sessionNotes.error_fixes.map((fix, index) => (
              <div
                key={index}
                className="rounded border border-red-500/20 bg-red-500/10 p-3"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-medium text-red-500">
                    {fix.error_type}
                  </span>
                  {fix.file_path && (
                    <code className="text-xs font-mono text-red-500">
                      {fix.file_path}
                    </code>
                  )}
                </div>
                <p className="mb-2 text-sm text-red-500">
                  {fix.error_message}
                </p>
                <p className="theme-text-muted text-sm">
                  <span className="theme-text font-medium">{t('conversation.notes.solution')}:</span> {fix.solution}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* 待办任务 */}
        <CollapsibleSection
          title={t('conversation.notes.todoTasks')}
          icon={CheckCircle}
          count={sessionNotes.todo_tasks.length}
        >
          <div className="space-y-2">
            {sessionNotes.todo_tasks.map((task, index) => (
              <div
                key={index}
                className="theme-panel-muted flex items-start justify-between rounded p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        task.status === 'completed'
                          ? 'bg-green-500'
                          : task.status === 'in_progress'
                          ? 'bg-yellow-500'
                          : 'theme-divider'
                      }`}
                    />
                    <span className="theme-text font-medium">
                      {task.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-1 rounded text-xs ${
                      task.status === 'completed'
                        ? 'bg-green-500/10 text-green-500'
                        : task.status === 'in_progress'
                        ? 'bg-yellow-500/10 text-yellow-500'
                        : 'theme-panel-elevated theme-text-muted'
                    }`}>
                      {task.status}
                    </span>
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* 摘要 */}
        {sessionNotes.summary && (
          <CollapsibleSection
            title={t('conversation.notes.summary')}
            icon={FileText}
            defaultOpen={false}
          >
            <div className="max-w-none text-sm">
              <pre className="theme-code-surface theme-border whitespace-pre-wrap rounded border p-3">
                {sessionNotes.summary}
              </pre>
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
