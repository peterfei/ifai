/**
 * 消息渲染系统 - 解析和注册表
 *
 * 将 MessageItem 中的复杂条件分支拆分为：
 * 1. 消息种类解析函数 resolveMessageKind
 * 2. 消息渲染注册表 messageRenderRegistry
 *
 * @version 1.0.0
 */

import type { Message, ContentSegment } from '../../stores/useChatStore';

// ============================================
// 类型定义
// ============================================

/**
 * 消息种类
 */
export type MessageKind =
  | 'user'                    // 用户消息
  | 'assistant-text'          // 纯文本助手消息
  | 'assistant-tool'          // 包含工具调用的助手消息
  | 'assistant-explore'       // 探索消息（包含 exploreProgress）
  | 'assistant-task-breakdown' // 任务拆解消息
  | 'assistant-multimodal'    // 多模态消息（包含图片）
  | 'system'                  // 系统消息
  | 'tool'                    // 工具消息（通常隐藏）
  | 'unknown';                // 未知类型

/**
 * 消息渲染上下文
 */
export interface MessageRenderContext {
  message: Message;
  isStreaming: boolean;
  hasVisibleContent: boolean;
  hasToolCalls: boolean;
  isVibeMode: boolean;
  isExploreMessage: boolean;
  hasProjectScanData: boolean;
  taskBreakdown: any;
}

/**
 * 消息渲染器组件
 */
export interface MessageRenderer {
  (context: MessageRenderContext): React.ReactNode;
}

// ============================================
// 消息种类解析
// ============================================

/**
 * 解析消息种类
 * 根据 message 的 role、content、toolCalls 等属性判断消息类型
 */
export function resolveMessageKind(message: Message, context: Partial<MessageRenderContext> = {}): MessageKind {
  const { role, content, toolCalls } = message;

  // 1. 用户消息
  if (role === 'user') {
    return 'user';
  }

  // 2. 系统消息
  if (role === 'system') {
    return 'system';
  }

  // 3. 工具消息
  if (role === 'tool') {
    return 'tool';
  }

  // 4. 助理消息分类
  if (role === 'assistant') {
    // 探索消息
    if (context.isExploreMessage) {
      return 'assistant-explore';
    }

    // 任务拆解消息
    if (context.taskBreakdown) {
      return 'assistant-task-breakdown';
    }

    // 多模态消息
    if (Array.isArray(content) && content.some((part: any) => part.type === 'image_url')) {
      return 'assistant-multimodal';
    }

    // 包含工具调用的消息
    if (toolCalls && toolCalls.length > 0) {
      return 'assistant-tool';
    }

    // 纯文本消息
    return 'assistant-text';
  }

  return 'unknown';
}

/**
 * 判断消息是否应该隐藏气泡
 */
export function shouldHideMessageBubble(context: MessageRenderContext): boolean {
  const {
    message,
    isStreaming,
    hasVisibleContent,
    hasToolCalls,
    isVibeMode,
    isExploreMessage,
    hasProjectScanData,
  } = context;

  // 计算待处理的工具调用数量
  const pendingCount = message.toolCalls?.filter(
    tc => tc.status === 'pending' && !tc.isPartial
  ).length || 0;

  // 检测是否是冗余引导语（Vibe 模式）
  const isRedundantIntro = isVibeMode && !hasToolCalls && hasVisibleContent;

  // 隐藏条件：
  // 1. 有 pending 的工具调用，必须显示气泡（用户需要批准/拒绝）
  // 2. 如果没有可见内容但有工具调用，且所有工具调用都已完成，隐藏 (交给聚合卡片)
  // 3. 如果是 Vibe 模式下的冗余引导语，隐藏
  // 4. 如果是工具角色的消息且已经是探索结果，隐藏 (数据已同步到助理消息的树 UI)
  // 5. 如果是工具角色的消息且内容包含项目扫描数据，隐藏原始 JSON (交给 ToolApproval 渲染)
  return (
    (pendingCount === 0 && message.role !== 'user' && !hasVisibleContent && hasToolCalls) ||
    isRedundantIntro ||
    (message.role === 'tool' && isExploreMessage) ||
    (message.role === 'tool' && hasProjectScanData)
  );
}

