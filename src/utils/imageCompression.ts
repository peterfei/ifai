/**
 * 图片压缩工具
 * v0.3.0: 支持前端图片压缩和优化
 */

export interface CompressionOptions {
  /** 最大宽度 (px) */
  maxWidth?: number;
  /** 最大高度 (px) */
  maxHeight?: number;
  /** 压缩质量 (0-1) */
  quality?: number;
  /** 最大文件大小 (MB) */
  maxSizeMB?: number;
}

export interface CompressionResult {
  /** 压缩后的 Base64 数据 */
  data: string;
  /** 原始大小 */
  originalSize: number;
  /** 压缩后大小 */
  compressedSize: number;
  /** 压缩率 */
  compressionRatio: number;
}

/**
 * 压缩图片
 */
export async function compressImage(
  dataUrl: string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    maxSizeMB = 5,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // 创建 canvas 进行缩放
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // 计算缩放比例
      const ratio = Math.min(
        maxWidth / width,
        maxHeight / height,
        1
      );

      if (ratio < 1) {
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // 绘制图片
      ctx.drawImage(img, 0, 0, width, height);

      // 转换为 Blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }

          // 转换为 Base64
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];

            // 计算原始大小（估算）
            const originalSize = Math.round(dataUrl.length * 0.75);
            const compressedSize = blob.size;
            const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

            resolve({
              data: base64,
              originalSize,
              compressedSize,
              compressionRatio,
            });
          };
          reader.onerror = () => reject(new Error('Failed to read compressed image'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * 获取图片 MIME 类型
 */
export function getImageMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/png';
}

/**
 * 验证图片大小
 */
export function validateImageSize(base64: string, maxSizeMB: number): boolean {
  const sizeInBytes = base64.length * 0.75; // Base64 约 4/3 倍原始大小
  const maxSizeInBytes = maxSizeMB * 1024 * 1024;
  return sizeInBytes <= maxSizeInBytes;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
