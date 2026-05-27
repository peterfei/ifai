/**
 * RecommendCard 单元测试
 *
 * 测试覆盖：
 * - 名称/描述渲染
 * - 推荐/热门标签
 * - 元数据行渲染
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecommendCard } from '../RecommendCard';

const baseSkill = {
  id: 'ts-check',
  name: 'TypeScript 深度检查',
  description: '全面的 TS 类型检查、边界检测和自动修复',
  version: '2.1.0',
  rating: 4.8,
  downloads: 12400,
  thumbnail: '',
  badge: 'recommended' as const,
  isInstalled: false,
};

describe('RecommendCard', () => {
  // #33: 渲染名称 + 描述
  it('渲染技能名称和描述', () => {
    render(
      <RecommendCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    expect(screen.getByText('TypeScript 深度检查')).toBeDefined();
    expect(
      screen.getByText('全面的 TS 类型检查、边界检测和自动修复')
    ).toBeDefined();
  });

  // #34: "推荐" 标签
  it('badge="recommended" 时显示"推荐"标签', () => {
    render(
      <RecommendCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    const badge = screen.getByText('推荐');
    expect(badge).toBeDefined();
    expect(badge.className).toContain('text-brand-300');
    expect(badge.className).toContain('bg-brand-500/20');
  });

  // #35: "热门" 标签
  it('badge="popular" 时显示"热门"标签', () => {
    const skill = { ...baseSkill, badge: 'popular' as const };
    render(
      <RecommendCard skill={skill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    const badge = screen.getByText('热门');
    expect(badge).toBeDefined();
    expect(badge.className).toContain('text-emerald-400');
  });

  // #36: 版本号 + 评分 + 下载量
  it('渲染版本号、评分和下载量', () => {
    render(
      <RecommendCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    expect(screen.getByText('v2.1.0')).toBeDefined();
    expect(screen.getByText('⭐ 4.8')).toBeDefined();
    expect(screen.getByText('12.4k')).toBeDefined();
  });
});
