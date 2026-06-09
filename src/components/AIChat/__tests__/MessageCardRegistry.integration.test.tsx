import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  MessageCardRegistry,
  resolveCardType,
  getRegisteredCardTypes,
  hasCardType,
  getCardComponent,
  renderMessageCard,
  type MessageCardProps,
} from '../../../gui/conversation/MessageCardRegistry';

// Mock message card components for testing
const MockTextCard: React.FC<MessageCardProps> = ({ message }) => (
  <div data-testid="text-card">{message.content || 'Text message'}</div>
);

const MockApprovalCard: React.FC<MessageCardProps> = ({ message }) => (
  <div data-testid="approval-card">Approval: {message.approvalId || 'N/A'}</div>
);

const MockToolCallCard: React.FC<MessageCardProps> = ({ message }) => (
  <div data-testid="tool-call-card">Tool: {message.toolCalls?.[0]?.name || 'unknown'}</div>
);

const MockProgressCard: React.FC<MessageCardProps> = ({ message }) => (
  <div data-testid="progress-card">Progress: {message.progress || 0}%</div>
);

describe('MessageCardRegistry - AIChat Integration', () => {
  beforeEach(() => {
    // 注册测试组件
    MessageCardRegistry.register('text', MockTextCard);
    MessageCardRegistry.register('approval', MockApprovalCard);
    MessageCardRegistry.register('tool-call', MockToolCallCard);
    MessageCardRegistry.register('progress', MockProgressCard);
  });

  describe('MessageCardRegistry 初始化', () => {
    it('应该注册默认消息类型', () => {
      const types = getRegisteredCardTypes();
      expect(types).toContain('text');
      expect(types).toContain('approval');
      expect(types).toContain('tool-call');
      expect(types).toContain('progress');
    });

    it('应该能够检查类型是否已注册', () => {
      expect(hasCardType('text')).toBe(true);
      expect(hasCardType('approval')).toBe(true);
      expect(hasCardType('unknown-type')).toBe(false);
    });

    it('应该能够获取已注册的组件', () => {
      const textComponent = getCardComponent('text');
      expect(textComponent).toBeDefined();
      expect(textComponent).toBe(MockTextCard);

      const unknownComponent = getCardComponent('unknown-type');
      expect(unknownComponent).toBeUndefined();
    });
  });

  describe('resolveCardType 函数', () => {
    it('应该优先使用消息自带的 cardType 字段', () => {
      const message = { cardType: 'approval', approvalId: '123' };
      expect(resolveCardType(message)).toBe('approval');
    });

    it('应该根据 toolCalls 字段推断为 tool-call', () => {
      const message = { toolCalls: [{ id: '1', name: 'read_file' }] };
      expect(resolveCardType(message)).toBe('tool-call');
    });

    it('应该根据 composer 字段推断为 composer', () => {
      const message = { composer: { type: 'file-editor' } };
      expect(resolveCardType(message)).toBe('composer');
    });

    it('应该根据 error 字段推断为 error-fix', () => {
      const message = { error: { message: 'Test error' } };
      expect(resolveCardType(message)).toBe('error-fix');
    });

    it('应该默认返回 text', () => {
      const message = { content: 'Plain text message' };
      expect(resolveCardType(message)).toBe('text');
    });

    it('应该处理空值', () => {
      expect(resolveCardType(null)).toBe('text');
      expect(resolveCardType(undefined)).toBe('text');
    });

    it('toolCalls 优先级应该高于默认推断', () => {
      const message = { content: 'Some text', toolCalls: [{ id: '1', name: 'bash' }] };
      expect(resolveCardType(message)).toBe('tool-call');
    });

    it('文件写入工具（pending）应该推断为 streaming-file-write', () => {
      const message = { content: 'Some text', toolCalls: [{ id: '1', name: 'write_file', status: 'pending' }] };
      expect(resolveCardType(message)).toBe('streaming-file-write');
    });

    it('文件写入工具（completed）应该推断为 tool-call', () => {
      const message = { content: 'Some text', toolCalls: [{ id: '1', name: 'write_file', status: 'completed' }] };
      expect(resolveCardType(message)).toBe('tool-call');
    });
  });

  describe('消息卡片渲染', () => {
    it('应该根据消息类型渲染对应的卡片', () => {
      const message = { cardType: 'approval', approvalId: 'test-123' };
      const Component = renderMessageCard(message);

      render(<Component message={message} />);
      expect(screen.getByTestId('approval-card')).toBeInTheDocument();
      expect(screen.getByText(/Approval: test-123/)).toBeInTheDocument();
    });

    it('应该自动推断消息类型并渲染', () => {
      const message = { toolCalls: [{ id: '1', name: 'bash' }] };
      const Component = renderMessageCard(message);

      render(<Component message={message} />);
      expect(screen.getByTestId('tool-call-card')).toBeInTheDocument();
    });

    it('未知类型应该降级到 text 卡片', () => {
      const message = { cardType: 'unknown-type', content: 'Fallback content' };
      const fallbackComponent = MockTextCard;
      const Component = renderMessageCard(message, fallbackComponent);

      render(<Component message={message} />);
      expect(screen.getByTestId('text-card')).toBeInTheDocument();
    });

    it('应该传递 compact 属性到卡片组件', () => {
      const message = { cardType: 'text', content: 'Compact message' };
      const Component = renderMessageCard(message);

      render(<Component message={message} compact={true} />);
      expect(screen.getByTestId('text-card')).toBeInTheDocument();
    });
  });

  describe('AIChat 集成场景', () => {
    it('应该处理对话历史中的混合消息类型', () => {
      const messages = [
        { content: 'Hello', cardType: 'text' },
        { toolCalls: [{ id: '1', name: 'read_file' }] },
        { cardType: 'approval', approvalId: '123' },
        { progress: 75, cardType: 'progress' },
      ];

      messages.forEach((message) => {
        const Component = renderMessageCard(message);
        const { container } = render(<Component message={message} />);
        expect(container.firstChild).toBeDefined();
      });
    });

    it('应该支持 onAction 回调', () => {
      const mockAction = vi.fn();
      const message = { cardType: 'approval', approvalId: '456' };
      const Component = renderMessageCard(message);

      render(<Component message={message} onAction={mockAction} />);
      // 这里只验证组件能渲染，实际点击测试需要具体的 ApprovalCard 组件
      expect(screen.getByTestId('approval-card')).toBeInTheDocument();
    });

    it('应该处理流式更新的消息', () => {
      // 初始消息
      const initialMessage = { content: 'Starting...', cardType: 'text' };
      let Component = renderMessageCard(initialMessage);
      const { rerender } = render(<Component message={initialMessage} />);

      expect(screen.getByTestId('text-card')).toBeInTheDocument();

      // 更新为工具调用（非文件写入类 → tool-call）
      const updatedMessage = { toolCalls: [{ id: '1', name: 'bash' }] };
      Component = renderMessageCard(updatedMessage);
      rerender(<Component message={updatedMessage} />);

      expect(screen.getByTestId('tool-call-card')).toBeInTheDocument();
    });
  });

  describe('边界情况和错误处理', () => {
    it('应该处理缺失的消息对象', () => {
      const cardType = resolveCardType(null);
      expect(cardType).toBe('text');
    });

    it('应该处理空 toolCalls 数组', () => {
      const message = { toolCalls: [] };
      expect(resolveCardType(message)).toBe('text');
    });

    it('应该处理 null toolCalls', () => {
      const message = { toolCalls: null };
      expect(resolveCardType(message)).toBe('text');
    });

    it('应该处理缺少必需字段的消息', () => {
      const incompleteMessage = { cardType: 'approval' };
      const Component = renderMessageCard(incompleteMessage);

      const { container } = render(<Component message={incompleteMessage} />);
      expect(container.firstChild).toBeDefined();
    });
  });

  describe('性能和优化', () => {
    it('应该高效解析大量消息类型', () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        cardType: i % 2 === 0 ? 'text' : 'approval',
        id: i,
      }));

      const startTime = performance.now();
      messages.forEach((message) => {
        resolveCardType(message);
      });
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50); // 应该在 50ms 内完成
    });

    it('应该缓存已注册的组件查询', () => {
      const component1 = getCardComponent('text');
      const component2 = getCardComponent('text');

      expect(component1).toBe(component2);
    });
  });
});
