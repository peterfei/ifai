import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockCommandLineCore } from '../../../src/core/commandBar/mock';
import type { CommandContext } from '../../../src/core/commandBar/types';

/**
 * 命令执行引擎 Mock 实现的单元测试
 */
describe('MockCommandLineCore', () => {
  let core: MockCommandLineCore;
  let mockContext: CommandContext;

  beforeEach(async () => {
    core = new MockCommandLineCore();
    mockContext = {
      activeFileId: 'test-file-123',
      workspace: '/test/workspace',
      editorState: {
        readonly: false,
        language: 'typescript',
      },
    };
  });

  afterEach(() => {
    core.dispose();
  });

  describe('初始化', () => {
    it('应该能够成功初始化', async () => {
      await core.initialize();
      const diagnostics = core.getDiagnostics();
      expect(diagnostics.initialized).toBe(true);
      expect(diagnostics.type).toBe('mock');
      expect(diagnostics.version).toBe('1.0.0-community');
    });

    it('多次初始化应该幂等', async () => {
      await core.initialize();
      await core.initialize();
      await core.initialize();
      const diagnostics = core.getDiagnostics();
      expect(diagnostics.initialized).toBe(true);
    });

    it('未初始化时调用 execute 应该自动初始化', async () => {
      const newCore = new MockCommandLineCore();
      const result = await newCore.execute(':help', mockContext);
      expect(result.success).toBe(true);
      expect(newCore.getDiagnostics().initialized).toBe(true);
    });
  });

  describe('命令执行', () => {
    beforeEach(async () => {
      await core.initialize();
    });

    it('应该能够正确解析并执行 :help 命令', async () => {
      const result = await core.execute(':help', mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('社区版');
      expect(result.outputType).toBe('html');
      expect(result.timestamp).toBeDefined();
    });

    it('应该能够执行 :version 命令', async () => {
      const result = await core.execute(':version', mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('1.0.0-community');
      expect(result.data).toEqual({ version: '1.0.0-community' });
      expect(result.outputType).toBe('text');
    });

    it('应该能够执行 :clear 命令', async () => {
      const result = await core.execute(':clear', mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('命令历史已清除');
      expect(result.outputType).toBe('toast');
    });

    it('对于未知命令应返回错误', async () => {
      const result = await core.execute(':unknown-command', mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('未知命令');
      expect(result.errorCode).toBe('UNKNOWN_COMMAND');
      expect(result.outputType).toBe('error');
    });

    it('对于空命令应返回提示', async () => {
      const result = await core.execute(':', mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('请输入命令');
      expect(result.outputType).toBe('error');
    });

    it('对于仅包含空格的命令应返回提示', async () => {
      const result = await core.execute(':   ', mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('请输入命令');
    });
  });

  describe('Pro 版专属命令', () => {
    beforeEach(async () => {
      await core.initialize();
    });

    it('执行 :config 应弹出 Pro 版提示', async () => {
      const result = await core.execute(':config', mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Pro 版');
      expect(result.message).toContain('config');
      expect(result.errorCode).toBe('PRO_FEATURE');
      expect(result.outputType).toBe('toast');
    });

    it('执行 :advanced 应弹出 Pro 版提示', async () => {
      const result = await core.execute(':advanced', mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PRO_FEATURE');
      expect(result.message).toContain('advanced');
    });

    it('执行 :plugin 应弹出 Pro 版提示', async () => {
      const result = await core.execute(':plugin', mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PRO_FEATURE');
    });

    it('执行 :workspace 应弹出 Pro 版提示', async () => {
      const result = await core.execute(':workspace', mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PRO_FEATURE');
    });

    it('执行 :refactor 应弹出 Pro 版提示', async () => {
      const result = await core.execute(':refactor', mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PRO_FEATURE');
    });

    it('执行 :debug 应弹出 Pro 版提示', async () => {
      const result = await core.execute(':debug', mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PRO_FEATURE');
    });
  });

  describe('命令建议', () => {
    beforeEach(async () => {
      await core.initialize();
    });

    it('应该能提供所有基础命令建议', async () => {
      const suggestions = await core.getSuggestions('');

      expect(suggestions).toContainEqual(
        expect.objectContaining({ text: 'help', type: 'command' })
      );
      expect(suggestions).toContainEqual(
        expect.objectContaining({ text: 'version', type: 'command' })
      );
      expect(suggestions).toContainEqual(
        expect.objectContaining({ text: 'clear', type: 'command' })
      );
    });

    it('应该能根据前缀过滤建议', async () => {
      const suggestions = await core.getSuggestions('h');

      // mock 实现包含 help 和 hsplit 两个以 h 开头的命令
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions).toContainEqual(
        expect.objectContaining({
          text: 'help',
          description: '显示可用命令帮助',
        })
      );
    });

    it('应该能根据前缀过滤建议 (v)', async () => {
      const suggestions = await core.getSuggestions('v');

      // mock 实现包含 vsplit 和 version 两个以 v 开头的命令
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions).toContainEqual(
        expect.objectContaining({
          text: 'version',
          description: '显示版本信息',
        })
      );
    });

    it('对于 Pro 命令应该显示特殊提示', async () => {
      const suggestions = await core.getSuggestions('config');

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toMatchObject({
        text: 'config',
        description: 'Pro 版专属功能',
      });
    });

    it('不匹配任何命令时应返回空数组', async () => {
      const suggestions = await core.getSuggestions('xyz');
      expect(suggestions).toEqual([]);
    });

    it('未初始化时调用 getSuggestions 应该自动初始化', async () => {
      const newCore = new MockCommandLineCore();
      const suggestions = await newCore.getSuggestions('h');

      expect(suggestions).toBeDefined();
      expect(newCore.getDiagnostics().initialized).toBe(true);
    });
  });

  describe('诊断信息', () => {
    it('应该提供完整的诊断信息', async () => {
      await core.initialize();
      const diagnostics = core.getDiagnostics();

      expect(diagnostics).toMatchObject({
        type: 'mock',
        version: '1.0.0-community',
        initialized: true,
      });
      expect(diagnostics.loadTime).toBeGreaterThanOrEqual(0);
    });

    it('未初始化时 loadTime 应该接近 0', () => {
      const diagnostics = core.getDiagnostics();
      expect(diagnostics.initialized).toBe(false);
      expect(diagnostics.loadTime).toBe(0);
    });
  });

  describe('资源释放', () => {
    it('dispose 后应该重置初始化状态', async () => {
      await core.initialize();
      expect(core.getDiagnostics().initialized).toBe(true);

      core.dispose();
      expect(core.getDiagnostics().initialized).toBe(false);
    });

    it('dispose 后可以重新初始化', async () => {
      await core.initialize();
      core.dispose();

      await core.initialize();
      expect(core.getDiagnostics().initialized).toBe(true);
    });
  });

  describe('边界情况', () => {
    beforeEach(async () => {
      await core.initialize();
    });

    it('应该处理大写命令', async () => {
      const result = await core.execute(':HELP', mockContext);
      expect(result.success).toBe(true);
    });

    it('应该处理混合大小写命令', async () => {
      const result = await core.execute(':HeLp', mockContext);
      expect(result.success).toBe(true);
    });

    it('应该处理带额外空格的命令', async () => {
      const result = await core.execute(':  help  ', mockContext);
      expect(result.success).toBe(true);
    });

    it('应该处理不带前缀的命令', async () => {
      const result = await core.execute('help', mockContext);
      expect(result.success).toBe(true);
    });

    it('应该处理空上下文', async () => {
      const result = await core.execute(':help', {} as CommandContext);
      expect(result.success).toBe(true);
    });

    it('应该处理 undefined 上下文', async () => {
      const result = await core.execute(':help', undefined as unknown as CommandContext);
      expect(result.success).toBe(true);
    });
  });

  describe('并发执行', () => {
    it('应该能够处理并发命令执行', async () => {
      await core.initialize();

      const promises = [
        core.execute(':help', mockContext),
        core.execute(':version', mockContext),
        core.execute(':clear', mockContext),
      ];

      const results = await Promise.all(promises);

      expect(results.every(r => r.success)).toBe(true);
    });

    it('应该能够处理并发建议请求', async () => {
      await core.initialize();

      const promises = [
        core.getSuggestions('h'),
        core.getSuggestions('v'),
        core.getSuggestions('c'),
      ];

      const results = await Promise.all(promises);

      expect(results.every(s => Array.isArray(s))).toBe(true);
    });
  });
});
