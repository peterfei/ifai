/**
 * AGENT_DSL 单元测试
 *
 * 测试覆盖：
 * - UT-A.2.1: AgentDescriptor 接口定义
 * - UT-A.2.2: 7 个 Agent 类型定义
 * - UT-A.2.3: getAgent 查询函数
 * - UT-A.2.4: 未知的 Agent ID 返回 undefined
 * - UT-A.2.5: Agent 颜色从 AGENT_PALETTE 查表
 * - UT-A.2.6: getAgentByCommand 按命令查询
 */

import { describe, it, expect } from 'vitest';
import { getAgent, AGENT_DSL, getAgentByCommand } from '../AGENT_DSL';
import { AGENT_PALETTE } from '../PALETTE';

describe('AGENT_DSL', () => {
  describe('UT-A.2.1: AgentDescriptor 接口定义', () => {
    it('每个 Agent 应包含必需字段', () => {
      const explore = getAgent('explore');

      expect(explore).toBeDefined();
      expect(explore).toHaveProperty('id');
      expect(explore).toHaveProperty('colorKey');
      expect(explore).toHaveProperty('name');
      expect(explore).toHaveProperty('abbr');
      expect(explore).toHaveProperty('icon');
      expect(explore).toHaveProperty('command');
    });

    it('colorKey 应与 AGENT_PALETTE 的键对应', () => {
      const explore = getAgent('explore');
      const review = getAgent('review');

      expect(explore?.colorKey).toBe('explore');
      expect(review?.colorKey).toBe('review');
    });

    it('command 字段应为斜杠命令', () => {
      const explore = getAgent('explore');
      const review = getAgent('review');

      expect(explore?.command).toBe('/explore');
      expect(review?.command).toBe('/review');
    });
  });

  describe('UT-A.2.2: 7 个 Agent 类型定义', () => {
    it('应定义 7 个 Agent 类型', () => {
      expect(Object.keys(AGENT_DSL)).toHaveLength(7);
      expect(AGENT_DSL).toHaveProperty('explore');
      expect(AGENT_DSL).toHaveProperty('review');
      expect(AGENT_DSL).toHaveProperty('test');
      expect(AGENT_DSL).toHaveProperty('doc');
      expect(AGENT_DSL).toHaveProperty('refactor');
      expect(AGENT_DSL).toHaveProperty('proposal');
      expect(AGENT_DSL).toHaveProperty('task');
    });

    it('explore 应有正确的元数据', () => {
      const explore = AGENT_DSL.explore;

      expect(explore.id).toBe('explore');
      expect(explore.name).toBe('探索代码库');
      expect(explore.abbr).toBe('EXP');
      expect(explore.icon).toBe('Search');
      expect(explore.command).toBe('/explore');
    });

    it('review 应有正确的元数据', () => {
      const review = AGENT_DSL.review;

      expect(review.id).toBe('review');
      expect(review.name).toBe('代码审查');
      expect(review.abbr).toBe('REV');
      expect(review.icon).toBe('ShieldCheck');
      expect(review.command).toBe('/review');
    });

    it('test 应有正确的元数据', () => {
      const test = AGENT_DSL.test;

      expect(test.id).toBe('test');
      expect(test.name).toBe('测试生成');
      expect(test.abbr).toBe('TST');
      expect(test.icon).toBe('TestTube');
      expect(test.command).toBe('/test');
    });

    it('doc 应有正确的元数据', () => {
      const doc = AGENT_DSL.doc;

      expect(doc.id).toBe('doc');
      expect(doc.name).toBe('文档生成');
      expect(doc.abbr).toBe('DOC');
      expect(doc.icon).toBe('FileText');
      expect(doc.command).toBe('/doc');
    });

    it('refactor 应有正确的元数据', () => {
      const refactor = AGENT_DSL.refactor;

      expect(refactor.id).toBe('refactor');
      expect(refactor.name).toBe('重构代码');
      expect(refactor.abbr).toBe('REF');
      expect(refactor.icon).toBe('Zap');
      expect(refactor.command).toBe('/refactor');
    });

    it('proposal 应有正确的元数据', () => {
      const proposal = AGENT_DSL.proposal;

      expect(proposal.id).toBe('proposal');
      expect(proposal.name).toBe('提案生成');
      expect(proposal.abbr).toBe('PRP');
      expect(proposal.icon).toBe('FileEdit');
      expect(proposal.command).toBe('/proposal');
    });

    it('task 应有正确的元数据', () => {
      const task = AGENT_DSL.task;

      expect(task.id).toBe('task');
      expect(task.name).toBe('任务拆解');
      expect(task.abbr).toBe('TSK');
      expect(task.icon).toBe('ListTree');
      expect(task.command).toBe('/task');
    });
  });

  describe('UT-A.2.3: getAgent 查询函数', () => {
    it('应返回正确的 Agent 对象', () => {
      const explore = getAgent('explore');

      expect(explore).toBeDefined();
      expect(explore?.id).toBe('explore');
      expect(explore?.name).toBe('探索代码库');
    });

    it('应支持所有 7 个 Agent ID', () => {
      expect(getAgent('explore')).toBeDefined();
      expect(getAgent('review')).toBeDefined();
      expect(getAgent('test')).toBeDefined();
      expect(getAgent('doc')).toBeDefined();
      expect(getAgent('refactor')).toBeDefined();
      expect(getAgent('proposal')).toBeDefined();
      expect(getAgent('task')).toBeDefined();
    });

    it('应返回 AGENT_DSL 中的引用（同一对象）', () => {
      const explore1 = getAgent('explore');
      const explore2 = AGENT_DSL.explore;

      expect(explore1).toBe(explore2); // 同一引用
    });
  });

  describe('UT-A.2.4: 未知的 Agent ID 返回 undefined', () => {
    it('不存在的 Agent ID 应返回 undefined', () => {
      const unknown = getAgent('UNKNOWN' as any);

      expect(unknown).toBeUndefined();
    });

    it('空字符串应返回 undefined', () => {
      const empty = getAgent('' as any);

      expect(empty).toBeUndefined();
    });

    it('undefined 应返回 undefined', () => {
      const undefinedAgent = getAgent(undefined as any);

      expect(undefinedAgent).toBeUndefined();
    });
  });

  describe('UT-A.2.5: Agent 颜色从 AGENT_PALETTE 查表', () => {
    it('explore 颜色应从 AGENT_PALETTE.explore 获取', () => {
      const explore = getAgent('explore');
      const exploreColor = AGENT_PALETTE.explore;

      expect(explore?.color).toBe(exploreColor);
      expect(explore?.color.bg).toBe('#3B82F6');
      expect(explore?.color.text).toBe('#3B82F6');
    });

    it('review 颜色应从 AGENT_PALETTE.review 获取', () => {
      const review = getAgent('review');
      const reviewColor = AGENT_PALETTE.review;

      expect(review?.color).toBe(reviewColor);
      expect(review?.color.bg).toBe('#F59E0B');
    });

    it('test 颜色应从 AGENT_PALETTE.test 获取', () => {
      const test = getAgent('test');
      const testColor = AGENT_PALETTE.test;

      expect(test?.color).toBe(testColor);
      expect(test?.color.bg).toBe('#10B981');
    });

    it('所有 Agent 的 color 字段应与 AGENT_PALETTE 对应', () => {
      const agentIds = ['explore', 'review', 'test', 'doc', 'refactor', 'proposal', 'task'] as const;

      for (const id of agentIds) {
        const agent = getAgent(id);
        const expectedColor = AGENT_PALETTE[id];

        expect(agent?.color).toEqual(expectedColor);
      }
    });
  });

  describe('UT-A.2.6: getAgentByCommand 按命令查询', () => {
    it('应通过斜杠命令查询 Agent', () => {
      const explore = getAgentByCommand('/explore');

      expect(explore).toBeDefined();
      expect(explore?.id).toBe('explore');
      expect(explore?.command).toBe('/explore');
    });

    it('应支持所有命令', () => {
      expect(getAgentByCommand('/explore')?.id).toBe('explore');
      expect(getAgentByCommand('/review')?.id).toBe('review');
      expect(getAgentByCommand('/test')?.id).toBe('test');
      expect(getAgentByCommand('/doc')?.id).toBe('doc');
      expect(getAgentByCommand('/refactor')?.id).toBe('refactor');
      expect(getAgentByCommand('/proposal')?.id).toBe('proposal');
      expect(getAgentByCommand('/task')?.id).toBe('task');
    });

    it('不存在的命令应返回 undefined', () => {
      const unknown = getAgentByCommand('/unknown');

      expect(unknown).toBeUndefined();
    });

    it('空字符串应返回 undefined', () => {
      const empty = getAgentByCommand('');

      expect(empty).toBeUndefined();
    });
  });
});
