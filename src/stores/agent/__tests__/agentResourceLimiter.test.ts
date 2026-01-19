import { describe, it, expect, beforeEach } from 'vitest';
import { createAgentResourceLimiter, type IAgentResourceLimiter, type ResourceLimits } from '../agentResourceLimiter';

describe('AgentResourceLimiter', () => {
  let limiter: IAgentResourceLimiter;

  beforeEach(() => {
    limiter = createAgentResourceLimiter();
  });

  describe('并发数限制', () => {
    it('应该检查并发限制', () => {
      const limits: ResourceLimits = { maxConcurrentAgents: 3 };
      limiter.setLimits(limits);

      expect(limiter.canLaunchAgent(2)).toBe(true);
      expect(limiter.canLaunchAgent(3)).toBe(true);
      expect(limiter.canLaunchAgent(4)).toBe(false);
    });

    it('应该记录已启动的 agent', () => {
      limiter.setLimits({ maxConcurrentAgents: 2 });

      limiter.recordLaunch('agent-1');
      limiter.recordLaunch('agent-2');

      expect(limiter.canLaunchAgent(2)).toBe(false);
    });

    it('应该释放已完成的 agent', () => {
      limiter.setLimits({ maxConcurrentAgents: 2 });

      limiter.recordLaunch('agent-1');
      limiter.recordLaunch('agent-2');
      expect(limiter.canLaunchAgent(1)).toBe(false); // 已满

      limiter.recordCompletion('agent-1');
      expect(limiter.canLaunchAgent(1)).toBe(true); // 释放后可以启动 1 个
      expect(limiter.canLaunchAgent(2)).toBe(false); // 但不能启动 2 个
    });

    it('应该返回当前并发数', () => {
      limiter.recordLaunch('agent-1');
      limiter.recordLaunch('agent-2');
      limiter.recordLaunch('agent-3');

      expect(limiter.getCurrentCount()).toBe(3);
    });
  });

  describe('默认限制', () => {
    it('应该使用默认限制', () => {
      expect(limiter.canLaunchAgent(10)).toBe(false); // 默认最多 5 个
      expect(limiter.canLaunchAgent(4)).toBe(true);
    });
  });

  describe('资源验证', () => {
    it('应该验证启动前置条件', () => {
      limiter.setLimits({ maxConcurrentAgents: 2 });
      limiter.recordLaunch('agent-1');

      const result = limiter.validateLaunch('agent-2');

      expect(result.canLaunch).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('应该在超过限制时拒绝启动', () => {
      limiter.setLimits({ maxConcurrentAgents: 2 });
      limiter.recordLaunch('agent-1');
      limiter.recordLaunch('agent-2');

      const result = limiter.validateLaunch('agent-3');

      expect(result.canLaunch).toBe(false);
      expect(result.reason).toContain('已达到最大并发数');
    });

    it('应该提供拒绝原因', () => {
      limiter.setLimits({ maxConcurrentAgents: 1 });
      limiter.recordLaunch('agent-1');

      const result = limiter.validateLaunch('agent-2');

      expect(result.reason).toMatch(/最大并发数.*1.*当前.*1/);
    });
  });

  describe('配置更新', () => {
    it('应该动态更新限制', () => {
      limiter.setLimits({ maxConcurrentAgents: 1 });

      limiter.recordLaunch('agent-1');
      expect(limiter.canLaunchAgent(1)).toBe(false);

      limiter.setLimits({ maxConcurrentAgents: 5 });
      expect(limiter.canLaunchAgent(1)).toBe(true);
    });

    it('应该获取当前限制', () => {
      const limits: ResourceLimits = { maxConcurrentAgents: 10 };
      limiter.setLimits(limits);

      expect(limiter.getLimits()).toEqual(limits);
    });
  });

  describe('边界情况', () => {
    it('应该处理未设置限制的情况', () => {
      // 未设置限制时应该使用默认值
      expect(limiter.canLaunchAgent(100)).toBe(false);
    });

    it('应该处理零限制', () => {
      limiter.setLimits({ maxConcurrentAgents: 0 });

      expect(limiter.canLaunchAgent(0)).toBe(true);  // 启动 0 个总是可以
      expect(limiter.canLaunchAgent(1)).toBe(false); // 启动任何正数都不行
    });

    it('应该处理重复记录', () => {
      limiter.recordLaunch('agent-1');
      limiter.recordLaunch('agent-1'); // 重复记录

      expect(limiter.getCurrentCount()).toBe(1);
    });

    it('应该处理不存在的 agent 完成', () => {
      limiter.recordLaunch('agent-1');
      limiter.recordCompletion('agent-nonexistent'); // 不应报错

      expect(limiter.getCurrentCount()).toBe(1);
    });
  });

  describe('统计信息', () => {
    it('应该提供完整的统计信息', () => {
      limiter.setLimits({ maxConcurrentAgents: 5 });
      limiter.recordLaunch('agent-1');
      limiter.recordLaunch('agent-2');

      const stats = limiter.getStats();

      expect(stats.currentCount).toBe(2);
      expect(stats.maxConcurrentAgents).toBe(5);
      expect(stats.availableSlots).toBe(3);
      expect(stats.utilization).toBeCloseTo(0.4);
    });
  });
});
