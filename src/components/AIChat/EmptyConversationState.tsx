/**
 * EmptyConversationState — 空对话占位组件
 *
 * compact 模式下无消息时显示居中提示
 */

import React from 'react';

export function EmptyConversationState() {
  return (
    <div
      data-testid="empty-state"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div data-testid="empty-state-text" style={{ textAlign: 'center', color: '#9CA3AF' }}>
        <p style={{ fontSize: 14 }}>开始新对话</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>在下方输入框输入消息</p>
      </div>
    </div>
  );
}
