/**
 * 消息渲染注册表
 *
 * 将 MessageItem 中的复杂条件分支转移到声明式注册表
 * 每个消息类型对应一个渲染器，通过 MessageKind 分发
 *
 * @version 1.0.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Message, ContentPart, ContentSegment } from '../../stores/useChatStore';
import {
  MessageKind,
  MessageRenderContext,
  resolveMessageKind,
  buildMessageRenderContext,
  extractThinkingContent,
  shouldHideMessageBubble,
} from './messageRendering';

// ============================================
// 渲染器 Props
// ============================================

export interface MessageRendererProps {
  message: Message;
  isStreaming: boolean;
  context: MessageRenderContext;
  // 通用回调
  onApprove: (messageId: string, toolCallId: string) => void;
  onReject: (messageId: string, toolCallId: string) => void;
  onOpenFile: (path: string) => Promise<void>;
  onOpenComposer?: (messageId: string) => void;
}

// ============================================
// 渲染器类型
// ============================================

export type MessageRendererComponent = React.FC<MessageRendererProps>;

// ============================================
// 渲染器注册表
// ============================================

interface MessageRendererRegistry {
  [kind: string]: MessageRendererComponent;
}

// ============================================
// 通用渲染组件
// ============================================

/**
 * 用户消息渲染器
 */
export const UserMessageRenderer: MessageRendererComponent = ({ message, context }) => {
  const content = typeof message.content === 'string' ? message.content : '';

  return (
    <div className="max-w-[85%] rounded-2xl p-4 bg-[var(--accent-color)] text-white shadow-lg ml-auto">
      <div className="whitespace-pre-wrap break-words">{content}</div>
    </div>
  );
};

/**
 * 助手文本消息渲染器
 */
export const AssistantTextRenderer: MessageRendererComponent = ({ message, context, isStreaming }) => {
  const { t } = useTranslation();
  const { thinkingText, contentWithoutThinking } = extractThinkingContent(message);

  // 这里需要导入实际的 MarkdownRenderer 组件
  // 为了简化，暂时使用简单的文本渲染
  return (
    <div className="theme-panel-muted theme-border w-full rounded-2xl border p-4 shadow-sm">
      {thinkingText && (
        <div className="theme-text-subtle mb-3 text-xs italic">
          {t('aiChat.messageRegistry.thinking')}: {thinkingText}
        </div>
      )}
      <div className="theme-text whitespace-pre-wrap break-words">{contentWithoutThinking}</div>
    </div>
  );
};

/**
 * 助手工具消息渲染器
 */
export const AssistantToolRenderer: MessageRendererComponent = ({ message, context, onApprove, onReject }) => {
  const { t } = useTranslation();
  const { thinkingText, contentWithoutThinking } = extractThinkingContent(message);

  return (
    <div className="theme-panel-muted theme-border w-full rounded-2xl border p-4 shadow-sm">
      {thinkingText && (
        <div className="theme-text-subtle mb-3 text-xs italic">
          {t('aiChat.messageRegistry.thinking')}: {thinkingText}
        </div>
      )}

      {/* 工具调用渲染 */}
      {message.toolCalls && message.toolCalls.map((toolCall) => (
        <div key={toolCall.id} className="theme-code-surface theme-border mb-2 rounded border p-2">
          <div className="theme-text-muted text-xs font-mono">
            {toolCall.function?.name || (toolCall as any).toolName || 'unknown'}
          </div>
          <div className="theme-text-subtle mt-1 text-xs">
            {t('aiChat.messageRegistry.status')}: {toolCall.status || t('aiChat.toolExecution.status.unknown')}
          </div>
        </div>
      ))}

      {contentWithoutThinking && (
        <div className="theme-text mt-2 whitespace-pre-wrap break-words">{contentWithoutThinking}</div>
      )}
    </div>
  );
};

/**
 * 探索消息渲染器
 */
export const ExploreMessageRenderer: MessageRendererComponent = ({ message, context }) => {
  const { t } = useTranslation();
  const exploreProgress = (message as any).exploreProgress;

  return (
    <div className="theme-panel-muted theme-border w-full rounded-2xl border p-4 shadow-sm">
      <div className="theme-text-muted mb-2 text-sm font-medium">{t('aiChat.messageRegistry.exploreProject')}</div>
      {exploreProgress && (
        <div className="theme-text-subtle text-xs">
          {t('aiChat.messageRegistry.scannedFiles', { count: exploreProgress.fileCount || 0 })}
        </div>
      )}
    </div>
  );
};

/**
 * 任务拆解消息渲染器
 */
export const TaskBreakdownRenderer: MessageRendererComponent = ({ message, context }) => {
  const { t } = useTranslation();
  // 这里需要导入 TaskBreakdownViewer 组件
  return (
    <div className="theme-panel-muted theme-border w-full rounded-2xl border p-4 shadow-sm">
      <div className="theme-text-muted text-sm">{t('aiChat.messageRegistry.taskBreakdown')}</div>
    </div>
  );
};

