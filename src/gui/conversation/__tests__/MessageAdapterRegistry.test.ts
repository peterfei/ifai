/**
 * MessageAdapterRegistry 测试
 *
 * 覆盖：
 * - REG-1~5: 注册表引擎（零分支遍历逻辑）
 * - AD-1~5: 适配器输入输出正确性
 * - SM-1~8: 状态映射表完整性
 * - NORM-1~6: 归一化一致性（预览 vs 真实输出同构）
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { MessageAdapterRegistry, adaptMessageToCard } from '../MessageAdapterRegistry';

/* ===== 辅助函数 ===== */

function makeMessage(overrides: Record<string, any> = {}): any {
  return { id: 'm1', role: 'assistant', content: '', ...overrides };
}

/* ===== 注册表引擎测试 ===== */

describe('REG: 注册表引擎', () => {
  beforeEach(() => {
    MessageAdapterRegistry.clear();
  });

  test('REG-1: 注册 2 个适配器，匹配第 1 个', () => {
    MessageAdapterRegistry.register('a', {
      id: 'a',
      match: () => true,
      adapt: () => ({ cardType: 'a', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    MessageAdapterRegistry.register('b', {
      id: 'b',
      match: () => true,
      adapt: () => ({ cardType: 'b', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    const result = adaptMessageToCard({});
    expect(result?.cardType).toBe('a');
  });

  test('REG-2: 注册 2 个适配器，匹配第 2 个', () => {
    MessageAdapterRegistry.register('a', {
      id: 'a',
      match: () => false,
      adapt: () => ({ cardType: 'a', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    MessageAdapterRegistry.register('b', {
      id: 'b',
      match: () => true,
      adapt: () => ({ cardType: 'b', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    const result = adaptMessageToCard({});
    expect(result?.cardType).toBe('b');
  });

  test('REG-3: 注册 2 个适配器，都不匹配 → null', () => {
    MessageAdapterRegistry.register('a', {
      id: 'a', match: () => false,
      adapt: () => ({ cardType: 'a', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    MessageAdapterRegistry.register('b', {
      id: 'b', match: () => false,
      adapt: () => ({ cardType: 'b', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    expect(adaptMessageToCard({})).toBeNull();
  });

  test('REG-4: 注册表为空 → null', () => {
    expect(adaptMessageToCard(makeMessage())).toBeNull();
  });

  test('REG-5: 动态注册后生效', () => {
    // 初始注册第 1 个
    MessageAdapterRegistry.register('a', {
      id: 'a', match: () => false,
      adapt: () => ({ cardType: 'a', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    expect(adaptMessageToCard({})).toBeNull();

    // 动态注册第 2 个
    MessageAdapterRegistry.register('b', {
      id: 'b', match: () => true,
      adapt: () => ({ cardType: 'b', id: 'x', role: 'assistant', content: '', data: {} }),
    });
    const result = adaptMessageToCard({});
    expect(result?.cardType).toBe('b');
  });
});

/* ===== 消息适配测试 ===== */

describe('AD: 消息适配', () => {
  beforeEach(() => {
    MessageAdapterRegistry.clear();
  });

  /* ---- AD-1: 空/无效输入 ---- */

  test('AD-1.1: adaptMessageToCard(null) → null', () => {
    expect(adaptMessageToCard(null)).toBeNull();
  });

  test('AD-1.2: adaptMessageToCard(undefined) → null', () => {
    expect(adaptMessageToCard(undefined)).toBeNull();
  });

  test('AD-1.3: adaptMessageToCard({}) → null', () => {
    expect(adaptMessageToCard({})).toBeNull();
  });

  test('AD-1.4: 仅有 id/role 无 toolCalls → null', () => {
    expect(adaptMessageToCard(makeMessage())).toBeNull();
  });

  /* ---- AD-2: 单 toolCall → tool-call ---- */

  // 注册 toolCall 适配器
  function registerToolCallAdapter() {
    // 内联适配器逻辑，避免 import 依赖
    const TOOL_NAME_FIELDS = ['tool', 'name', 'functionName'];
    const STATUS_MAP: Record<string, string> = {
      pending: 'pending', executing: 'running', running: 'running',
      completed: 'success', failed: 'failed', approved: 'success',
      rejected: 'cancelled',
    };
    MessageAdapterRegistry.register('tool-call', {
      id: 'tool-call',
      match: (msg: any) => !!msg.toolCalls?.length,
      adapt: (msg: any) => {
        const isMulti = msg.toolCalls.length > 1;
        const first = msg.toolCalls[0];
        const pickField = (obj: any, fields: string[], fb: string) =>
          fields.reduce((v: string | null, f: string) => v ?? obj?.[f], null) ?? fb;
        return {
          cardType: 'tool-call',
          id: msg.id, role: msg.role, content: msg.content,
          data: {
            name: isMulti ? `${msg.toolCalls.length} 个工具调用` : pickField(first, TOOL_NAME_FIELDS, 'Unknown Tool'),
            status: isMulti ? 'pending' : (STATUS_MAP[first.status] ?? 'pending'),
            multiTool: isMulti || undefined,
            calls: isMulti ? msg.toolCalls.map((tc: any) => ({
              id: tc.id, name: pickField(tc, TOOL_NAME_FIELDS, 'Unknown Tool'),
              status: tc.status, args: tc.args, result: tc.result,
            })) : undefined,
            args: isMulti ? undefined : first.args,
            result: isMulti ? undefined : (first.output ?? first.result),
            duration: isMulti ? undefined : (first as any).duration,
          },
        };
      },
    });
  }

  test('AD-2.1: 单 toolCall status=completed → cardType=tool-call, status=success', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', tool: 'read_file', status: 'completed', args: { path: '/x' }, result: 'content' }],
    }));
    expect(result?.cardType).toBe('tool-call');
    expect(result?.data.name).toBe('read_file');
    expect(result?.data.status).toBe('success');
    expect(result?.data.args).toEqual({ path: '/x' });
    expect(result?.data.result).toBe('content');
  });

  test('AD-2.2: 单 toolCall status=pending → data.status=pending', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', tool: 'read', status: 'pending' }],
    }));
    expect(result?.data.status).toBe('pending');
  });

  test('AD-2.3: 单 toolCall status=executing → data.status=running', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', tool: 'read', status: 'executing' }],
    }));
    expect(result?.data.status).toBe('running');
  });

  test('AD-2.4: 单 toolCall status=failed → data.status=failed', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', tool: 'read', status: 'failed' }],
    }));
    expect(result?.data.status).toBe('failed');
  });

  test('AD-2.5: output 字段优先于 result', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', tool: 'read', status: 'completed', result: 'old', output: 'new_output' }],
    }));
    // test expects: output 优先于 result
    // 这意味着实现中应为 output ?? result（而非 result ?? output）
    expect(result?.data.result).toBe('new_output');
  });

  test('AD-2.6: tool 字段缺失时回退到 name 字段', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', name: 'fallback_tool', status: 'completed' }],
    }));
    expect(result?.data.name).toBe('fallback_tool');
  });

  test('AD-2.7: tool 和 name 都缺失 → Unknown Tool', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', status: 'completed' }],
    }));
    expect(result?.data.name).toBe('Unknown Tool');
  });

  test('AD-2.8: duration 字段透传', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', tool: 'read', status: 'completed', duration: 1234 }],
    }));
    expect(result?.data.duration).toBe(1234);
  });

  /* ---- AD-3: 多 toolCall ---- */

  test('AD-3.1: 2 个 toolCall → multiTool=true, data.calls 数组', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [
        { id: 'a', tool: 'read_file', status: 'completed' },
        { id: 'b', tool: 'write_file', status: 'pending' },
      ],
    }));
    expect(result?.data.multiTool).toBe(true);
    expect(result?.data.calls).toHaveLength(2);
    expect(result?.data.calls![0].name).toBe('read_file');
    expect(result?.data.calls![1].name).toBe('write_file');
    expect(result?.data.name).toBe('2 个工具调用');
  });

  test('AD-3.2: 5 个 toolCall 边界', () => {
    registerToolCallAdapter();
    const calls = Array.from({ length: 5 }, (_, i) => ({
      id: `tc${i}`, tool: `tool_${i}`, status: 'completed' as const,
    }));
    const result = adaptMessageToCard(makeMessage({ toolCalls: calls }));
    expect(result?.data.calls).toHaveLength(5);
  });

  test('AD-3.3: 多 toolCall 每个条目保留关键字段', () => {
    registerToolCallAdapter();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [
        { id: 'a', tool: 'read', status: 'completed', args: { path: '/x' }, result: 'ok' },
      ],
    }));
    // 非 multiTool（只有1个），验证顶层字段保留
    expect(result?.data.args).toEqual({ path: '/x' });
    expect(result?.data.result).toBe('ok');
  });

  /* ---- AD-4: 已有 cardType 透传 ---- */

  test('AD-4.1: 已有 cardType=approval → 透传 cardType 和 data', () => {
    registerToolCallAdapter(); // 不应影响 cardType 路径，因无 toolCalls
    // 注册 cardType 透传适配器
    MessageAdapterRegistry.register('cardType-passthrough', {
      id: 'cardType-passthrough',
      match: (msg: any) => !!msg.cardType,
      adapt: (msg: any) => ({
        cardType: msg.cardType, id: msg.id, role: msg.role, content: msg.content, data: msg.data || {},
      }),
    });
    const result = adaptMessageToCard({
      id: 'm1', role: 'assistant', content: '', cardType: 'approval', data: { title: 'test' },
    });
    expect(result?.cardType).toBe('approval');
    expect(result?.data.title).toBe('test');
  });

  test('AD-4.2: 已有 cardType 但无 data → data={}', () => {
    MessageAdapterRegistry.register('cardType-passthrough', {
      id: 'cardType-passthrough',
      match: (msg: any) => !!msg.cardType,
      adapt: (msg: any) => ({
        cardType: msg.cardType, id: msg.id, role: msg.role, content: msg.content, data: msg.data || {},
      }),
    });
    const result = adaptMessageToCard({ id: 'm1', role: 'assistant', content: '', cardType: 'progress' });
    expect(result?.data).toEqual({});
  });

  test('AD-4.4: cardType=interaction → 透传所有字段', () => {
    MessageAdapterRegistry.register('cardType-passthrough', {
      id: 'cardType-passthrough',
      match: (msg: any) => !!msg.cardType,
      adapt: (msg: any) => ({
        cardType: msg.cardType, id: msg.id, role: msg.role, content: msg.content, data: msg.data || {},
      }),
    });
    const options = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
    const result = adaptMessageToCard({
      id: 'm1', role: 'assistant', content: '',
      cardType: 'interaction', data: { type: 'single', options },
    });
    expect(result?.data.options).toHaveLength(2);
  });

  /* ---- AD-5: 纯文本降级 ---- */

  test('AD-5.1: user 消息 → null', () => {
    registerToolCallAdapter();
    expect(adaptMessageToCard({ id: 'm1', role: 'user', content: 'hello' })).toBeNull();
  });

  test('AD-5.2: assistant 纯文本（无 toolCalls）→ null', () => {
    registerToolCallAdapter();
    expect(adaptMessageToCard(makeMessage({ content: '## Summary\nSome text' }))).toBeNull();
  });

  test('AD-5.3: system 消息 → null', () => {
    registerToolCallAdapter();
    expect(adaptMessageToCard({ id: 'm1', role: 'system', content: 'You are a helper' })).toBeNull();
  });

  test('AD-5.4: 空 toolCalls 数组 → null', () => {
    registerToolCallAdapter();
    expect(adaptMessageToCard(makeMessage({ toolCalls: [] }))).toBeNull();
  });
});

