import React, { useMemo } from 'react';
import { Plus, Search, Gamepad2, Shield, Cpu, ChevronRight, Users } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { switchThread } from '../../stores/useChatStore';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

/* ===== DSL 数据驱动 ===== */

type ThreadStatus = 'active' | 'completed' | 'pending';

const STATUS_MAP: Record<string, ThreadStatus> = {
  active: 'active',
  completed: 'completed',
  pending: 'pending',
  idle: 'pending',
};

/* 纯色背景 + 白色文字 */
const STATUS_STYLE: Record<ThreadStatus, { bg: string; text: string; label: string }> = {
  active:    { bg: 'bg-[#10B981]', text: 'text-white', label: '工作中' },
  completed: { bg: 'bg-[#6B7280]', text: 'text-white', label: '已完成' },
  pending:   { bg: 'bg-[#F59E0B]', text: 'text-white', label: '待处理' },
};

/* Mock Agent 数量 — 后续对接真实数据 */
const MOCK_AGENT_COUNT: Record<string, number> = {
  active: 3,
  completed: 2,
  pending: 1,
};

/* ===== 组件 ===== */

export function ConversationListPanel() {
  const { t } = useTranslation();
  const threads = useThreadStore((s) => s.threads);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const createThread = useThreadStore((s) => s.createThread);
  const searchQuery = useThreadStore((s) => s.searchQuery);
  const setSearchQuery = useThreadStore((s) => s.setSearchQuery);

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
    const id = createThread({ title: t('common.untitled', '新对话') });
    switchThread(id);
  };

  return (
    <div
      data-testid="conversation-list-panel"
      className="flex h-full flex-col bg-[#1E1E1E] border-r border-[#2D2D2D]"
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

      {/* 对话卡片列表 */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {sortedThreads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-[#6B7280] text-sm">
            {searchQuery ? '无匹配结果' : '暂无对话'}
          </div>
        )}
        {sortedThreads.map((thread) => {
          const status: ThreadStatus = STATUS_MAP[thread.status] || 'pending';
          const statusStyle = STATUS_STYLE[status];
          const isActive = activeThreadId === thread.id;
          const agentCount = MOCK_AGENT_COUNT[thread.status] ?? 0;

          return (
            <button
              key={thread.id}
              onClick={() => switchThread(thread.id)}
              className={clsx(
                'w-full rounded-lg px-3 py-3 text-left transition-all mb-3',
                'border border-transparent',
                isActive
                  ? 'bg-[#293449] border-[rgba(59,130,246,0.3)]'
                  : 'bg-[#1F2937] hover:bg-[#273344]'
              )}
            >
              {/* 标题 */}
              <span className={clsx(
                'block text-sm font-semibold truncate',
                isActive ? 'text-white' : 'text-[#E5E7EB]'
              )}>
                {thread.title}
              </span>

              {/* 描述 */}
              <p className="mt-1 text-[13px] text-[#9CA3AF] truncate">
                {thread.messageCount > 0 ? `${thread.messageCount} 条消息` : '空对话'}
              </p>

              {/* 底部：状态 + Agent数 + 时间 */}
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* 纯色状态标签 */}
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                    statusStyle.bg,
                    statusStyle.text,
                  )}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {statusStyle.label}
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
