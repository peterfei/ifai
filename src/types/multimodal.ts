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

// ============================================================================
// 🔧 元编程类型系统（编译时安全）
// ============================================================================

/**
 * 内容部分类型（符合 OpenAI Chat Completions API 格式）
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * 多模态内容类型
 */
export type MultiModalContent = ContentPart[];

/**
 * 基础消息类型
 */
export interface BaseMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: any[];
  tool_call_id?: string;
  multiModalContent?: MultiModalContent;
}

/**
 * 多模态消息类型（扩展）
 */
export interface MultimodalMessage extends BaseMessage {
  multiModalContent: MultiModalContent;
}

// ============================================================================
// 类型守卫（Type Guards）
// ============================================================================

/**
 * 检查消息是否包含多模态内容
 *
 * @param message 消息对象
 * @returns 是否为多模态消息
 */
export function hasMultimodalContent(message: BaseMessage): message is MultimodalMessage {
  return (
    'multiModalContent' in message &&
    message.multiModalContent !== undefined &&
    Array.isArray(message.multiModalContent) &&
    message.multiModalContent.length > 0
  );
}

/**
 * 检查是否为文本内容部分
 */
export function isTextPart(part: ContentPart): part is { type: 'text'; text: string } {
  return part.type === 'text';
}

/**
 * 检查是否为图片内容部分
 */
export function isImagePart(
  part: ContentPart
): part is { type: 'image_url'; image_url: { url: string } } {
  return part.type === 'image_url';
}

// ============================================================================
// 内容访问器（Content Selectors）
// ============================================================================

/**
 * 内容选择策略
 */
export type ContentStrategy = 'preferMultiModal' | 'contentOnly' | 'auto';

/**
 * 选择 API 消息内容
 *
 * 用于调用 LLM API 时选择合适的内容格式。
 * 优先使用 multiModalContent，否则使用纯文本。
 *
 * @param message 消息对象
 * @returns API 消息内容（字符串或多模态数组）
 */
export function selectAPIMessageContent(message: BaseMessage): string | MultiModalContent {
  // 类型守卫 + 类型推导
  if (hasMultimodalContent(message)) {
    console.log('[ContentSelector] 📸 Using multiModalContent:', {
      itemCount: message.multiModalContent.length,
      types: message.multiModalContent.map(c => c.type),
    });

    return message.multiModalContent;
  }

  // 回退到纯文本
  if (typeof message.content === 'string') {
    return message.content;
  }

  // 如果 content 不是字符串，转换为 JSON 字符串
  return JSON.stringify(message.content);
}

/**
 * 提取文本内容
 *
 * 从多模态内容中提取所有文本部分。
 *
 * @param content 多模态内容
 * @returns 提取的文本
 */
export function extractTextFromMultimodal(content: MultiModalContent): string {
  return content
    .filter(isTextPart)
    .map(part => part.text)
    .join(' ');
}

/**
 * 提取图片 URL
 *
 * 从多模态内容中提取所有图片 URL。
 *
 * @param content 多模态内容
 * @returns 图片 URL 列表
 */
export function extractImageURLs(content: MultiModalContent): string[] {
  return content
    .filter(isImagePart)
    .map(part => part.image_url.url);
}
