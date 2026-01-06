import React, { useEffect, useRef } from 'react';
import { X, XCircle, Trash2 } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useTranslation } from 'react-i18next';

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
      className="fixed bg-gray-800 border border-gray-700 rounded shadow-xl z-[100] py-1 min-w-40"
      style={{ left: x, top: y }}
    >
      <ContextMenuItem
        icon={<X size={14} />}
        label={t('common.close')}
        onClick={handleCloseCurrent}
      />
      <ContextMenuItem
        icon={<XCircle size={14} />}
        label="关闭其它"
        onClick={handleCloseOthers}
      />
      <div className="my-1 border-t border-gray-700" />
      <ContextMenuItem
        icon={<Trash2 size={14} />}
        label="关闭所有"
        onClick={handleCloseAll}
        className="text-red-400 hover:bg-red-900/20 hover:text-red-300"
      />
    </div>
  );
};

interface ContextMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

const ContextMenuItem: React.FC<ContextMenuItemProps> = ({ icon, label, onClick, className = '' }) => (
  <div
    className={`px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer text-gray-300 hover:bg-gray-700 hover:text-white ${className}`}
    onClick={onClick}
  >
    <span className="text-gray-400">{icon}</span>
    <span>{label}</span>
  </div>
);
