/**
 * 归档系统核心类型定义
 *
 * 多格式归档引擎的类型基础
 */

/**
 * 支持的归档格式
 */
export type ArchiveFormat = 'json' | 'markdown' | 'parquet';

/**
 * 归档消息
 */
export interface ArchiveMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/**
 * 归档数据
 *
 * 核心数据模型，所有格式都基于此结构序列化
 */
export interface ArchiveData {
  id: string;
  timestamp: number;
  summary: string;
  originalMessages: ArchiveMessage[];
  compactedMessages: ArchiveMessage[];
}

/**
 * 格式化选项
 */
export interface FormatOptions {
  /** 要生成的格式列表（不指定则生成全部） */
  formats?: ArchiveFormat[];

  /** 压缩算法 */
  compression?: 'none' | 'gzip' | 'lz4';

  /** 是否美化输出（仅适用于 JSON/Markdown） */
  pretty?: boolean;

  /** 自定义元数据 */
  metadata?: Record<string, any>;
}

/**
 * 格式化结果
 */
export interface FormatResult {
  format: ArchiveFormat;
  data: Uint8Array;
  size: number;
  error?: Error;
}

/**
 * 格式用途
 */
export type FormatPurpose =
  | 'machine'  // 机器处理（API、索引）
  | 'human'    // 人类阅读（Git、Diff）
  | 'analytics'; // 数据分析（聚合、查询）

/**
 * 格式化器接口
 *
 * 所有格式化器必须实现此接口
 */
export interface Formatter {
  /**
   * 将 ArchiveData 序列化为指定格式
   */
  format(data: ArchiveData, options: FormatOptions): Promise<Uint8Array>;

  /**
   * 从指定格式解析为 ArchiveData
   */
  parse(input: Uint8Array): Promise<ArchiveData>;

  /**
   * 获取格式 MIME 类型
   */
  getMimeType(): string;

  /**
   * 获取文件扩展名
   */
  getExtension(): string;
}

/**
 * 格式化器元数据（用于装饰器注册）
 */
export interface FormatterMetadata {
  type: ArchiveFormat;
  purpose: FormatPurpose;
  priority?: number;
}
