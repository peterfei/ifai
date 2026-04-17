/**
 * TagManager Component
 *
 * Dialog for managing thread tags:
 * - View tags for the current thread
 * - Create new tags
 * - Edit tag names
 * - Delete tags
 *
 * Tags are thread-isolated - each thread has its own set of tags
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Check, Tag } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';

// ============================================================================
// Types
// ============================================================================

interface TagManagerProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
}

interface TagInfo {
  name: string;
}

// ============================================================================
// Component
// ============================================================================

export const TagManager: React.FC<TagManagerProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);

  // Thread store state
  const activeThreadId = useThreadStore(state => state.activeThreadId);
  const threads = useThreadStore(state => state.threads);
  const updateThread = useThreadStore(state => state.updateThread);

  // Local state
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get current thread's tags
  const currentThread = activeThreadId ? threads[activeThreadId] : null;
  const tags = useMemo(() => {
    if (!currentThread) return [];
    return currentThread.tags.map(name => ({ name }));
  }, [currentThread]);

  // Focus input when editing
  useEffect(() => {
    if (editingTag && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTag]);

  // Focus input when creating new tag
  useEffect(() => {
    if (showNewTagInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewTagInput]);

  // Handle start edit
  const handleStartEdit = (tagName: string) => {
    setEditingTag(tagName);
    setEditValue(tagName);
  };

  // Handle save edit
  const handleSaveEdit = () => {
    if (!editingTag || !editValue.trim() || !activeThreadId) return;

    const newTagName = editValue.trim();
    const currentThread = threads[activeThreadId];

    if (!currentThread) return;

    // If name changed, update current thread's tags
    if (newTagName !== editingTag) {
      const updatedTags = currentThread.tags.map(t => t === editingTag ? newTagName : t);
      updateThread(activeThreadId, { tags: updatedTags });
    }

    setEditingTag(null);
    setEditValue('');
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingTag(null);
    setEditValue('');
  };

  // Handle delete tag (from current thread only)
  const handleDeleteTag = (tagName: string) => {
    if (!activeThreadId) return;
    if (!confirm(t('threads.confirmDeleteTag', '确定要删除标签 "{{tag}}" 吗？', { tag: tagName }))) {
      return;
    }

    const currentThread = threads[activeThreadId];
    if (!currentThread) return;

    // Remove tag from current thread only
    const updatedTags = currentThread.tags.filter(t => t !== tagName);
    updateThread(activeThreadId, { tags: updatedTags });
  };

  // Handle create new tag (add to current thread)
  const handleCreateTag = () => {
    if (!newTagName.trim() || !activeThreadId) return;

    const tagName = newTagName.trim();
    const currentThread = threads[activeThreadId];

    if (!currentThread) return;

    // Check if tag already exists in current thread
    if (currentThread.tags.includes(tagName)) {
      alert(t('threads.tagExists', '标签已存在'));
      return;
    }

    // Add tag to current thread
    const updatedTags = [...currentThread.tags, tagName];
    updateThread(activeThreadId, { tags: updatedTags });

    setNewTagName('');
    setShowNewTagInput(false);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent, action: 'save' | 'cancel' | 'create') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (action === 'save') handleSaveEdit();
      if (action === 'create') handleCreateTag();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (action === 'save' || action === 'create') {
        setEditingTag(null);
        setShowNewTagInput(false);
        setEditValue('');
        setNewTagName('');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="theme-backdrop-strong fixed inset-0 z-[10000] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div
        className="theme-panel-elevated border theme-border rounded-xl theme-shadow w-full max-w-md max-h-[600px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b theme-border">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-blue-400" />
            <div>
              <h2 className="text-lg font-bold theme-text">{t('threads.manageTags', '管理标签')}</h2>
              {currentThread && (
                <p className="text-xs theme-text-subtle">{currentThread.title}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors theme-button-ghost"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tag List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!activeThreadId ? (
            <div className="text-center py-8 theme-text-subtle">
              <Tag size={48} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('threads.noActiveThread', '无活动会话')}</p>
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8 theme-text-subtle">
              <Tag size={48} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('threads.noTagsYet', '当前会话暂无标签')}</p>
              <p className="text-xs mt-1">{t('threads.createTagHint', '创建标签后可以为当前会话添加标签')}</p>
            </div>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.name}
                className="flex items-center gap-2 p-3 theme-panel-muted rounded-lg border theme-border group"
              >
                {editingTag === tag.name ? (
                  <>
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'save')}
                      className="flex-1 theme-input-surface border theme-border rounded px-2 py-1 text-sm theme-text outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSaveEdit}
                      className="p-1.5 theme-button-success rounded"
                      title={t('threads.save', '保存')}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1.5 theme-button-secondary rounded"
                      title={t('threads.cancel', '取消')}
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">
                        {tag.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(tag.name)}
                        className="p-1.5 rounded transition-colors theme-button-ghost"
                        title={t('threads.editTag', '编辑标签')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.name)}
                        className="p-1.5 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                        title={t('threads.deleteTag', '删除标签')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Create New Tag */}
        <div className="p-4 border-t theme-border">
          {showNewTagInput ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'create')}
                placeholder={t('threads.newTagName', '新标签名称')}
                className="flex-1 theme-input-surface border theme-border rounded px-3 py-2 text-sm theme-text outline-none focus:border-blue-500"
              />
              <button
                onClick={handleCreateTag}
                className="p-2 theme-button-primary rounded"
                title={t('threads.create', '创建')}
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => {
                  setShowNewTagInput(false);
                  setNewTagName('');
                }}
                className="p-2 theme-button-secondary rounded"
                title={t('threads.cancel', '取消')}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewTagInput(true)}
              className={dark
                ? 'w-full flex items-center justify-center gap-2 px-4 py-2 theme-button-secondary border-dashed rounded-lg theme-text-subtle hover:text-[var(--text-primary)] transition-colors'
                : 'w-full flex items-center justify-center gap-2 px-4 py-2 theme-button-secondary border-dashed rounded-lg theme-text-muted hover:text-[var(--text-primary)] transition-colors'
              }
            >
              <Plus size={16} />
              <span className="text-sm">{t('threads.createNewTag', '创建新标签')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Hook for easy usage
// ============================================================================

export const useTagManager = () => {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    TagManagerComponent: () => <TagManager isOpen={isOpen} onClose={() => setIsOpen(false)} />,
  };
};
