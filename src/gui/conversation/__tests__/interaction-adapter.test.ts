/**
 * interactionAdapter 单元测试
 *
 * 覆盖：
 * - UT-A.1 ~ UT-A.3: match 函数
 * - UT-A.4 ~ UT-A.7: adapt 函数
 * - UT-A.8: 注册表存在性
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { interactionAdapter } from '../adapters/interactionAdapter';
import { MessageAdapterRegistry } from '../MessageAdapterRegistry';

function makeMsg(overrides: Record<string, any> = {}): any {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '需要您的意见...',
    ...overrides,
  };
}

describe('interactionAdapter.match', () => {
  /* UT-A.1 */
  it('UT-A.1: metadata.interactionData.questions 数组存在 → 匹配', () => {
    const msg = makeMsg({
      metadata: {
        interactionData: {
          title: '选择策略',
          questions: [{ id: 'q1', type: 'single', question: '?', options: [] }],
        },
      },
    });
    expect(interactionAdapter.match(msg)).toBe(true);
  });

  /* UT-A.2 */
  it('UT-A.2: cardType=interaction 但不含 metadata.interactionData → 不匹配（由 cardTypePassthroughAdapter 处理）', () => {
    const msg = makeMsg({ cardType: 'interaction', data: { title: 'test' } });
    expect(interactionAdapter.match(msg)).toBe(false);
  });

  /* UT-A.3 */
  it('UT-A.3: 普通 assistant/user 消息 → 不匹配', () => {
    expect(interactionAdapter.match(makeMsg())).toBe(false);
    expect(interactionAdapter.match(makeMsg({ role: 'user', content: 'hello' }))).toBe(false);
  });
});

describe('interactionAdapter.adapt', () => {
  /* UT-A.4 */
  it('UT-A.4: 完整 questions 数据 → 返回正确 cardType + data', () => {
    const msg = makeMsg({
      metadata: {
        interactionData: {
          type: 'single',
          title: '选择策略',
          questions: [
            { id: 'q1', type: 'single', question: '请选择：', options: [{ id: 'a', label: 'A', desc: 'desc' }] },
          ],
          onSelect: 'continue',
        },
      },
    });
    const result = interactionAdapter.adapt(msg);
    expect(result).not.toBeNull();
    expect(result!.cardType).toBe('interaction');
    expect(result!.data.title).toBe('选择策略');
    expect(result!.data.questions).toHaveLength(1);
    expect(result!.data.questions[0].options).toHaveLength(1);
  });

  /* UT-A.5 */
  it('UT-A.5: 空 questions 数组 → 返回 null', () => {
    const msg = makeMsg({
      metadata: { interactionData: { title: 'test', questions: [] } },
    });
    expect(interactionAdapter.adapt(msg)).toBeNull();
  });

  /* UT-A.6 */
  it('UT-A.6: 缺失 questions 字段 → 返回 null', () => {
    const msg = makeMsg({
      metadata: { interactionData: { title: 'test' } },
    });
    expect(interactionAdapter.adapt(msg)).toBeNull();
  });

  /* UT-A.7 */
  it('UT-A.7: 多问题模式 type 推导 → questions.length > 1 时 type 为 multiple', () => {
    const msg = makeMsg({
      metadata: {
        interactionData: {
          type: 'single',
          title: '选择方案',
          questions: [
            { id: 'q1', type: 'single', question: 'Q1', options: [{ id: 'a', label: 'A', desc: '' }] },
            { id: 'q2', type: 'multiple', question: 'Q2', options: [{ id: 'b', label: 'B', desc: '' }] },
          ],
        },
      },
    });
    const result = interactionAdapter.adapt(msg);
    expect(result!.data.type).toBe('multiple');
  });
});

describe('interactionAdapter 注册表', () => {
  /* UT-A.8 */
  it('UT-A.8: MessageAdapterRegistry 包含 interaction 条目', () => {
    const entry = MessageAdapterRegistry.get('interaction');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('interaction');
  });
});
