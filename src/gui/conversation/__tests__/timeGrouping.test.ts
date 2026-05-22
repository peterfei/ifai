/**
 * timeGrouping 纯函数测试
 *
 * TG-1 ~ TG-7: 消息时间分组逻辑
 */

import { describe, it, expect } from 'vitest';
import {
  getTimeGroupKey,
  shouldShowTimeDivider,
  getTimeGroupLabel,
} from '../timeGrouping';

/* ===== 辅助函数 ===== */

function makeMsg(timestamp: number) {
  return { id: `msg-${timestamp}`, timestamp, role: 'user' as const, content: 'test' };
}

function today(): number { return Date.now(); }
function yesterday(): number { return Date.now() - 24 * 60 * 60 * 1000; }
function daysAgo(n: number): number { return Date.now() - n * 24 * 60 * 60 * 1000; }

/* ===== 测试 ===== */

describe('timeGrouping', () => {
  // TG-1: getTimeGroupKey — 今日消息返回 'today'
  it('TG-1: 今日消息返回 today', () => {
    expect(getTimeGroupKey(today())).toBe('today');
  });

  // TG-2: 昨日返回 'yesterday'
  it('TG-2: 昨日消息返回 yesterday', () => {
    expect(getTimeGroupKey(yesterday())).toBe('yesterday');
  });

  // TG-3: 更早返回 'older'
  it('TG-3: 3天前消息返回 older', () => {
    expect(getTimeGroupKey(daysAgo(3))).toBe('older');
  });

  // TG-4: 中文标签
  it('TG-4: today 标签为"今天"', () => {
    expect(getTimeGroupLabel('today')).toBe('今天');
  });

  it('TG-4b: yesterday 标签为"昨天"', () => {
    expect(getTimeGroupLabel('yesterday')).toBe('昨天');
  });

  it('TG-4c: older 标签为"更早"', () => {
    expect(getTimeGroupLabel('older')).toBe('更早');
  });

  // TG-5: shouldShowTimeDivider 跨日返回 true
  it('TG-5: 昨日→今日跨日返回 true', () => {
    const prev = makeMsg(yesterday());
    const curr = makeMsg(today());
    expect(shouldShowTimeDivider(prev, curr)).toBe(true);
  });

  // TG-6: shouldShowTimeDivider 同日返回 false（使用固定中午时间避免跨日）
  it('TG-6: 同日不显示分隔线', () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const prev = makeMsg(noon.getTime() - 3600000); // 中午前 1 小时
    const curr = makeMsg(noon.getTime());             // 中午
    expect(shouldShowTimeDivider(prev, curr)).toBe(false);
  });

  // TG-7: 更早→今日跨日返回 true
  it('TG-7: 更早→今日跨日返回 true', () => {
    const prev = makeMsg(daysAgo(3));
    const curr = makeMsg(today());
    expect(shouldShowTimeDivider(prev, curr)).toBe(true);
  });

  // TG-8: 更早→昨日跨日返回 true
  it('TG-8: 更早→昨日跨日返回 true', () => {
    const prev = makeMsg(daysAgo(5));
    const curr = makeMsg(yesterday());
    expect(shouldShowTimeDivider(prev, curr)).toBe(true);
  });

  // TG-9: 昨日→更早不跨日返回 false（同组 older 内）
  it('TG-9: 同组 older 内不显示分隔线', () => {
    const prev = makeMsg(daysAgo(3));
    const curr = makeMsg(daysAgo(4));
    expect(shouldShowTimeDivider(prev, curr)).toBe(false);
  });
});
