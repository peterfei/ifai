/**
 * v0.3.0: 快捷键列表弹窗组件
 *
 * 显示应用的所有键盘快捷键
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatKeybinding, formatKeyLabel } from '../../utils/keyboard';
import { useSettingsStore } from '../../stores/settingsStore';

interface ShortcutItem {
  shortcut: string;
  description: string;
  category: string;
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const theme = useSettingsStore((state) => state.theme);

  if (!isOpen || typeof document === 'undefined') return null;

  const shortcuts: ShortcutItem[] = [
    // 文件操作
    { shortcut: formatKeybinding('Mod+n'), description: t('shortcuts.newFile'), category: t('shortcuts.category.file') },
    { shortcut: formatKeybinding('Mod+o'), description: t('shortcuts.openFile'), category: t('shortcuts.category.file') },
    { shortcut: formatKeybinding('Mod+s'), description: t('shortcuts.save'), category: t('shortcuts.category.file') },
    { shortcut: formatKeybinding('Mod+Shift+s'), description: t('shortcuts.saveAs'), category: t('shortcuts.category.file') },
    { shortcut: formatKeybinding('Mod+w'), description: t('shortcuts.closeFile'), category: t('shortcuts.category.file') },

    // 编辑操作
    { shortcut: formatKeybinding('Mod+z'), description: t('shortcuts.undo'), category: t('shortcuts.category.edit') },
    { shortcut: formatKeybinding('Mod+Shift+z'), description: t('shortcuts.redo'), category: t('shortcuts.category.edit') },
    { shortcut: formatKeybinding('Mod+f'), description: t('shortcuts.find'), category: t('shortcuts.category.edit') },
    { shortcut: formatKeybinding('Mod+h'), description: t('shortcuts.replace'), category: t('shortcuts.category.edit') },
    { shortcut: formatKeybinding('Mod+d'), description: t('shortcuts.selectWord'), category: t('shortcuts.category.edit') },

    // 导航操作
    { shortcut: formatKeybinding('Mod+p'), description: t('shortcuts.quickOpen'), category: t('shortcuts.category.navigation') },
    { shortcut: formatKeybinding('Mod+Shift+p'), description: t('shortcuts.commandPalette'), category: t('shortcuts.category.navigation') },
    { shortcut: 'F12', description: t('shortcuts.goToDefinition'), category: t('shortcuts.category.navigation') },
    { shortcut: 'Shift+F12', description: t('shortcuts.findReferences'), category: t('shortcuts.category.navigation') },
    { shortcut: formatKeybinding('Mod+g'), description: t('shortcuts.goToLine'), category: t('shortcuts.category.navigation') },

    // AI 功能
    { shortcut: formatKeybinding('Mod+l'), description: t('shortcuts.openChat'), category: t('shortcuts.category.ai') },
    { shortcut: formatKeybinding('Mod+k'), description: t('shortcuts.inlineEdit'), category: t('shortcuts.category.ai') },
    { shortcut: formatKeybinding('Mod+j'), description: t('shortcuts.toggleTerminal'), category: t('shortcuts.category.ai') },
    { shortcut: formatKeybinding('Mod+b'), description: t('shortcuts.toggleSidebar'), category: t('shortcuts.category.ai') },

    // 视图操作
    { shortcut: formatKeybinding('Mod+,'), description: t('shortcuts.toggleSettings'), category: t('shortcuts.category.view') },
    { shortcut: formatKeybinding('Mod+Shift+e'), description: t('shortcuts.toggleExplorer'), category: t('shortcuts.category.view') },
  ];

  // 按类别分组
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);

  return createPortal(
    <div
      className="help-modal-overlay keyboard-shortcuts-modal theme-backdrop fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm"
      data-theme={theme}
    >
      <div
        aria-labelledby="keyboard-shortcuts-title"
        aria-modal="true"
        className="help-modal-panel keyboard-shortcuts-panel theme-panel-elevated theme-border theme-shadow flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border"
        data-testid="keyboard-shortcuts-dialog"
        role="dialog"
      >
        {/* 标题栏 */}
        <div className="theme-border flex items-center justify-between border-b px-6 py-4">
          <h2
            id="keyboard-shortcuts-title"
            className="keyboard-shortcuts-text theme-text text-lg font-semibold"
          >
            {t('help.keyboardShortcuts')}
          </h2>
          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {Object.entries(groupedShortcuts).map(([category, items]) => (
            <div key={category} className="mb-6">
              <h3 className="keyboard-shortcuts-muted theme-text-subtle mb-3 text-sm font-semibold uppercase tracking-wide">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="keyboard-shortcuts-row theme-hoverable flex items-center justify-between rounded px-3 py-2 transition-colors"
                  >
                    <span className="keyboard-shortcuts-text theme-text-muted text-sm">{item.description}</span>
                    <kbd className="theme-input-surface theme-border rounded border px-2 py-1 text-xs">
                      {item.shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="keyboard-shortcuts-footer theme-panel theme-border border-t px-6 py-4">
          <p className="keyboard-shortcuts-muted theme-text-subtle text-center text-sm">
            {t('shortcuts.tip')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

/**
 * 快捷键显示组件（用于工具提示等）
 */
export const ShortcutKey: React.FC<{ keys: string[] }> = ({ keys }) => {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="theme-text-subtle">+</span>}
          <kbd className="theme-input-surface theme-border rounded border px-1.5 py-0.5 text-xs">
            {formatKeyLabel(key)}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
};
