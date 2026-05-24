import React, { useMemo, useState } from 'react';
import { Plus, Search, Gamepad2, Shield, Cpu, ChevronRight, Users, Edit, Pin, Trash2 } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { ThreadManager } from '../../stores/threadManager';
import { ConversationContextMenu, type MenuItem, type MenuStrategy, type MenuContext } from '../conversation/ConversationContextMenu';
import { ConfirmDialog } from '../../components/UI/ConfirmDialog';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { STATUS_PALETTE } from '../conversation/PALETTE';
import type { ThreadStatus } from '../../stores/threadStore';
import type { Thread } from '../../stores/threadStore';

/* ===== DSL 数据驱动 ===== */

const STATUS_MAP: Partial<Record<string, ThreadStatus>> = {
  active: 'active',
  idle: 'idle',
  working: 'working',
  completed: 'idle', // 映射 completed 到 idle
  pending: 'idle', // 映射 pending 到 idle
  archived: 'archived',
};

const STATUS_LABEL: Record<ThreadStatus, string> = {
  active: '活跃',
  idle: '空闲',
  working: '工作中',
  archived: '已归档',
  deleted: '已删除',
};

/* ===== 组件 ===== */

export function ConversationListPanel() {
  const { t } = useTranslation();
  const threads = useThreadStore((s) => s.threads);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const searchQuery = useThreadStore((s) => s.searchQuery);
  const setSearchQuery = useThreadStore((s) => s.setSearchQuery);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    threadId: string;
    position: { x: number; y: number };
  } | null>(null);

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // 删除确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    threadId: string | null;
    title: string;
  }>({ open: false, threadId: null, title: '' });

  const sortedThreads = useMemo(() => {
    return Object.values(threads)
      .filter((th) => th.status !== 'deleted')
      .filter((th) => !searchQuery || th.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return b.updatedAt - a.updatedAt;
      });
  }, [threads, searchQuery]);

  const handleNewThread = () => {
    const id = ThreadManager.create({ title: t('common.untitled', '新对话') });
    ThreadManager.switch(id);
  };

  // 删除确认处理器
  const handleConfirmDelete = async () => {
    if (confirmDialog.threadId) {
      await ThreadManager.delete(confirmDialog.threadId);

      // 删除当前对话自动切换
      if (activeThreadId === confirmDialog.threadId) {
        const remaining = Object.values(threads).filter(
          t => t.status !== 'deleted' && t.id !== confirmDialog.threadId
        );
        if (remaining.length > 0) {
          ThreadManager.switch(remaining[0].id);
        } else {
          ThreadManager.create({ title: '新对话' });
        }
      }
    }
    setConfirmDialog({ open: false, threadId: null, title: '' });
    setContextMenu(null);
  };

  const handleCancelDelete = () => {
    setConfirmDialog({ open: false, threadId: null, title: '' });
  };

  // ========== 声明式菜单配置 ==========
  const menuItems: MenuItem[] = useMemo(() => [
    {
      id: 'rename',
      label: '重命名',
      icon: Edit,
      action: 'edit',
    },
    {
      id: 'togglePin',
      label: (thread: Thread) => thread.pinned ? '取消置顶' : '置顶对话',
      icon: Pin,
      action: 'toggleProperty',
      payload: { key: 'pinned' },
    },
    {
      id: 'delete',
      label: '删除对话',
      icon: Trash2,
      action: 'deleteWithConfirm',
      danger: true,
    },
  ], []);

  // ========== 策略注册表 ==========
  const menuStrategies: Record<string, MenuStrategy> = useMemo(() => ({
    edit: (thread: Thread, _, ctx: MenuContext) => {
      ctx.setEditingId(thread.id);
      ctx.setEditValue(thread.title);
    },

    toggleProperty: (thread: Thread, { key }: { key: string }, _ctx: MenuContext) => {
      ThreadManager.update(thread.id, { [key]: !thread[key as keyof Thread] });
    },

    deleteWithConfirm: async (thread: Thread, _, ctx: MenuContext) => {
      // 触发确认对话框
      setConfirmDialog({
        open: true,
        threadId: thread.id,
        title: thread.title,
      });
    },
  }), [threads, activeThreadId]);

  // 菜单上下文
  const menuContext: MenuContext = useMemo(() => ({
    threads,
    activeThreadId,
    setEditingId,
    setEditValue,
  }), [threads, activeThreadId]);

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      threadId,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  return (
    <div
      data-testid="conversation-list-panel"
      className="flex flex-col bg-[#1E1E1E] border-r border-[#2D2D2D]"
      style={{ flex: '1 1 0%', minHeight: 0 }}
    >
      {/* 新建对话 */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={handleNewThread}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          <span>新建对话</span>
        </button>
      </div>

      {/* 技能广场 */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#2D2D2D] cursor-pointer transition-colors group">
          <div className="flex items-center gap-2.5">
            <Gamepad2 size={16} className="text-[#9CA3AF]" />
            <span className="text-sm font-medium text-[#D1D5DB]">技能广场</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#9CA3AF]">42个</span>
            <ChevronRight size={14} className="text-[#6B7280] group-hover:text-[#9CA3AF] transition-colors" />
          </div>
        </div>
      </div>

      {/* 搜索 */}
      <div className="px-4 py-1.5">
        <div className="flex items-center gap-2 rounded-lg bg-[#2D2D2D] border border-[#3F3F3F] px-3 py-2 focus-within:border-[#3B82F6] transition-colors">
          <Search size={14} className="text-[#6B7280]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#6B7280]"
          />
        </div>
      </div>

      {/* 对话列表标题 */}
      <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#9CA3AF]">对话列表</span>
        <span className="text-xs text-[#6B7280]">{sortedThreads.length}</span>
      </div>

      {/* 对话卡片列表 — min-h-0 确保 flex 收缩 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        {sortedThreads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-[#6B7280] text-sm">
            {searchQuery ? '无匹配结果' : '暂无对话'}
          </div>
        )}
        {sortedThreads.map((thread) => {
          const status: ThreadStatus = STATUS_MAP[thread.status] || 'active';
          const color = STATUS_PALETTE[status];
          const isActive = activeThreadId === thread.id;
          const agentCount = thread.agentTasks?.length ?? 0;
          const isEditing = editingId === thread.id;

          return (
            <div key={thread.id} className="relative">
              {/* 编辑状态：重命名输入框 */}
              {isEditing && (
                <input
                  data-testid="rename-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    ThreadManager.updateTitle(thread.id, editValue);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      ThreadManager.updateTitle(thread.id, editValue);
                      setEditingId(null);
                    }
                    if (e.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  className="absolute inset-0 w-full px-3 py-3 text-sm font-semibold bg-[#1E1E1E] border border-[#3B82F6] outline-none rounded-lg mb-3 z-10"
                  style={{ color: isActive ? '#fff' : '#E5E7EB' }}
                  autoFocus
                />
              )}

              {/* 对话卡片按钮 */}
              <button
                data-thread-id={thread.id}
                onClick={() => ThreadManager.switch(thread.id)}
                onContextMenu={(e) => handleContextMenu(e, thread.id)}
                className={clsx(
                  'w-full rounded-lg px-3 py-3 text-left transition-all mb-3',
                  'border border-transparent',
                  isActive
                    ? 'bg-[#293449] border-[rgba(59,130,246,0.3)]'
                    : 'bg-[#1F2937] hover:bg-[#273344]'
                )}
                style={{ visibility: isEditing ? 'hidden' : 'visible' }}
              >
                {/* 标题行 + 置顶标识 */}
                <div className="flex items-center justify-between gap-2">
                  <span className={clsx(
                    'block text-sm font-semibold truncate flex-1',
                    isActive ? 'text-white' : 'text-[#E5E7EB]'
                  )}>
                    {thread.title}
                  </span>

                  {/* 置顶标识 */}
                  {thread.pinned && (
                    <Pin size={14} className="text-[#3B82F6] flex-shrink-0" data-testid="pinned-icon" />
                  )}
                </div>

                {/* 描述 */}
                <p className="mt-1 text-[13px] text-[#9CA3AF] truncate">
                  {thread.messageCount > 0 ? `${thread.messageCount} 条消息` : '空对话'}
                </p>

              {/* 底部：状态 + Agent数 + 时间 */}
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* 纯色状态标签 — inline style */}
                  <span
                    data-status={status}
                    style={{
                      backgroundColor: color.bg,
                      color: '#fff',
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#fff' }} />
                    {STATUS_LABEL[status]}
                  </span>
                  {/* Agent 数量 */}
                  {agentCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                      <Users size={11} />
                      {agentCount}个Agent
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#6B7280]">
                  {formatRelativeTime(thread.updatedAt)}
                </span>
              </div>
            </button>
            </div>
          );
        })}
      </div>

      {/* 底部状态栏 */}
      <div className="px-4 py-2.5 border-t border-[#2D2D2D] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Shield size={12} className="text-[#10B981]" />
          <span className="text-xs text-[#9CA3AF]">隐私模式</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Cpu size={12} className="text-[#9CA3AF]" />
          <span className="text-xs text-[#9CA3AF]">本地模型</span>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ConversationContextMenu
          thread={threads[contextMenu.threadId]}
          items={menuItems}
          strategies={menuStrategies}
          position={contextMenu.position}
          context={menuContext}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={`删除"${confirmDialog.title}"？`}
        description="此操作不可恢复。删除后对话将永久消失。"
        confirmLabel="删除"
        cancelLabel="取消"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}