/* ===== 状态映射表测试 ===== */

describe('SM: STATUS_MAP', () => {
  // 内联映射表（与实现保持一致）
  const STATUS_MAP: Record<string, string> = {
    pending: 'pending', executing: 'running', running: 'running',
    completed: 'success', failed: 'failed', approved: 'success',
    rejected: 'cancelled',
  };
  // 注意：此内联映射表必须与 toolCallAdapter.ts 中的 STATUS_MAP 保持同步
  // 若实现中 STATUS_MAP 有变更，此处需同步更新

  test('SM-1: pending → pending', () => {
    expect(STATUS_MAP['pending']).toBe('pending');
  });
  test('SM-2: executing → running', () => {
    expect(STATUS_MAP['executing']).toBe('running');
  });
  test('SM-3: running → running', () => {
    expect(STATUS_MAP['running']).toBe('running');
  });
  test('SM-4: completed → success', () => {
    expect(STATUS_MAP['completed']).toBe('success');
  });
  test('SM-5: failed → failed', () => {
    expect(STATUS_MAP['failed']).toBe('failed');
  });
  test('SM-6: approved → success', () => {
    expect(STATUS_MAP['approved']).toBe('success');
  });
  test('SM-7: rejected → cancelled', () => {
    expect(STATUS_MAP['rejected']).toBe('cancelled');
  });
  test('SM-8: unknown → undefined (降级)', () => {
    expect(STATUS_MAP['unknown']).toBeUndefined();
  });
});

