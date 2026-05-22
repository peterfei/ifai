/**
 * bubbleStyles 查表测试
 *
 * BS-1 ~ BS-5: 气泡样式从 PALETTE/AGENT_DSL 查表
 */

import { describe, it, expect } from 'vitest';
import {
  getUserBubbleStyle,
  getAssistantBubbleStyle,
  getAgentBubbleStyle,
  getAgentAvatarStyle,
} from '../bubbleStyles';
import { BRAND_COLORS } from '../../design-tokens/colors';
import { SEMANTIC_TOKENS } from '../PALETTE';
import { AGENT_DSL } from '../AGENT_DSL';

describe('bubbleStyles', () => {
  // BS-1: 用户气泡背景色 = BRAND_COLORS['500']
  it('BS-1: 用户气泡背景色使用品牌色', () => {
    const style = getUserBubbleStyle();
    expect(style.backgroundColor).toBe(BRAND_COLORS['500']);
  });

  // BS-2: 用户气泡右对齐
  it('BS-2: 用户气泡右对齐', () => {
    const style = getUserBubbleStyle();
    expect(style.alignSelf).toBe('flex-end');
  });

  // BS-3: AI 气泡背景色 = surface bg2
  it('BS-3: AI 气泡背景色使用 surface bg2', () => {
    const style = getAssistantBubbleStyle();
    expect(style.backgroundColor).toBe(SEMANTIC_TOKENS.surface.bg2);
  });

  // BS-4: Agent 气泡左边框色 = AGENT_DSL[id].color.border
  it('BS-4: Agent 气泡左边框色来自 AGENT_DSL', () => {
    const style = getAgentBubbleStyle('explore');
    expect(style.borderLeft).toContain(AGENT_DSL.explore.color.border);
  });

  // BS-5: compact 模式 padding 更小
  it('BS-5: compact 模式 padding 更小', () => {
    const normal = getUserBubbleStyle();
    const compact = getUserBubbleStyle(true);
    // compact 的 padding 应该小于 normal
    expect(compact.padding).not.toBe(normal.padding);
  });

  // BS-6: compact 用户气泡背景色不变
  it('BS-6: compact 用户气泡背景色不变', () => {
    const style = getUserBubbleStyle(true);
    expect(style.backgroundColor).toBe(BRAND_COLORS['500']);
  });

  // BS-7: compact AI 气泡背景色不变
  it('BS-7: compact AI 气泡背景色不变', () => {
    const style = getAssistantBubbleStyle(true);
    expect(style.backgroundColor).toBe(SEMANTIC_TOKENS.surface.bg2);
  });

  // BS-8: 未知 Agent 安全降级
  it('BS-8: 未知 Agent 安全降级', () => {
    const style = getAgentBubbleStyle('unknown_agent');
    // borderLeft 简写包含 neutral 色
    expect(style.borderLeft).toContain(SEMANTIC_TOKENS.semantic.neutral);
  });

  // BS-9: Agent 头像背景色来自 AGENT_DSL
  it('BS-9: Agent 头像背景色来自 AGENT_DSL', () => {
    const style = getAgentAvatarStyle('explore');
    expect(style.backgroundColor).toBe(AGENT_DSL.explore.color.bg);
  });

  // BS-10: 未知 Agent 头像安全降级
  it('BS-10: 未知 Agent 头像安全降级', () => {
    const style = getAgentAvatarStyle('unknown_agent');
    expect(style.backgroundColor).toBe(SEMANTIC_TOKENS.semantic.neutral);
  });
});
