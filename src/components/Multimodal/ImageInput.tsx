import React, { useState, useRef, useCallback } from 'react';
import { Image } from 'lucide-react';
import type { ImageAttachment } from '../../types/multimodal';
import { compressImage, formatFileSize } from '../../utils/imageCompression';
import { useTranslation } from 'react-i18next';

interface ImageInputProps {
  /** 当前图片附件列表 */
  attachments: ImageAttachment[];
  /** 添加附件回调 */
  onAddAttachment: (attachment: ImageAttachment) => void;
  /** 删除附件回调 */
  onRemoveAttachment: (id: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 最大图片数量 */
  maxImages?: number;
  /** 最大文件大小（MB） */
  maxFileSize?: number;
}

/**
 * v0.3.6: 图片输入组件 (精简版 - 仅负责上传逻辑)
 */
export const ImageInput: React.FC<ImageInputProps> = ({
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  disabled = false,
  maxImages = 3,
  maxFileSize = 5,
}) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = attachments.length < maxImages;

  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    if (!canAddMore || disabled) return;

    const fileArray = Array.from(files);
    const remainingSlots = maxImages - attachments.length;
    const filesToProcess = fileArray.slice(0, remainingSlots);

    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) continue;

      if (file.size > maxFileSize * 1024 * 1024) {
        onAddAttachment({
          id: crypto.randomUUID(),
          content: { data: '', mime_type: file.type, name: file.name, size: file.size },
          previewUrl: '',
          status: 'error',
          error: t('imageInput.fileTooLarge', { maxSize: maxFileSize }),
        });
        continue;
      }

      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = () => reject(new Error('读取失败'));
          reader.readAsDataURL(file);
        });

        const base64 = await base64Promise;
        const originalDataUrl = `data:${file.type};base64,${base64}`;

        // 🔥 FIX: 添加图片压缩，避免智谱 API 1210 错误（请求体过大）
        // 智谱 API 对请求体大小限制较严格，需要压缩图片
        // 参考: https://github.com/anthropics/claude-code/issues/XXX
        const compressionResult = await compressImage(originalDataUrl, {
          maxWidth: 1280,    // 限制宽度
          maxHeight: 1280,   // 限制高度
          quality: 0.75,     // 压缩质量
          maxSizeMB: 2,      // 最大 2MB
        });

        const compressedBase64 = compressionResult.data;
        const previewUrl = `data:image/jpeg;base64,${compressedBase64}`;

        console.log('[ImageInput] 图片压缩完成:', {
          原始大小: formatFileSize(compressionResult.originalSize),
          压缩后大小: formatFileSize(compressionResult.compressedSize),
          压缩率: `${compressionResult.compressionRatio.toFixed(1)}%`,
        });

        onAddAttachment({
          id: crypto.randomUUID(),
          content: { data: compressedBase64, mime_type: 'image/jpeg', name: file.name, size: compressionResult.compressedSize },
          previewUrl,
          status: 'ready',
        });
      } catch (error) {
        console.error('[ImageInput] 处理文件失败:', error);
      }
    }
  }, [attachments.length, maxImages, maxFileSize, disabled, onAddAttachment]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!canAddMore || disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await handleFileSelect(files);
    }
  }, [canAddMore, disabled, handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canAddMore || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, [canAddMore, disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (!canAddMore || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) await handleFileSelect(files);
  }, [canAddMore, disabled, handleFileSelect]);

  const triggerFileSelect = useCallback(() => {
    if (!canAddMore || disabled) return;
    fileInputRef.current?.click();
  }, [canAddMore, disabled]);

  return (
    <div
      className="flex items-center"
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        onClick={triggerFileSelect}
        disabled={!canAddMore || disabled}
        className="theme-button-ghost rounded-xl p-2 hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-30"
        title={canAddMore ? t('imageInput.uploadImage') : t('imageInput.maxImages', { count: maxImages })}
        data-testid="image-input-button"
      >
        <Image size={18} />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFileSelect(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        disabled={disabled}
      />
    </div>
  );
};
