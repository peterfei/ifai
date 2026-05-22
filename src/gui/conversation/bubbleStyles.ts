/**
 * bubbleStyles — 气泡样式查表
 *
 * 从 PALETTE / AGENT_DSL / Design Tokens 查表生成 CSSProperties
 * 所有返回值为模块级预计算常量（零运行时开销）
 * Agent 气泡需要动态查表（agentId 未知），使用轻量函数
 */

import type { CSSProperties } from 'react';
import { BRAND_COLORS } from '../design-tokens/colors';
import { SEMANTIC_TOKENS } from './PALETTE';
import { getAgent } from './AGENT_DSL';

/* ===== 预计算常量 ===== */

/** 用户气泡 — 普通模式 */
export const USER_BUBBLE_NORMAL: CSSProperties = {
  maxWidth: '85%',
  borderRadius: 12,
  padding: '12px 16px',
  backgroundColor: BRAND_COLORS['500'],
  color: '#fff',
  alignSelf: 'flex-end',
  boxShadow: '0 4px 12px rgba(75, 137, 255, 0.15)',
};

/** 用户气泡 — compact 模式 */
export const USER_BUBBLE_COMPACT: CSSProperties = {
  ...USER_BUBBLE_NORMAL,
  padding: '8px 12px',
  borderRadius: 10,
};

/** AI 气泡 — 普通模式 */
export const ASSISTANT_BUBBLE_NORMAL: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  padding: '12px 16px',
  backgroundColor: SEMANTIC_TOKENS.surface.bg2,
  color: '#e5e7eb',
  border: `1px solid ${SEMANTIC_TOKENS.surface.border}`,
  alignSelf: 'flex-start',
};

/** AI 气泡 — compact 模式 */
export const ASSISTANT_BUBBLE_COMPACT: CSSProperties = {
  ...ASSISTANT_BUBBLE_NORMAL,
  padding: '8px 12px',
  borderRadius: 10,
};

/** Agent 气泡基础 — 普通模式 */
const AGENT_BUBBLE_BASE: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  padding: '12px 16px',
  backgroundColor: SEMANTIC_TOKENS.surface.bg1,
  color: '#e5e7eb',
  alignSelf: 'flex-start',
};

/** Agent 气泡基础 — compact 模式 */
const AGENT_BUBBLE_COMPACT_BASE: CSSProperties = {
  ...AGENT_BUBBLE_BASE,
  padding: '8px 12px',
  borderRadius: 10,
};

/* ===== 查询函数 ===== */

/** 获取用户气泡样式 */
export function getUserBubbleStyle(compact?: boolean): CSSProperties {
  return compact ? USER_BUBBLE_COMPACT : USER_BUBBLE_NORMAL;
}

/** 获取 AI 气泡样式 */
export function getAssistantBubbleStyle(compact?: boolean): CSSProperties {
  return compact ? ASSISTANT_BUBBLE_COMPACT : ASSISTANT_BUBBLE_NORMAL;
}

/** 获取 Agent 气泡样式（需要动态查表 agentId） */
export function getAgentBubbleStyle(agentId: string, compact?: boolean): CSSProperties {
  const agent = getAgent(agentId);
  const borderColor = agent?.color?.border ?? SEMANTIC_TOKENS.semantic.neutral;
  const base = compact ? AGENT_BUBBLE_COMPACT_BASE : AGENT_BUBBLE_BASE;

  return {
    ...base,
    borderLeft: `3px solid ${borderColor}`,
  };
}

/** 获取 Agent 头像样式 */
export function getAgentAvatarStyle(agentId: string): CSSProperties {
  const agent = getAgent(agentId);
  const bgColor = agent?.color?.bg ?? SEMANTIC_TOKENS.semantic.neutral;

  return {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: bgColor,
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
  };
}
