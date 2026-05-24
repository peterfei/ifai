import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calculateMenuPosition } from '../ConversationContextMenu';

describe('calculateMenuPosition', () => {
  const DEFAULT_CONFIG = { width: 180, itemHeight: 36, padding: 10 };

  // 保存和恢复 viewport 尺寸
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
  });

  afterEach(() => {
    // 恢复原始尺寸
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it('UT-CM-1: 正常位置不调整', () => {
    const result = calculateMenuPosition({ x: 500, y: 300 }, 3, DEFAULT_CONFIG);
    expect(result).toEqual({ x: 500, y: 300 });
  });

  it('UT-CM-2: 超出右边界自动调整', () => {
    // 设置较小的 viewport 宽度
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });

    const result = calculateMenuPosition(
      { x: 700, y: 300 },  // 靠近右边界
      3,
      DEFAULT_CONFIG
    );

    // 期望：x位置调整到 800 - 180 - 10 = 610
    expect(result.x).toBeLessThanOrEqual(610);
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('UT-CM-3: 超出下边界自动调整', () => {
    // 设置较小的 viewport 高度
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 600,
    });

    const result = calculateMenuPosition(
      { x: 500, y: 550 },  // 靠近下边界
      3,
      DEFAULT_CONFIG
    );

    // 菜单高度 = 3 * 36 = 108
    // 期望：y位置调整到 600 - 108 - 10 = 482
    expect(result.y).toBeLessThanOrEqual(482);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it('UT-CM-4: 边角位置调整', () => {
    // 设置较小的 viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 600,
    });

    const result = calculateMenuPosition(
      { x: 750, y: 550 },  // 右下角
      3,
      DEFAULT_CONFIG
    );

    // 期望：x 和 y 都被调整
    expect(result.x).toBeLessThan(750);
    expect(result.y).toBeLessThan(550);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it('UT-CM-5: 自定义配置覆盖默认值', () => {
    const customConfig = { width: 200, itemHeight: 40, padding: 20 };
    const result = calculateMenuPosition({ x: 500, y: 300 }, 3, customConfig);
    expect(result).toEqual({ x: 500, y: 300 });
  });
});
