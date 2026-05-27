/**
 * SkillMarketModal 单元测试
 *
 * 测试覆盖：
 * - 弹窗渲染/隐藏
 * - 5 区域编排
 * - 分类+搜索联动
 * - 推荐区域显隐
 * - 卡片点击打开详情
 * - 遮罩层关闭
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SkillMarketModal } from '../SkillMarketModal';

// 模拟技能数据
const mockSkills = [
  {
    id: 'code-review-pro',
    name: '代码审查专家 Pro',
    description: '深度代码审查',
    version: '2.0.0',
    downloads: 15234,
    rating: 4.8,
    featured: true,
    tags: ['code-review'],
    category: 'development',
    systemPrompt: 'test',
    emoji: '🔍',
    isInstalled: false,
    isInstalling: false,
  },
  {
    id: 'test-generator-ai',
    name: 'AI测试生成器',
    description: '自动生成单元测试',
    version: '3.1.0',
    downloads: 8921,
    rating: 4.6,
    featured: false,
    tags: ['test'],
    category: 'testing',
    systemPrompt: 'test',
    emoji: '🧪',
    isInstalled: true,
    isInstalling: false,
  },
  {
    id: 'doc-automation',
    name: '文档自动化',
    description: '自动生成项目文档',
    version: '1.2.0',
    downloads: 3456,
    rating: 4.3,
    featured: true,
    tags: ['docs'],
    category: 'documentation',
    systemPrompt: 'test',
    emoji: '📖',
    isInstalled: false,
    isInstalling: false,
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('SkillMarketModal', () => {
  // #63: 弹窗渲染
  it('isOpen=true 时渲染弹窗', () => {
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    // 遮罩层和标题存在
    expect(screen.getByText('技能广场')).toBeDefined();
  });

  it('isOpen=false 时不渲染', () => {
    const { container } = render(
      <SkillMarketModal
        isOpen={false}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  // #64: 5 区域编排 (Header + CategoryPills + Grid + Footer)
  it('渲染 Header、分类、技能列表和 Footer', () => {
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    // Header
    expect(screen.getByText('技能广场')).toBeDefined();
    // Footer
    expect(screen.getByText('已安装 1 个技能')).toBeDefined();
    // 技能卡片（featured 技能同时在推荐区和网格中渲染，用 getAllByText）
    const codeReviewCards = screen.getAllByText('代码审查专家 Pro');
    expect(codeReviewCards.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AI测试生成器')).toBeDefined();
  });

  // #65: Header 含搜索和关闭
  it('Header 包含搜索输入框和关闭按钮', () => {
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    expect(screen.getByPlaceholderText('搜索技能...')).toBeDefined();
    expect(screen.getByText('✕')).toBeDefined();
  });

  // #66: 分类联动过滤
  it('选择分类后技能列表过滤', () => {
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    // 点击"测试"分类
    fireEvent.click(screen.getByText('测试'));
    // 只显示 testing 分类的技能
    expect(screen.getByText('AI测试生成器')).toBeDefined();
    expect(screen.queryByText('代码审查专家 Pro')).toBeNull();
  });

  // #67: 搜索联动过滤（使用 fake timers 处理 debounce）
  it('搜索后技能列表过滤', () => {
    vi.useFakeTimers();
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    const input = screen.getByPlaceholderText('搜索技能...');
    fireEvent.change(input, { target: { value: '文档' } });
    // 在 act 中推进防抖时间，确保 React 状态更新 flush
    act(() => {
      vi.advanceTimersByTime(350);
    });
    // 防抖后 Recommend 区隐藏，只保留网格中的 "文档自动化"
    const docCards = screen.getAllByText('文档自动化');
    expect(docCards.length).toBeGreaterThanOrEqual(1);
  });

  // #68: 推荐在搜索时隐藏
  it('有搜索时推荐区域隐藏', () => {
    vi.useFakeTimers();
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    // 初始有"为你推荐"
    expect(screen.getByText(/为你推荐/)).toBeDefined();
    const input = screen.getByPlaceholderText('搜索技能...');
    fireEvent.change(input, { target: { value: 'test' } });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.queryByText(/为你推荐/)).toBeNull();
  });

  // #69: 点击卡片打开详情（用 SKillDetailPanel 中专有的 version 标识判断）
  it('点击技能卡片选中该技能', () => {
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={1}
      />
    );
    // 点击第一张卡片（featured 技能会出现在推荐区和网格，取第一个）
    const cards = screen.getAllByText('代码审查专家 Pro');
    fireEvent.click(cards[0]);
    // 详情面板应出现：用 "标签" 区域标识（仅详情面板渲染标签区域）
    expect(screen.getByText('标签')).toBeDefined();
  });

  // #70: 点击遮罩层关闭
  it('点击遮罩层触发 onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SkillMarketModal
        isOpen={true}
        onClose={onClose}
        skills={mockSkills}
        installedCount={1}
      />
    );
    // 点击遮罩层（弹窗外部）
    const overlay = container.firstElementChild;
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  // #71: 点击"安装"按钮应调用 onInstall（修复后：安装而非打开详情面板）
  it('点击卡片"安装"按钮应调用 onInstall 回调', () => {
    const onInstall = vi.fn();
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={0}
        onInstall={onInstall}
        onUninstall={vi.fn()}
      />
    );
    // 找到第一个"安装"按钮（未安装技能的卡片上）
    const installBtns = screen.getAllByText('安装');
    fireEvent.click(installBtns[0]);

    // ✅ 修复后：onInstall 应被调用
    expect(onInstall).toHaveBeenCalledWith('code-review-pro');
  });

  // #72: 详情面板中的"安装"按钮也应调用 onInstall
  it('详情面板中的"安装"按钮应调用 onInstall 回调', () => {
    const onInstall = vi.fn();
    render(
      <SkillMarketModal
        isOpen={true}
        onClose={vi.fn()}
        skills={mockSkills}
        installedCount={0}
        onInstall={onInstall}
        onUninstall={vi.fn()}
      />
    );
    // 先点击卡片打开详情面板
    const skillCards = screen.getAllByText('代码审查专家 Pro');
    fireEvent.click(skillCards[0]);
    expect(screen.getByText('标签')).toBeDefined(); // 确认详情面板已打开

    // 点击详情面板中的"安装"按钮
    const installBtns = screen.getAllByText('安装');
    // 取最后一个 — 这是详情面板中的按钮
    fireEvent.click(installBtns[installBtns.length - 1]);

    // ✅ 修复后：onInstall 应被调用
    expect(onInstall).toHaveBeenCalledWith('code-review-pro');
  });
});
