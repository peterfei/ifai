import React from 'react';
import { AIChat } from '../../components/AIChat/AIChat';

export function ConversationPanel() {
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', position: 'relative' }}>
      <AIChat compact={true} />
    </div>
  );
}
