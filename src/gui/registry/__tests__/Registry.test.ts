import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../registry';

interface TestHandler {
  type: string;
  execute: () => string;
}

describe('Registry<T>', () => {
  let registry: Registry<TestHandler>;

  beforeEach(() => {
    registry = new Registry<TestHandler>();
  });

  describe('基础 CRUD', () => {
    it('UT1.1.1: 注册 + 查询 — register 后 get 返回 handler', () => {
      const handler: TestHandler = { type: 'test', execute: () => 'ok' };
      registry.register('test', handler);
      expect(registry.get('test')).toBe(handler);
    });

    it('UT1.1.2: 注册覆盖 — 同一 type 注册两次，后者覆盖前者', () => {
      const h1: TestHandler = { type: 'a', execute: () => 'v1' };
      const h2: TestHandler = { type: 'a', execute: () => 'v2' };
      registry.register('a', h1);
      registry.register('a', h2);
      expect(registry.get('a')?.execute()).toBe('v2');
    });

    it('UT1.1.3: 缺失 type — get 不存在的 type 返回 undefined，不抛异常', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('UT1.1.5: has 检查 — 已注册返回 true，未注册返回 false', () => {
      registry.register('a', { type: 'a', execute: () => '' });
      expect(registry.has('a')).toBe(true);
      expect(registry.has('x')).toBe(false);
    });

    it('UT1.1.6: 空注册表 — 新实例所有 get 返回 undefined', () => {
      expect(registry.get('a')).toBeUndefined();
      expect(registry.get('b')).toBeUndefined();
      expect(registry.has('any')).toBe(false);
    });

    it('UT1.1.7: entries 迭代 — 返回所有已注册条目', () => {
      registry.register('a', { type: 'a', execute: () => 'a' });
      registry.register('b', { type: 'b', execute: () => 'b' });
      registry.register('c', { type: 'c', execute: () => 'c' });
      const entries = registry.entries();
      expect(entries).toHaveLength(3);
      expect(entries.map(e => e[0])).toEqual(['a', 'b', 'c']);
    });

    it('UT1.1.10: 同名不同实例 — 返回最后注册的实例', () => {
      const instances = Array.from({ length: 5 }, (_, i) =>
        ({ type: 'x', execute: () => `v${i}` })
      );
      instances.forEach(h => registry.register('x', h));
      expect(registry.get('x')?.execute()).toBe('v4');
    });
  });

  describe('安全降级', () => {
    it('UT1.1.4: get 返回 undefined 时 fallback 生效', () => {
      const fallback: TestHandler = { type: 'fb', execute: () => 'fallback' };
      const result = registry.get('missing') ?? fallback;
      expect(result).toBe(fallback);
    });
  });

  describe('性能与边界', () => {
    it('UT1.1.9: 大量注册 — 1000 次注册无异常', () => {
      for (let i = 0; i < 1000; i++) {
        registry.register(`h-${i}`, { type: `h-${i}`, execute: () => `${i}` });
      }
      expect(registry.get('h-999')?.execute()).toBe('999');
      expect(registry.entries()).toHaveLength(1000);
    });
  });
});
