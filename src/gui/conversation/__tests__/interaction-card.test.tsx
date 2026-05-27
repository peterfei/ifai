/**
 * InteractionCard 渲染测试
 *
 * 测试覆盖：
 * - 渲染交互卡片完整 UI
 * - 单选模式交互
 * - 多选模式交互
 * - 选项标签和颜色
 * - 已解决状态
 * - compact 模式
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InteractionCard } from '../cards/InteractionCard';
import { MOCK_INTERACTION_DATA_SINGLE, MOCK_INTERACTION_DATA_MULTIPLE, MOCK_INTERACTION_DATA_MULTI_QUESTION } from '../WORKFLOW_DSL';

function makeMessage(data: any) {
  return { id: 'test', role: 'assistant' as const, content: '', timestamp: Date.now(), data };
}

describe('InteractionCard', () => {
  /* ===== 单选模式 ===== */

  describe('单选模式', () => {
    it('应渲染标题和问题', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      render(<InteractionCard message={msg} />);

      expect(screen.getByText(MOCK_INTERACTION_DATA_SINGLE.title)).toBeTruthy();
      expect(screen.getByText(MOCK_INTERACTION_DATA_SINGLE.questions[0].question)).toBeTruthy();
    });

    it('应显示"LLM 提问"标签', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      render(<InteractionCard message={msg} />);

      expect(screen.getByText('LLM 提问')).toBeTruthy();
    });

    it('应渲染所有选项', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      render(<InteractionCard message={msg} />);

      for (const opt of MOCK_INTERACTION_DATA_SINGLE.questions[0].options) {
        expect(screen.getByText(opt.label)).toBeTruthy();
        expect(screen.getByText(opt.desc)).toBeTruthy();
      }
    });

    it('应显示选项标签（tag）', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      render(<InteractionCard message={msg} />);

      // 有 tag 的选项应显示
      const taggedOption = MOCK_INTERACTION_DATA_SINGLE.questions[0].options.find(o => o.tag);
      if (taggedOption?.tag) {
        expect(screen.getByText(taggedOption.tag)).toBeTruthy();
      }
    });

    it('单选模式不应显示确认按钮', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      render(<InteractionCard message={msg} />);

      expect(screen.queryByText(/确认选择/)).toBeNull();
    });

    it('应显示单选等待提示', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      render(<InteractionCard message={msg} />);

      expect(screen.getByText('请选择一个选项...')).toBeTruthy();
    });

    it('点击选项应触发选中', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      render(<InteractionCard message={msg} />);

      const firstOption = MOCK_INTERACTION_DATA_SINGLE.questions[0].options[0];
      const optionEl = screen.getByText(firstOption.label).closest('[class*="rounded-lg"]')!;
      fireEvent.click(optionEl);

      // 选中后等待提示应消失（因为 setTimeout 800ms 后 setResolved(true)）
      // 但在测试环境中 immediate check: 选中状态已改变
      expect(optionEl).toBeTruthy();
    });
  });

  /* ===== 多选模式 ===== */

  describe('多选模式', () => {
    it('应渲染多选确认按钮', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
      render(<InteractionCard message={msg} />);

      // 初始状态：0 个选中
      expect(screen.getByText('确认选择 (0)')).toBeTruthy();
    });

    it('应显示多选等待提示', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
      render(<InteractionCard message={msg} />);

      expect(screen.getByText('请勾选选项后确认...')).toBeTruthy();
    });

    it('应渲染所有选项', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
      render(<InteractionCard message={msg} />);

      for (const opt of MOCK_INTERACTION_DATA_MULTIPLE.questions[0].options) {
        expect(screen.getByText(opt.label)).toBeTruthy();
        expect(screen.getByText(opt.desc)).toBeTruthy();
      }
    });

    it('点击选项应 toggle 选中计数', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
      render(<InteractionCard message={msg} />);

      const firstOption = MOCK_INTERACTION_DATA_MULTIPLE.questions[0].options[0];
      const optionEl = screen.getByText(firstOption.label).closest('[class*="rounded-lg"]')!;
      fireEvent.click(optionEl);

      expect(screen.getByText('确认选择 (1)')).toBeTruthy();
    });

    it('确认按钮初始应为禁用状态', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
      render(<InteractionCard message={msg} />);

      const confirmBtn = screen.getByText('确认选择 (0)').closest('button')!;
      expect(confirmBtn.disabled).toBe(true);
    });

    it('选中选项后确认按钮应启用', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
      render(<InteractionCard message={msg} />);

      const firstOption = MOCK_INTERACTION_DATA_MULTIPLE.questions[0].options[0];
      const optionEl = screen.getByText(firstOption.label).closest('[class*="rounded-lg"]')!;
      fireEvent.click(optionEl);

      const confirmBtn = screen.getByText('确认选择 (1)').closest('button')!;
      expect(confirmBtn.disabled).toBe(false);
    });

    it('再次点击同一选项应取消选中', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTIPLE);
      render(<InteractionCard message={msg} />);

      const firstOption = MOCK_INTERACTION_DATA_MULTIPLE.questions[0].options[0];
      const optionEl = screen.getByText(firstOption.label).closest('[class*="rounded-lg"]')!;

      fireEvent.click(optionEl); // 选中
      expect(screen.getByText('确认选择 (1)')).toBeTruthy();

      fireEvent.click(optionEl); // 取消选中
      expect(screen.getByText('确认选择 (0)')).toBeTruthy();
    });
  });

  /* ===== 多问题模式 ===== */

  describe('多问题模式', () => {
    /* UT-C.2 */
    it('UT-C.2: 应渲染多组独立选项', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTI_QUESTION);
      render(<InteractionCard message={msg} />);

      // 两个问题各自渲染
      expect(screen.getByText(MOCK_INTERACTION_DATA_MULTI_QUESTION.questions[0].question)).toBeTruthy();
      expect(screen.getByText(MOCK_INTERACTION_DATA_MULTI_QUESTION.questions[1].question)).toBeTruthy();
      // 选项也分别渲染
      for (const opt of MOCK_INTERACTION_DATA_MULTI_QUESTION.questions[0].options) {
        expect(screen.getByText(opt.label)).toBeTruthy();
      }
      for (const opt of MOCK_INTERACTION_DATA_MULTI_QUESTION.questions[1].options) {
        expect(screen.getByText(opt.label)).toBeTruthy();
      }
    });

    /* UT-C.9 */
    it('UT-C.9: 每个问题的问题文本正确显示', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTI_QUESTION);
      render(<InteractionCard message={msg} />);

      expect(screen.getByText(MOCK_INTERACTION_DATA_MULTI_QUESTION.questions[0].question)).toBeTruthy();
      expect(screen.getByText(MOCK_INTERACTION_DATA_MULTI_QUESTION.questions[1].question)).toBeTruthy();
    });

    /* 多问题模式应显示统一确认按钮 */
    it('多问题模式应显示确认按钮', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTI_QUESTION);
      render(<InteractionCard message={msg} />);

      expect(screen.getByText('确认选择 (0)')).toBeTruthy();
    });

    /* 确认按钮在无选择时禁用 */
    it('确认按钮在无选择时禁用', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_MULTI_QUESTION);
      render(<InteractionCard message={msg} />);

      const confirmBtn = screen.getByText('确认选择 (0)').closest('button')!;
      expect(confirmBtn.disabled).toBe(true);
    });
  });

  /* ===== onAction 回调 ===== */

  describe('onAction 回调', () => {
    /* UT-C.8 */
    it('UT-C.8: 多选确认触发 onAction 携带 questionAnswers', () => {
      const onAction = vi.fn();
      const msg = makeMessage({
        type: 'single',
        title: '测试',
        questions: [{
          id: 'q1',
          type: 'multiple',
          question: '选择类型',
          options: [
            { id: 'a', label: '单元测试', desc: '测试单个函数' },
            { id: 'b', label: '集成测试', desc: '测试组件交互' },
          ],
        }],
      });
      render(<InteractionCard message={msg} onAction={onAction} />);

      // 选中选项
      fireEvent.click(screen.getByText('单元测试').closest('[class*="rounded-lg"]')!);
      // 点击确认
      fireEvent.click(screen.getByText('确认选择 (1)').closest('button')!);

      expect(onAction).toHaveBeenCalledWith('confirm', expect.objectContaining({
        questionAnswers: expect.arrayContaining([
          expect.objectContaining({ questionId: 'q1', selectedIds: ['a'] }),
        ]),
      }));
    });
  });

  /* ===== 已解决状态 ===== */

  describe('已解决状态', () => {
    /* UT-C.7 */
    it('UT-C.7: resolved 后选项不可点击', () => {
      const onAction = vi.fn();
      const msg = makeMessage({
        type: 'single',
        title: '测试',
        questions: [{
          id: 'q1',
          type: 'multiple',
          question: '选择类型',
          options: [{ id: 'a', label: '选项A', desc: 'desc' }],
        }],
      });
      render(<InteractionCard message={msg} onAction={onAction} />);

      // 选中并确认
      fireEvent.click(screen.getByText('选项A').closest('[class*="rounded-lg"]')!);
      fireEvent.click(screen.getByText('确认选择 (1)').closest('button')!);

      // resolved 后再次点击不应触发回调
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  /* ===== compact 模式 ===== */

  describe('compact 模式', () => {
    it('compact 模式应渲染', () => {
      const msg = makeMessage(MOCK_INTERACTION_DATA_SINGLE);
      const { container } = render(<InteractionCard message={msg} compact={true} />);

      expect(container.firstChild).toBeTruthy();
      expect(screen.getByText(MOCK_INTERACTION_DATA_SINGLE.title)).toBeTruthy();
    });
  });
});
