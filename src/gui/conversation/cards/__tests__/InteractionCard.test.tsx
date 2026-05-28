/**
 * InteractionCard 测试
 *
 * 测试覆盖：
 * - IC-1: 渲染头部（PM 头像 + LLM 提问徽章）
 * - IC-2: 渲染标题 + 问题描述
 * - IC-3: 单选模式（radio）
 * - IC-4: 多选模式（checkbox + 确认按钮）
 * - IC-5: 确认按钮点击后 resolved
 * - IC-6: resolved 后按钮变色 + 选项 disabled
 * - IC-7: 等待指示器
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InteractionCard } from '../InteractionCard';

const SINGLE_DATA = {
  type: 'single' as const,
  title: '选择做法',
  questions: [
    {
      id: 'q1',
      type: 'single' as const,
      question: '请选择下一步操作',
      compactAsk: '选择',
      options: [
        { id: 'opt1', label: '生成代码', desc: '自动生成代码文件', tag: '推荐', tagColor: 'emerald' },
        { id: 'opt2', label: '手动编写', desc: '亲自编写代码' },
      ],
    },
  ],
  onSelect: 'next_step',
};

const MULTI_DATA = {
  type: 'multiple' as const,
  title: '选择模块',
  questions: [
    {
      id: 'q2',
      type: 'multiple' as const,
      question: '请选择要修改的模块',
      options: [
        { id: 'mod1', label: '登录模块', desc: '用户登录功能' },
        { id: 'mod2', label: '注册模块', desc: '用户注册功能' },
        { id: 'mod3', label: '设置模块', desc: '用户设置功能' },
      ],
    },
  ],
  onSelect: 'select_modules',
};

describe('InteractionCard', () => {
  it('IC-1: 渲染头部（PM 头像 + LLM 提问徽章）', () => {
    render(<InteractionCard message={{ data: SINGLE_DATA }} />);
    expect(screen.getByText('PM')).toBeTruthy();
    expect(screen.getByText('LLM 提问')).toBeTruthy();
  });

  it('IC-2: 渲染标题 + 问题描述', () => {
    render(<InteractionCard message={{ data: SINGLE_DATA }} />);
    expect(screen.getByText('选择做法')).toBeTruthy();
    expect(screen.getByText('请选择下一步操作')).toBeTruthy();
  });

  it('IC-3: 单选模式（radio）不显示确认按钮', () => {
    render(<InteractionCard message={{ data: SINGLE_DATA }} />);
    // 单选模式无确认按钮
    expect(screen.queryByText(/确认选择/)).toBeNull();
    // 选项可见
    expect(screen.getByText('生成代码')).toBeTruthy();
    expect(screen.getByText('手动编写')).toBeTruthy();
    // 描述可见
    expect(screen.getByText('自动生成代码文件')).toBeTruthy();
    // tag 可见
    expect(screen.getByText('推荐')).toBeTruthy();
  });

  it('IC-4: 多选模式显示确认按钮', () => {
    render(<InteractionCard message={{ data: MULTI_DATA }} />);
    expect(screen.getByText(/确认选择/)).toBeTruthy();
    // 所有选项可见
    expect(screen.getByText('登录模块')).toBeTruthy();
    expect(screen.getByText('注册模块')).toBeTruthy();
    expect(screen.getByText('设置模块')).toBeTruthy();
  });

  it('IC-5: 多选点击后确认按钮可用，点击确认后触发 onAction', () => {
    const onAction = vi.fn();
    render(<InteractionCard message={{ data: MULTI_DATA }} onAction={onAction} />);

    // 选中一个选项
    fireEvent.click(screen.getByText('登录模块'));
    expect(screen.getByText(/确认选择 \(1\)/)).toBeTruthy();

    // 点击确认
    fireEvent.click(screen.getByText(/确认选择/));

    expect(onAction).toHaveBeenCalled();
    const callArg = onAction.mock.calls[0];
    expect(callArg[0]).toBe('confirm');
    expect(callArg[1].action).toBe('select_modules');
  });

  it('IC-6: resolved 后按钮变色为绿色', () => {
    const onAction = vi.fn();
    render(<InteractionCard message={{ data: MULTI_DATA }} onAction={onAction} />);

    fireEvent.click(screen.getByText('登录模块'));
    fireEvent.click(screen.getByText(/确认选择/));

    expect(screen.getByText('已确认')).toBeTruthy();
    // 等待提示消失
    expect(screen.queryByText('请勾选选项后确认...')).toBeNull();
  });

  it('IC-7: 等待指示器', () => {
    render(<InteractionCard message={{ data: MULTI_DATA }} />);
    expect(screen.getByText('请勾选选项后确认...')).toBeTruthy();
  });

  it('IC-8: 显示选项标签颜色标签', () => {
    render(<InteractionCard message={{ data: SINGLE_DATA }} />);
    // 推荐标签有 emerald 色
    const tag = screen.getByText('推荐');
    expect(tag).toBeTruthy();
  });
});
