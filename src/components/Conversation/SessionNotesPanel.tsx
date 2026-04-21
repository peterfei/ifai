/**
 * Section 5.3: 会话笔记组件
 *
 * 显示和编辑会话笔记的 React 组件
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationStore } from '../../stores/conversationStore';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
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
  const { t, i18n } = useTranslation();
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
  const formatDateTime = (value: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value * 1000);

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'pattern':
        return {
          label: t('conversation.notes.categories.pattern'),
          className: 'bg-[var(--info-soft-bg)] text-[var(--info-color)]'
        };
      case 'algorithm':
        return {
          label: t('conversation.notes.categories.algorithm'),
          className: 'bg-[var(--success-soft-bg)] text-[var(--success-color)]'
        };
      case 'framework':
        return {
          label: t('conversation.notes.categories.framework'),
          className: 'bg-[var(--warning-soft-bg)] text-[var(--warning-color)]'
        };
      case 'concept':
      default:
        return {
          label: t('conversation.notes.categories.concept'),
          className: 'bg-[var(--accent-soft-bg)] text-[var(--accent-color)]'
        };
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'low':
        return {
          label: t('conversation.notes.priorities.low'),
          className: 'theme-panel-elevated theme-text-muted'
        };
      case 'high':
        return {
          label: t('conversation.notes.priorities.high'),
          className: 'bg-[var(--danger-soft-bg)] text-[var(--danger-color)]'
        };
      case 'medium':
      default:
        return {
          label: t('conversation.notes.priorities.medium'),
          className: 'bg-[var(--warning-soft-bg)] text-[var(--warning-color)]'
        };
    }
  };

  const getFileActionBadge = (action: string) => {
    switch (action) {
      case 'created':
        return {
          label: t('conversation.notes.fileAction.created'),
          className: 'bg-[var(--success-soft-bg)] text-[var(--success-color)]'
        };
      case 'deleted':
        return {
          label: t('conversation.notes.fileAction.deleted'),
          className: 'bg-[var(--danger-soft-bg)] text-[var(--danger-color)]'
        };
      case 'modified':
      default:
        return {
          label: t('conversation.notes.fileAction.modified'),
          className: 'bg-[var(--accent-soft-bg)] text-[var(--accent-color)]'
        };
    }
  };

  const getTaskStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          label: t('conversation.notes.taskStatus.completed'),
          dotClass: 'bg-[var(--success-color)]',
          className: 'bg-[var(--success-soft-bg)] text-[var(--success-color)]'
        };
      case 'in_progress':
        return {
          label: t('conversation.notes.taskStatus.inProgress'),
          dotClass: 'bg-[var(--warning-color)]',
          className: 'bg-[var(--warning-soft-bg)] text-[var(--warning-color)]'
        };
      case 'pending':
      default:
        return {
          label: t('conversation.notes.taskStatus.pending'),
          dotClass: 'bg-[var(--border-strong)]',
          className: 'theme-panel-elevated theme-text-muted'
        };
    }
  };

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
      <div className="rounded-lg border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] p-4">
        <div className="flex items-start">
          <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--danger-color)]" />
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-[var(--danger-color)]">
              {t('conversation.notes.error')}
            </h3>
            <p className="mt-1 text-sm text-[var(--danger-color)]">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="theme-button-ghost theme-text-danger ml-4 rounded p-1 transition-colors hover:bg-[var(--danger-soft-bg)]"
            title={t('common.close')}
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
              <option value="markdown">{t('conversation.notes.exportFormats.markdown')}</option>
              <option value="json">{t('conversation.notes.exportFormats.json')}</option>
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
              className="theme-button-ghost theme-text-accent rounded p-2 transition-colors"
              title={t('conversation.notes.extractFromMessages')}
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
              {t('conversation.notes.startedAt')}: {formatDateTime(sessionNotes.started_at)}
            </span>
          </div>
          <span>•</span>
          <span>{t('conversation.notes.stats.techConcepts', { count: sessionNotes.tech_concepts.length })}</span>
          <span>•</span>
          <span>{t('conversation.notes.stats.fileChanges', { count: sessionNotes.file_changes.length })}</span>
          <span>•</span>
          <span>{t('conversation.notes.stats.todoTasks', { count: sessionNotes.todo_tasks.length })}</span>
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
              (() => {
                const badge = getCategoryBadge(concept.category);

                return (
                  <div
                    key={index}
                    className="theme-panel-muted flex items-start justify-between rounded p-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="theme-text font-medium">
                          {concept.name}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="theme-text-muted text-sm">
                        {concept.description}
                      </p>
                    </div>
                    <span className="theme-text-subtle ml-2 text-xs">
                      {t('conversation.notes.mentions')}: {concept.mentions}
                    </span>
                  </div>
                );
              })()
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
              (() => {
                const badge = getFileActionBadge(change.action);

                return (
                  <div
                    key={index}
                    className="theme-panel-muted rounded p-3"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <code className="theme-text text-sm font-mono">
                        {change.path}
                      </code>
                      <span className={`rounded px-2 py-1 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="theme-text-muted text-sm">
                      {change.reason}
                    </p>
                  </div>
                );
              })()
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
                className="rounded border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] p-3"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-medium text-[var(--danger-color)]">
                    {fix.error_type}
                  </span>
                  {fix.file_path && (
                    <code className="text-xs font-mono text-[var(--danger-color)]">
                      {fix.file_path}
                    </code>
                  )}
                </div>
                <p className="mb-2 text-sm text-[var(--danger-color)]">
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
              (() => {
                const statusBadge = getTaskStatusBadge(task.status);
                const priorityBadge = getPriorityBadge(task.priority);

                return (
                  <div
                    key={index}
                    className="theme-panel-muted flex items-start justify-between rounded p-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`h-2 w-2 rounded-full ${statusBadge.dotClass}`} />
                        <span className="theme-text font-medium">
                          {task.description}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded px-2 py-1 text-xs ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${priorityBadge.className}`}>
                          {priorityBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()
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
