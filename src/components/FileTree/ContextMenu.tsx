import React, { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Scissors,
  Clipboard,
  FileText,
  Folder,
  Terminal,
  ExternalLink,
  RefreshCw,
  Trash2,
  Edit3,
  FilePlus,
  FolderPlus,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../../stores/fileStore';
import {
  copyToClipboard,
  revealInFileManager,
  openInTerminal,
  createFile,
  createDirectory,
  deleteFile,
  renameFile,
} from '../../utils/fileSystem';
import { toast } from 'sonner';
import { platform } from '@tauri-apps/plugin-os';
import { ask } from '@tauri-apps/plugin-dialog';
import { FileNode, WorkspaceRoot } from '../../stores/types';

interface ContextMenuProps {
  x: number;
  y: number;
  node: FileNode | null;
  root: WorkspaceRoot | null;  // v0.3.0: 支持根目录菜单
  onClose: () => void;
  onRefresh: () => void;
  onRemoveFolder?: (rootId: string) => void;  // v0.3.0: 移除根目录回调
  rootPath?: string;
}

interface InputDialogProps {
  title: string;
  defaultValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const InputDialog: React.FC<InputDialogProps> = ({ title, defaultValue, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus and select all text when dialog opens
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  // Determine icon and subtitle based on title
  const getDialogIcon = () => {
    if (title.includes('Rename') || title.includes('name')) {
      return <Edit3 size={20} className="text-blue-400" />;
    }
    if (title.includes('File')) {
      return <FilePlus size={20} className="text-green-400" />;
    }
    if (title.includes('Folder')) {
      return <FolderPlus size={20} className="text-yellow-400" />;
    }
    return <FileText size={20} className="text-gray-400" />;
  };

  const getDialogSubtitle = () => {
    if (title.includes('Rename') || title.includes('name')) {
      return t('dialog.enterNewName');
    }
    return t('dialog.enterName');
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="bg-[#252526] border border-gray-600/50 rounded-xl shadow-2xl p-6 min-w-[400px] max-w-[500px] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        style={{
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-gray-800/50 rounded-lg">
            {getDialogIcon()}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {getDialogSubtitle()}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              placeholder={title}
            />
            {/* Character count indicator */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-600">
              {t('dialog.characterCount', { count: value.length })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-150"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg transition-all duration-150 shadow-lg shadow-blue-600/20 disabled:shadow-none"
            >
              {t('common.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  node,
  root,
  onClose,
  onRefresh,
  onRemoveFolder,
  rootPath,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const currentPlatform = (() => {
    try {
      return platform();
    } catch (e) {
      console.warn('Failed to get platform, falling back to linux', e);
      return 'linux' as any;
    }
  })();
  const { selectedNodeIds, fileTree } = useFileStore();
  const [inputDialog, setInputDialog] = useState<{
    title: string;
    defaultValue: string;
    onConfirm: (value: string) => void;
  } | null>(null);

  // Close menu on click outside (but not when input dialog is open)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if input dialog is open
      if (inputDialog) return;

      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, inputDialog]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (inputDialog) {
          setInputDialog(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, inputDialog]);

  // v0.3.0: 支持根目录菜单或文件节点菜单
  if (!node && !root) return null;

  // v0.3.0: 处理根目录菜单
  const isRootMenu = !!root;
  const handleRemoveFolder = async () => {
    if (root && onRemoveFolder) {
      // 确认删除
      const confirmMessage = `Remove folder "${root.name}" from workspace?`;
      let confirmed = false;
      try {
        confirmed = await ask(confirmMessage, {
          title: 'Remove Folder',
          kind: 'warning',
          okLabel: 'Remove',
          cancelLabel: 'Cancel'
        });
      } catch (e) {
        confirmed = window.confirm(confirmMessage);
      }

      if (confirmed) {
        onRemoveFolder(root.id);
        onClose();
      }
    }
  };

  const handleCopyPath = async () => {
    try {
      await copyToClipboard(node.path);
      toast.success(t('common.copiedToClipboard'));
    } catch (error) {
      toast.error(t('common.copyFailed'));
    }
    onClose();
  };

  const handleCopyRelativePath = async () => {
    try {
      const relativePath = rootPath
        ? node.path.replace(new RegExp(`^${rootPath}/?`), '')
        : node.path;
      await copyToClipboard(relativePath || node.path);
      toast.success(t('common.copiedToClipboard'));
    } catch (error) {
      toast.error(t('common.copyFailed'));
    }
    onClose();
  };

  const handleCopyName = async () => {
    try {
      await copyToClipboard(node.name);
      toast.success(t('common.copiedToClipboard'));
    } catch (error) {
      toast.error(t('common.copyFailed'));
    }
    onClose();
  };

  const handleOpenInTerminal = async () => {
    try {
      const dirPath = node.kind === 'directory' ? node.path : node.path.substring(0, node.path.lastIndexOf('/'));
      console.log('[ContextMenu] Opening terminal at:', dirPath);
      await openInTerminal(dirPath);
      console.log('[ContextMenu] Terminal opened successfully');
      toast.success('Terminal opened');
      onClose();
    } catch (error) {
      console.error('[ContextMenu] Failed to open terminal:', error);
      toast.error(t('common.openTerminalFailed'));
    }
  };

  const handleRevealInFileManager = async () => {
    try {
      console.log('[ContextMenu] Revealing file in manager:', node.path);
      await revealInFileManager(node.path);
      console.log('[ContextMenu] File revealed successfully');
      toast.success('File revealed');
      onClose();
    } catch (error) {
      console.error('[ContextMenu] Failed to reveal file:', error);
      toast.error(t('common.openFileManagerFailed'));
    }
  };

  const handleNewFile = () => {
    setInputDialog({
      title: t('common.enterFileName'),
      defaultValue: '',
      onConfirm: async (name) => {
        try {
          const dirPath = node.kind === 'directory' ? node.path : node.path.substring(0, node.path.lastIndexOf('/'));
          const newPath = `${dirPath}/${dirPath.endsWith('/') ? '' : '/'}${name}`;
          console.log('[ContextMenu] Creating new file:', newPath);
          await createFile(newPath);
          toast.success(t('common.fileCreated'));
          console.log('[ContextMenu] File created, refreshing file tree...');
          await onRefresh();
          console.log('[ContextMenu] File tree refreshed');
        } catch (error) {
          console.error('[ContextMenu] Failed to create file:', error);
          toast.error(`${t('common.createFileFailed')}: ${String(error)}`);
        }
        setInputDialog(null);
        onClose();
      }
    });
  };

  const handleNewFolder = () => {
    setInputDialog({
      title: t('common.enterFolderName'),
      defaultValue: '',
      onConfirm: async (name) => {
        try {
          const dirPath = node.kind === 'directory' ? node.path : node.path.substring(0, node.path.lastIndexOf('/'));
          const newPath = `${dirPath}/${dirPath.endsWith('/') ? '' : '/'}${name}`;
          console.log('[ContextMenu] Creating new folder:', newPath);
          await createDirectory(newPath);
          toast.success(t('common.folderCreated'));
          console.log('[ContextMenu] Folder created, refreshing file tree...');
          await onRefresh();
          console.log('[ContextMenu] File tree refreshed');
        } catch (error) {
          console.error('[ContextMenu] Failed to create folder:', error);
          toast.error(`${t('common.createFolderFailed')}: ${String(error)}`);
        }
        setInputDialog(null);
        onClose();
      }
    });
  };

  const handleRename = () => {
    console.log('[ContextMenu] Rename requested for:', node.name, 'at path:', node.path);
    setInputDialog({
      title: t('common.renameTo'),
      defaultValue: node.name,
      onConfirm: async (newName) => {
        console.log('[ContextMenu] User entered new name:', newName);
        if (newName !== node.name) {
          const pathParts = node.path.split('/');
          pathParts.pop();
          const newPath = [...pathParts, newName].join('/');
          console.log('[ContextMenu] Rename path:', node.path, '->', newPath);

          try {
            await renameFile(node.path, newPath);
            console.log('[ContextMenu] Rename successful, refreshing file tree...');
            toast.success(t('common.renamedSuccessfully', { newName }));
            // Wait for refresh to complete before closing
            await onRefresh();
            console.log('[ContextMenu] File tree refreshed');
          } catch (error) {
            console.error('[ContextMenu] Rename failed:', error);
            toast.error(`${t('common.renameFailed')}: ${String(error)}`);
          }
        }
        setInputDialog(null);
        onClose();
      }
    });
  };

  const handleDelete = async () => {
    if (!node) return;

    // Check if the right-clicked node is part of the current selection
    const isNodeInSelection = selectedNodeIds.includes(node.id);
    
    // Helper to find nodes by ID in the tree
    const findNodesByIds = (root: any, ids: string[]): FileNode[] => {
      const results: FileNode[] = [];
      const traverse = (n: FileNode) => {
        if (ids.includes(n.id)) results.push(n);
        if (n.children) n.children.forEach(traverse);
      };
      if (root) traverse(root);
      return results;
    };

    const targetNodes = isNodeInSelection 
      ? findNodesByIds(fileTree, selectedNodeIds)
      : [node];

    const confirmMessage = targetNodes.length > 1
      ? t('common.confirmDeleteMultiple', { count: targetNodes.length })
      : t('common.confirmDeleteFile', { fileName: node.name });

    // Close the menu first
    onClose();

    // Use Tauri's native dialog if available, fallback to window.confirm
    let confirmed = false;
    try {
      confirmed = await ask(confirmMessage, {
        title: t('common.delete'),
        kind: 'warning',
        okLabel: t('common.confirm'),
        cancelLabel: t('common.cancel')
      });
    } catch (e) {
      console.warn('Native dialog failed, falling back to window.confirm', e);
      confirmed = window.confirm(confirmMessage);
    }

    if (confirmed) {
      try {
        // Delete all target nodes in parallel
        await Promise.all(targetNodes.map(n => deleteFile(n.path)));
        
        console.log('[ContextMenu] Bulk delete successful, refreshing file tree...');
        toast.success(t('common.deletedSuccessfully'));
        await onRefresh();
        console.log('[ContextMenu] File tree refreshed');
      } catch (error) {
        console.error('[ContextMenu] Bulk delete failed:', error);
        toast.error(`${t('common.deleteFailed')}: ${String(error)}`);
      }
    } else {
      console.log('[ContextMenu] Delete cancelled');
    }
  };

  const handleRefresh = () => {
    onRefresh();
    onClose();
  };

  // Get platform-specific label for "Reveal in File Manager"
  const getRevealLabel = () => {
    switch (currentPlatform) {
      case 'windows':
        return t('contextMenu.revealInExplorer');
      case 'macos':
        return t('contextMenu.revealInFinder');
      default:
        return t('contextMenu.openContainingFolder');
    }
  };

  const positionMenu = () => {
    const menuWidth = 220;
    const menuHeight = 400;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = x;
    let top = y;

    // Adjust if menu would go off screen
    if (left + menuWidth > screenWidth) {
      left = screenWidth - menuWidth - 10;
    }
    if (top + menuHeight > screenHeight) {
      top = screenHeight - menuHeight - 10;
    }

    return { left, top };
  };

  const pos = positionMenu();

  return (
    <>
      {inputDialog && (
        <InputDialog
          title={inputDialog.title}
          defaultValue={inputDialog.defaultValue}
          onConfirm={inputDialog.onConfirm}
          onCancel={() => setInputDialog(null)}
        />
      )}
      <div
        ref={menuRef}
        className="fixed bg-gray-800 border border-gray-700 rounded shadow-xl z-50 py-1 min-w-48"
        style={{ left: pos.left, top: pos.top }}
      >
        {isRootMenu ? (
          // v0.3.0: 根目录菜单
          <>
            <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">
              Workspace
            </div>
            {root && (
              <>
                <MenuItem
                  icon={<Terminal size={14} />}
                  label="Open in Terminal"
                  onClick={async () => {
                    try {
                      await openInTerminal(root.path);
                      toast.success('Terminal opened');
                    } catch (e) {
                      toast.error('Failed to open terminal');
                    }
                    onClose();
                  }}
                />
                <MenuItem
                  icon={<ExternalLink size={14} />}
                  label={getRevealLabel()}
                  onClick={async () => {
                    try {
                      await revealInFileManager(root.path);
                      toast.success('Folder revealed');
                    } catch (e) {
                      toast.error('Failed to reveal folder');
                    }
                    onClose();
                  }}
                />
                <div className="my-1 border-t border-gray-700" />
                <MenuItem
                  icon={<Trash2 size={14} />}
                  label="Remove Folder"
                  onClick={handleRemoveFolder}
                  className="text-red-400 hover:bg-red-900/20 hover:text-red-300"
                  data-testid="context-menu-item-remove"
                />
              </>
            )}
          </>
        ) : (
          // 原有的文件节点菜单
          <>
            {/* Copy Section */}
            <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">
              {t('contextMenu.copy')}
            </div>
            <MenuItem icon={<Copy size={14} />} label={t('contextMenu.copyPath')} onClick={handleCopyPath} />
            <MenuItem icon={<Copy size={14} />} label={t('contextMenu.copyRelativePath')} onClick={handleCopyRelativePath} />
            <MenuItem icon={<FileText size={14} />} label={t('contextMenu.copyName')} onClick={handleCopyName} />

            <div className="my-1 border-t border-gray-700" />

            {/* External Applications Section */}
            <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">
              {t('contextMenu.external')}
            </div>
            <MenuItem icon={<Terminal size={14} />} label={t('contextMenu.openInTerminal')} onClick={handleOpenInTerminal} />
            <MenuItem icon={<ExternalLink size={14} />} label={getRevealLabel()} onClick={handleRevealInFileManager} />

            <div className="my-1 border-t border-gray-700" />

            {/* Create Section */}
            <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">
              {t('contextMenu.new')}
            </div>
            <MenuItem icon={<FilePlus size={14} />} label={t('contextMenu.newFile')} onClick={handleNewFile} />
            <MenuItem icon={<FolderPlus size={14} />} label={t('contextMenu.newFolder')} onClick={handleNewFolder} />

            <div className="my-1 border-t border-gray-700" />

            {/* File Operations Section */}
            <MenuItem icon={<Edit3 size={14} />} label={t('common.rename')} onClick={handleRename} />
            <MenuItem icon={<RefreshCw size={14} />} label={t('contextMenu.refresh')} onClick={handleRefresh} />

            <div className="my-1 border-t border-gray-700" />

            {/* Delete Section */}
            <MenuItem
              icon={<Trash2 size={14} />}
              label={t('common.delete')}
              onClick={handleDelete}
              className="text-red-400 hover:bg-red-900/20 hover:text-red-300"
            />
          </>
        )}
      </div>
    </>
  );
};

interface MenuItemProps {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  shortcut?: string;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, onClick, className = '', shortcut }) => {
  return (
    <div
      className={`px-3 py-1.5 text-sm flex items-center justify-between cursor-pointer text-gray-300 hover:bg-gray-700 hover:text-white ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span>{label}</span>
      </div>
      {shortcut && <span className="text-xs text-gray-500">{shortcut}</span>}
    </div>
  );
};
