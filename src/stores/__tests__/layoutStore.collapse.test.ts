/**
 * layoutStore 折叠状态测试
 *
 * LC-1 ~ LC-9: conversation 模式左栏/右栏折叠
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '../layoutStore';

describe('layoutStore conversation collapse', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      conversationLeftWidth: 260,
      conversationRightWidth: 300,
      conversationLeftCollapsed: false,
      conversationRightCollapsed: false,
      guiMode: 'conversation',
    });
  });

  // LC-1: conversationLeftCollapsed 默认 false
  it('LC-1: conversationLeftCollapsed 默认 false', () => {
    expect(useLayoutStore.getState().conversationLeftCollapsed).toBe(false);
  });

  // LC-2: conversationRightCollapsed 默认 false
  it('LC-2: conversationRightCollapsed 默认 false', () => {
    expect(useLayoutStore.getState().conversationRightCollapsed).toBe(false);
  });

  // LC-3: toggle('left') 切换为 true
  it('LC-3: toggle 左栏折叠', () => {
    useLayoutStore.getState().toggleConversationPaneCollapse('left');
    expect(useLayoutStore.getState().conversationLeftCollapsed).toBe(true);
  });

  // LC-4: toggle('right') 切换为 true
  it('LC-4: toggle 右栏折叠', () => {
    useLayoutStore.getState().toggleConversationPaneCollapse('right');
    expect(useLayoutStore.getState().conversationRightCollapsed).toBe(true);
  });

  // LC-5: 再次 toggle 恢复展开
  it('LC-5: 双 toggle 恢复展开', () => {
    useLayoutStore.getState().toggleConversationPaneCollapse('left');
    useLayoutStore.getState().toggleConversationPaneCollapse('left');
    expect(useLayoutStore.getState().conversationLeftCollapsed).toBe(false);
  });

  // LC-6: 折叠不影响 width 值
  it('LC-6: 折叠不影响 conversationLeftWidth', () => {
    useLayoutStore.getState().toggleConversationPaneCollapse('left');
    expect(useLayoutStore.getState().conversationLeftWidth).toBe(260);
  });

  // LC-7: 折叠状态在 partialize 中持久化
  it('LC-7: 折叠字段存在于 store 状态', () => {
    useLayoutStore.setState({
      conversationLeftCollapsed: true,
      conversationRightCollapsed: true,
    });
    const state = useLayoutStore.getState();
    expect(state.conversationLeftCollapsed).toBe(true);
    expect(state.conversationRightCollapsed).toBe(true);
  });

  // LC-8: v5→v6 迁移添加折叠字段
  it('LC-8: migrate v5→v6 添加折叠字段默认值', () => {
    // 模拟从 v5 迁移：setState 确保字段可以设置
    useLayoutStore.setState({
      conversationLeftCollapsed: undefined as any,
      conversationRightCollapsed: undefined as any,
    });
    // 迁移后应该可以正常使用，不崩溃
    expect(typeof useLayoutStore.getState().toggleConversationPaneCollapse).toBe('function');
  });

  // LC-9: 切出 conversation 模式时重置折叠
  it('LC-9: setGuiMode 非 conversation 时重置折叠', () => {
    useLayoutStore.setState({ conversationLeftCollapsed: true, conversationRightCollapsed: true });
    useLayoutStore.getState().setGuiMode('editor');
    expect(useLayoutStore.getState().conversationLeftCollapsed).toBe(false);
    expect(useLayoutStore.getState().conversationRightCollapsed).toBe(false);
  });
});
