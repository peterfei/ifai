/**
 * useArtifactData — 从 messages 提取产出物（文件变更）
 *
 * 扫描 assistant 消息的 toolCalls，从 result 中提取文件信息，
 * 支持同名文件去重（保留最新）
 */

import { useMemo } from 'react';
import { useChatStore } from '../../../stores/useChatStore';
import type { ToolCall } from '../../../stores/useChatStore';

/** 产出物数据 */
export interface FileChangeData {
  /** 文件名 */
  name: string;
  /** 格式化大小（如 "2.4 KB"） */
  size: string;
  /** 文件类型（ts/tsx/test/md/css/json 等） */
  type: string;
  /** 完整路径 */
  path: string;
  /** 增加行数 */
  additions: number;
  /** 删除行数 */
  deletions: number;
}

/** 从路径后缀推断文件类型 */
function inferFileType(path: string): string {
  if (path.includes('.test.') || path.includes('.spec.')) return 'test';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ext || 'file';
}

/** 估算文件大小 */
function estimateSize(additions: number, deletions: number): string {
  // 假设平均每行 30 字节
  const bytes = (additions + deletions) * 30;

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 从路径提取文件名 */
function extractFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** 从 toolCall result 提取文件变更 */
function extractFileChange(tc: ToolCall): FileChangeData | null {
  // 只处理写操作的工具
  const writeTools = ['Write', 'Edit'];
  if (!writeTools.includes(tc.function.name)) return null;

  const result = tc.result;
  if (!result || typeof result !== 'object') return null;

  const path = result.path;
  if (!path || typeof path !== 'string') return null;

  const additions = Number(result.additions) || 0;
  const deletions = Number(result.deletions) || 0;

  return {
    name: extractFileName(path),
    size: estimateSize(additions, deletions),
    type: inferFileType(path),
    path,
    additions,
    deletions,
  };
}

/**
 * useArtifactData — 从 messages 提取产出物
 *
 * @returns FileChangeData[] 同名文件去重
 */
export function useArtifactData(): FileChangeData[] {
  const messages = useChatStore((s) => s.messages);

  return useMemo(() => {
    const fileMap = new Map<string, FileChangeData>();

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      if (!msg.toolCalls?.length) continue;

      for (const tc of msg.toolCalls) {
        const file = extractFileChange(tc);
        if (!file) continue;

        // 同名文件保留最新（直接覆盖）
        fileMap.set(file.name, file);
      }
    }

    return Array.from(fileMap.values());
  }, [messages]);
}
