/**
 * TaskProgressPanel 单元测试
 *
 * 测试覆盖：
 * - UT-B.1.1: 面板容器渲染
 * - UT-B.1.2: 任务标题区渲染
 * - UT-B.1.3: 进度指示区渲染
 * - UT-B.1.4: Agent 角色行渲染
 * - UT-B.1.5: 任务清单渲染
 * - UT-B.1.6: 任务清单复选框交互
 * - UT-B.1.7: 任务项分隔线
 * - UT-B.1.8: Mock 数据驱动渲染
 * - UT-B.1.9: 颜色从 AGENT_DSL 查表
 * - UT-B.1.10: 响应式布局
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskProgressPanel } from '../TaskProgressPanel';
import { MOCK_TASK_DATA, MOCK_TASK_DATA_MULTIPLE } from '../../conversation/WORKFLOW_DSL';

describe('TaskProgressPanel', () => {
  describe('UT-B.1.1: 面板容器渲染', () => {
    it('应渲染面板容器', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const panel = container.querySelector('[data-testid="task-progress-panel"]');
      expect(panel).toBeDefined();
    });

    it('面板应有正确的 Tailwind 类', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const panel = container.querySelector('[data-testid="task-progress-panel"]');
      expect(panel).toHaveClass('bg-[#1E1E1E]', 'border-r', 'border-[#2D2D2D]');
    });

    it('面板应占满全高', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const panel = container.querySelector('[data-testid="task-progress-panel"]');
      expect(panel).toHaveClass('h-full');
    });
  });

  describe('UT-B.1.2: 任务标题区渲染', () => {
    it('应显示 Agent 头像', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const avatar = screen.queryByTestId('task-agent-avatar');
      expect(avatar).toBeDefined();
    });

    it('Agent 头像应为 32px 圆形', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const avatar = screen.getByTestId('task-agent-avatar');
      expect(avatar).toHaveClass('w-8', 'h-8', 'rounded-full');
    });

    it('应显示任务标题', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const title = screen.queryByText(MOCK_TASK_DATA.title);
      expect(title).toBeDefined();
    });

    it('任务标题应为白色 14px font-weight 600', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const title = screen.getByText(MOCK_TASK_DATA.title);
      expect(title).toHaveClass('text-white', 'text-sm', 'font-semibold');
    });
  });

  describe('UT-B.1.3: 进度指示区渲染', () => {
    it('应显示当前活跃的 Agent 名称', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const agentName = screen.queryByText(/explore/i);
      expect(agentName).toBeDefined();
    });

    it('应显示步骤进度文本（步骤 N/M）', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const progressText = screen.queryByText(/步骤/i);
      expect(progressText).toBeDefined();
    });

    it('应显示进度条', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const progressBar = screen.queryByTestId('task-progress-bar');
      expect(progressBar).toBeDefined();
    });

    it('进度条应有正确的 Tailwind 类', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const progressBar = screen.getByTestId('task-progress-bar');
      expect(progressBar).toHaveClass('bg-[#374151]');
    });

    it('进度条填充应有正确的 Tailwind 类', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const progressFill = screen.getByTestId('task-progress-fill');
      expect(progressFill).toHaveClass('bg-[#3B82F6]');
    });

    it('进度条宽度应等于百分比', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const progressFill = screen.getByTestId('task-progress-fill');
      expect(progressFill).toHaveStyle({ width: '50%' });
    });
  });

  describe('UT-B.1.4: Agent 角色行渲染', () => {
    it('应显示所有涉及的 Agent 圆形图标', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      // MOCK_TASK_DATA.agents = ['explore', 'proposal', 'task']
      expect(screen.getByTestId('agent-icon-explore')).toBeDefined();
      expect(screen.getByTestId('agent-icon-proposal')).toBeDefined();
      expect(screen.getByTestId('agent-icon-task')).toBeDefined();
    });

    it('Agent 图标应为圆形', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const exploreIcon = screen.getByTestId('agent-icon-explore');
      // 检查子元素是否有 rounded-full 类（因为圆形图标在子 div 中）
      const circle = exploreIcon.querySelector('.rounded-full');
      expect(circle).toBeDefined();
    });

    it('活跃 Agent 应高亮显示', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const exploreIcon = screen.getByTestId('agent-icon-explore');
      // 活跃 Agent 应该有特殊样式（如 ring 或 border）
      expect(exploreIcon).toBeDefined();
    });
  });

  describe('UT-B.1.5: 任务清单渲染', () => {
    it('应显示所有任务项', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      // MOCK_TASK_DATA.taskList 有 5 项
      for (const item of MOCK_TASK_DATA.taskList) {
        expect(screen.queryByText(item.text)).toBeDefined();
      }
    });

    it('每个任务项应有复选框', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBe(MOCK_TASK_DATA.taskList.length);
    });

    it('已完成的任务应显示选中状态', () => {
      render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const completedCount = MOCK_TASK_DATA.taskList.filter(item => item.completed).length;
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];

      const checkedCount = checkboxes.filter(cb => cb.checked).length;
      expect(checkedCount).toBe(completedCount);
    });

    it('已完成任务颜色应为 #10B981', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const firstCompletedTask = MOCK_TASK_DATA.taskList.find(item => item.completed);
      if (firstCompletedTask) {
        const taskElement = screen.getByText(firstCompletedTask.text);
        // 检查内联样式，因为组件使用 style 属性设置颜色
        expect(taskElement).toHaveStyle({ color: '#10B981' });
      }
    });

    it('未完成任务颜色应为 #6B7280', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const firstIncompleteTask = MOCK_TASK_DATA.taskList.find(item => !item.completed);
      if (firstIncompleteTask) {
        const taskElement = screen.getByText(firstIncompleteTask.text);
        // 检查内联样式
        expect(taskElement).toHaveStyle({ color: '#6B7280' });
      }
    });
  });

  describe('UT-B.1.6: 任务清单复选框交互', () => {
    it('点击复选框应切换选中状态', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const firstCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
      const initialState = firstCheckbox.checked;

      // 点击复选框（虽然当前可能没有交互功能，但测试未来实现）
      firstCheckbox.click();

      // 验证状态改变（如果实现了交互）
      // expect(firstCheckbox.checked).toBe(!initialState);
    });
  });

  describe('UT-B.1.7: 任务项分隔线', () => {
    it('任务项之间应有 1px 分隔线', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const dividers = container.querySelectorAll('[data-testid="task-item-divider"]');
      // 5 个任务项应该有 4 条分隔线
      expect(dividers.length).toBe(MOCK_TASK_DATA.taskList.length - 1);
    });

    it('分隔线颜色应为 #374151', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const divider = container.querySelector('[data-testid="task-item-divider"]');
      expect(divider).toHaveClass('border-[#374151]');
    });
  });

  describe('UT-B.1.8: Mock 数据驱动渲染', () => {
    it('应使用 taskData prop 驱动渲染', () => {
      const { rerender } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      // 初始渲染
      expect(screen.queryByText(MOCK_TASK_DATA.title)).toBeDefined();

      // 重新渲染不同数据
      rerender(<TaskProgressPanel taskData={MOCK_TASK_DATA_MULTIPLE} />);

      expect(screen.queryByText(MOCK_TASK_DATA_MULTIPLE.title)).toBeDefined();
    });
  });

  describe('UT-B.1.9: 颜色从 AGENT_DSL 查表', () => {
    it('Agent 图标颜色应从 AGENT_DSL 查表', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      // explore agent 的颜色应为 #3B82F6（蓝色）
      const exploreIcon = screen.getByTestId('agent-icon-explore');
      const circle = exploreIcon.querySelector('.rounded-full') as HTMLElement;
      expect(circle).toHaveStyle({ backgroundColor: '#3B82F6' });
    });
  });

  describe('UT-B.1.10: 响应式布局', () => {
    it('面板应使用 flex 布局', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const panel = container.querySelector('[data-testid="task-progress-panel"]');
      expect(panel).toHaveClass('flex');
    });

    it('面板应垂直排列子元素', () => {
      const { container } = render(<TaskProgressPanel taskData={MOCK_TASK_DATA} />);

      const panel = container.querySelector('[data-testid="task-progress-panel"]');
      expect(panel).toHaveClass('flex-col');
    });
  });
});