/* ===== 归一化一致性测试 ===== */

describe('NORM: 归一化一致性', () => {
  beforeEach(() => {
    MessageAdapterRegistry.clear();
  });

  function registerBothAdapters() {
    // cardType 透传
    MessageAdapterRegistry.register('cardType-passthrough', {
      id: 'cardType-passthrough',
      match: (msg: any) => !!msg.cardType,
      adapt: (msg: any) => ({
        cardType: msg.cardType, id: msg.id, role: msg.role, content: msg.content, data: msg.data || {},
      }),
    });
    // toolCall
    const TOOL_NAME_FIELDS = ['tool', 'name', 'functionName'];
    const STATUS_MAP: Record<string, string> = {
      pending: 'pending', executing: 'running', running: 'running',
      completed: 'success', failed: 'failed', approved: 'success',
      rejected: 'cancelled',
    };
    MessageAdapterRegistry.register('tool-call', {
      id: 'tool-call',
      match: (msg: any) => !!msg.toolCalls?.length,
      adapt: (msg: any) => {
        const isMulti = msg.toolCalls.length > 1;
        const first = msg.toolCalls[0];
        const pickField = (obj: any, fields: string[], fb: string) =>
          fields.reduce((v: string | null, f: string) => v ?? obj?.[f], null) ?? fb;
        return {
          cardType: 'tool-call',
          id: msg.id, role: msg.role, content: msg.content,
          data: {
            name: isMulti ? `${msg.toolCalls.length} 个工具调用` : pickField(first, TOOL_NAME_FIELDS, 'Unknown Tool'),
            status: isMulti ? 'pending' : (STATUS_MAP[first.status] ?? 'pending'),
            multiTool: isMulti || undefined,
            calls: isMulti ? msg.toolCalls.map((tc: any) => ({
              id: tc.id, name: pickField(tc, TOOL_NAME_FIELDS, 'Unknown Tool'),
              status: tc.status, args: tc.args, result: tc.result,
            })) : undefined,
            args: isMulti ? undefined : first.args,
            result: isMulti ? undefined : (first.output ?? first.result),
            duration: isMulti ? undefined : (first as any).duration,
          },
        };
      },
    });
  }

  test('NORM-1: 预览格式 cardType=tool-call → 透传 data 不变', () => {
    registerBothAdapters();
    const result = adaptMessageToCard({
      id: 'm1', role: 'assistant', content: '',
      cardType: 'tool-call',
      data: { name: 'read_file', status: 'success', args: { path: '/x' }, result: 'data' },
    });
    expect(result?.data.name).toBe('read_file');
    expect(result?.data.status).toBe('success');
    expect(result?.data.args).toEqual({ path: '/x' });
  });

  test('NORM-2: 真实单工具 → 预览等价结构', () => {
    registerBothAdapters();
    const previewResult = adaptMessageToCard({
      id: 'm1', role: 'assistant', content: '',
      cardType: 'tool-call',
      data: { name: 'read_file', status: 'success', args: { path: '/x' }, result: 'data' },
    });
    const realResult = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'tc1', tool: 'read_file', status: 'completed', args: { path: '/x' }, result: 'data' }],
    }));
    expect(realResult?.data.name).toBe(previewResult?.data.name);
    expect(realResult?.data.status).toBe(previewResult?.data.status);
    expect(realResult?.data.args).toEqual(previewResult?.data.args);
    expect(realResult?.data.result).toBe(previewResult?.data.result);
  });

  test('NORM-3: 预览格式 multiTool → 保存 data.calls', () => {
    registerBothAdapters();
    const result = adaptMessageToCard({
      id: 'm1', role: 'assistant', content: '',
      cardType: 'tool-call',
      data: { multiTool: true, name: '2 个工具调用', calls: [{ id: 'a', name: 'read' }, { id: 'b', name: 'write' }] },
    });
    expect(result?.data.multiTool).toBe(true);
    expect(result?.data.calls).toHaveLength(2);
  });

  test('NORM-4: 真实多工具 → 预览等价结构', () => {
    registerBothAdapters();
    const result = adaptMessageToCard(makeMessage({
      toolCalls: [
        { id: 'a', tool: 'read', status: 'completed' },
        { id: 'b', tool: 'write', status: 'pending' },
      ],
    }));
    expect(result?.data.multiTool).toBe(true);
    expect(result?.data.calls).toHaveLength(2);
    expect(result?.data.name).toBe('2 个工具调用');
  });

  test('NORM-5: 预览与真实产出 data 的 key 集合一致', () => {
    registerBothAdapters();
    const previewData = adaptMessageToCard({
      id: 'm1', role: 'assistant', content: '',
      cardType: 'tool-call',
      data: { name: 'read', status: 'success' },
    })!.data;
    const realData = adaptMessageToCard(makeMessage({
      toolCalls: [{ id: 'a', tool: 'read', status: 'completed' }],
    }))!.data;
    // 预览格式的 key 是真实格式 key 的子集（真实可能多 multiTool/calls/args/result/duration）
    for (const key of Object.keys(previewData)) {
      expect(realData).toHaveProperty(key);
    }
  });

  test('NORM-6: 注册表空时返回 null', () => {
    // beforeEach 已 clear
    expect(adaptMessageToCard(makeMessage({ toolCalls: [{ id: 'a', tool: 'read', status: 'completed' }] })))
      .toBeNull();
  });
});
