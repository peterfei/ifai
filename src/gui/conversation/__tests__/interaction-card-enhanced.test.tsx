/**
 * InteractionCard 增强测试 — PM 头像 + 动画 + 选中交互
 *
 * 测试覆盖：
 * - PM 头像渲染
 * - 入场动画 class
 * - 单选选中后 animate-check-fade / animate-option-highlight
 * - 多选选中后相应 class
 * - 等待指示器 animate-progress-pulse
 * - 单选 800ms 自动确认后状态
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InteractionCard } from '../cards/InteractionCard';
import { MOCK_INTERACTION_DATA_SINGLE, MOCK_INTERACTION_DATA_MULTIPLE } from '../WORKFLOW_DSL';

function makeMessage(data: any) {
  return { id: 'test', role: 'assistant' as const, content: '', timestamp: Date.now(), data };
}

describe('InteractionCard 增强', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ===== PM 头像 ===== */

  it('IC-E1: 头部渲染 PM 头像', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    render(<InteractionCard message={msg} />);

    expect(screen.getByText('PM')).toBeTruthy();
  });

  /* ===== 入场动画 ===== */

  it('IC-E2: 容器包含 animate-interaction-slide 入场动画 class', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    const { container } = render(<InteractionCard message={msg} />);

    // 最外层容器
    expect(container.firstChild).toHaveClass('animate-interaction-slide');
  });

  /* ===== 单选选中动画 ===== */

  it('IC-E3: 单选选中后 radio 图标包含 animate-check-fade class', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    render(<InteractionCard message={msg} />);

    const firstLabel = MOCK_INTERACTION_DATA_SINGLE.questions[0].options[0].label;
    const optionEl = screen.getByText(firstLabel).closest('[class*="rounded-lg"]')!;
    fireEvent.click(optionEl);

    // 单选 radio 选中后，内部填充圆点应有 animate-check-fade
    const radioFill = optionEl.querySelector('.rounded-full.bg-white');
    expect(radioFill).toBeTruthy();
    // 父容器应有选中相关 class
    expect(optionEl.className).toContain('border-blue-500');
  });

  it('IC-E4: 单选选中后选项容器包含 animate-option-highlight class', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    render(<InteractionCard message={msg} />);

    const firstLabel = MOCK_INTERACTION_DATA_SINGLE.questions[0].options[0].label;
    const optionEl = screen.getByText(firstLabel).closest('[class*="rounded-lg"]')!;
    fireEvent.click(optionEl);

    // 选中时应有 animate-option-highlight class（动画会应用然后移除，保留一瞬间）
    expect(optionEl.className).toContain('animate-option-highlight');
  });

  /* ===== 等待指示器 ===== */

  it('IC-E5: 等待指示器包含 animate-progress-pulse class', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    const { container } = render(<InteractionCard message={msg} />);

    const pulseDot = container.querySelector('.animate-progress-pulse');
    expect(pulseDot).toBeTruthy();
  });

  it('IC-E6: 单选模式等待文本为"请选择一个选项..."', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    render(<InteractionCard message={msg} />);

    expect(screen.getByText('请选择一个选项...')).toBeTruthy();
  });

  it('IC-E7: 多选模式等待文本为"请勾选选项后确认..."', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
    render(<InteractionCard message={msg} />);

    expect(screen.getByText('请勾选选项后确认...')).toBeTruthy();
  });

  /* ===== 单选 800ms 自动确认 ===== */

  it('IC-E8: 单选自动确认后等待指示器消失', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    render(<InteractionCard message={msg} />);

    const firstLabel = MOCK_INTERACTION_DATA_SINGLE.questions[0].options[0].label;
    const optionEl = screen.getByText(firstLabel).closest('[class*="rounded-lg"]')!;
    fireEvent.click(optionEl);

    // 800ms 前等待提示仍在
    expect(screen.getByText('请选择一个选项...')).toBeTruthy();

    // 快进 800ms
    act(() => {
      vi.advanceTimersByTime(800);
    });

    // 800ms 后等待提示消失
    expect(screen.queryByText('请选择一个选项...')).toBeNull();
  });

  it('IC-E9: 单选自动确认后选项变灰 (opacity-50)', () => {
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    render(<InteractionCard message={msg} />);

    const firstLabel = MOCK_INTERACTION_DATA_SINGLE.questions[0].options[0].label;
    const optionEl = screen.getByText(firstLabel).closest('[class*="rounded-lg"]')!;
    fireEvent.click(optionEl);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(optionEl.className).toContain('opacity-50');
    expect(optionEl.className).toContain('cursor-not-allowed');
  });

  it('IC-E10: 单选自动确认触发 onAction("confirm")', () => {
    const onAction = vi.fn();
    const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
    render(<InteractionCard message={msg} onAction={onAction} />);

    const firstLabel = MOCK_INTERACTION_DATA_SINGLE.questions[0].options[0].label;
    const optionEl = screen.getByText(firstLabel).closest('[class*="rounded-lg"]')!;
    fireEvent.click(optionEl);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onAction).toHaveBeenCalledWith('confirm', expect.objectContaining({
      questionAnswers: expect.arrayContaining([
        expect.objectContaining({ questionId: '_default' }),
      ]),
    }));
  });
});
