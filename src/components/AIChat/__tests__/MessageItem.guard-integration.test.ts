/**
 * MessageItem guard 修复集成测试
 *
 * 验证 MessageItem.tsx:868 守卫移除后，真实消息能正确进入卡片渲染路径。
 *
 * 守卫原代码：
 *   const resolvedCardType = (message as any).cardType ? resolveCardType(message as any) : null;
 *
 * 修复后：
 *   const resolvedCardType = resolveCardType(message as any);
 *
 * 由于 resolveCardType 已具备智能推断能力（toolCalls → 'tool-call'），
 * 移除守卫后真实消息的 cardType 将由 resolveCardType 的推断逻辑决定。
 */
import { describe, test, expect } from 'vitest';
import { resolveCardType } from '../../../gui/conversation/MessageCardRegistry';

/* ===== 辅助函数 ===== */

function makeAssistantMessage(overrides: Record<string, any> = {}): any {
  return { id: 'm1', role: 'assistant', content: 'some text', ...overrides };
}

/* ===== AD-6: 守卫修复 — 渲染路径验证 ===== */

describe('AD-6: 守卫移除后卡片类型推断', () => {
  // 模拟修复后的逻辑：直接调用 resolveCardType（移除 cardType? 守卫）
  function resolvedCardType(message: any): string | null {
    const cardType = resolveCardType(message);
    // 如果 resolveCardType 返回 'text'，意味着不可渲染为卡片
    return cardType === 'text' ? null : cardType;
  }

  test('AD-6a: 真实消息有 toolCalls → resolveCardType 返回 tool-call', () => {
    const msg = makeAssistantMessage({
      toolCalls: [{ id: 'tc1', tool: 'read_file', status: 'completed' }],
    });
    // 修复前： (msg as any).cardType ? resolveCardType(msg) : null → null（因无 cardType）
    // 修复后： resolveCardType(msg) → 'tool-call'（因推断 toolCalls）
    const cardType = resolvedCardType(msg);
    expect(cardType).toBe('tool-call');
  });

  test('AD-6b: 纯文本 assistant 消息 → resolveCardType 返回 null（降级到 MarkdownRenderer）', () => {
    const msg = makeAssistantMessage({ content: '# Hello\nWorld', toolCalls: undefined });
    const cardType = resolvedCardType(msg);
    expect(cardType).toBeNull();
  });

  test('AD-6c: user 消息 → resolveCardType 返回 null', () => {
    const msg = { id: 'm2', role: 'user', content: 'hello' };
    const cardType = resolvedCardType(msg);
    expect(cardType).toBeNull();
  });

  test('AD-6d: 多 toolCall → resolveCardType 返回 tool-call（进入 ToolCallCard 多工具模式）', () => {
    const msg = makeAssistantMessage({
      toolCalls: [
        { id: 'a', tool: 'read', status: 'completed' },
        { id: 'b', tool: 'write', status: 'pending' },
      ],
    });
    const cardType = resolvedCardType(msg);
    expect(cardType).toBe('tool-call');
  });

  test('AD-6e: 已有 cardType 透传不受影响', () => {
    const msg = { id: 'm3', role: 'assistant', content: '', cardType: 'approval', data: {} };
    const cardType = resolvedCardType(msg);
    expect(cardType).toBe('approval');
  });

  test('AD-6f: null 消息 → resolveCardType 返回 text → null（安全降级）', () => {
    const cardType = resolvedCardType(null);
    expect(cardType).toBeNull();
  });

  test('AD-6g: undefined 消息 → resolveCardType 返回 text → null（安全降级）', () => {
    const cardType = resolvedCardType(undefined);
    expect(cardType).toBeNull();
  });
});

/* ===== AD-9: 预览模式无回归 ===== */

describe('AD-9: 预览模式 7 种卡片推断不变', () => {
  function resolvedCardType(message: any): string | null {
    const cardType = resolveCardType(message);
    return cardType === 'text' ? null : cardType;
  }

  const CARD_TYPES = ['progress', 'approval', 'interaction', 'file-change', 'tool-call', 'error-fix', 'composer'];

  for (const cardType of CARD_TYPES) {
    test(`AD-9: cardType=${cardType} → resolveCardType 返回 ${cardType}`, () => {
      const msg = { id: 'm1', role: 'assistant', content: '', cardType, data: {} };
      expect(resolvedCardType(msg)).toBe(cardType);
    });
  }
});

/* ===== AD-10: 纯文本消息无回归 ===== */

describe('AD-10: 纯文本消息推断不变', () => {
  function resolvedCardType(message: any): string | null {
    const cardType = resolveCardType(message);
    return cardType === 'text' ? null : cardType;
  }

  test('AD-10.1: 纯 Markdown → 返回 null（走 MarkdownRenderer）', () => {
    expect(resolvedCardType({ id: 'm1', role: 'assistant', content: '# Title\n**bold**' })).toBeNull();
  });

  test('AD-10.2: 代码块 → 返回 null（走 MarkdownRenderer）', () => {
    expect(resolvedCardType({ id: 'm1', role: 'assistant', content: '```ts\nconst x = 1;\n```' })).toBeNull();
  });

  test('AD-10.3: 空字符串 → 返回 null', () => {
    expect(resolvedCardType({ id: 'm1', role: 'assistant', content: '' })).toBeNull();
  });
});
