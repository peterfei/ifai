import React from 'react';
import { X, FileImage, AlertCircle, Loader2 } from 'lucide-react';
import type { ImageAttachment } from '../../types/multimodal';

interface ImagePreviewProps {
  /** 图片附件 */
  attachment: ImageAttachment;
  /** 删除回调 */
  onRemove: (id: string) => void;
}

/**
 * 图片预览组件
 *
 * 功能：
 * - 显示图片缩略图
 * - 显示文件名和大小
 * - 显示上传状态
 * - 提供删除按钮
 */
export const ImagePreview: React.FC<ImagePreviewProps> = ({ attachment, onRemove }) => {
  const { id, content, previewUrl, status, error } = attachment;

  // 格式化文件大小
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 状态图标
  const renderStatusIcon = () => {
    switch (status) {
      case 'pending':
      case 'uploading':
        return <Loader2 size={16} className="theme-text-accent animate-spin" />;
      case 'ready':
        return null;
      case 'error':
        return <AlertCircle size={16} className="theme-text-danger" />;
      default:
        return null;
    }
  };

  return (
    <div className="theme-panel-muted theme-border group relative inline-flex flex-col items-start gap-2 rounded-lg border p-2 transition-colors hover:border-[var(--accent-soft-border)]">
      {/* 图片预览 */}
      <div className="relative">
        <img
          src={previewUrl}
          alt={content.name || 'Image'}
          className="theme-border max-h-[150px] max-w-[200px] rounded border object-contain"
        />
        {/* 状态遮罩 */}
        {(status === 'pending' || status === 'uploading') && (
          <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
            <Loader2 size={24} className="theme-text-accent animate-spin" />
          </div>
        )}
        {/* 错误遮罩 */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
            <AlertCircle size={24} className="theme-text-danger" />
          </div>
        )}
      </div>

      {/* 文件信息 */}
      <div className="theme-text-muted flex min-w-[150px] items-center gap-2 text-xs">
        <FileImage size={14} />
        <span className="flex-1 truncate" title={content.name}>
          {content.name || 'Image'}
        </span>
        {content.size && <span>{formatSize(content.size)}</span>}
        {renderStatusIcon()}
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="theme-text-danger max-w-[200px] truncate text-xs" title={error}>
          {error}
        </div>
      )}

      {/* 删除按钮 */}
      <button
        onClick={() => onRemove(id)}
        className="theme-button-danger absolute -top-2 -right-2 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100"
        title="删除图片"
      >
        <X size={14} />
      </button>
    </div>
  );
};
