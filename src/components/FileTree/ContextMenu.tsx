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
import { FileNode, WorkspaceRoot } from '../../stores/types';
import { ConfirmDialog } from '../UI/ConfirmDialog';

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
  variant: 'rename' | 'file' | 'folder';
  title: string;
  defaultValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const InputDialog: React.FC<InputDialogProps> = ({ variant, title, defaultValue, onConfirm, onCancel }) => {
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

  const getDialogIcon = () => {
    if (variant === 'rename') {
      return <Edit3 size={20} className="theme-text-info" />;
    }
    if (variant === 'file') {
      return <FilePlus size={20} className="theme-text-success" />;
    }
    if (variant === 'folder') {
      return <FolderPlus size={20} className="theme-text-warning" />;
    }
    return <FileText size={20} className="theme-text-subtle" />;
  };

  const getDialogSubtitle = () => {
    if (variant === 'rename') {
      return t('dialog.enterNewName');
    }
    return t('dialog.enterName');
  };

  return (
    <div
      className="theme-backdrop-strong fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="theme-panel-elevated theme-border theme-shadow min-w-[400px] max-w-[500px] rounded-xl border p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="theme-panel-muted theme-border rounded-lg border p-2">
            {getDialogIcon()}
          </div>
          <div className="flex-1">
            <h3 className="theme-text text-lg font-semibold">{title}</h3>
            <p className="theme-text-subtle mt-0.5 text-xs">
              {getDialogSubtitle()}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="theme-button-ghost rounded-lg p-1.5"
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
              className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-lg border px-4 py-3 pr-24 transition-colors placeholder:theme-text-subtle"
              placeholder={title}
            />
            {/* Character count indicator */}
            <div className="theme-text-subtle absolute right-3 top-1/2 -translate-y-1/2 text-xs">
              {t('dialog.characterCount', { count: value.length })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={onCancel}
              className="theme-button-secondary rounded-lg px-5 py-2.5 text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="theme-button-primary rounded-lg px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
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
    variant: 'rename' | 'file' | 'folder';
    title: string;
    defaultValue: string;
    onConfirm: (value: string) => void;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    | { kind: 'removeRoot'; root: WorkspaceRoot }
    | { kind: 'deleteNodes'; description: string; targetNodes: FileNode[] }
    | null
  >(null);

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
      setConfirmDialog({ kind: 'removeRoot', root });
      onClose();
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
      toast.success(t('contextMenu.terminalOpened'));
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
      toast.success(t('contextMenu.fileRevealed'));
      onClose();
    } catch (error) {
      console.error('[ContextMenu] Failed to reveal file:', error);
      toast.error(t('common.openFileManagerFailed'));
    }
  };

  const handleNewFile = () => {
    setInputDialog({
      variant: 'file',
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
      variant: 'folder',
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
      variant: 'rename',
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
    setConfirmDialog({
      kind: 'deleteNodes',
      description: confirmMessage,
      targetNodes,
    });
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
      <ConfirmDialog
        open={confirmDialog !== null}
        title={
          confirmDialog?.kind === 'removeRoot'
            ? t('fileTree.removeFolder')
            : t('common.delete')
        }
        description={
          confirmDialog?.kind === 'removeRoot'
            ? t('fileTree.removeFolderConfirm', { name: confirmDialog.root.name })
            : confirmDialog?.description || ''
        }
        confirmLabel={
          confirmDialog?.kind === 'removeRoot'
            ? t('fileTree.removeFolder')
            : t('common.delete')
        }
        cancelLabel={t('common.cancel')}
        tone="danger"
        onCancel={() => setConfirmDialog(null)}
        onConfirm={async () => {
          if (!confirmDialog) {
            return;
          }

          if (confirmDialog.kind === 'removeRoot') {
            onRemoveFolder?.(confirmDialog.root.id);
            setConfirmDialog(null);
            return;
          }

          try {
            await Promise.all(confirmDialog.targetNodes.map((targetNode) => deleteFile(targetNode.path)));
            toast.success(t('common.deletedSuccessfully'));
            await onRefresh();
          } catch (error) {
            console.error('[ContextMenu] Bulk delete failed:', error);
            toast.error(`${t('common.deleteFailed')}: ${String(error)}`);
          } finally {
            setConfirmDialog(null);
          }
        }}
      />
      {inputDialog && (
        <InputDialog
          variant={inputDialog.variant}
          title={inputDialog.title}
          defaultValue={inputDialog.defaultValue}
          onConfirm={inputDialog.onConfirm}
          onCancel={() => setInputDialog(null)}
        />
      )}
      <div
        ref={menuRef}
        className="theme-panel-elevated theme-border theme-shadow fixed z-50 min-w-48 rounded-lg border py-1"
        style={{ left: pos.left, top: pos.top }}
      >
        {isRootMenu ? (
          // v0.3.0: 根目录菜单
          <>
            <div className="theme-text-subtle px-3 py-1 text-xs uppercase tracking-wider">
              {t('fileTree.workspace')}
            </div>
            {root && (
              <>
                <MenuItem
                  icon={<Terminal size={14} />}
                  label={t('contextMenu.openInTerminal')}
                  onClick={async () => {
                    try {
                      await openInTerminal(root.path);
                      toast.success(t('contextMenu.terminalOpened'));
                    } catch (e) {
                      toast.error(t('common.openTerminalFailed'));
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
                      toast.success(t('contextMenu.folderRevealed'));
                    } catch (e) {
                      toast.error(t('common.openFileManagerFailed'));
                    }
                    onClose();
                  }}
                />
                <div className="theme-border my-1 border-t" />
                <MenuItem
                  icon={<Trash2 size={14} />}
                  label={t('fileTree.removeFolder')}
                  onClick={handleRemoveFolder}
                  className="theme-text-danger hover:bg-[var(--danger-soft-bg)] hover:text-[var(--danger-color)]"
                  data-testid="context-menu-item-remove"
                />
              </>
            )}
          </>
        ) : (
          // 原有的文件节点菜单
          <>
            {/* Copy Section */}
            <div className="theme-text-subtle px-3 py-1 text-xs uppercase tracking-wider">
              {t('contextMenu.copy')}
            </div>
            <MenuItem icon={<Copy size={14} />} label={t('contextMenu.copyPath')} onClick={handleCopyPath} />
            <MenuItem icon={<Copy size={14} />} label={t('contextMenu.copyRelativePath')} onClick={handleCopyRelativePath} />
            <MenuItem icon={<FileText size={14} />} label={t('contextMenu.copyName')} onClick={handleCopyName} />

            <div className="theme-border my-1 border-t" />

            {/* External Applications Section */}
            <div className="theme-text-subtle px-3 py-1 text-xs uppercase tracking-wider">
              {t('contextMenu.external')}
            </div>
            <MenuItem icon={<Terminal size={14} />} label={t('contextMenu.openInTerminal')} onClick={handleOpenInTerminal} />
            <MenuItem icon={<ExternalLink size={14} />} label={getRevealLabel()} onClick={handleRevealInFileManager} />

            <div className="theme-border my-1 border-t" />

            {/* Create Section */}
            <div className="theme-text-subtle px-3 py-1 text-xs uppercase tracking-wider">
              {t('contextMenu.new')}
            </div>
            <MenuItem icon={<FilePlus size={14} />} label={t('contextMenu.newFile')} onClick={handleNewFile} />
            <MenuItem icon={<FolderPlus size={14} />} label={t('contextMenu.newFolder')} onClick={handleNewFolder} />

            <div className="theme-border my-1 border-t" />

            {/* File Operations Section */}
            <MenuItem icon={<Edit3 size={14} />} label={t('common.rename')} onClick={handleRename} />
            <MenuItem icon={<RefreshCw size={14} />} label={t('contextMenu.refresh')} onClick={handleRefresh} />

            <div className="theme-border my-1 border-t" />

            {/* Delete Section */}
            <MenuItem
              icon={<Trash2 size={14} />}
              label={t('common.delete')}
              onClick={handleDelete}
              className="theme-text-danger hover:bg-[var(--danger-soft-bg)] hover:text-[var(--danger-color)]"
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
      className={`theme-text-muted theme-hoverable mx-1 flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="theme-text-subtle">{icon}</span>}
        <span>{label}</span>
      </div>
      {shortcut && <span className="theme-text-subtle text-xs">{shortcut}</span>}
    </div>
  );
};
