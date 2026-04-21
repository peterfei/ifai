import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Clock3,
  FileArchive,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConversationStore } from '../../stores/conversationStore';
import type { ArchiveDetail, ArchiveInfo } from '../../types/conversation';
import { formatFileSize, formatLocalizedNumber } from '../Skills/skillUi';

export interface ArchivePanelProps {
  onRestore?: (archive: ArchiveDetail) => void;
  onClose?: () => void;
}

export const ArchivePanel: React.FC<ArchivePanelProps> = ({ onRestore, onClose }) => {
  const { t, i18n } = useTranslation();
  const { archives, isLoading, error, loadArchives, loadArchiveDetail } = useConversationStore();
  const [selectedArchive, setSelectedArchive] = useState<ArchiveDetail | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    loadArchives();
  }, [loadArchives]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language]
  );

  const formatDate = (timestamp: number) => {
    return dateFormatter.format(new Date(timestamp * 1000));
  };

  const handleArchiveClick = async (archive: ArchiveInfo) => {
    const detail = await loadArchiveDetail(archive.id);
    if (detail) {
      setSelectedArchive(detail);
      setViewMode('detail');
    }
  };

  const handleBack = () => {
    setSelectedArchive(null);
    setViewMode('list');
  };

  const headerActions = (
    <button
      type="button"
      onClick={onClose}
      className="theme-button-ghost theme-focus-ring-accent rounded-md p-1.5"
      title={t('archivePanel.close')}
      aria-label={t('archivePanel.close')}
    >
      <X size={16} />
    </button>
  );

  if (error) {
    return (
      <div className="theme-panel flex h-full w-full flex-col overflow-hidden">
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Archive size={16} className="theme-text-accent" />
            <h3 className="theme-text text-sm font-semibold">{t('archivePanel.title')}</h3>
          </div>
          {headerActions}
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="theme-surface-danger max-w-md rounded-lg p-4">
            <div className="theme-text-danger text-sm font-medium">
              {t('archivePanel.errorTitle')}
            </div>
            <div className="theme-text-muted mt-2 text-sm">
              {t('archivePanel.errorDescription', { error })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-panel flex h-full w-full flex-col overflow-hidden">
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {viewMode === 'detail' ? (
            <button
              type="button"
              onClick={handleBack}
              className="theme-button-ghost theme-focus-ring-accent rounded-md p-1.5"
              title={t('archivePanel.back')}
              aria-label={t('archivePanel.back')}
            >
              <ArrowLeft size={16} />
            </button>
          ) : (
            <Archive size={16} className="theme-text-accent" />
          )}
          <h3 className="theme-text text-sm font-semibold">
            {viewMode === 'detail' ? t('archivePanel.detailTitle') : t('archivePanel.title')}
          </h3>
        </div>
        {headerActions}
      </div>

      {viewMode === 'detail' && selectedArchive ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section className="theme-panel-muted theme-border grid gap-3 rounded-lg border p-4 md:grid-cols-2">
              <MetaItem
                icon={Clock3}
                label={t('archivePanel.meta.time')}
                value={formatDate(selectedArchive.timestamp)}
              />
              <MetaItem
                icon={MessageSquare}
                label={t('archivePanel.meta.messages')}
                value={t('archivePanel.messageCount', {
                  value: formatLocalizedNumber(selectedArchive.message_count, i18n.language),
                })}
              />
              <MetaItem
                icon={Archive}
                label={t('archivePanel.meta.tokens')}
                value={formatLocalizedNumber(selectedArchive.token_count, i18n.language)}
              />
              <MetaItem
                icon={FileArchive}
                label={t('archivePanel.meta.format')}
                value={selectedArchive.format?.toUpperCase() ?? '-'}
              />
              <MetaItem
                icon={Archive}
                label={t('archivePanel.meta.size')}
                value={formatFileSize(selectedArchive.size, i18n.language)}
              />
            </section>

            <section className="theme-panel-muted theme-border rounded-lg border p-4">
              <div className="theme-text-muted mb-2 text-xs font-semibold uppercase tracking-[0.1em]">
                {t('archivePanel.summaryTitle')}
              </div>
              <div className="theme-text whitespace-pre-wrap text-sm leading-relaxed">
                {selectedArchive.summary}
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => selectedArchive && onRestore?.(selectedArchive)}
                className="theme-button-primary theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
              >
                <RotateCcw size={14} />
                {t('archivePanel.restore')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="theme-text-subtle flex h-full items-center justify-center gap-2 text-sm">
              <RefreshCw size={16} className="animate-spin" />
              <span>{t('archivePanel.loading')}</span>
            </div>
          ) : archives.length === 0 ? (
            <div className="theme-text-subtle flex h-full flex-col items-center justify-center gap-3 text-center">
              <Archive size={30} className="opacity-50" />
              <div>
                <div className="theme-text-muted text-sm">{t('archivePanel.emptyTitle')}</div>
                <div className="mt-1 text-xs">{t('archivePanel.emptyDescription')}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {archives.map((archive) => (
                <button
                  key={archive.id}
                  type="button"
                  onClick={() => handleArchiveClick(archive)}
                  className="theme-panel-muted theme-border theme-hoverable w-full rounded-lg border p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="theme-text-subtle text-xs">{formatDate(archive.timestamp)}</div>
                      <div className="theme-text mt-1 line-clamp-2 text-sm leading-relaxed">
                        {archive.summary_preview}
                      </div>
                    </div>
                    {archive.format && (
                      <span className="theme-panel theme-border theme-text-subtle shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase">
                        {archive.format}
                      </span>
                    )}
                  </div>
                  <div className="theme-text-subtle mt-3 flex flex-wrap items-center gap-4 text-xs">
                    <span>{t('archivePanel.messageCount', { value: formatLocalizedNumber(archive.message_count, i18n.language) })}</span>
                    <span>{t('archivePanel.tokens', { value: formatLocalizedNumber(archive.token_count, i18n.language) })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface MetaItemProps {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  value: string;
}

const MetaItem: React.FC<MetaItemProps> = ({ icon: Icon, label, value }) => {
  return (
    <div className="theme-panel flex items-start gap-3 rounded-lg p-3">
      <Icon size={16} className="theme-text-subtle mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="theme-text-subtle text-[11px] font-medium uppercase tracking-[0.08em]">
          {label}
        </div>
        <div className="theme-text mt-1 text-sm">{value}</div>
      </div>
    </div>
  );
};
