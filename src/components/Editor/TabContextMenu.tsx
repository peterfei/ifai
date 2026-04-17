import React, { useEffect, useRef } from 'react';
import { X, XCircle, Trash2 } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';
import clsx from 'clsx';

interface TabContextMenuProps {
  x: number;
  y: number;
  fileId: string;
  onClose: () => void;
}

export const TabContextMenu: React.FC<TabContextMenuProps> = ({ x, y, fileId, onClose }) => {
  const { closeFile, closeOthers, closeAll } = useFileStore();
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleCloseCurrent = () => {
    closeFile(fileId);
    onClose();
  };

  const handleCloseOthers = () => {
    closeOthers(fileId);
    onClose();
  };

  const handleCloseAll = () => {
    closeAll();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="theme-panel-elevated theme-border theme-shadow fixed z-[100] min-w-40 rounded border py-1"
      style={{ left: x, top: y }}
    >
      <ContextMenuItem
        icon={<X size={14} />}
        label={t('common.close')}
        onClick={handleCloseCurrent}
        dark={dark}
      />
      <ContextMenuItem
        icon={<XCircle size={14} />}
        label="关闭其它"
        onClick={handleCloseOthers}
        dark={dark}
      />
      <div className="theme-border my-1 border-t" />
      <ContextMenuItem
        icon={<Trash2 size={14} />}
        label="关闭所有"
        onClick={handleCloseAll}
        className="text-red-400 hover:bg-red-900/20 hover:text-red-300"
        dark={dark}
      />
    </div>
  );
};

interface ContextMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  dark: boolean;
}

const ContextMenuItem: React.FC<ContextMenuItemProps> = ({ icon, label, onClick, className = '' }) => (
  <div
    className={clsx('theme-hoverable theme-text-muted flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm', className)}
    onClick={onClick}
  >
    <span className="theme-text-subtle">{icon}</span>
    <span>{label}</span>
  </div>
);