/**
 * 多模态消息渲染器
 */
export const MultimodalMessageRenderer: MessageRendererComponent = ({ message, context, isStreaming }) => {
  const { t } = useTranslation();
  const parts = message.multiModalContent || [];

  return (
    <div className="theme-panel-muted theme-border w-full rounded-2xl border p-4 shadow-sm">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <div key={index} className="theme-text whitespace-pre-wrap break-words">
              {part.text}
            </div>
          );
        }
        if (part.type === 'image_url') {
          return (
            <img
              key={index}
              src={part.image_url?.url}
              alt={t('aiChat.messageRegistry.uploadedImage')}
              className="max-w-full h-auto rounded"
            />
          );
        }
        return null;
      })}
    </div>
  );
};

/**
 * 系统消息渲染器
 */
export const SystemMessageRenderer: MessageRendererComponent = ({ message }) => {
  const { t } = useTranslation();
  const content = typeof message.content === 'string' ? message.content : '';

  return (
    <div className="w-full rounded-lg border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3 text-sm text-[var(--warning-color)]">
      <div className="mb-1 font-medium">{t('aiChat.messageRegistry.systemMessage')}</div>
      <div className="whitespace-pre-wrap break-words">{content}</div>
    </div>
  );
};

/**
 * 工具消息渲染器（通常隐藏）
 */
export const ToolMessageRenderer: MessageRendererComponent = ({ message }) => {
  // 工具消息通常不直接渲染，内容已同步到 assistant 消息
  return null;
};

/**
 * 未知类型渲染器
 */
export const UnknownMessageRenderer: MessageRendererComponent = ({ message }) => {
  const { t } = useTranslation();
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

  return (
    <div className="theme-panel-muted theme-border w-full rounded-2xl border p-4 text-sm">
      <div className="theme-text-subtle mb-2">{t('aiChat.messageRegistry.unknownMessageType', { role: message.role })}</div>
      <div className="theme-text whitespace-pre-wrap break-words">{content}</div>
    </div>
  );
};

// ============================================
// 注册表实例
// ============================================

/**
 * 默认消息渲染注册表
 */
export const DEFAULT_MESSAGE_RENDER_REGISTRY: MessageRendererRegistry = {
  'user': UserMessageRenderer,
  'assistant-text': AssistantTextRenderer,
  'assistant-tool': AssistantToolRenderer,
  'assistant-explore': ExploreMessageRenderer,
  'assistant-task-breakdown': TaskBreakdownRenderer,
  'assistant-multimodal': MultimodalMessageRenderer,
  'system': SystemMessageRenderer,
  'tool': ToolMessageRenderer,
  'unknown': UnknownMessageRenderer,
};

// ============================================
// 消息外壳组件
// ============================================

export interface MessageShellProps {
  message: Message;
  isStreaming?: boolean;
  onApprove: (messageId: string, toolCallId: string) => void;
  onReject: (messageId: string, toolCallId: string) => void;
  onOpenFile: (path: string) => Promise<void>;
  onOpenComposer?: (messageId: string) => void;
  registry?: MessageRendererRegistry;
}

/**
 * 消息外壳组件
 *
 * 负责解析消息种类并分发到对应的渲染器
 * 提供稳定的渲染边界，减少不必要的重渲染
 */
export const MessageShell: React.FC<MessageShellProps> = React.memo(({
  message,
  isStreaming = false,
  onApprove,
  onReject,
  onOpenFile,
  onOpenComposer,
  registry = DEFAULT_MESSAGE_RENDER_REGISTRY,
}) => {
  // 构建渲染上下文
  const context = React.useMemo(
    () => buildMessageRenderContext(message, isStreaming),
    [message, isStreaming]
  );

  // 解析消息种类
  const kind = React.useMemo(
    () => resolveMessageKind(message, context),
    [message, context]
  );

  // 检查是否应该隐藏气泡
  const shouldHide = React.useMemo(
    () => shouldHideMessageBubble(context),
    [context]
  );

  // 如果应该隐藏，返回 null
  if (shouldHide) {
    return null;
  }

  // 获取对应的渲染器
  const Renderer = registry[kind] || registry['unknown'];

  // 渲染消息内容
  return (
    <Renderer
      message={message}
      isStreaming={isStreaming}
      context={context}
      onApprove={onApprove}
      onReject={onReject}
      onOpenFile={onOpenFile}
      onOpenComposer={onOpenComposer}
    />
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，优化重渲染
  return (
    prevProps.message === nextProps.message &&
    prevProps.isStreaming === nextProps.isStreaming
  );
});

MessageShell.displayName = 'MessageShell';
