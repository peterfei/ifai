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
import './ArchivePanel.css';

export interface ArchivePanelProps {
  onRestore?: (archive: ArchiveDetail) => void;
  onClose?: () => void;
}

export const ArchivePanel: React.FC<ArchivePanelProps> = ({ onRestore, onClose }) => {
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
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
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
          <p>加载归档失败: {error}</p>
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
              ← 返回
            </button>
            <h3 className="archive-panel__title">归档详情</h3>
          </div>
          <button onClick={onClose} className="archive-panel__close">×</button>
        </div>

        <div className="archive-panel__detail">
          <div className="archive-detail__meta">
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">时间</span>
              <span className="archive-detail__value">{formatDate(selectedArchive.timestamp)}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">消息数</span>
              <span className="archive-detail__value">{selectedArchive.message_count}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">Token 数</span>
              <span className="archive-detail__value">{selectedArchive.token_count.toLocaleString()}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">格式</span>
              <span className="archive-detail__value">{selectedArchive.format?.toUpperCase()}</span>
            </div>
            <div className="archive-detail__meta-item">
              <span className="archive-detail__label">大小</span>
              <span className="archive-detail__value">{formatFileSize(selectedArchive.size)}</span>
            </div>
          </div>

          <div className="archive-detail__summary">
            <h4>对话总结</h4>
            <p>{selectedArchive.summary}</p>
          </div>

          <div className="archive-detail__actions">
            <button
              onClick={handleRestore}
              className="archive-panel__button archive-panel__button--primary"
            >
              恢复此归档
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="archive-panel">
      <div className="archive-panel__header">
        <h3 className="archive-panel__title">对话归档</h3>
        <button onClick={onClose} className="archive-panel__close">×</button>
      </div>

      <div className="archive-panel__content">
        {isLoading ? (
          <div className="archive-panel__loading">加载中...</div>
        ) : archives.length === 0 ? (
          <div className="archive-panel__empty">
            <p>暂无归档</p>
            <p className="archive-panel__empty-hint">对话压缩后会自动创建归档</p>
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
                  <span className="archive-list__item-count">{archive.message_count} 条消息</span>
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
