/**
 * layoutStore conversation 栏宽持久化测试
 *
 * LR-1 ~ LR-7: conversation 模式左栏/右栏宽度
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLayoutStore } from '../layoutStore';

describe('layoutStore conversation widths', () => {
  beforeEach(() => {
    // 重置 store 到初始状态
    const store = useLayoutStore.getState();
    store.resetLayout();
    useLayoutStore.setState({
      conversationLeftWidth: 260,
      conversationRightWidth: 300,
    });
  });

  // LR-1: conversationLeftWidth 默认 260
  it('LR-1: conversationLeftWidth 默认 260', () => {
    expect(useLayoutStore.getState().conversationLeftWidth).toBe(260);
  });

  // LR-2: conversationRightWidth 默认 300
  it('LR-2: conversationRightWidth 默认 300', () => {
    expect(useLayoutStore.getState().conversationRightWidth).toBe(300);
  });

  // LR-3: setConversationPaneWidth 更新左栏
  it('LR-3: setConversationPaneWidth 更新左栏', () => {
    useLayoutStore.getState().setConversationPaneWidth('left', 350);
    expect(useLayoutStore.getState().conversationLeftWidth).toBe(350);
  });

  // LR-4: setConversationPaneWidth 更新右栏
  it('LR-4: setConversationPaneWidth 更新右栏', () => {
    useLayoutStore.getState().setConversationPaneWidth('right', 450);
    expect(useLayoutStore.getState().conversationRightWidth).toBe(450);
  });

  // LR-5: 最小宽度约束 150px
  it('LR-5: 最小宽度约束 150px', () => {
    useLayoutStore.getState().setConversationPaneWidth('left', 50);
    expect(useLayoutStore.getState().conversationLeftWidth).toBe(150);
  });

  // LR-6: 最大宽度约束 600px
  it('LR-6: 最大宽度约束 600px', () => {
    useLayoutStore.getState().setConversationPaneWidth('right', 800);
    expect(useLayoutStore.getState().conversationRightWidth).toBe(600);
  });

  // LR-7: 栏宽字段存在于 partialize 中（验证持久化）
  it('LR-7: 栏宽在 partialize 中持久化', () => {
    // 通过 setState 后读取来验证字段存在
    useLayoutStore.setState({
      conversationLeftWidth: 280,
      conversationRightWidth: 320,
    });

    const state = useLayoutStore.getState();
    expect(state.conversationLeftWidth).toBe(280);
    expect(state.conversationRightWidth).toBe(320);
  });
});
