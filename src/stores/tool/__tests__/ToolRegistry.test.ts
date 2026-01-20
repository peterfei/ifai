import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from 'ifainew-core';
import type { ToolDefinition } from 'ifainew-core';

describe('ToolRegistry - 基础功能', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('应该注册工具', () => {
    const tool: ToolDefinition = {
      name: 'test_tool',
      category: 'custom',
      description: 'Test',
      schema: { type: 'object' },
      requiresApproval: false,
      handler: async () => ({ success: true })
    };

    registry.register(tool);

    expect(registry.has('test_tool')).toBe(true);
  });

  it('应该拒绝重复注册', () => {
    const tool: ToolDefinition = {
      name: 'test_tool',
      category: 'custom',
      description: 'Test',
      schema: { type: 'object' },
      requiresApproval: false,
      handler: async () => ({ success: true })
    };

    registry.register(tool);

    expect(() => registry.register(tool)).toThrow('already registered');
  });

  describe('分类功能', () => {
    beforeEach(() => {
      registry.register({
        name: 'custom_tool',
        category: 'custom',
        description: 'Custom tool',
        schema: { type: 'object' },
        requiresApproval: false,
        handler: async () => ({ success: true })
      });

      registry.register({
        name: 'fs_tool',
        category: 'fs',
        description: 'FS tool',
        schema: { type: 'object' },
        requiresApproval: false,
        handler: async () => ({ success: true })
      });
    });

    it('应该列出所有工具', () => {
      const allTools = registry.list();
      expect(allTools).toHaveLength(2);
    });

    it('应该按分类过滤工具', () => {
      const customTools = registry.list('custom');
      const fsTools = registry.list('fs');

      expect(customTools).toHaveLength(1);
      expect(customTools[0].name).toBe('custom_tool');

      expect(fsTools).toHaveLength(1);
      expect(fsTools[0].name).toBe('fs_tool');
    });

    it('空分类返回空数组', () => {
      const bashTools = registry.list('bash');
      expect(bashTools).toHaveLength(0);
    });
  });

  describe('获取功能', () => {
    it('应该获取已注册的工具', () => {
      const tool: ToolDefinition = {
        name: 'test_tool',
        category: 'custom',
        description: 'Test',
        schema: { type: 'object' },
        requiresApproval: false,
        handler: async () => ({ success: true })
      };

      registry.register(tool);
      const retrieved = registry.get('test_tool');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test_tool');
    });

    it('未注册工具返回 undefined', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });
});

describe('ToolRegistry - 执行功能', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      category: 'custom',
      description: 'Echo tool',
      schema: { type: 'object' },
      requiresApproval: false,
      handler: async (args) => ({ success: true, output: args.message })
    });
  });

  it('应该执行工具并返回结果', async () => {
    const result = await registry.execute(
      'echo',
      { message: 'hello' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('hello');
  });

  it('未注册工具返回错误', async () => {
    const result = await registry.execute(
      'unknown',
      {},
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('应该传递上下文到处理器', async () => {
    let capturedContext: any | undefined;

    registry.register({
      name: 'context_test',
      category: 'custom',
      description: 'Context test',
      schema: { type: 'object' },
      requiresApproval: false,
      handler: async (_args, context) => {
        capturedContext = context;
        return { success: true };
      }
    });

    const testContext = { messageId: 'msg123', threadId: 't456', projectRoot: '/project' };
    await registry.execute('context_test', {}, testContext);

    expect(capturedContext).toEqual(testContext);
  });

  it('应该处理工具异常', async () => {
    registry.register({
      name: 'error_tool',
      category: 'custom',
      description: 'Error tool',
      schema: { type: 'object' },
      requiresApproval: false,
      handler: async () => {
        throw new Error('Tool failed');
      }
    });

    const result = await registry.execute(
      'error_tool',
      {},
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool failed');
  });
});
