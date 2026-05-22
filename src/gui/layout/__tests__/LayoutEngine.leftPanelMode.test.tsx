import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LayoutEngine } from '../LayoutEngine';
import { layoutRegistry } from '../layout-registry';
import { componentRegistry } from '../../registry/component-registry';
import { registerLayouts } from '../registrations';
import { useLayoutStore } from '../../../stores/layoutStore';

// Mock panels for testing
const MockTaskPanel = () => <div data-testid="task-panel">Task Progress Panel</div>;
const MockListPanel = () => <div data-testid="list-panel">Conversation List Panel</div>;
const MockCenterPanel = () => <div data-testid="center-panel">Center Panel</div>;
const MockRightPanel = () => <div data-testid="right-panel">Right Panel</div>;

describe('LayoutEngine - leftPanelMode Support', () => {
  beforeEach(() => {
    // 清理注册状态
    layoutRegistry.clear();
    componentRegistry.clear();

    // 注册测试组件
    componentRegistry.register('task-panel', MockTaskPanel);
    componentRegistry.register('list-panel', MockListPanel);
    componentRegistry.register('center-panel', MockCenterPanel);
    componentRegistry.register('right-panel', MockRightPanel);

    // 注册测试布局，左栏使用占位符
    layoutRegistry.register('test-layout', {
      id: 'test-layout',
      panes: [
        { id: 'left', width: 320, flex: 0 },
        { id: 'center', width: 'auto', flex: 1 },
        { id: 'right', width: 400, flex: 0 },
      ],
    });
  });

  afterEach(() => {
    // 清理 store 状态
    if (useLayoutStore.getState().leftPanelMode) {
      useLayoutStore.getState().setLeftPanelMode?.('task');
    }
  });

  describe('leftPanelMode 状态管理', () => {
    it('应该在 useLayoutStore 中有 leftPanelMode 状态', () => {
      const state = useLayoutStore.getState();
      expect(state.leftPanelMode).toBeDefined();
      expect(['task', 'list']).toContain(state.leftPanelMode);
    });

    it('默认应该是 task 模式', () => {
      const state = useLayoutStore.getState();
      expect(state.leftPanelMode).toBe('task');
    });

    it('应该有 setLeftPanelMode action', () => {
      const state = useLayoutStore.getState();
      expect(typeof state.setLeftPanelMode).toBe('function');
    });

    it('setLeftPanelMode 应该能切换模式', () => {
      const state = useLayoutStore.getState();

      state.setLeftPanelMode?.('list');
      expect(useLayoutStore.getState().leftPanelMode).toBe('list');

      state.setLeftPanelMode?.('task');
      expect(useLayoutStore.getState().leftPanelMode).toBe('task');
    });

    it('setLeftPanelMode 应该接受有效值', () => {
      // 测试模式切换的边界情况
      useLayoutStore.getState().setLeftPanelMode?.('list');
      expect(useLayoutStore.getState().leftPanelMode).toBe('list');

      useLayoutStore.getState().setLeftPanelMode?.('task');
      expect(useLayoutStore.getState().leftPanelMode).toBe('task');
    });
  });

  describe('LayoutEngine leftPanelMode 集成', () => {
    it('应该在 task 模式下渲染 TaskProgressPanel', () => {
      useLayoutStore.getState().setLeftPanelMode?.('task');

      const paneRenderer = (paneId: string) => {
        if (paneId === 'left') {
          // 根据 leftPanelMode 选择组件
          const mode = useLayoutStore.getState().leftPanelMode;
          const Component = componentRegistry.get(mode === 'task' ? 'task-panel' : 'list-panel');
          return Component ? <Component /> : <div>Unknown: {paneId}</div>;
        }
        const Component = componentRegistry.get(`${paneId}-panel`);
        return Component ? <Component /> : <div>Unknown: {paneId}</div>;
      };

      render(<LayoutEngine mode="test-layout" paneRenderer={paneRenderer} />);

      expect(screen.getByTestId('task-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('list-panel')).not.toBeInTheDocument();
    });

    it('应该在 list 模式下渲染 ConversationListPanel', () => {
      useLayoutStore.getState().setLeftPanelMode?.('list');

      const paneRenderer = (paneId: string) => {
        if (paneId === 'left') {
          const mode = useLayoutStore.getState().leftPanelMode;
          const Component = componentRegistry.get(mode === 'task' ? 'task-panel' : 'list-panel');
          return Component ? <Component /> : <div>Unknown: {paneId}</div>;
        }
        const Component = componentRegistry.get(`${paneId}-panel`);
        return Component ? <Component /> : <div>Unknown: {paneId}</div>;
      };

      render(<LayoutEngine mode="test-layout" paneRenderer={paneRenderer} />);

      expect(screen.getByTestId('list-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
    });

    it('应该在切换模式时重新渲染左栏', () => {
      const paneRenderer = (paneId: string) => {
        if (paneId === 'left') {
          const mode = useLayoutStore.getState().leftPanelMode;
          const Component = componentRegistry.get(mode === 'task' ? 'task-panel' : 'list-panel');
          return Component ? <Component /> : <div>Unknown: {paneId}</div>;
        }
        const Component = componentRegistry.get(`${paneId}-panel`);
        return Component ? <Component /> : <div>Unknown: {paneId}</div>;
      };

      const { rerender } = render(<LayoutEngine mode="test-layout" paneRenderer={paneRenderer} />);

      // 初始应该是 task 模式
      expect(screen.getByTestId('task-panel')).toBeInTheDocument();

      // 切换到 list 模式
      useLayoutStore.getState().setLeftPanelMode?.('list');
      rerender(<LayoutEngine mode="test-layout" paneRenderer={paneRenderer} />);

      expect(screen.getByTestId('list-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();

      // 切换回 task 模式
      useLayoutStore.getState().setLeftPanelMode?.('task');
      rerender(<LayoutEngine mode="test-layout" paneRenderer={paneRenderer} />);

      expect(screen.getByTestId('task-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('list-panel')).not.toBeInTheDocument();
    });

    it('leftPanelMode 不应该影响其他面板的渲染', () => {
      useLayoutStore.getState().setLeftPanelMode?.('list');

      const paneRenderer = (paneId: string) => {
        if (paneId === 'left') {
          const mode = useLayoutStore.getState().leftPanelMode;
          const Component = componentRegistry.get(mode === 'task' ? 'task-panel' : 'list-panel');
          return Component ? <Component /> : <div>Unknown: {paneId}</div>;
        }
        const Component = componentRegistry.get(`${paneId}-panel`);
        return Component ? <Component /> : <div>Unknown: {paneId}</div>;
      };

      render(<LayoutEngine mode="test-layout" paneRenderer={paneRenderer} />);

      // 验证其他面板仍然正常渲染
      expect(screen.getByTestId('center-panel')).toBeInTheDocument();
      expect(screen.getByTestId('right-panel')).toBeInTheDocument();
    });
  });

  describe('与 conversation 布局的集成', () => {
    beforeEach(() => {
      registerLayouts();
    });

    it('conversation 布局应该支持 leftPanelMode 切换', () => {
      const descriptor = layoutRegistry.get('conversation');
      expect(descriptor).toBeDefined();
      expect(descriptor?.panes).toHaveLength(3);

      const leftPane = descriptor?.panes.find(p => p.id === 'left');
      expect(leftPane).toBeDefined();
      expect(leftPane?.width).toBe(320);
    });

    it('应该能从 task 模式切换到 list 模式', () => {
      // 初始状态：task 模式
      expect(useLayoutStore.getState().leftPanelMode).toBe('task');

      // 切换到 list 模式
      useLayoutStore.getState().setLeftPanelMode?.('list');
      expect(useLayoutStore.getState().leftPanelMode).toBe('list');

      // 切换回 task 模式
      useLayoutStore.getState().setLeftPanelMode?.('task');
      expect(useLayoutStore.getState().leftPanelMode).toBe('task');
    });
  });
});
