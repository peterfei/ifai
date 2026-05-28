/**
 * useArtifactData — 从 messages 提取产出物（文件变更）
 *
 * 扫描 assistant 消息的 toolCalls，按工具名查表 dispatch 解析器，
 * 从 result 中提取文件信息，支持同名文件去重（保留最新）。
 *
 * 声明式架构：RESULT_PARSERS Record 驱动，零 fallthrough。
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

// ============================================================================
// 工具函数（纯函数，声明式）
// ============================================================================

/** 从路径后缀推断文件类型 */
function inferFileType(path: string): string {
  if (path.includes('.test.') || path.includes('.spec.')) return 'test';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ext || 'file';
}

/** 估算文件大小 */
function estimateSize(additions: number, deletions: number): string {
  const bytes = (additions + deletions) * 30;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 从路径提取文件名 */
function extractFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

// ============================================================================
// 声明式 Parser 注册表：工具名 → 解析器（零 fallthrough）
// ============================================================================

/** 解析 agent_write_file 的 JSON 结果 */
function parseAgentWriteFile(raw: string): FileChangeData | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const filePath: string | undefined = parsed.filePath;
  if (!filePath || typeof filePath !== 'string') return null;

  const oldLines = parsed.originalContent ? parsed.originalContent.split('\n').length : 0;
  const newLines = parsed.newContent ? parsed.newContent.split('\n').length : 0;

  return {
    name: extractFileName(filePath),
    size: estimateSize(newLines, Math.abs(newLines - oldLines)),
    type: inferFileType(filePath),
    path: filePath,
    additions: newLines,
    deletions: oldLines,
  };
}

/** 解析 write_file 的纯文本结果 */
function parseWriteFile(raw: string): FileChangeData | null {
  const pathMatch = raw.match(/wrote to file:\s*([^\n]+)/);
  if (!pathMatch?.[1]) return null;

  const path = pathMatch[1].trim();
  const linesMatch = raw.match(/(\d+)\s*lines/);
  const lines = linesMatch ? parseInt(linesMatch[1], 10) : 0;

  return {
    name: extractFileName(path),
    size: estimateSize(lines, 0),
    type: inferFileType(path),
    path,
    additions: lines,
    deletions: 0,
  };
}

/** 解析 edit_file 的纯文本结果 */
function parseEditFile(raw: string): FileChangeData | null {
  const pathMatch = raw.match(/edited file:\s*([^\n]+)/);
  if (!pathMatch?.[1]) return null;

  const path = pathMatch[1].trim();

  return {
    name: extractFileName(path),
    size: estimateSize(1, 1), // edit 无法精确计算，保守估算
    type: inferFileType(path),
    path,
    additions: 1,
    deletions: 1,
  };
}

/** 声明式：工具名 → 解析器（查表 dispatch，零 if-else） */
const RESULT_PARSERS: Record<string, (raw: string) => FileChangeData | null> = {
  'agent_write_file': parseAgentWriteFile,
  'write_file': parseWriteFile,
  'edit_file': parseEditFile,
};

// ============================================================================
// 核心逻辑
// ============================================================================

/** 从 toolCall result 提取文件变更（按工具名查表 dispatch） */
function extractFileChange(tc: ToolCall): FileChangeData | null {
  const parser = RESULT_PARSERS[tc.function.name];
  if (!parser) return null;

  const raw = tc.result;
  if (!raw || typeof raw !== 'string') return null;

  return parser(raw);
}

/** 从消息列表计算产出物（同名文件去重） */
export function computeArtifacts(messages: any[]): FileChangeData[] {
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
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useArtifactData — 从 messages 提取产出物
 *
 * @returns FileChangeData[] 同名文件去重
 */
export function useArtifactData(): FileChangeData[] {
  const messages = useChatStore((s) => s.messages);

  return useMemo(() => computeArtifacts(messages), [messages]);
}

// ============================================================================
// Test-only 导出（仅供单元测试使用）
// ============================================================================

export const _extractFileChange = extractFileChange;
export const _computeArtifacts = computeArtifacts;
