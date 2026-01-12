import React, { useState, useRef, useCallback } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import type { ImageAttachment, ImageContent } from '../../types/multimodal';
import { ImagePreview } from './ImagePreview';

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
 * 图片输入组件
 *
 * 功能：
 * - 粘贴图片 (Ctrl+V)
 * - 拖拽上传
 * - 文件选择器
 * - 图片预览
 * - 图片删除
 */
export const ImageInput: React.FC<ImageInputProps> = ({
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  disabled = false,
  maxImages = 3,
  maxFileSize = 5,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检查是否可以添加更多图片
  const canAddMore = attachments.length < maxImages;

  // 处理文件选择
  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    if (!canAddMore || disabled) return;

    const fileArray = Array.from(files);
    const remainingSlots = maxImages - attachments.length;
    const filesToProcess = fileArray.slice(0, remainingSlots);

    for (const file of filesToProcess) {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        console.warn('[ImageInput] 跳过非图片文件:', file.name);
        continue;
      }

      // 验证文件大小
      if (file.size > maxFileSize * 1024 * 1024) {
        onAddAttachment({
          id: crypto.randomUUID(),
          content: {
            data: '',
            mime_type: file.type,
            name: file.name,
            size: file.size,
          },
          previewUrl: '',
          status: 'error',
          error: `文件过大 (${maxFileSize}MB 限制)`,
        });
        continue;
      }

      try {
        // 读取文件为 Base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            // 移除 data:image/xxx;base64, 前缀
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = () => reject(new Error('读取失败'));
          reader.readAsDataURL(file);
        });

        const base64 = await base64Promise;
        const previewUrl = `data:${file.type};base64,${base64}`;

        onAddAttachment({
          id: crypto.randomUUID(),
          content: {
            data: base64,
            mime_type: file.type,
            name: file.name,
            size: file.size,
          },
          previewUrl,
          status: 'ready',
        });
      } catch (error) {
        console.error('[ImageInput] 处理文件失败:', error);
        onAddAttachment({
          id: crypto.randomUUID(),
          content: {
            data: '',
            mime_type: file.type,
            name: file.name,
            size: file.size,
          },
          previewUrl: '',
          status: 'error',
          error: '处理失败',
        });
      }
    }
  }, [attachments.length, maxImages, maxFileSize, disabled, onAddAttachment]);

  // 处理粘贴事件
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!canAddMore || disabled) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      await handleFileSelect(files);
    }
  }, [canAddMore, disabled, handleFileSelect]);

  // 处理拖拽事件
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
    if (files && files.length > 0) {
      await handleFileSelect(files);
    }
  }, [canAddMore, disabled, handleFileSelect]);

  // 处理文件输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFileSelect(files);
      // 重置 input 以允许再次选择相同文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [handleFileSelect]);

  // 触发文件选择器
  const triggerFileSelect = useCallback(() => {
    if (!canAddMore || disabled) return;
    fileInputRef.current?.click();
  }, [canAddMore, disabled]);

  return (
    <div
      className={`flex flex-col gap-2 ${isDragging ? 'bg-blue-500/10' : ''}`}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 图片预览列表 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <ImagePreview
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemoveAttachment}
            />
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        {/* 文件上传按钮 */}
        <button
          onClick={triggerFileSelect}
          disabled={!canAddMore || disabled}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={canAddMore ? '上传图片' : `最多 ${maxImages} 张图片`}
        >
          <Upload size={18} />
        </button>

        {/* 提示文字 */}
        <span className="text-xs text-gray-500">
          {attachments.length > 0 && `${attachments.length}/${maxImages} `}
          {canAddMore ? '支持粘贴、拖拽或点击上传图片' : '已达到图片数量上限'}
        </span>

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
