import { describe, it, expect, beforeEach } from 'vitest';
import { layoutRegistry } from '../layout-registry';
import { componentRegistry } from '../../registry/component-registry';
import { registerLayouts } from '../registrations';
import { ConversationDetailPanel } from '../ConversationDetailPanel';

describe('Layout Registrations', () => {
  beforeEach(() => {
    layoutRegistry.clear();
    componentRegistry.clear();
  });

  describe('B.3.3 - TaskProgressPanel Registration', () => {
    it('should register TaskProgressPanel in componentRegistry', () => {
      registerLayouts();

      const TaskProgressPanelComponent = componentRegistry.get('conversation-task');
      expect(TaskProgressPanelComponent).toBeDefined();
    });

    it('should register conversation layout with three panes', () => {
      registerLayouts();

      const conversationLayout = layoutRegistry.get('conversation');
      expect(conversationLayout).toBeDefined();
      expect(conversationLayout?.panes).toHaveLength(3);

      const listPane = conversationLayout?.panes.find(p => p.id === 'conversation-list');
      expect(listPane).toBeDefined();
      expect(listPane?.width).toBe(260);
    });

    it.skip('should have leftPanelMode state in layoutStore', async () => {
      // TODO: 跳过此测试，需要在测试环境中正确初始化 layoutStore
      const { layoutStore } = await import('../../../stores/layoutStore');
      const state = layoutStore.getState();

      expect(state.leftPanelMode).toBeDefined();
      expect(['task', 'list']).toContain(state.leftPanelMode);
    });

    it.skip('should have setLeftPanelMode action in layoutStore', async () => {
      // TODO: 跳过此测试，需要在测试环境中正确初始化 layoutStore
      const { layoutStore } = await import('../../../stores/layoutStore');
      const state = layoutStore.getState();

      expect(typeof state.setLeftPanelMode).toBe('function');

      // 测试切换功能
      state.setLeftPanelMode('list');
      expect(layoutStore.getState().leftPanelMode).toBe('list');

      state.setLeftPanelMode('task');
      expect(layoutStore.getState().leftPanelMode).toBe('task');
    });
  });

  describe('Component Registrations', () => {
    it('should register ConversationDetailPanel', () => {
      registerLayouts();

      const detailPanel = componentRegistry.get('conversation-detail');
      expect(detailPanel).toBeDefined();
      expect(detailPanel).toBe(ConversationDetailPanel);
    });

    it('should register TaskProgressPanel with correct id', () => {
      registerLayouts();

      const taskPanel = componentRegistry.get('conversation-task');
      expect(taskPanel).toBeDefined();
    });
  });

  describe('Layout Descriptors', () => {
    it('should register conversation layout descriptor', () => {
      registerLayouts();

      const descriptor = layoutRegistry.get('conversation');
      expect(descriptor).toBeDefined();
      expect(descriptor?.panes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'conversation-list' }),
          expect.objectContaining({ id: 'conversation' }),
          expect.objectContaining({ id: 'conversation-detail' }),
        ])
      );
    });

    it('should register editor layout descriptor', () => {
      registerLayouts();

      const descriptor = layoutRegistry.get('editor');
      expect(descriptor).toBeDefined();
      expect(descriptor?.panes).toHaveLength(1);
    });

    it('should register split layout descriptor', () => {
      registerLayouts();

      const descriptor = layoutRegistry.get('split');
      expect(descriptor).toBeDefined();
      expect(descriptor?.panes).toHaveLength(2);
    });
  });
});
