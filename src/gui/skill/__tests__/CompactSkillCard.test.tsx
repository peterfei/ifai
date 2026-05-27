/**
 * CompactSkillCard 单元测试
 *
 * 测试覆盖：
 * - 标题/描述/评分渲染
 * - 缩略图与 fallback
 * - 按钮状态（未安装/已安装/安装中）
 * - 交互事件
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompactSkillCard } from '../CompactSkillCard';

const baseSkill = {
  id: 'test-skill',
  name: '测试技能',
  description: '这是一个测试技能的描述文字',
  version: '1.0.0',
  rating: 4.5,
  downloads: 6234,
  emoji: '🧪',
  thumbnail: '',
  coverColor: '#3B82F6',
  isInstalled: false,
  isInstalling: false,
};

describe('CompactSkillCard', () => {
  // #22: 标题渲染
  it('渲染技能名称', () => {
    render(<CompactSkillCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />);
    expect(screen.getByText('测试技能')).toBeDefined();
  });

  it('渲染 emoji 标签', () => {
    render(<CompactSkillCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />);
    expect(screen.getByText('🧪')).toBeDefined();
  });

  // #23: 描述 truncate
  it('描述包含 truncate 类名', () => {
    const { container } = render(
      <CompactSkillCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    const descEl = container.querySelector('.truncate');
    expect(descEl).not.toBeNull();
  });

  // #24: 评分 + 下载量显示
  it('显示评分和下载量', () => {
    render(<CompactSkillCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />);
    expect(screen.getByText('⭐ 4.5')).toBeDefined();
    expect(screen.getByText('6.2k')).toBeDefined();
  });

  // #25: 缩略图渲染
  it('有图片时渲染 img 元素', () => {
    const skill = { ...baseSkill, thumbnail: 'https://example.com/img.png' };
    const { container } = render(
      <CompactSkillCard skill={skill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/img.png');
  });

  // #26: 无图片时 fallback （lucide icon 显示）
  it('无图片时显示 lucide icon', () => {
    const { container } = render(
      <CompactSkillCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    // 没有 img 元素，有 svg icon
    const img = container.querySelector('img');
    expect(img).toBeNull();
    // lucide icon 渲染为 svg
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  // #27: 未安装 → 蓝色按钮
  it('未安装时按钮为 brand-500 蓝色背景', () => {
    const { container } = render(
      <CompactSkillCard skill={baseSkill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-brand-500');
    expect(screen.getByText('安装')).toBeDefined();
  });

  // #28: 已安装 → 灰色按钮
  it('已安装时按钮为灰色背景', () => {
    const skill = { ...baseSkill, isInstalled: true };
    const { container } = render(
      <CompactSkillCard skill={skill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-white/');
    expect(btn?.className).toContain('cursor-default');
    expect(screen.getByText('已安装 ✓')).toBeDefined();
  });

  // #29: 安装中 → 旋转图标
  it('安装中显示旋转图标', () => {
    const skill = { ...baseSkill, isInstalling: true };
    const { container } = render(
      <CompactSkillCard skill={skill} onSelect={vi.fn()} onInstall={vi.fn()} />
    );
    const svg = container.querySelector('.animate-spin');
    expect(svg).not.toBeNull();
  });

  // #31: 点击卡片 → onSelect
  it('点击卡片触发 onSelect', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CompactSkillCard skill={baseSkill} onSelect={onSelect} onInstall={vi.fn()} />
    );
    // 点击卡片主体（不是按钮）
    const cardEl = container.querySelector('[data-testid="skill-card"]') || container.firstElementChild;
    fireEvent.click(cardEl!);
    expect(onSelect).toHaveBeenCalledWith('test-skill');
  });

  // #32: 点击安装按钮 → onInstall
  it('点击安装按钮触发 onInstall', () => {
    const onInstall = vi.fn();
    render(<CompactSkillCard skill={baseSkill} onSelect={vi.fn()} onInstall={onInstall} />);
    const btn = screen.getByText('安装');
    fireEvent.click(btn);
    expect(onInstall).toHaveBeenCalledWith('test-skill');
  });
});