/**
 * 解析消息的渲染内容（分段）
 */
export function resolveMessageSegments(
  context: MessageRenderContext
): ContentSegment[] | null {
  const { message } = context;

  // 🏆 优先使用 message.segments (新逻辑)
  if (message.segments && message.segments.length > 0) {
    return message.segments.map(s => ({
      ...s,
      phase: s.phase || 'pre-tool'
    }));
  }

  // Fallback: 使用旧的 contentSegments
  if (message.contentSegments && message.contentSegments.length > 0) {
    return message.contentSegments;
  }

  return null;
}

// ============================================
// 消息元数据提取
// ============================================

/**
 * 提取消息的思考内容
 */
export function extractThinkingContent(message: Message): { thinkingText: string | null; contentWithoutThinking: string } {
  const content = typeof message.content === 'string' ? message.content : '';

  const thinkingMatch = content.match(/^_\(([^)]+)\)_/);
  if (thinkingMatch) {
    return {
      thinkingText: thinkingMatch[1],
      contentWithoutThinking: content.replace(/^_\([^)]+\)_\s*/, '')
    };
  }

  return { thinkingText: null, contentWithoutThinking: content };
}

/**
 * 检测消息是否有文件变更（用于 Composer）
 */
export function hasFileChanges(message: Message): boolean {
  if (!message.toolCalls) return false;

  return message.toolCalls.some(tc => {
    const toolName = (tc as any).function?.name || (tc as any).toolName || (tc as any).tool || '';
    const result = tc.result;

    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        return toolName === 'agent_write_file' && parsed.success;
      } catch {
        return false;
      }
    }

    return toolName === 'agent_write_file' && (result as any)?.success;
  });
}

/**
 * 检测消息是否有可回滚的文件
 */
export function hasRollbackableFiles(message: Message): boolean {
  if (!message.toolCalls) return false;

  return message.toolCalls.some(tc => {
    if (tc.tool !== 'agent_write_file') return false;
    if (tc.status !== 'completed') return false;

    const result = tc.result;
    if (!result) return false;

    try {
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      return data.originalContent !== undefined || data.original_content !== undefined;
    } catch {
      return false;
    }
  });
}

// ============================================
// 消息渲染上下文构建
// ============================================

/**
 * 构建消息渲染上下文
 */
export function buildMessageRenderContext(
  message: Message,
  isStreaming: boolean,
  additionalContext: Partial<MessageRenderContext> = {}
): MessageRenderContext {
  // 基础检测
  const hasVisibleContent = (() => {
    if (!message.content) return false;
    if (typeof message.content === 'string') {
      return message.content.trim().length > 0;
    }
    // 修复类型推断 - 显式类型断言
    const contentArray = message.content as any[];
    if (Array.isArray(contentArray)) {
      return contentArray.some((part: any) =>
        (part.type === 'text' && part.text?.trim().length > 0) ||
        part.type === 'image_url'
      );
    }
    return false;
  })();

  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  // Vibe 模式检测
  const isVibeMode = (window as any).__IFAI_EDITOR_MODE__ === 'vibe';

  // 探索消息检测
  const isExploreMessage = !!(message as any).exploreProgress;

  // 项目扫描数据检测
  const hasProjectScanData = message.role === 'tool' &&
    message.content &&
    typeof message.content === 'string' &&
    message.content.includes('structure');

  // 任务拆解检测（需要导入 detectTaskBreakdown）
  // 这里暂时设为 null，调用方可以提供
  const taskBreakdown = additionalContext.taskBreakdown || null;

  return {
    message,
    isStreaming,
    hasVisibleContent,
    hasToolCalls,
    isVibeMode,
    isExploreMessage,
    hasProjectScanData,
    taskBreakdown,
    ...additionalContext,
  };
}
