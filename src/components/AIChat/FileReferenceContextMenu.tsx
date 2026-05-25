/**
 * FileReferenceContextMenu - 文件引用上下文菜单组件
 *
 * 功能：右键点击文件链接时显示的上下文菜单
 * - 在编辑器中打开
 * - 复制文件路径
 * - 复制相对路径
 * - 显示文件信息
 * - 在文件管理器中显示
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Copy, ExternalLink, Info, FolderOpen, Check } from 'lucide-react';

// ========== 类型定义 ==========

export interface FileReference {
  /** 文件路径（绝对路径或相对路径） */
  path: string;
  /** 文件名 */
  fileName: string;
  /** 文件扩展名 */
  extension?: string;
  /** 是否存在 */
  exists?: boolean;
  /** 文件大小（字节） */
  size?: number;
  /** 最后修改时间 */
  lastModified?: number;
}

export interface FileMenuItem {
  id: string;
  /** 菜单项标签（字符串或动态函数） */
  label: string | ((file: FileReference) => string);
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface FileMenuContext {
  /** 文件引用信息 */
  file: FileReference;
  /** 菜单位置 */
  position: { x: number; y: number };
  /** 关闭菜单回调 */
  onClose: () => void;
  /** 复制到剪贴板 */
  copyToClipboard: (text: string) => Promise<void>;
  /** 在编辑器中打开文件 */
  openInEditor: (path: string) => Promise<void>;
  /** 在文件管理器中显示 */
  showInFinder: (path: string) => Promise<void>;
  /** 设置已复制的菜单项（用于显示复制反馈） */
  setCopiedItem: (item: string | null) => void;
}

export type FileMenuStrategy = (
  file: FileReference,
  payload: unknown,
  ctx: FileMenuContext
) => void | Promise<void>;

export interface FileMenuPositionConfig {
  width: number;
  itemHeight: number;
  padding: number;
}

// ========== 配置常量 ==========

const DEFAULT_MENU_CONFIG: FileMenuPositionConfig = {
  width: 200,
  itemHeight: 36,
  padding: 10,
};

// ========== 工具函数 ==========

/**
 * 检测路径是否为文件路径
 */
export const isFilePath = (text: string): boolean => {
  // 匹配常见的文件路径模式
  const patterns = [
    // 绝对路径：/path/to/file 或 Windows path C:\path\to\file
    /^([a-zA-Z]:)?[/\\].*\.(ts|tsx|js|jsx|py|md|json|css|html|txt|yaml|yml|toml|xml)$/i,
    // 相对路径：../path/to/file 或 ./path/to/file
    /^\.\.?[/\\].*\.(ts|tsx|js|jsx|py|md|json|css|html|txt|yaml|yml|toml|xml)$/i,
    // 文件名（可能包含路径）：src/components/File.tsx
    /^[\w/\\-]+.*\.(ts|tsx|js|jsx|py|md|json|css|html|txt|yaml|yml|toml|xml)$/i,
  ];

  return patterns.some(pattern => pattern.test(text));
};

/**
 * 从文件路径提取文件信息
 */
export const extractFileInfo = (filePath: string): FileReference => {
  // 提取文件名
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  // 提取扩展名
  const match = fileName.match(/\.([^.]+)$/);
  const extension = match ? match[1] : '';

  return {
    path: filePath,
    fileName,
    extension,
  };
};

/**
 * 格式化文件大小
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * 计算菜单位置，避免超出屏幕
 */
export const calculateFileMenuPosition = (
  trigger: { x: number; y: number },
  itemCount: number,
  config: FileMenuPositionConfig = DEFAULT_MENU_CONFIG
) => {
  const { width, itemHeight, padding } = config;
  const viewport = { w: window.innerWidth, h: window.innerHeight };

  return {
    x: Math.min(trigger.x, viewport.w - width - padding),
    y: Math.min(trigger.y, viewport.h - itemCount * itemHeight - padding),
  };
};

// ========== 组件 ==========

interface FileReferenceContextMenuProps {
  file: FileReference;
  items: FileMenuItem[];
  strategies: Record<string, FileMenuStrategy>;
  position: { x: number; y: number };
  context: FileMenuContext;
}

export function FileReferenceContextMenu({
  file,
  items,
  strategies,
  position,
  context,
}: FileReferenceContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedItem, setCopiedItem] = React.useState<string | null>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        context.onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') context.onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [context]);

