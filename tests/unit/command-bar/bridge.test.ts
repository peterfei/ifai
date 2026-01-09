import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getCommandLineCore,
  getCommandLineDiagnostics,
  isMockMode,
  isProMode,
  resetBridge,
  CommandBridge,
} from '../../../src/core/commandBar/bridge';
import type { ICommandLineCore } from '../../../src/core/commandBar/types';

/**
 * CommandBar Bridge 路由单元测试
 *
 * 注意：由于私有库不存在，这些测试主要验证降级到 Mock 的行为。
 * 当私有库可用时，需要补充测试覆盖 Pro 版加载路径。
 */
describe('CommandBar Bridge Routing', () => {
  // 每个测试后重置桥接器状态
  afterEach(() => {
    resetBridge();
  });

  describe('基础功能', () => {
    it('应该成功获取核心实例', async () => {
      const core = await getCommandLineCore();
      expect(core).toBeDefined();
      expect(typeof core.initialize).toBe('function');
      expect(typeof core.execute).toBe('function');
      expect(typeof core.getSuggestions).toBe('function');
      expect(typeof core.dispose).toBe('function');
    });

    it('默认应该使用 Mock 实现', async () => {
      await getCommandLineCore();
      expect(isMockMode()).toBe(true);
      expect(isProMode()).toBe(false);
    });
  });

  describe('单例模式', () => {
    it('多次获取应返回同一个实例', async () => {
      const instance1 = await getCommandLineCore();
      const instance2 = await getCommandLineCore();
      const instance3 = await getCommandLineCore();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });

    it('重置后应返回新实例', async () => {
      const instance1 = await getCommandLineCore();
      resetBridge();
      const instance2 = await getCommandLineCore();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('诊断信息', () => {
    it('应该提供正确的诊断信息（Mock 模式）', async () => {
      await getCommandLineCore();
      const diagnostics = getCommandLineDiagnostics();

      expect(diagnostics).toMatchObject({
        type: 'mock',
        initialized: true,
      });
      expect(diagnostics.version).toBeDefined();
      expect(diagnostics.loadTime).toBeGreaterThanOrEqual(0);
    });

    it('loadTime 应该反映实际加载时间', async () => {
      const startTime = performance.now();
      await getCommandLineCore();
      const diagnostics = getCommandLineDiagnostics();
      const endTime = performance.now();

      expect(diagnostics.loadTime).toBeGreaterThan(0);
      expect(diagnostics.loadTime).toBeLessThanOrEqual(endTime - startTime + 10); // 允许 10ms 误差
    });
  });

  describe('降级策略', () => {
    it('当私有核心库缺失时，应自动降级到 Mock 实现', async () => {
      // 由于私有库不存在，这应该自动降级
      const core = await getCommandLineCore();
      const result = await core.execute(':help', {});

      expect(result.success).toBe(true);
      expect(result.message).toContain('社区版');
    });

    it('降级模式下应正确执行 Mock 命令', async () => {
      const core = await getCommandLineCore();

      // 测试 Mock 实现的命令
      const helpResult = await core.execute(':help', {});
      expect(helpResult.success).toBe(true);

      const versionResult = await core.execute(':version', {});
      expect(versionResult.success).toBe(true);

      const clearResult = await core.execute(':clear', {});
      expect(clearResult.success).toBe(true);
    });

    it('降级模式下应正确处理 Pro 命令', async () => {
      const core = await getCommandLineCore();
      const result = await core.execute(':config', {});

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PRO_FEATURE');
    });
  });

  describe('初始化行为', () => {
    it('获取实例后应该自动初始化', async () => {
      const core = await getCommandLineCore();
      const diagnostics = getCommandLineDiagnostics();

      expect(diagnostics.initialized).toBe(true);
    });

    it('初始化后的核心应该可以正常执行命令', async () => {
      const core = await getCommandLineCore();
      const result = await core.execute(':version', {});

      expect(result.success).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该记录加载错误信息（如果有）', async () => {
      // 重置以清除之前的状态
      resetBridge();

      // 获取实例（会尝试加载私有库并失败）
      await getCommandLineCore();

      // 在 Mock 模式下，不应该有错误（因为降级成功）
      // 如果将来需要模拟加载失败的情况，可以使用 vi.stub
      const diagnostics = getCommandLineDiagnostics();
      expect(diagnostics.type).toBe('mock');
    });
  });

  describe('并发获取', () => {
    it('应该能够处理并发获取请求', async () => {
      const promises = [
        getCommandLineCore(),
        getCommandLineCore(),
        getCommandLineCore(),
        getCommandLineCore(),
        getCommandLineCore(),
      ];

      const results = await Promise.all(promises);

      // 所有结果应该是同一个实例
      const firstInstance = results[0];
      expect(results.every(r => r === firstInstance)).toBe(true);
    });
  });

  describe('模式检查', () => {
    it('isMockMode 在 Mock 模式下应返回 true', async () => {
      await getCommandLineCore();
      expect(isMockMode()).toBe(true);
    });

    it('isProMode 在 Mock 模式下应返回 false', async () => {
      await getCommandLineCore();
      expect(isProMode()).toBe(false);
    });

    it('重置后模式检查应返回默认值', () => {
      resetBridge();
      // 在没有获取实例时，应该返回 false
      expect(isMockMode()).toBe(false);
      expect(isProMode()).toBe(false);
    });
  });

  describe('资源清理', () => {
    it('reset 应该释放当前实例', async () => {
      const core = await getCommandLineCore();
      const disposeSpy = vi.spyOn(core, 'dispose');

      resetBridge();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('reset 后应该可以重新获取新实例', async () => {
      const instance1 = await getCommandLineCore();
      const result1 = await instance1.execute(':version', {});

      resetBridge();

      const instance2 = await getCommandLineCore();
      const result2 = await instance2.execute(':version', {});

      expect(instance1).not.toBe(instance2);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('reset 应该清除所有状态', async () => {
      await getCommandLineCore();
      expect(isMockMode()).toBe(true);

      resetBridge();

      expect(isMockMode()).toBe(false);
      expect(isProMode()).toBe(false);
    });
  });

  describe('命令建议功能', () => {
    it('降级模式下应该提供 Mock 建议', async () => {
      const core = await getCommandLineCore();
      const suggestions = await core.getSuggestions('');

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.text === 'help')).toBe(true);
    });

    it('应该支持命令建议过滤', async () => {
      const core = await getCommandLineCore();
      const suggestions = await core.getSuggestions('h');

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].text).toBe('help');
    });
  });
});
