/**
 * TodoWriteBanner — 任务计划横幅（独立区域）
 *
 * 固定在 AIChat 输入框上方，始终可见。
 * 直接订阅 todoWriteStore，单数据源，实时更新。
 *
 * 设计原则：
 * - 数据驱动：渲染完全由 TODO_STATUS_CONFIG 查表驱动，零 if/else
 * - 单数据源：todoWriteStore.tasks → 渲染，无 message.data 中间层
 * - 可折叠：点击标题栏切换展开/折叠
 * - 始终可见：LLM 多次 TodoWrite 调用时，同一区域就地更新
 */

import React, { useState, useEffect, useRef } from 'react';
import { ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { useTodoWriteStore } from '../../stores/todoWriteStore';
import { TODO_STATUS_CONFIG } from '../../gui/conversation/WORKFLOW_DSL';
import type { TodoWriteTaskItem } from '../../gui/conversation/WORKFLOW_DSL';

/* ===== 自动隐藏延迟（毫秒） ===== */
const AUTO_HIDE_DELAY = 2000;

/* ===== 主组件 ===== */

export function TodoWriteBanner() {
  const tasks = useTodoWriteStore(state => state.tasks);
  const stats = useTodoWriteStore(state => state.stats);
  const [collapsed, setCollapsed] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 全部完成后延迟自动隐藏
  useEffect(() => {
    const allDone = stats.total > 0 && stats.completed === stats.total;

    if (allDone) {
      hideTimerRef.current = setTimeout(() => {
        // 直接清空本地状态（同步），不调用 async clearTasks 避免后端依赖
        useTodoWriteStore.setState({ tasks: [] });
        useTodoWriteStore.getState().updateStats();
        hideTimerRef.current = null;
      }, AUTO_HIDE_DELAY);
    } else {
      // 任务进行中，取消定时器
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [stats.total, stats.completed]);

  // 无任务时不渲染
  if (!tasks || tasks.length === 0) return null;

  const activeTask = tasks.find(t => t.status === 'in_progress');

  return (
    <div
      className="border-t border-white/5 overflow-hidden transition-all duration-200"
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.6)',
      }}
    >
      {/* 标题栏 — 可点击折叠 */}
      <div
        className="px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-gray-500 font-medium">任务计划</span>
          {activeTask && (
            <span className="text-[10px] text-blue-400/80 truncate max-w-[200px]">
              {activeTask.activeForm}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              color: stats.completed === stats.total ? '#10B981' : '#9CA3AF',
            }}
          >
            {stats.completed}/{stats.total}
          </span>
          {collapsed ? (
            <ChevronDown className="w-3 h-3 text-gray-600" />
          ) : (
            <ChevronUp className="w-3 h-3 text-gray-600" />
          )}
        </div>
      </div>

      {/* 任务列表 — 折叠时隐藏 */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="space-y-1">
            {tasks.map((task: TodoWriteTaskItem, index: number) => {
              const config = TODO_STATUS_CONFIG[task.status] || TODO_STATUS_CONFIG.pending;
              return (
                <div
                  key={`banner-task-${index}`}
                  className="flex items-center gap-2 py-0.5"
                >
                  {/* 状态图标 */}
                  <span
                    className="text-[11px] flex-shrink-0 w-3.5 text-center"
                    style={{
                      color: config.color,
                      animation: config.pulse
                        ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                        : 'none',
                    }}
                  >
                    {config.icon}
                  </span>

                  {/* 任务内容 */}
                  <span
                    className={`flex-1 min-w-0 truncate text-[11px] ${
                      task.status === 'completed'
                        ? 'line-through text-gray-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {task.content}
                  </span>

                  {/* 状态标签 */}
                  <span
                    className="px-1 py-0.5 rounded text-[8px] font-medium flex-shrink-0"
                    style={{ backgroundColor: config.bg, color: config.color }}
                  >
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
