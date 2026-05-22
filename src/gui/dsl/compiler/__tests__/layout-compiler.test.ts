/**
 * LayoutDSL 编译器测试
 *
 * TDD 先行：8 个用例
 *
 * 覆盖：
 * - LC-1: conversation 三栏
 * - LC-2: editor 单栏
 * - LC-3: split 双栏等宽
 * - LC-4: CSS 变量
 * - LC-5: gap 间距
 * - LC-6: minWidth 约束
 * - LC-7: 无效模式
 * - LC-8: 合法 CSS
 */

import { describe, it, expect } from 'vitest';
import { compileLayout } from '../layout-compiler';
import type { LayoutDSL } from '../../layout-dsl';

describe('LayoutDSL Compiler', () => {
  /* ===== LC-1: conversation 三栏 ===== */

  it('LC-1: 编译 conversation 模式：三栏（320px / flex:1 / 400px）', () => {
    const layout: LayoutDSL = {
      mode: 'conversation',
      gap: 0,
      panels: [
        { id: 'left', width: 320 },
        { id: 'center', flex: 1 },
        { id: 'right', width: 400 },
      ],
    };

    const css = compileLayout(layout);

    expect(css).toContain('.layout-conversation');
    expect(css).toContain('width: 320px');
    expect(css).toContain('flex: 1');
    expect(css).toContain('width: 400px');
    expect(css).toContain('flex-shrink: 0');
  });

  /* ===== LC-2: editor 单栏 ===== */

  it('LC-2: 编译 editor 模式：单栏全宽（flex:1）', () => {
    const layout: LayoutDSL = {
      mode: 'editor',
      panels: [
        { id: 'main', flex: 1 },
      ],
    };

    const css = compileLayout(layout);

    expect(css).toContain('.layout-editor');
    expect(css).toContain('flex: 1');
  });

  /* ===== LC-3: split 双栏 ===== */

  it('LC-3: 编译 split 模式：双栏等宽（flex:1 / flex:1）', () => {
    const layout: LayoutDSL = {
      mode: 'split',
      panels: [
        { id: 'left', flex: 1 },
        { id: 'right', flex: 1 },
      ],
    };

    const css = compileLayout(layout);

    expect(css).toContain('.layout-split');
  });

  /* ===== LC-4: CSS 变量 ===== */

  it('LC-4: 生成 CSS 变量：--layout-{mode}-{paneIndex}-width/flex', () => {
    const layout: LayoutDSL = {
      mode: 'conversation',
      panels: [
        { id: 'left', width: 320 },
        { id: 'center', flex: 1 },
        { id: 'right', width: 400 },
      ],
    };

    const css = compileLayout(layout);

    expect(css).toContain('--layout-conversation-0-width');
    expect(css).toContain('--layout-conversation-1-flex');
    expect(css).toContain('--layout-conversation-2-width');
  });

  /* ===== LC-5: gap ===== */

  it('LC-5: 面板 gap（间距）编译正确', () => {
    const layout: LayoutDSL = {
      mode: 'test-gap',
      gap: 8,
      panels: [
        { id: 'a', flex: 1 },
        { id: 'b', flex: 1 },
      ],
    };

    const css = compileLayout(layout);
    expect(css).toContain('gap: 8px');
  });

  /* ===== LC-6: minWidth ===== */

  it('LC-6: minWidth 约束编译正确', () => {
    const layout: LayoutDSL = {
      mode: 'test-min',
      panels: [
        { id: 'a', flex: 1, minWidth: 200 },
      ],
    };

    const css = compileLayout(layout);
    expect(css).toContain('min-width: 200px');
  });

  /* ===== LC-7: 无效模式 ===== */

  it('LC-7: 无效模式（空 panels）应返回空字符串', () => {
    const layout: LayoutDSL = {
      mode: 'empty',
      panels: [],
    };

    const css = compileLayout(layout);
    expect(css).toBe('');
  });

  /* ===== LC-8: 合法 CSS ===== */

  it('LC-8: 三种模式编译输出均为合法 CSS', () => {
    const modes: LayoutDSL[] = [
      {
        mode: 'conversation',
        gap: 0,
        panels: [
          { id: 'left', width: 320 },
          { id: 'center', flex: 1 },
          { id: 'right', width: 400 },
        ],
      },
      {
        mode: 'editor',
        panels: [{ id: 'main', flex: 1 }],
      },
      {
        mode: 'split',
        gap: 2,
        panels: [
          { id: 'left', flex: 1 },
          { id: 'right', flex: 1 },
        ],
      },
    ];

    for (const layout of modes) {
      const css = compileLayout(layout);
      expect(css).not.toContain('undefined');
      expect(css).not.toContain('NaN');
      // 大括号配对
      const opens = (css.match(/{/g) || []).length;
      const closes = (css.match(/}/g) || []).length;
      expect(opens).toBe(closes);
    }
  });
});
