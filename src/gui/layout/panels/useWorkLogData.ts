/**
 * useWorkLogData — 从 messages 提取工作日志
 *
 * 遍历 assistant 消息的 toolCalls，推断 Agent 类型，
 * 返回按时间倒序排列的工作日志条目
 */

import { useMemo } from 'react';
import { useChatStore } from '../../../stores/useChatStore';
import { getAgent } from '../../conversation/AGENT_DSL';
import type { Message, ToolCall } from '../../../stores/useChatStore';

/** 工作日志条目 */
export interface WorkLogEntry {
  /** Agent ID */
  agentId: string;
  /** Agent 显示名称 */
  agentName: string;
  /** 格式化时间 HH:mm */
  time: string;
  /** 日志内容 */
  content: string;
  /** 原始时间戳 */
  timestamp: number;
  /** Agent 主色（十六进制，如 "#10B981"） */
  agentColor?: string;
}

/**
 * 从工具名称推断 Agent ID
 *
 * 将 Claude Code 工具映射到 AGENT_DSL 中的 agent 类型
 */
export function inferAgentFromTool(toolName: string): string {
  const mapping: Record<string, string> = {
    // 探索类 → explore
    Read: 'explore',
    Glob: 'explore',
    Grep: 'explore',
    WebSearch: 'explore',
    WebFetch: 'explore',
    Task: 'explore',
    agent_read_file: 'explore',
    agent_list_dir: 'explore',
    agent_scan_project: 'explore',
    agent_search: 'explore',

    // 编辑/写入类 → refactor
    Edit: 'refactor',
    Write: 'refactor',
    agent_write_file: 'refactor',

    // 命令执行类 → test
    Bash: 'test',
    agent_execute_command: 'test',

    // 审查类 → review
    mcp__4_5v_mcp__analyze_image: 'review',
    git_status: 'review',
    secret_scanner: 'review',

    // Git 提交 → git_commit
    git_commit: 'git_commit',
    git_snapshot: 'git_commit',
  };

  return mapping[toolName] ?? 'unknown';
}

/** 格式化时间戳为 HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 从 toolCall 提取显示内容 */
function extractContent(tc: ToolCall, message: Message): string {
  // 优先从 function.name 生成描述
  const toolName = tc.function.name;
  const contentMap: Record<string, string> = {
    Read: '读取文件',
    Glob: '搜索文件',
    Grep: '搜索内容',
    Edit: '编辑文件',
    Write: '写入文件',
    Bash: '执行命令',
    WebSearch: '网络搜索',
    WebFetch: '获取网页',
    Task: '启动任务',
    // agent 系统工具
    agent_read_file: '读取文件',
    agent_write_file: '写入文件',
    agent_execute_command: '执行命令',
    agent_list_dir: '列出目录',
    agent_scan_project: '扫描项目',
    agent_search: '搜索内容',
  };

  const base = contentMap[toolName] ?? `调用 ${toolName}`;

  // 尝试从 arguments 提取文件路径
  try {
    const args = typeof tc.function.arguments === 'string'
      ? JSON.parse(tc.function.arguments)
      : tc.function.arguments;

    if (args?.file_path) return `${base}: ${args.file_path}`;
    if (args?.pattern) return `${base}: ${args.pattern}`;
    if (args?.command) return `${base}: ${args.command}`;
    if (args?.path) return `${base}: ${args.path}`;
  } catch {
    // arguments 解析失败，使用基础描述
  }

  return base;
}

/**
 * useWorkLogData — 从 messages 提取工作日志
 *
 * @returns WorkLogEntry[] 按时间倒序排列
 */
export function useWorkLogData(): WorkLogEntry[] {
  const messages = useChatStore((s) => s.messages);

  return useMemo(() => {
    const logs: WorkLogEntry[] = [];

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      if (!msg.toolCalls?.length) continue;

      for (const tc of msg.toolCalls) {
        const agentId = inferAgentFromTool(tc.function.name);
        const agent = getAgent(agentId);

        logs.push({
          agentId,
          agentName: agent?.name ?? 'Agent',
          time: formatTime(msg.timestamp),
          content: extractContent(tc, msg),
          timestamp: msg.timestamp,
          agentColor: agent?.color?.text,
        });
      }
    }

    // 按 timestamp 倒序（最新在前）
    logs.sort((a, b) => b.timestamp - a.timestamp);

    return logs;
  }, [messages]);
}
