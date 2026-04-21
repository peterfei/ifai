/**
 * ThreadContextMenu Component
 *
 * Context menu for thread tabs with the following options:
 * - Rename (F2)
 * - Toggle Pin
 * - Add Tag
 * - Copy Title
 * - Thread Details
 * - Delete (Ctrl+W)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Edit3,
  Pin,
  PinOff,
  Tag,
  Copy,
  Info,
  Trash2,
  X,
  MessageSquare,
  Clock,
  Hash,
} from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import type { Thread } from '../../stores/threadStore';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { formatKeybinding } from '../../utils/keyboard';
import { ConfirmDialog } from '../UI/ConfirmDialog';

interface ThreadContextMenuProps {
  x: number;
  y: number;
  thread: Thread | null;
  onClose: () => void;
  onStartRename?: (threadId: string) => void;
  onShowTagManager?: () => void;
}

interface ThreadDetailsDialogProps {
  thread: Thread;
  onClose: () => void;
}

// Thread Details Dialog
const ThreadDetailsDialog: React.FC<ThreadDetailsDialogProps> = ({ thread, onClose }) => {
  const { t, i18n } = useTranslation();

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(i18n.language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div
      className="theme-backdrop-strong fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="theme-panel-elevated theme-border theme-shadow min-w-[400px] max-w-[500px] rounded-xl border p-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="theme-surface-info theme-border rounded-lg border p-2">
            <MessageSquare size={20} className="theme-text-info" />
          </div>
          <div className="flex-1">
            <h3 className="theme-text truncate text-lg font-semibold">{thread.title}</h3>
            <p className="theme-text-subtle mt-0.5 text-xs">{t('threads.details')}</p>
          </div>
          <button
            onClick={onClose}
            className="theme-button-ghost rounded-lg p-1.5"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div className="theme-panel-muted flex items-center gap-3 rounded-lg p-3">
            <Hash size={16} className="theme-text-subtle" />
            <div className="flex-1">
              <div className="theme-text-subtle text-xs">{t('threads.threadId')}</div>
              <div className="theme-text font-mono text-sm">{thread.id.slice(0, 8)}...</div>
            </div>
          </div>

          <div className="theme-panel-muted flex items-center gap-3 rounded-lg p-3">
            <MessageSquare size={16} className="theme-text-subtle" />
            <div className="flex-1">
              <div className="theme-text-subtle text-xs">{t('threads.messageCount')}</div>
              <div className="theme-text text-sm">{t('threads.messageCountValue', { count: thread.messageCount })}</div>
            </div>
          </div>

          <div className="theme-panel-muted flex items-center gap-3 rounded-lg p-3">
            <Clock size={16} className="theme-text-subtle" />
            <div className="flex-1">
              <div className="theme-text-subtle text-xs">{t('threads.createdAt')}</div>
              <div className="theme-text text-sm">{formatTimestamp(thread.createdAt)}</div>
            </div>
          </div>

          <div className="theme-panel-muted flex items-center gap-3 rounded-lg p-3">
            <Clock size={16} className="theme-text-subtle" />
            <div className="flex-1">
              <div className="theme-text-subtle text-xs">{t('threads.lastActive')}</div>
              <div className="theme-text text-sm">{formatTimestamp(thread.lastActiveAt)}</div>
            </div>
          </div>

          {thread.tags && thread.tags.length > 0 && (
            <div className="theme-panel-muted flex items-center gap-3 rounded-lg p-3">
              <Tag size={16} className="theme-text-subtle" />
              <div className="flex-1">
                <div className="theme-text-subtle text-xs">{t('threads.tags')}</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {thread.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="theme-badge-info rounded px-2 py-0.5 text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {thread.description && (
            <div className="theme-panel-muted rounded-lg p-3">
              <div className="theme-text-subtle mb-1 text-xs">{t('threads.description')}</div>
              <div className="theme-text text-sm">{thread.description}</div>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="theme-button-primary rounded-lg px-5 py-2.5 text-sm font-medium"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ThreadContextMenu: React.FC<ThreadContextMenuProps> = ({
  x,
  y,
  thread,
  onClose,
  onStartRename,
  onShowTagManager,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteThread = useThreadStore(state => state.deleteThread);
  const toggleThreadPinned = useThreadStore(state => state.toggleThreadPinned);
  const closeThreadShortcut = formatKeybinding('Mod+w');

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showDetails) {
          setShowDetails(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, showDetails]);

  if (!thread) return null;

  const handleRename = () => {
    onStartRename?.(thread.id);
    onClose();
  };

  const handleTogglePin = () => {
    toggleThreadPinned(thread.id);
    toast.success(thread.pinned ? t('threads.unpinned') : t('threads.pinned'));
    onClose();
  };

  const handleAddTag = () => {
    onShowTagManager?.();
    onClose();
  };

  const handleCopyTitle = async () => {
    try {
      await navigator.clipboard.writeText(thread.title);
      toast.success(t('common.copiedToClipboard'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
    onClose();
  };

  const handleShowDetails = () => {
    setShowDetails(true);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
    onClose();
  };

  // Position menu to avoid going off-screen
  const positionMenu = () => {
    const menuWidth = 200;
    const menuHeight = 300;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = x;
    let top = y;

    if (left + menuWidth > screenWidth) {
      left = screenWidth - menuWidth - 10;
    }
    if (top + menuHeight > screenHeight) {
      top = screenHeight - menuHeight - 10;
    }

    return { left, top };
  };

  const pos = positionMenu();

  return (
    <>
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('threads.deleteThread')}
        description={t('threads.confirmDeleteThread', { title: thread.title })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        tone="danger"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteThread(thread.id);
          toast.success(t('common.deletedSuccessfully'));
          setShowDeleteConfirm(false);
        }}
      />
      {showDetails && <ThreadDetailsDialog thread={thread} onClose={() => setShowDetails(false)} />}
      <div
        ref={menuRef}
        className="theme-panel-elevated theme-border theme-shadow fixed z-50 min-w-48 rounded-lg border py-1"
        style={{ left: pos.left, top: pos.top }}
      >
        {/* Rename */}
        <MenuItem
          icon={<Edit3 size={14} />}
          label={t('common.rename')}
          shortcut="F2"
          onClick={handleRename}
        />

        <div className="theme-border my-1 border-t" />

        {/* Toggle Pin */}
        <MenuItem
          icon={thread.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          label={thread.pinned ? t('threads.unpin') : t('threads.pin')}
          onClick={handleTogglePin}
        />

        {/* Add Tag */}
        <MenuItem
          icon={<Tag size={14} />}
          label={t('threads.addTag')}
          onClick={handleAddTag}
        />

        <div className="theme-border my-1 border-t" />

        {/* Copy Title */}
        <MenuItem
          icon={<Copy size={14} />}
          label={t('threads.copyTitle')}
          onClick={handleCopyTitle}
        />

        {/* Thread Details */}
        <MenuItem
          icon={<Info size={14} />}
          label={t('threads.details')}
          onClick={handleShowDetails}
        />

        <div className="theme-border my-1 border-t" />

        {/* Delete */}
        <MenuItem
          icon={<Trash2 size={14} />}
          label={t('common.delete')}
          shortcut={closeThreadShortcut}
          onClick={handleDelete}
          className="theme-text-danger hover:bg-[var(--danger-soft-bg)]"
        />
      </div>
    </>
  );
};

interface MenuItemProps {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  shortcut?: string;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, onClick, className = '', shortcut }) => {
  return (
    <div
      className={clsx('theme-hoverable theme-text-muted flex cursor-pointer items-center justify-between px-3 py-2 text-sm', className)}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="opacity-80">{icon}</span>}
        <span>{label}</span>
      </div>
      {shortcut && <span className="theme-text-subtle text-xs">{shortcut}</span>}
    </div>
  );
};
