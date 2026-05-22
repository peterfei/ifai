import React from 'react';
import { AIChat } from '../../components/AIChat/AIChat';

export function ConversationPanel() {
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <AIChat compact={true} />
    </div>
  );
}
