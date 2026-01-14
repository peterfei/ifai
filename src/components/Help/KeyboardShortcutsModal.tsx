/**
 * v0.3.0: 快捷键列表弹窗组件
 *
 * 显示应用的所有键盘快捷键
 */

import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();

  // 🔍 调试：打印当前语言和翻译值
  React.useEffect(() => {
    if (isOpen) {
      console.log('=== KeyboardShortcutsModal 调试信息 ===');
      console.log('1. 当前语言 (i18n.language):', i18n.language);
      console.log('2. localStorage i18nextLng:', localStorage.getItem('i18nextLng'));

      const titleText = t('help.keyboardShortcuts');
      console.log('3. t("help.keyboardShortcuts") 返回值:', titleText);

      // 检查 i18n store 中的实际值
      const storeData = i18n.store.data;
      console.log('4. i18n.store.data 键:', Object.keys(storeData || {}));

      const zhCNData = (storeData as any)?.['zh-CN']?.translation?.help;
      const enUSData = (storeData as any)?.['en-US']?.translation?.help;
      console.log('5. zh-CN translation.help.keyboardShortcuts:', zhCNData?.keyboardShortcuts);
      console.log('6. en-US translation.help.keyboardShortcuts:', enUSData?.keyboardShortcuts);
      console.log('7. 实际渲染的标题文本:', titleText);
    }
  }, [isOpen, i18n, t]);

  if (!isOpen) return null;

  const shortcuts: ShortcutItem[] = [
    // 文件操作
    { shortcut: 'Cmd+N', description: t('shortcuts.newFile'), category: t('shortcuts.category.file') },
    { shortcut: 'Cmd+O', description: t('shortcuts.openFile'), category: t('shortcuts.category.file') },
    { shortcut: 'Cmd+S', description: t('shortcuts.save'), category: t('shortcuts.category.file') },
    { shortcut: 'Cmd+Shift+S', description: t('shortcuts.saveAs'), category: t('shortcuts.category.file') },
    { shortcut: 'Cmd+W', description: t('shortcuts.closeFile'), category: t('shortcuts.category.file') },

    // 编辑操作
    { shortcut: 'Cmd+Z', description: t('shortcuts.undo'), category: t('shortcuts.category.edit') },
    { shortcut: 'Cmd+Shift+Z', description: t('shortcuts.redo'), category: t('shortcuts.category.edit') },
    { shortcut: 'Cmd+F', description: t('shortcuts.find'), category: t('shortcuts.category.edit') },
    { shortcut: 'Cmd+H', description: t('shortcuts.replace'), category: t('shortcuts.category.edit') },
    { shortcut: 'Cmd+D', description: t('shortcuts.selectWord'), category: t('shortcuts.category.edit') },

    // 导航操作
    { shortcut: 'Cmd+P', description: t('shortcuts.quickOpen'), category: t('shortcuts.category.navigation') },
    { shortcut: 'Cmd+Shift+P', description: t('shortcuts.commandPalette'), category: t('shortcuts.category.navigation') },
    { shortcut: 'F12', description: t('shortcuts.goToDefinition'), category: t('shortcuts.category.navigation') },
    { shortcut: 'Shift+F12', description: t('shortcuts.findReferences'), category: t('shortcuts.category.navigation') },
    { shortcut: 'Cmd+G', description: t('shortcuts.goToLine'), category: t('shortcuts.category.navigation') },

    // AI 功能
    { shortcut: 'Cmd+L', description: t('shortcuts.openChat'), category: t('shortcuts.category.ai') },
    { shortcut: 'Cmd+K', description: t('shortcuts.inlineEdit'), category: t('shortcuts.category.ai') },
    { shortcut: 'Cmd+J', description: t('shortcuts.toggleTerminal'), category: t('shortcuts.category.ai') },
    { shortcut: 'Cmd+B', description: t('shortcuts.toggleSidebar'), category: t('shortcuts.category.ai') },

    // 视图操作
    { shortcut: 'Cmd+', description: t('shortcuts.toggleSettings'), category: t('shortcuts.category.view') },
    { shortcut: 'Cmd+Shift+E', description: t('shortcuts.toggleExplorer'), category: t('shortcuts.category.view') },
  ];

  // 按类别分组
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        data-testid="keyboard-shortcuts-dialog"
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">{t('help.keyboardShortcuts')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {Object.entries(groupedShortcuts).map(([category, items]) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-gray-300 text-sm">{item.description}</span>
                    <kbd className="px-2 py-1 bg-gray-900 text-gray-300 text-xs rounded border border-gray-600">
                      {item.shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-750">
          <p className="text-sm text-gray-400 text-center">
            {t('shortcuts.tip')}
          </p>
        </div>
      </div>
    </div>
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
          {index > 0 && <span className="text-gray-500">+</span>}
          <kbd className="px-1.5 py-0.5 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
};
