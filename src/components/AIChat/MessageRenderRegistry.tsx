/**
 * 消息渲染注册表
 *
 * 将 MessageItem 中的复杂条件分支转移到声明式注册表
 * 每个消息类型对应一个渲染器，通过 MessageKind 分发
 *
 * @version 1.0.0
 */

import React from 'react';
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
    <div className="max-w-[85%] rounded-2xl p-4 bg-blue-600 text-white shadow-lg ml-auto">
      <div className="whitespace-pre-wrap break-words">{content}</div>
    </div>
  );
};

/**
 * 助手文本消息渲染器
 */
export const AssistantTextRenderer: MessageRendererComponent = ({ message, context, isStreaming }) => {
  const { thinkingText, contentWithoutThinking } = extractThinkingContent(message);

  // 这里需要导入实际的 MarkdownRenderer 组件
  // 为了简化，暂时使用简单的文本渲染
  return (
    <div className="w-full rounded-2xl p-4 bg-[#252526] text-gray-200 border border-gray-700/50 shadow-sm">
      {thinkingText && (
        <div className="mb-3 text-xs text-gray-500 italic">
          Thinking: {thinkingText}
        </div>
      )}
      <div className="whitespace-pre-wrap break-words">{contentWithoutThinking}</div>
    </div>
  );
};

/**
 * 助手工具消息渲染器
 */
export const AssistantToolRenderer: MessageRendererComponent = ({ message, context, onApprove, onReject }) => {
  const { thinkingText, contentWithoutThinking } = extractThinkingContent(message);

  return (
    <div className="w-full rounded-2xl p-4 bg-[#252526] text-gray-200 border border-gray-700/50 shadow-sm">
      {thinkingText && (
        <div className="mb-3 text-xs text-gray-500 italic">
          Thinking: {thinkingText}
        </div>
      )}

      {/* 工具调用渲染 */}
      {message.toolCalls && message.toolCalls.map((toolCall) => (
        <div key={toolCall.id} className="mb-2 p-2 bg-[#1e1e1e] rounded border border-gray-700">
          <div className="text-xs font-mono text-gray-400">
            {toolCall.function?.name || (toolCall as any).toolName || 'unknown'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Status: {toolCall.status || 'unknown'}
          </div>
        </div>
      ))}

      {contentWithoutThinking && (
        <div className="whitespace-pre-wrap break-words mt-2">{contentWithoutThinking}</div>
      )}
    </div>
  );
};

/**
 * 探索消息渲染器
 */
export const ExploreMessageRenderer: MessageRendererComponent = ({ message, context }) => {
  const exploreProgress = (message as any).exploreProgress;

  return (
    <div className="w-full rounded-2xl p-4 bg-[#252526] text-gray-200 border border-gray-700/50 shadow-sm">
      <div className="text-sm font-medium text-gray-400 mb-2">探索项目</div>
      {exploreProgress && (
        <div className="text-xs text-gray-500">
          扫描了 {exploreProgress.fileCount || 0} 个文件
        </div>
      )}
    </div>
  );
};

/**
 * 任务拆解消息渲染器
 */
export const TaskBreakdownRenderer: MessageRendererComponent = ({ message, context }) => {
  // 这里需要导入 TaskBreakdownViewer 组件
  return (
    <div className="w-full rounded-2xl p-4 bg-[#252526] text-gray-200 border border-gray-700/50 shadow-sm">
      <div className="text-sm text-gray-400">任务拆解</div>
    </div>
  );
};

/**
 * 多模态消息渲染器
 */
export const MultimodalMessageRenderer: MessageRendererComponent = ({ message, context, isStreaming }) => {
  const parts = message.multiModalContent || [];

  return (
    <div className="w-full rounded-2xl p-4 bg-[#252526] text-gray-200 border border-gray-700/50 shadow-sm">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <div key={index} className="whitespace-pre-wrap break-words">
              {part.text}
            </div>
          );
        }
        if (part.type === 'image_url') {
          return (
            <img
              key={index}
              src={part.image_url?.url}
              alt="Uploaded"
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
  const content = typeof message.content === 'string' ? message.content : '';

  return (
    <div className="w-full rounded-lg p-3 bg-yellow-900/20 border border-yellow-700/50 text-yellow-200 text-sm">
      <div className="font-medium mb-1">系统消息</div>
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
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

  return (
    <div className="w-full rounded-2xl p-4 bg-gray-800/50 border border-gray-700 text-gray-400 text-sm">
      <div className="mb-2 text-gray-500">未知消息类型: {message.role}</div>
      <div className="whitespace-pre-wrap break-words">{content}</div>
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
