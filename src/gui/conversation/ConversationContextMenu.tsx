import React, { useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Thread } from '../../stores/threadStore';

// ========== 类型定义 ==========

export interface MenuItem {
  id: string;
  label: string | ((thread: Thread) => string);
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: string;
  danger?: boolean;
  payload?: unknown;
  confirm?: {
    title: string | ((thread: Thread) => string);
    message: string;
  };
}

export interface MenuContext {
  threads: Record<string, Thread>;
  activeThreadId: string | null;
  setEditingId: (id: string | null) => void;
  setEditValue: (value: string) => void;
}

export type MenuStrategy = (
  thread: Thread,
  payload: unknown,
  ctx: MenuContext
) => void | Promise<void>;

export interface MenuPositionConfig {
  width: number;
  itemHeight: number;
  padding: number;
}

// ========== 配置常量 ==========

const DEFAULT_MENU_CONFIG: MenuPositionConfig = {
  width: 180,
  itemHeight: 36,
  padding: 10,
};

// ========== 通用工具函数 ==========

/**
 * 计算菜单位置，避免超出屏幕
 */
export const calculateMenuPosition = (
  trigger: { x: number; y: number },
  itemCount: number,
  config: MenuPositionConfig = DEFAULT_MENU_CONFIG
) => {
  const { width, itemHeight, padding } = config;
  const viewport = { w: window.innerWidth, h: window.innerHeight };

  return {
    x: Math.min(trigger.x, viewport.w - width - padding),
    y: Math.min(trigger.y, viewport.h - itemCount * itemHeight - padding),
  };
};

// ========== 组件 ==========

interface ConversationContextMenuProps {
  thread: Thread;
  items: MenuItem[];
  strategies: Record<string, MenuStrategy>;
  position: { x: number; y: number };
  context: MenuContext;
  onClose: () => void;
}

export function ConversationContextMenu({
  thread,
  items,
  strategies,
  position,
  context,
  onClose,
}: ConversationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 计算菜单位置
  const adjustedPosition = useMemo(
    () => calculateMenuPosition(position, items.length),
    [position, items.length]
  );

  // 处理菜单项选择
  const handleSelect = async (item: MenuItem) => {
    const strategy = strategies[item.action];
    if (!strategy) {
      console.warn(`[ConversationContextMenu] Unknown strategy: ${item.action}`);
      return;
    }

    // 处理确认对话框
    if (item.confirm) {
      const title = typeof item.confirm.title === 'function'
        ? item.confirm.title(thread)
        : item.confirm.title;

      const confirmed = confirm(`${title}\n${item.confirm.message}`);
      if (!confirmed) return;
    }

    // 执行策略
    await strategy(thread, item.payload, context);
    onClose();
  };

  // 渲染菜单项标签
  const renderLabel = (item: MenuItem) => {
    return typeof item.label === 'function' ? item.label(thread) : item.label;
  };

  const IconComponent = ({ item }: { item: MenuItem }) => {
    const Icon = item.icon;
    return <Icon size={14} />;
  };

  return createPortal(
    <div
      ref={menuRef}
      data-testid="conversation-context-menu"
      className="fixed z-50 py-1 rounded-lg shadow-xl border animate-fade-in"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        backgroundColor: '#1E1E1E',
        borderColor: '#2D2D2D',
        minWidth: `${DEFAULT_MENU_CONFIG.width}px`,
        animation: 'fadeIn 150ms ease-out',
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleSelect(item)}
          data-testid={`menu-item-${item.id}`}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#2D2D2D] transition-colors"
          style={{
            color: item.danger ? '#EF4444' : '#D1D5DB',
          }}
        >
          <IconComponent item={item} />
          <span>{renderLabel(item)}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
