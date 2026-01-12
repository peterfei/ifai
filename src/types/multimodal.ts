/**
 * 多模态功能类型定义
 * v0.3.0: 图片输入、UI 转代码、报错诊断
 */

/**
 * 图片内容类型
 */
export interface ImageContent {
  /** Base64 编码的图片数据 */
  data: string;
  /** MIME 类型 */
  mime_type: string;
  /** 原始文件名 */
  name?: string;
  /** 文件大小（字节） */
  size?: number;
}

/**
 * 图片消息附件
 */
export interface ImageAttachment {
  /** 唯一 ID */
  id: string;
  /** 图片内容 */
  content: ImageContent;
  /** 预览 URL (data:) */
  previewUrl: string;
  /** 上传状态 */
  status: 'pending' | 'uploading' | 'ready' | 'error';
  /** 错误信息 */
  error?: string;
}

/**
 * 视觉分析结果
 */
export interface VisionAnalysisResult {
  /** 分析文本 */
  description: string;
  /** 提取的代码 */
  code?: string;
  /** 语言类型 */
  language?: string;
  /** 置信度 */
  confidence?: number;
}

/**
 * 多模态引擎接口
 */
export interface MultimodalEngine {
  /** 分析上传的图片 */
  analyzeImage(image: ImageContent, prompt: string): Promise<VisionAnalysisResult>;
  /** 检查是否支持视觉能力 */
  isVisionSupported(): boolean;
}
