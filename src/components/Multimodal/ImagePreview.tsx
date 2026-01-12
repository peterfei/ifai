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
        return <Loader2 size={16} className="animate-spin text-blue-400" />;
      case 'ready':
        return null;
      case 'error':
        return <AlertCircle size={16} className="text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="group relative inline-flex flex-col items-start gap-2 p-2 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors">
      {/* 图片预览 */}
      <div className="relative">
        <img
          src={previewUrl}
          alt={content.name || 'Image'}
          className="max-w-[200px] max-h-[150px] object-contain rounded"
        />
        {/* 状态遮罩 */}
        {(status === 'pending' || status === 'uploading') && (
          <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        )}
        {/* 错误遮罩 */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
            <AlertCircle size={24} className="text-red-400" />
          </div>
        )}
      </div>

      {/* 文件信息 */}
      <div className="flex items-center gap-2 text-xs text-gray-400 min-w-[150px]">
        <FileImage size={14} />
        <span className="flex-1 truncate" title={content.name}>
          {content.name || 'Image'}
        </span>
        {content.size && <span>{formatSize(content.size)}</span>}
        {renderStatusIcon()}
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="text-xs text-red-400 truncate max-w-[200px]" title={error}>
          {error}
        </div>
      )}

      {/* 删除按钮 */}
      <button
        onClick={() => onRemove(id)}
        className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        title="删除图片"
      >
        <X size={14} />
      </button>
    </div>
  );
};
