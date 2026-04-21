/**
 * 对话归档服务
 *
 * 集成多格式归档引擎到现有对话系统
 */

import { MultiFormatFormatter } from './formatters/MultiFormatFormatter';
import type { ArchiveData, ArchiveFormat } from './types';
import type { Message } from '../../types/conversation';

export interface ConversationArchiveOptions {
  /** 归档格式（不指定则生成全部） */
  formats?: ArchiveFormat[];

  /** 是否压缩 */
  compression?: 'none' | 'gzip';

  /** 是否美化输出 */
  pretty?: boolean;

  /** 自定义元数据 */
  metadata?: Record<string, any>;
}

export interface ArchiveResult {
  success: boolean;
  archiveId: string;
  files: ArchivedFile[];
  error?: string;
}

export interface ArchivedFile {
  format: ArchiveFormat;
  path: string;
  size: number;
}

/**
 * 对话归档服务
 *
 * 负责将对话压缩和归档集成到一起
 */
export class ConversationArchiveService {
  private formatter: MultiFormatFormatter;

  constructor() {
    this.formatter = new MultiFormatFormatter();
  }

  /**
   * 归档对话（多格式）
   *
   * 这是主要入口，将原始对话保存为多种格式
   */
  async archiveConversation(
    messages: Message[],
    summary: string,
    projectRoot: string,
    options: ConversationArchiveOptions = {}
  ): Promise<ArchiveResult> {
    try {
      // 1. 构建归档数据
      const archiveData = this.buildArchiveData(messages, summary);

      // 2. 生成多种格式（并行）
      const formatted = await this.formatter.formatAll(archiveData, {
        formats: options.formats,
        compression: options.compression,
        pretty: options.pretty ?? true,
        metadata: options.metadata
      });

      // 3. 写入文件系统
      const archiveDir = `${projectRoot}/.ifai/sessions/archive`;
      const files: ArchivedFile[] = [];

      for (const [format, data] of formatted.entries()) {
        const fileName = this.getFileName(archiveData.id, format);
        const filePath = `${archiveDir}/${fileName}`;

        await this.writeFile(filePath, data);

        files.push({
          format,
          path: filePath,
          size: data.length
        });
      }

      return {
        success: true,
        archiveId: archiveData.id,
        files
      };
    } catch (error) {
      return {
        success: false,
        archiveId: '',
        files: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 构建归档数据
   */
  private buildArchiveData(messages: Message[], summary: string): ArchiveData {
    return {
      id: this.generateArchiveId(),
      timestamp: Date.now(),
      summary,
      originalMessages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system', // 类型断言
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        timestamp: Date.now() // Message 类型没有 timestamp 字段
      })),
      compactedMessages: [] // 压缩后的消息由调用方填充
    };
  }

  /**
   * 生成归档 ID
   */
  private generateArchiveId(): string {
    return `archive-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取文件名
   */
  private getFileName(archiveId: string, format: ArchiveFormat): string {
    const extension = this.formatter.getFormatter(format).getExtension();
    return `${archiveId}${extension}`;
  }

  /**
   * 写入文件（使用 Tauri API）
   */
  private async writeFile(path: string, data: Uint8Array): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_file', { path, content: Array.from(data) });
  }

  /**
   * 读取归档文件
   */
  async readArchive(
    archivePath: string,
    format: ArchiveFormat
  ): Promise<ArchiveData | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<number[]>('read_file', { path: archivePath });
      const data = new Uint8Array(content);

      const formatter = this.formatter.getFormatter(format);
      return await formatter.parse(data);
    } catch (error) {
      console.error('[ArchiveService] Failed to read archive:', error);
      return null;
    }
  }

  /**
   * 列出所有归档
   */
  async listArchives(projectRoot: string): Promise<ArchivedFile[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const archiveDir = `${projectRoot}/.ifai/sessions/archive`;
      const files = await invoke<string[]>('list_directory', { path: archiveDir });

      return files
        .filter(f => f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.parquet'))
        .map(f => ({
          format: this.getFormatFromFileName(f) as ArchiveFormat,
          path: `${archiveDir}/${f}`,
          size: 0 // TODO: 获取文件大小
        }));
    } catch (error) {
      console.error('[ArchiveService] Failed to list archives:', error);
      return [];
    }
  }

  /**
   * 从文件名推断格式
   */
  private getFormatFromFileName(fileName: string): string {
    if (fileName.endsWith('.json')) return 'json';
    if (fileName.endsWith('.md')) return 'markdown';
    if (fileName.endsWith('.parquet')) return 'parquet';
    return 'json'; // 默认
  }

  /**
   * 删除归档
   */
  async deleteArchive(archivePath: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_file', { path: archivePath });
      return true;
    } catch (error) {
      console.error('[ArchiveService] Failed to delete archive:', error);
      return false;
    }
  }

  /**
   * 获取支持的格式
   */
  getSupportedFormats(): ArchiveFormat[] {
    return this.formatter.listSupportedFormats();
  }
}

// 导出单例
export const conversationArchiveService = new ConversationArchiveService();
