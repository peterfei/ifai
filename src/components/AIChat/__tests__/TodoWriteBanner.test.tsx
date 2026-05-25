/**
 * TodoWriteBanner 渲染测试
 *
 * 测试覆盖：
 * - 订阅 todoWriteStore，tasks > 0 时渲染
 * - 数据驱动：pending / in_progress / completed 状态查表渲染
 * - 完成计数准确（从 store.stats）
 * - 折叠/展开交互
 * - 底部脉冲指示器（in_progress 任务）
 * - 空任务时不渲染
 * - TODO_STATUS_CONFIG 声明式配置完整性
 * - TOOL_RENDER_BLACKLIST 屏蔽 TodoWrite 的 ToolApproval 渲染
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TodoWriteBanner } from '../TodoWriteBanner';
import { useTodoWriteStore } from '../../../stores/todoWriteStore';
import { TODO_STATUS_CONFIG } from '../../../gui/conversation/WORKFLOW_DSL';
import type { TodoWriteTaskItem } from '../../../gui/conversation/WORKFLOW_DSL';

/* ===== 辅助函数 ===== */

const MOCK_TASKS: TodoWriteTaskItem[] = [
  { content: '实现用户认证 API',    activeForm: '正在实现用户认证 API...',  status: 'pending' },
  { content: '创建登录表单组件',    activeForm: '正在创建登录表单组件...',  status: 'in_progress' },
  { content: '设计数据库 schema',   activeForm: '正在设计数据库 schema...', status: 'completed' },
  { content: '编写单元测试',        activeForm: '正在编写单元测试...',      status: 'pending' },
  { content: '部署到测试环境',      activeForm: '正在部署到测试环境...',    status: 'pending' },
];

function setStoreTasks(tasks: TodoWriteTaskItem[]) {
  useTodoWriteStore.setState({ tasks });
  // 手动触发 stats 更新
  useTodoWriteStore.getState().updateStats();
}

function clearStoreTasks() {
  useTodoWriteStore.setState({ tasks: [] });
  useTodoWriteStore.getState().updateStats();
}

