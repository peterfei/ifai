/**
 * SkillMarketFooter 单元测试
 *
 * 测试覆盖：
 * - 安装统计
 * - 分隔线
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillMarketFooter } from '../SkillMarketFooter';

describe('SkillMarketFooter', () => {
  // #49: 安装统计
  it('显示已安装技能数量', () => {
    render(
      <SkillMarketFooter
        installedCount={3}
        lastUpdated="今天 12:00"
      />
    );
    expect(screen.getByText('已安装 3 个技能')).toBeDefined();
    expect(screen.getByText('上次更新: 今天 12:00')).toBeDefined();
  });

  // #51: 分隔线
  it('包含垂直分隔线', () => {
    const { container } = render(
      <SkillMarketFooter
        installedCount={3}
        lastUpdated="今天 12:00"
      />
    );
    // 分隔线 w-px h-3
    const lines = container.querySelectorAll('.w-px');
    expect(lines.length).toBeGreaterThan(0);
  });
});