  // 复制状态自动清除
  useEffect(() => {
    if (copiedItem) {
      const timer = setTimeout(() => setCopiedItem(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedItem]);

  // 计算菜单位置
  const adjustedPosition = useMemo(
    () => calculateFileMenuPosition(position, items.length),
    [position, items.length]
  );

  // 处理菜单项选择
  const handleSelect = async (item: FileMenuItem) => {
    if (item.disabled) return;

    const strategy = strategies[item.action];
    if (!strategy) {
      console.warn(`[FileReferenceContextMenu] Unknown strategy: ${item.action}`);
      return;
    }

    // 执行策略
    await strategy(file, null, { ...context, setCopiedItem });

    // 如果不是复制操作，关闭菜单
    if (item.action !== 'copyPath' && item.action !== 'copyRelativePath') {
      context.onClose();
    }
  };

  // 渲染菜单项标签
  const renderLabel = (item: FileMenuItem) => {
    return typeof item.label === 'function' ? item.label(file) : item.label;
  };

  const IconComponent = ({ item }: { item: FileMenuItem }) => {
    const Icon = item.icon;

    // 复制状态显示
    if ((item.action === 'copyPath' || item.action === 'copyRelativePath') && copiedItem === item.action) {
      return <Check size={14} className="text-green-500" />;
    }

    return <Icon size={14} />;
  };

  return createPortal(
    <div
      ref={menuRef}
      data-testid="file-reference-context-menu"
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
      {/* 文件名头部 */}
      <div className="px-3 py-2 border-b border-[#2D2D2D] mb-1">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-[#3B82F6] flex-shrink-0" />
          <span className="text-xs font-medium text-[#D1D5DB] truncate flex-1">
            {file.fileName}
          </span>
        </div>
        {file.extension && (
          <div className="text-[10px] text-[#6B7280] ml-6">
            {file.extension.toUpperCase()}
          </div>
        )}
      </div>

      {/* 菜单项 */}
      {items.map((item) => {
        const isDisabled = item.disabled || false;

        return (
          <button
            key={item.id}
            onClick={() => handleSelect(item)}
            data-testid={`file-menu-item-${item.id}`}
            disabled={isDisabled}
            className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#2D2D2D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              color: item.danger ? '#EF4444' : '#D1D5DB',
            }}
          >
            <IconComponent item={item} />
            <span className="flex-1 text-left">{renderLabel(item)}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}

// ========== 默认菜单配置 ==========

/**
 * 创建默认的文件引用菜单项
 */
export const createDefaultFileMenuItems = (): FileMenuItem[] => [
  {
    id: 'openInEditor',
    label: '在编辑器中打开',
    icon: ExternalLink,
    action: 'openInEditor',
  },
  {
    id: 'copyPath',
    label: '复制文件路径',
    icon: Copy,
    action: 'copyPath',
  },
  {
    id: 'copyRelativePath',
    label: '复制相对路径',
    icon: Copy,
    action: 'copyRelativePath',
  },
  {
    id: 'showInFinder',
    label: '在文件管理器中显示',
    icon: FolderOpen,
    action: 'showInFinder',
  },
  {
    id: 'fileInfo',
    label: '文件信息',
    icon: Info,
    action: 'showInfo',
  },
];

// ========== 默认策略配置 ==========

/**
 * 创建默认的文件菜单策略
 */
export const createDefaultFileMenuStrategies = (): Record<string, FileMenuStrategy> => ({
  openInEditor: async (file: FileReference, _, ctx: FileMenuContext) => {
    await ctx.openInEditor(file.path);
  },

  copyPath: async (file: FileReference, _, ctx: FileMenuContext) => {
    await ctx.copyToClipboard(file.path);
    ctx.setCopiedItem('copyPath');
  },

  copyRelativePath: async (file: FileReference, _, ctx: FileMenuContext) => {
    // 尝试生成相对路径
    const relativePath = file.path.startsWith('./') ? file.path : `./${file.path}`;
    await ctx.copyToClipboard(relativePath);
    ctx.setCopiedItem('copyRelativePath');
  },

  showInFinder: async (file: FileReference, _, ctx: FileMenuContext) => {
    await ctx.showInFinder(file.path);
  },

  showInfo: (file: FileReference) => {
    const info = [
      `文件名: ${file.fileName}`,
      file.extension && `类型: ${file.extension.toUpperCase()}`,
      file.size && `大小: ${formatFileSize(file.size)}`,
      file.lastModified && `修改时间: ${new Date(file.lastModified).toLocaleString('zh-CN')}`,
    ].filter(Boolean).join('\n');

    alert(info); // TODO: 可以使用更好的对话框
  },
});
