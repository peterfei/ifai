/**
 * 声明式预览触发规则表
 *
 * 行为由数据（规则表）驱动而非 if-else 代码驱动。
 * 添加新触发场景 = 在 PREVIEW_TRIGGERS 中加一行，不改引擎代码。
 */

import type { ToolCall } from '../../../stores/useChatStore';
import type { FileChangeData } from './useArtifactData';

// =============================================================
// 类型定义
// =============================================================

/** 规则引擎支持的事件类型 */
export type TriggerEvent =
  | 'workflow:completed'
  | 'artifact:clicked';

/** 规则引擎输出的动作 */
export type Action = 'auto:open' | 'open';

/** 一条预览触发规则 */
export interface PreviewTrigger {
  event: TriggerEvent;
  match: (ctx: MatchContext) => boolean;
  action: Action;
}

/** 规则引擎评估上下文 */
export interface MatchContext {
  artifacts?: FileChangeData[];
  file?: FileChangeData;
}

// =============================================================
// 谓词函数
// =============================================================

/** 判断 toolCall 是否为文件写入工具 */
export function isWriteTool(toolCall: ToolCall): boolean {
  return toolCall.tool === 'agent_write_file' || toolCall.tool === 'write_file';
}

/** 判断文件名是否为 HTML 文件 */
export function isHtmlFile(fileName: string): boolean {
  return /\.html?$/i.test(fileName);
}

/** 判断产出物列表中是否包含 HTML 文件 */
export function hasHtmlOutput(artifacts: FileChangeData[]): boolean {
  return artifacts.some((f) => isHtmlFile(f.name));
}

// =============================================================
// 声明式规则表 — 这是"数据"，不是"代码"
// 添加新规则 = 在此数组加一行
// =============================================================

export const PREVIEW_TRIGGERS: PreviewTrigger[] = [
  {
    event: 'workflow:completed',
    match: (ctx) => hasHtmlOutput(ctx.artifacts ?? []),
    action: 'auto:open',
  },
  {
    event: 'artifact:clicked',
    match: (ctx) => ctx.file != null && isHtmlFile(ctx.file.name),
    action: 'open',
  },
];

// =============================================================
// 规则引擎（纯函数，无副作用，写一次不改）
// =============================================================

/**
 * 评估所有匹配当前事件的规则，返回匹配规则的动作列表。
 * @param event - 事件类型
 * @param ctx - 评估上下文
 * @returns 匹配规则的 action 数组
 */
export function evaluateTriggers(event: string, ctx: MatchContext): Action[] {
  return PREVIEW_TRIGGERS
    .filter((rule) => rule.event === event && rule.match(ctx))
    .map((rule) => rule.action);
}
