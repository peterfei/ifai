/**
 * MessageCardRegistry 单元测试
 *
 * 测试覆盖：
 * - UT-A.3.1: 注册表初始化
 * - UT-A.3.2: 注册消息类型
 * - UT-A.3.3: 查询已注册类型
 * - UT-A.3.4: 查询未注册类型返回 undefined
 * - UT-A.3.5: 覆盖已注册类型
 * - UT-A.3.6: resolveCardType 根据 cardType 字段解析
 * - UT-A.3.7: resolveCardType 根据 toolCalls 推断
 * - UT-A.3.8: resolveCardType 默认返回 'text'
 */

import { describe, it, expect, vi } from 'vitest';
import { MessageCardRegistry, resolveCardType } from '../MessageCardRegistry';
import type { MessageCardProps } from '../MessageCardRegistry';

/* ===== Mock 组件 ===== */

const MockTextCard = () => null;
const MockApprovalCard = () => null;
const MockProgressCard = () => null;

/* ===== 测试 ===== */

describe('MessageCardRegistry', () => {
  describe('UT-A.3.1: 注册表初始化', () => {
    it('应已注册 8 个默认类型', () => {
      const defaultTypes = [
        'text',
        'approval',
        'interaction',
        'progress',
        'file-change',
        'tool-call',
        'composer',
        'error-fix',
      ];

      for (const type of defaultTypes) {
        expect(MessageCardRegistry.has(type), `${type} 应已注册`).toBe(true);
      }
    });

    it('已注册类型应返回组件（即使是占位符）', () => {
      const textCard = MessageCardRegistry.get('text');

      expect(textCard).toBeDefined();
      expect(typeof textCard).toBe('function');
    });
  });

  describe('UT-A.3.2: 注册消息类型', () => {
    it('应支持注册新类型', () => {
      MessageCardRegistry.register('custom', MockTextCard);

      const custom = MessageCardRegistry.get('custom');

      expect(custom).toBeDefined();
      expect(custom).toBe(MockTextCard);
    });

    it('应支持注册 React 组件', () => {
      MessageCardRegistry.register('test-component', MockApprovalCard);

      const component = MessageCardRegistry.get('test-component');

      expect(component).toBe(MockApprovalCard);
    });
  });

  describe('UT-A.3.3: 查询已注册类型', () => {
    it('应返回正确的组件', () => {
      MessageCardRegistry.register('test-query', MockProgressCard);

      const component = MessageCardRegistry.get('test-query');

      expect(component).toBe(MockProgressCard);
    });

    it('has() 应正确判断已注册类型', () => {
      MessageCardRegistry.register('test-has', MockTextCard);

      expect(MessageCardRegistry.has('test-has')).toBe(true);
      expect(MessageCardRegistry.has('non-existent')).toBe(false);
    });
  });

  describe('UT-A.3.4: 查询未注册类型返回 undefined', () => {
    it('不存在的类型应返回 undefined', () => {
      const unknown = MessageCardRegistry.get('unknown-type');

      expect(unknown).toBeUndefined();
    });

    it('空字符串应返回 undefined', () => {
      const empty = MessageCardRegistry.get('');

      expect(empty).toBeUndefined();
    });
  });

  describe('UT-A.3.5: 覆盖已注册类型', () => {
    it('后注册的组件应覆盖先注册的', () => {
      MessageCardRegistry.register('override-test', MockTextCard);
      MessageCardRegistry.register('override-test', MockApprovalCard);

      const component = MessageCardRegistry.get('override-test');

      expect(component).toBe(MockApprovalCard); // 后注册的
      expect(component).not.toBe(MockTextCard);  // 不是先注册的
    });
  });

  describe('UT-A.3.6: resolveCardType 根据 cardType 字段解析', () => {
    it('应优先使用消息自带的 cardType 字段', () => {
      const message = {
        id: '1',
        cardType: 'approval',
      } as any;

      const type = resolveCardType(message);

      expect(type).toBe('approval');
    });

    it('cardType 为任意有效值应直接返回', () => {
      const validTypes = ['text', 'approval', 'interaction', 'progress'];

      for (const t of validTypes) {
        const message = { cardType: t } as any;
        expect(resolveCardType(message)).toBe(t);
      }
    });
  });

  describe('UT-A.3.7: resolveCardType 根据 toolCalls 推断', () => {
    it('有 toolCalls 时应推断为 tool-call', () => {
      const message = {
        id: '1',
        toolCalls: [{ id: 'tool1', name: 'search' }],
      } as any;

      const type = resolveCardType(message);

      expect(type).toBe('tool-call');
    });

    it('toolCalls 为空数组时应默认为 text', () => {
      const message = {
        id: '1',
        toolCalls: [],
      } as any;

      const type = resolveCardType(message);

      expect(type).toBe('text');
    });

    it('有 composer 字段时应推断为 composer', () => {
      const message = {
        id: '1',
        composer: {},
      } as any;

      const type = resolveCardType(message);

      expect(type).toBe('composer');
    });

    it('有 error 字段时应推断为 error-fix', () => {
      const message = {
        id: '1',
        error: { message: 'Test error' },
      } as any;

      const type = resolveCardType(message);

      expect(type).toBe('error-fix');
    });
  });

  describe('UT-A.3.8: resolveCardType 默认返回 text', () => {
    it('空消息应返回 text', () => {
      const message = {} as any;

      const type = resolveCardType(message);

      expect(type).toBe('text');
    });

    it('没有特殊字段的消息应返回 text', () => {
      const message = {
        id: '1',
        content: 'Hello',
      } as any;

      const type = resolveCardType(message);

      expect(type).toBe('text');
    });

    it('null/undefined 应返回 text', () => {
      expect(resolveCardType(null as any)).toBe('text');
      expect(resolveCardType(undefined as any)).toBe('text');
    });
  });
});
