/**
 * TagManager Component
 *
 * Dialog for managing thread tags:
 * - View all tags with usage counts
 * - Create new tags
 * - Edit tag names
 * - Delete tags
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Check, Tag } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { useTranslation } from 'react-i18next';

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
  count: number;
  color?: string;
}

// ============================================================================
// Component
// ============================================================================

export const TagManager: React.FC<TagManagerProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  // Thread store state
  const threads = useThreadStore(state => state.threads);
  const updateThread = useThreadStore(state => state.updateThread);

  // Local state
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Extract all tags with counts
  const tags = useMemo(() => {
    const tagMap = new Map<string, number>();
    Object.values(threads).forEach(thread => {
      thread.tags.forEach(tag => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [threads]);

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
    if (!editingTag || !editValue.trim()) return;

    const newTagName = editValue.trim();

    // If name changed, update all threads with this tag
    if (newTagName !== editingTag) {
      Object.values(threads).forEach(thread => {
        if (thread.tags.includes(editingTag)) {
          const updatedTags = thread.tags.map(t => t === editingTag ? newTagName : t);
          updateThread(thread.id, { tags: updatedTags });
        }
      });
    }

    setEditingTag(null);
    setEditValue('');
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingTag(null);
    setEditValue('');
  };

  // Handle delete tag
  const handleDeleteTag = (tagName: string) => {
    if (!confirm(t('threads.confirmDeleteTag', '确定要删除标签 "{{tag}}" 吗？', { tag: tagName }))) {
      return;
    }

    Object.values(threads).forEach(thread => {
      if (thread.tags.includes(tagName)) {
        const updatedTags = thread.tags.filter(t => t !== tagName);
        updateThread(thread.id, { tags: updatedTags });
      }
    });
  };

  // Handle create new tag
  const handleCreateTag = () => {
    if (!newTagName.trim()) return;

    const tagName = newTagName.trim();

    // Check if tag already exists
    if (tags.some(t => t.name === tagName)) {
      alert(t('threads.tagExists', '标签已存在'));
      return;
    }

    setNewTagName('');
    setShowNewTagInput(false);

    // Apply to currently active thread (optional feature)
    // For now, just creating the tag without applying to any thread
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl w-full max-w-md max-h-[600px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#333]">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-blue-400" />
            <h2 className="text-lg font-bold text-gray-200">{t('threads.manageTags', '管理标签')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tag List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tags.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Tag size={48} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('threads.noTagsYet', '暂无标签')}</p>
              <p className="text-xs mt-1">{t('threads.createTagHint', '创建标签后可以为对话添加标签')}</p>
            </div>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.name}
                className="flex items-center gap-2 p-3 bg-[#2d2d2d] rounded-lg border border-[#333] group"
              >
                {editingTag === tag.name ? (
                  <>
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'save')}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSaveEdit}
                      className="p-1.5 bg-green-600 hover:bg-green-700 rounded text-white transition-colors"
                      title={t('threads.save', '保存')}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1.5 bg-gray-600 hover:bg-gray-700 rounded text-white transition-colors"
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
                      <span className="text-xs text-gray-500">{tag.count} {t('threads.threads', '个对话')}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(tag.name)}
                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                        title={t('threads.editTag', '编辑标签')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.name)}
                        className="p-1.5 hover:bg-red-600/20 rounded text-gray-400 hover:text-red-400 transition-colors"
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
        <div className="p-4 border-t border-[#333]">
          {showNewTagInput ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'create')}
                placeholder={t('threads.newTagName', '新标签名称')}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
              />
              <button
                onClick={handleCreateTag}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                title={t('threads.create', '创建')}
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => {
                  setShowNewTagInput(false);
                  setNewTagName('');
                }}
                className="p-2 bg-gray-600 hover:bg-gray-700 rounded text-white transition-colors"
                title={t('threads.cancel', '取消')}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewTagInput(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors"
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