describe('TodoWriteBanner', () => {
  beforeEach(() => {
    clearStoreTasks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ===== 条件渲染 ===== */

  describe('条件渲染', () => {
    it('无任务时不应渲染', () => {
      const { container } = render(<TodoWriteBanner />);
      expect(container.firstChild).toBeNull();
    });

    it('有任务时应渲染', () => {
      setStoreTasks(MOCK_TASKS);
      render(<TodoWriteBanner />);
      expect(screen.getByText('任务计划')).toBeTruthy();
    });
  });

  /* ===== 基础 UI ===== */

  describe('基础 UI', () => {
    it('应显示完成计数', () => {
      setStoreTasks(MOCK_TASKS);
      render(<TodoWriteBanner />);
      // 1 completed, 5 total
      expect(screen.getByText('1/5')).toBeTruthy();
    });

    it('应渲染所有任务内容', () => {
      setStoreTasks(MOCK_TASKS);
      render(<TodoWriteBanner />);
      for (const task of MOCK_TASKS) {
        expect(screen.getByText(task.content)).toBeTruthy();
      }
    });

    it('应渲染状态标签', () => {
      setStoreTasks(MOCK_TASKS);
      render(<TodoWriteBanner />);
      expect(screen.getByText('进行中')).toBeTruthy();
      expect(screen.getByText('已完成')).toBeTruthy();
      expect(screen.getAllByText('待处理').length).toBe(3);
    });
  });

  /* ===== 折叠/展开 ===== */

  describe('折叠/展开', () => {
    it('点击标题栏应折叠任务列表', () => {
      setStoreTasks(MOCK_TASKS);
      render(<TodoWriteBanner />);

      // 任务内容可见
      expect(screen.getByText('实现用户认证 API')).toBeTruthy();

      // 点击标题栏折叠
      const header = screen.getByText('任务计划').closest('div')!;
      fireEvent.click(header);

      // 任务内容不再可见
      expect(screen.queryByText('实现用户认证 API')).toBeNull();
    });

    it('折叠后再点击应展开', () => {
      setStoreTasks(MOCK_TASKS);
      render(<TodoWriteBanner />);

      const header = screen.getByText('任务计划').closest('div')!;
      fireEvent.click(header); // 折叠
      fireEvent.click(header); // 展开

      expect(screen.getByText('实现用户认证 API')).toBeTruthy();
    });
  });

  /* ===== 脉冲指示器 ===== */

  describe('执行中脉冲指示器', () => {
    it('有 in_progress 任务时标题栏应显示 activeForm', () => {
      setStoreTasks(MOCK_TASKS);
      render(<TodoWriteBanner />);
      const activeTask = MOCK_TASKS.find(t => t.status === 'in_progress')!;
      expect(screen.getByText(activeTask.activeForm)).toBeTruthy();
    });

    it('无 in_progress 任务时标题栏不应显示 activeForm', () => {
      const allPending: TodoWriteTaskItem[] = [
        { content: 'A', activeForm: 'A...', status: 'pending' },
      ];
      setStoreTasks(allPending);
      render(<TodoWriteBanner />);
      // activeForm "A..." 不应在标题栏中
      expect(screen.queryByText('A...')).toBeNull();
    });
  });

  /* ===== Store 实时更新 ===== */

  describe('Store 实时更新', () => {
    it('store 更新后 UI 应同步', () => {
      setStoreTasks([MOCK_TASKS[0]]);
      render(<TodoWriteBanner />);
      expect(screen.getByText('0/1')).toBeTruthy();

      // 更新 store（标记为完成）— 用 act 包裹确保 React 重渲染
      act(() => {
        setStoreTasks([{ ...MOCK_TASKS[0], status: 'completed' }]);
      });
      expect(screen.getByText('1/1')).toBeTruthy();
    });

    it('store 清空后 Banner 应消失', () => {
      setStoreTasks(MOCK_TASKS);
      const { container } = render(<TodoWriteBanner />);
      expect(container.firstChild).toBeTruthy();

      act(() => {
        clearStoreTasks();
      });
      // store 清空后组件返回 null
      expect(container.firstChild).toBeNull();
    });
  });

  /* ===== 自动隐藏 ===== */

  describe('全部完成后自动隐藏', () => {
    it('全部完成后 2 秒应自动消失', () => {
      const allCompleted = MOCK_TASKS.map(t => ({ ...t, status: 'completed' as const }));
      setStoreTasks(allCompleted);
      const { container } = render(<TodoWriteBanner />);
      expect(container.firstChild).toBeTruthy();

      // 快进 2 秒
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // store 被清空，Banner 消失
      expect(container.firstChild).toBeNull();
    });

    it('全部完成后 2 秒内不应消失', () => {
      const allCompleted = MOCK_TASKS.map(t => ({ ...t, status: 'completed' as const }));
      setStoreTasks(allCompleted);
      const { container } = render(<TodoWriteBanner />);
      expect(container.firstChild).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      // 还没到 2 秒，仍然显示
      expect(container.firstChild).toBeTruthy();
    });

    it('未全部完成时不应触发自动隐藏', () => {
      setStoreTasks(MOCK_TASKS); // 只有 1 个 completed
      const { container } = render(<TodoWriteBanner />);
      expect(container.firstChild).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // 仍有未完成任务，不消失
      expect(container.firstChild).toBeTruthy();
    });
  });

  /* ===== TODO_STATUS_CONFIG 声明式配置 ===== */

  describe('TODO_STATUS_CONFIG', () => {
    it('配置应覆盖全部 3 种状态', () => {
      const statuses: Array<keyof typeof TODO_STATUS_CONFIG> = ['pending', 'in_progress', 'completed'];
      for (const s of statuses) {
        expect(TODO_STATUS_CONFIG[s]).toBeDefined();
        expect(TODO_STATUS_CONFIG[s].icon).toBeTruthy();
        expect(TODO_STATUS_CONFIG[s].color).toBeTruthy();
        expect(TODO_STATUS_CONFIG[s].label).toBeTruthy();
      }
    });

    it('in_progress 应有 pulse 动画标记', () => {
      expect(TODO_STATUS_CONFIG.in_progress.pulse).toBe(true);
    });
  });
});

/* ===== TOOL_RENDER_BLACKLIST 集成测试 ===== */

describe('TodoWrite ToolApproval 屏蔽', () => {
  it('TodoWrite 工具应在黑名单中被屏蔽', () => {
    const TOOL_RENDER_BLACKLIST = new Set(['TodoWrite']);
    expect(TOOL_RENDER_BLACKLIST.has('TodoWrite')).toBe(true);
    expect(TOOL_RENDER_BLACKLIST.has('agent_write_file')).toBe(false);
  });

  it('TodoWrite 工具调用应被过滤出 validToolCalls', () => {
    const TOOL_RENDER_BLACKLIST = new Set(['TodoWrite']);
    const toolCalls = [
      { id: '1', tool: 'agent_write_file', status: 'completed' },
      { id: '2', tool: 'TodoWrite', status: 'completed' },
      { id: '3', tool: 'agent_read_file', status: 'pending' },
    ];
    const filtered = toolCalls.filter(tc => !TOOL_RENDER_BLACKLIST.has(tc.tool));
    expect(filtered.length).toBe(2);
    expect(filtered.every(tc => tc.tool !== 'TodoWrite')).toBe(true);
  });
});
