/**
 * 对话归档浏览面板
 *
 * 功能：
 * - 显示归档列表
 * - 查看归档详细内容
 * - 恢复归档到对话
 */

import React, { useEffect, useState } from 'react';
import { useConversationStore } from '../../stores/conversationStore';
import type { ArchiveInfo, ArchiveDetail } from '../../types/conversation';
import { useTranslation } from 'react-i18next';
import './ArchivePanel.css';

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
    // 加载归档列表
    loadArchives();
  }, [loadArchives]);

  const handleArchiveClick = async (archive: ArchiveInfo) => {
    const detail = await loadArchiveDetail(archive.id);
    if (detail) {
      setSelectedArchive(detail);
      setViewMode('detail');
    }
  };

  const handleRestore = () => {
    if (selectedArchive && onRestore) {
      onRestore(selectedArchive);
    }
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedArchive(null);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString(i18n.language);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (error) {
    return (
      <div className="archive-panel archive-panel--error">
        <div className="archive-panel__error">
          <p>{t('archive.error')}: {error}</p>
          <button onClick={onClose} className="archive-panel__close">×</button>
        </div>
      </div>
    );
  }

  if (viewMode === 'detail' && selectedArchive) {
    return (
      <div className="archive-panel">
        <div className="archive-panel__header">
          <div className="archive-panel__header-left">
            <button onClick={handleBack} className="archive-panel__back">
              ← {t('archive.back')}
            </button>
            <h3 className="archive-panel__title">{t('archive.detailTitle')}</h3>
          </div>
          <button onClick={onClose} className="archive-panel__close">×</button>
        </div>

        <div className="archive-panel__detail">
          <div className="archive-detail__meta">
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">{t('archive.labels.time')}</span>
              <span className="archive-detail__value">{formatDate(selectedArchive.timestamp)}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">{t('archive.labels.messageCount')}</span>
              <span className="archive-detail__value">{selectedArchive.message_count}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">{t('archive.labels.tokenCount')}</span>
              <span className="archive-detail__value">{selectedArchive.token_count.toLocaleString()}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">{t('archive.labels.format')}</span>
              <span className="archive-detail__value">{selectedArchive.format?.toUpperCase()}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">{t('archive.labels.size')}</span>
              <span className="archive-detail__value">{formatFileSize(selectedArchive.size)}</span>
            </div>
          </div>

          <div className="archive-detail__summary">
            <h4>{t('archive.summary')}</h4>
            <p>{selectedArchive.summary}</p>
          </div>

          <div className="archive-detail__actions">
            <button
              onClick={handleRestore}
              className="archive-panel__button archive-panel__button--primary"
            >
              {t('archive.restore')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="archive-panel">
      <div className="archive-panel__header">
        <h3 className="archive-panel__title">{t('archive.title')}</h3>
        <button onClick={onClose} className="archive-panel__close">×</button>
      </div>

      <div className="archive-panel__content">
        {isLoading ? (
          <div className="archive-panel__loading">{t('archive.loading')}</div>
        ) : archives.length === 0 ? (
          <div className="archive-panel__empty">
            <p>{t('archive.empty')}</p>
            <p className="archive-panel__empty-hint">{t('archive.emptyHint')}</p>
          </div>
        ) : (
          <div className="archive-list">
            {archives.map((archive) => (
              <div
                key={archive.id}
                onClick={() => handleArchiveClick(archive)}
                className="archive-list__item"
              >
                <div className="archive-list__item-main">
                  <div className="archive-list__item-time">
                    {formatDate(archive.timestamp)}
                  </div>
                  <div className="archive-list__item-summary">
                    {archive.summary_preview}
                  </div>
                </div>
                <div className="archive-list__item-meta">
                  <span className="archive-list__item-count">{archive.message_count} {t('archive.messages')}</span>
                  <span className="archive-list__item-tokens">
                    {archive.token_count.toLocaleString()} tokens
                  </span>
                  {archive.format && (
                    <span className="archive-list__item-format">
                      {archive.format.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
