import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../builtinTools';
import type {
  WriteFileArgs,
  ReadFileArgs,
  GetToolArgs,
  GetToolResult
} from '@/types/toolTypes';

describe('工具类型系统', () => {
  describe('类型推断', () => {
    it('应该正确推断 agent_write_file 的参数类型', () => {
      // 这个测试主要验证类型系统，运行时检查
      const tool = toolRegistry.get('agent_write_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('agent_write_file');
    });

    it('应该正确推断 agent_read_file 的参数类型', () => {
      const tool = toolRegistry.get('agent_read_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('agent_read_file');
    });

    it('应该正确推断 agent_list_dir 的参数类型', () => {
      const tool = toolRegistry.get('agent_list_dir');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('agent_list_dir');
    });

    it('应该正确推断 agent_delete_file 的参数类型', () => {
      const tool = toolRegistry.get('agent_delete_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('agent_delete_file');
    });
  });

  describe('类型映射表', () => {
    it('应该正确映射 agent_write_file 的参数类型', () => {
      // 编译时类型检查
      type Args = GetToolArgs<'agent_write_file'>;
      const args: Args = { path: '/test', content: 'hello' };
      expect(args.path).toBe('/test');
      expect(args.content).toBe('hello');
    });

    it('应该正确映射 agent_read_file 的参数类型', () => {
      type Args = GetToolArgs<'agent_read_file'>;
      const args: Args = { path: '/test' };
      expect(args.path).toBe('/test');
    });

    it('类型映射表应该包含所有已注册的工具', () => {
      const tools = ['agent_write_file', 'agent_read_file', 'agent_list_dir', 'agent_delete_file'] as const;

      tools.forEach(toolName => {
        expect(toolRegistry.has(toolName)).toBe(true);
      });
    });
  });

  describe('工具执行类型安全', () => {
    it('agent_write_file 应该接受正确的参数', async () => {
      const result = await toolRegistry.execute<WriteFileArgs, any>(
        'agent_write_file',
        { path: '/tmp/test.txt', content: 'test content' },
        { messageId: 'test-msg', threadId: 'test-thread', projectRoot: '/tmp' }
      );

      // 结果应该有正确的类型结构
      expect(result).toHaveProperty('success');
      if (!result.success) {
        expect(result).toHaveProperty('error');
      }
    });

    it('agent_read_file 应该接受正确的参数', async () => {
      const result = await toolRegistry.execute<ReadFileArgs, any>(
        'agent_read_file',
        { path: '/tmp/test.txt' },
        { messageId: 'test-msg', threadId: 'test-thread', projectRoot: '/tmp' }
      );

      expect(result).toHaveProperty('success');
    });
  });

  describe('类型导出', () => {
    it('WriteFileArgs 应该是正确的类型', () => {
      const args: WriteFileArgs = {
        path: '/test/path',
        content: 'content'
      };

      expect(typeof args.path).toBe('string');
      expect(typeof args.content).toBe('string');
    });

    it('ReadFileArgs 应该是正确的类型', () => {
      const args: ReadFileArgs = {
        path: '/test/path'
      };

      expect(typeof args.path).toBe('string');
    });
  });
});
