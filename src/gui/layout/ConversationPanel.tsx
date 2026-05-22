import React from 'react';
import { AIChat } from '../../components/AIChat/AIChat';
import { CardPreviewPanel } from '../conversation/CardPreviewPanel';

export function ConversationPanel() {
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', position: 'relative' }}>
      <AIChat compact={true} />
      <CardPreviewPanel />
    </div>
  );
}
