// Wrapper for core library useChatStore
// Handles dependency injection of file and settings stores

import { useChatStore as coreUseChatStore, registerStores, type Message } from 'ifainew-core';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';
import { useAgentStore } from './agentStore';
import { useThreadStore } from './threadStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { recognizeIntent, shouldTriggerAgent, formatAgentName } from '../utils/intentRecognizer';
import { autoSaveThread } from './persistence/threadPersistence';
import { countMessagesTokens, getModelMaxTokens, calculateTokenUsagePercentage } from '../utils/tokenCounter';
import i18n from '../i18n/config';

// Content segment interface for tracking stream reception order
export interface ContentSegment {
  type: 'text' | 'tool';
  order: number;
  timestamp: number;
  content?: string;
  toolCallId?: string;  // Reference to toolCall by ID
  startPos?: number;    // Character position in full content (for precise tool interleaving)
  endPos?: number;      // End position in full content
}

// ============================================================================
// Thread-Aware Message Management
// ============================================================================

/**
 * Per-thread message storage.
 * Messages are stored per thread to enable quick switching between threads.
 * The core store's messages array is updated when switching threads.
 */
const threadMessages: Map<string, Message[]> = new Map();

/**
 * Get messages for a specific thread
 */
export function getThreadMessages(threadId: string): Message[] {
  return threadMessages.get(threadId) || [];
}

/**
 * Set messages for a specific thread
 */
export function setThreadMessages(threadId: string, messages: Message[]): void {
  threadMessages.set(threadId, messages);
  // Trigger auto-save
  autoSaveThread(threadId);
}

/**
 * Clear all thread messages (for testing/reset)
 */
export function clearThreadMessages(): void {
  threadMessages.clear();
}

/**
 * Generate thread title from message content
 */
function generateTitleFromMessage(content: string | any[]): string {
  let textContent = '';

  if (typeof content === 'string') {
    textContent = content;
  } else if (Array.isArray(content)) {
    textContent = content
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join(' ');
  }

  // Take first 30 characters as title
  const maxLength = 30;
  if (textContent.length > maxLength) {
    return textContent.slice(0, maxLength) + '...';
  }
  return textContent || '新对话';
}

/**
 * Switch to a different thread
 * Saves current messages to thread and loads the target thread's messages
 */
export function switchThread(threadId: string): void {
  const threadStore = useThreadStore.getState();
  const currentThreadId = threadStore.activeThreadId;

  // Save current thread messages before switching
  if (currentThreadId) {
    const currentMessages = coreUseChatStore.getState().messages;
    setThreadMessages(currentThreadId, [...currentMessages]);
  }

  // Switch to target thread
  threadStore.switchThread(threadId);

  // Load target thread messages
  const targetMessages = getThreadMessages(threadId);
  coreUseChatStore.setState({ messages: [...targetMessages] });

  console.log(`[Thread] Switched from ${currentThreadId} to ${threadId}, loaded ${targetMessages.length} messages`);
}

// Register stores on first import
// Pass getState functions so core library can access current state
registerStores(useFileStore.getState, useSettingsStore.getState);

// --- Monkey-patching Core Store ---
// Fixes for API errors and UI updates that reside in the core library

// =============================================================================
// Frontend Wrapper - Message Sanitization Removed
// =============================================================================
// Message sanitization is now handled authoritatively in the Rust backend
// (src-tauri/src/lib.rs in ai_chat function) to ensure consistency and avoid
// duplicate logic. The backend sanitizes messages immediately before sending
// to the AI API, which is the optimal place for this validation.
// =============================================================================

const originalSendMessage = coreUseChatStore.getState().sendMessage;
const originalApproveToolCall = coreUseChatStore.getState().approveToolCall;
const originalRejectToolCall = coreUseChatStore.getState().rejectToolCall;

/**
 * 智能消息上下文选择（支持 Token 限制）
 * 保留系统消息、最近消息、以及包含关键内容（tool_calls、references等）的历史消息
 * v0.2.6 新增：支持基于 Token 的上下文窗口管理
 *
 * @param messages - 所有历史消息
 * @param maxMessages - 最大保留消息数
 * @param model - 模型名称（用于 Token 计算）
 * @param maxTokens - 最大 Token 数（可选）
 * @returns - 过滤后的消息（保持原始顺序）
 */
async function selectMessagesForContext(
    messages: Message[],
    maxMessages: number,
    model?: string,
    maxTokens?: number
): Promise<Message[]> {
    // 1. 如果消息总数小于限制，直接返回
    if (messages.length <= maxMessages) {
        return messages;
    }

    // 2. 为每条消息计算优先级分数
    interface ScoredMessage {
        message: Message;
        score: number;
        index: number;  // 原始索引
        estimatedTokens: number;  // 估算的 Token 数
    }

    // 简单的 Token 估算函数（避免频繁调用后端）
    const estimateTokens = (msg: Message): number => {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        // 英文约 4 字符 = 1 Token，中文约 2 字符 = 1 Token
        const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
        const otherChars = content.length - chineseChars;
        return Math.ceil((chineseChars / 2) + (otherChars / 4));
    };

    const scored: ScoredMessage[] = messages.map((msg, idx) => {
        let score = 0;
        const positionFromEnd = messages.length - 1 - idx;
        const estimatedTokens = estimateTokens(msg);

        // 规则1: 系统消息 - 最高优先级
        if (msg.role === 'system') {
            score = 1000;
        }
        // 规则2: 有 tool_calls 的消息
        else if (msg.toolCalls && msg.toolCalls.length > 0) {
            score = 500;
        }
        // 规则3: Tool 响应消息
        else if (msg.tool_call_id) {
            score = 450;
        }
        // 规则4: 有 RAG references 的消息
        else if ((msg as any).references && (msg as any).references.length > 0) {
            score = 300;
        }
        // 规则5: 用户消息
        else if (msg.role === 'user') {
            score = 100;
        }
        // 规则6: 助手消息
        else if (msg.role === 'assistant') {
            score = 50;
        }

        // 应用时间衰减：越近的消息权重越高
        const decayFactor = Math.pow(1.1, positionFromEnd);
        score = score * decayFactor;

        return { message: msg, score, index: idx, estimatedTokens };
    });

    // 3. 按分数降序排序，取前 maxMessages 条
    scored.sort((a, b) => b.score - a.score);
    let selected = scored.slice(0, maxMessages);

    // 4. 完整性检查：确保 tool_calls 和 tool_call_id 配对
    const selectedIndices = new Set(selected.map(s => s.index));

    // 4a. 检查 tool_calls 是否有对应的响应
    selected.forEach(s => {
        if (s.message.toolCalls && s.message.toolCalls.length > 0) {
            // 找到这条消息之后的所有 tool 响应
            for (let i = s.index + 1; i < messages.length; i++) {
                const responseMsg = messages[i];
                if (responseMsg.tool_call_id) {
                    // 检查这个响应是否属于当前的 tool_calls
                    const belongsToCurrent = s.message.toolCalls?.some(tc => tc.id === responseMsg.tool_call_id);
                    if (belongsToCurrent && !selectedIndices.has(i)) {
                        selectedIndices.add(i);
                        selected.push({
                            message: responseMsg,
                            score: 450,  // tool响应分数
                            index: i,
                            estimatedTokens: estimateTokens(responseMsg)
                        });
                    }
                }
            }
        }
    });

    // 4b. 检查 tool 响应是否有对应的 tool_calls
    selected.forEach(s => {
        if (s.message.tool_call_id) {
            // 向前查找对应的 tool_calls
            for (let i = s.index - 1; i >= 0; i--) {
                const requestMsg = messages[i];
                if (requestMsg.toolCalls && requestMsg.toolCalls.some(tc => tc.id === s.message.tool_call_id)) {
                    if (!selectedIndices.has(i)) {
                        selectedIndices.add(i);
                        selected.push({
                            message: requestMsg,
                            score: 500,  // tool_call分数
                            index: i,
                            estimatedTokens: estimateTokens(requestMsg)
                        });
                    }
                    break;
                }
            }
        }
    });

    // 5. v0.2.6 新增：Token 限制检查（滑动窗口策略）
    if (model && maxTokens) {
        const totalTokens = selected.reduce((sum, s) => sum + s.estimatedTokens, 0);

        if (totalTokens > maxTokens) {
            console.log(`[Context] Token limit exceeded: ${totalTokens} > ${maxTokens}, applying sliding window`);

            // 滑动窗口：保留最近的高优先级消息
            const maxTokenLimit = maxTokens * 0.9;  // 留 10% 余量

            // 按原始索引排序（时间顺序）
            selected.sort((a, b) => a.index - b.index);

            // 从最近的消息开始，向前累加 Token
            const windowSelected: typeof selected = [];
            let currentTokens = 0;

            // 首先保留所有系统消息
            const systemMessages = selected.filter(s => s.message.role === 'system');
            windowSelected.push(...systemMessages);
            currentTokens += systemMessages.reduce((sum, s) => sum + s.estimatedTokens, 0);

            // 然后从最近的消息开始添加
            for (let i = selected.length - 1; i >= 0; i--) {
                const s = selected[i];
                if (s.message.role === 'system') continue;  // 已添加

                if (currentTokens + s.estimatedTokens <= maxTokenLimit) {
                    windowSelected.push(s);
                    currentTokens += s.estimatedTokens;
                } else if (windowSelected.length < systemMessages.length + 3) {
                    // 至少保留系统消息 + 最后 3 条消息
                    windowSelected.push(s);
                    currentTokens += s.estimatedTokens;
                }
            }

            // 按时间顺序重新排序
            windowSelected.sort((a, b) => a.index - b.index);
            selected = windowSelected;

            console.log(`[Context] Sliding window applied: ${selected.length} messages, ~${currentTokens} tokens`);
        }
    }

    // 6. 按原始索引排序，保持时间顺序
    selected.sort((a, b) => a.index - b.index);

    // 7. 返回消息（去重后的）
    return selected.map(s => s.message);
}

const patchedSendMessage = async (content: string | any[], providerId: string, modelName: string) => {
    const callId = crypto.randomUUID().slice(0, 8);
    console.log(`>>> [${callId}] patchedSendMessage called:`, typeof content === 'string' ? content.slice(0, 50) : 'array');

    // Set loading state immediately to provide UI feedback
    coreUseChatStore.setState({ isLoading: true });

    // ========================================================================
    // Thread-Aware Message Management
    // ========================================================================
    const threadStore = useThreadStore.getState();
    let activeThreadId = threadStore.activeThreadId;

    // Create a new thread if none exists
    if (!activeThreadId) {
      activeThreadId = threadStore.createThread();
      console.log(`[Thread] Auto-created thread: ${activeThreadId}`);
    }

    // Load current thread messages into the core store
    const currentThreadMessages = getThreadMessages(activeThreadId);
    if (currentThreadMessages.length > 0) {
      coreUseChatStore.setState({ messages: currentThreadMessages });
    }

    // Get settings at the beginning (needed for both intent recognition and provider config)
    const settings = useSettingsStore.getState();

    // Slash Command Interception
    let textInput = "";
    if (typeof content === 'string') {
        textInput = content.trim();
    } else if (Array.isArray(content)) {
        textInput = content.map(p => p.type === 'text' ? p.text : '').join(' ').trim();
    }

    if (textInput.startsWith('/')) {
        const parts = textInput.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        const supportedAgents = ['/explore', '/review', '/test', '/doc', '/refactor'];

        if (supportedAgents.includes(command)) {
            const agentTypeBase = command.slice(1);
            const agentName = agentTypeBase.charAt(0).toUpperCase() + agentTypeBase.slice(1) + " Agent";
            
            const { addMessage } = coreUseChatStore.getState();
            const userMsgId = crypto.randomUUID();
            
            addMessage({ 
                id: userMsgId, 
                role: 'user', 
                content: textInput,
                multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content
            });

            try {
                const assistantMsgId = crypto.randomUUID();
                addMessage({
                    id: assistantMsgId,
                    role: 'assistant',
                    content: ``,
                    // @ts-ignore - custom property
                    agentId: undefined,
                    isAgentLive: true
                });

                const agentId = await useAgentStore.getState().launchAgent(
                    agentName,
                    args || "No specific task provided",
                    assistantMsgId
                );

                const messages = coreUseChatStore.getState().messages;
                const msg = messages.find(m => m.id === assistantMsgId);
                if (msg) {
                    // @ts-ignore
                    msg.agentId = agentId;
                    coreUseChatStore.setState({ messages: [...messages] });
                }
            } catch (e) {
                addMessage({
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `❌ **Failed to launch agent**\n\nError: ${String(e)}`
                });
            }
            coreUseChatStore.setState({ isLoading: false });
            return;
        }
    }

    // --- Natural Language Intent Recognition ---
    // Check if settings enable natural language agent triggering
    const enableNaturalLanguageTrigger = settings.enableNaturalLanguageAgentTrigger !== false; // Default to true
    const confidenceThreshold = settings.agentTriggerConfidenceThreshold || 0.7;

    if (enableNaturalLanguageTrigger && textInput) {
        const intentResult = recognizeIntent(textInput);

        // Log intent recognition result for debugging
        console.log('[NaturalLanguageTrigger] Intent recognized:', intentResult);

        if (shouldTriggerAgent(intentResult, confidenceThreshold)) {
            const agentType = intentResult.type;
            const agentTypeBase = agentType.slice(1); // Remove '/' prefix

            // 意图类型到 Agent 名称的映射
            // 默认规则：首字母大写 + " Agent"
            // 特殊映射：proposal -> proposal-generator
            const agentNameMap: Record<string, string> = {
                'proposal': 'proposal-generator',
                // 可以添加更多映射
            };

            const agentName = agentNameMap[agentTypeBase] ||
                (agentTypeBase.charAt(0).toUpperCase() + agentTypeBase.slice(1) + " Agent");

            console.log('[NaturalLanguageTrigger] Mapped agent:', {
                intentType: agentType,
                agentTypeBase,
                agentName,
                originalIntent: intentResult
            });

            const args = intentResult.args || textInput;

            const { addMessage } = coreUseChatStore.getState();
            const userMsgId = crypto.randomUUID();

            addMessage({
                id: userMsgId,
                role: 'user',
                content: textInput,
                multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content
            });

            try {
                const assistantMsgId = crypto.randomUUID();
                addMessage({
                    id: assistantMsgId,
                    role: 'assistant',
                    content: `_[自动识别意图: ${formatAgentName(agentType)}，置信度: ${(intentResult.confidence * 100).toFixed(0)}%]_\n\n`,
                    // @ts-ignore - custom property
                    agentId: undefined,
                    isAgentLive: true
                });

                const agentId = await useAgentStore.getState().launchAgent(
                    agentName,
                    args,
                    assistantMsgId
                );

                const messages = coreUseChatStore.getState().messages;
                const msg = messages.find(m => m.id === assistantMsgId);
                if (msg) {
                    // @ts-ignore
                    msg.agentId = agentId;
                    coreUseChatStore.setState({ messages: [...messages] });
                }

                console.log('[NaturalLanguageTrigger] Agent launched successfully:', agentId);
            } catch (e) {
                addMessage({
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `❌ **无法启动Agent**\n\n错误: ${String(e)}`
                });
                console.error('[NaturalLanguageTrigger] Failed to launch agent:', e);
            }
            coreUseChatStore.setState({ isLoading: false });
            return;
        } else if (intentResult && intentResult.confidence > 0.5) {
            // Medium confidence: Log for future improvement
            console.log('[NaturalLanguageTrigger] Medium confidence intent detected but not triggered:', intentResult);
        }
    }

    // --- Local Model Preprocessing (Simple Q&A) ---
    // Check if local model should handle this request
    // Get current messages for preprocessing
    const allCurrentMessages = coreUseChatStore.getState().messages;

    try {
        // Prepare simplified message history for local model (last 10 messages)
        const messagesForLocal = allCurrentMessages.slice(-10).map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        }));

        // Add current user message
        messagesForLocal.push({
            role: 'user',
            content: textInput
        });

        // Add timeout for local model preprocessing (2 seconds)
        // This prevents the UI from hanging if the local model check takes too long
        const preprocessPromise = invoke<any>('local_model_preprocess', {
            messages: messagesForLocal
        });
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Local model preprocess timeout')), 2000)
        );

        const preprocessResult = await Promise.race([preprocessPromise, timeoutPromise]) as any;

        console.log('[LocalModel] Preprocess result:', preprocessResult);

        // If local model can handle this
        if (preprocessResult && preprocessResult.should_use_local) {
            const { addMessage } = coreUseChatStore.getState();

            // Add user message
            const userMsgId = crypto.randomUUID();
            addMessage({
                id: userMsgId,
                role: 'user',
                content: textInput,
                multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content
            });

            // If tool calls were parsed locally
            if (preprocessResult.has_tool_calls && preprocessResult.tool_calls.length > 0) {
                const assistantMsgId = crypto.randomUUID();

                // Convert local tool calls to our format
                const toolCalls = preprocessResult.tool_calls.map((tc: any) => ({
                    id: crypto.randomUUID(),
                    type: 'function' as const,
                    tool: tc.name,
                    args: tc.arguments,
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments)
                    },
                    status: 'pending' as const,
                    isLocalModel: true  // 标记为本地模型执行的工具调用
                }));

                addMessage({
                    id: assistantMsgId,
                    role: 'assistant',
                    content: '',
                    toolCalls
                });

                // Save thread
                const finalMessages = coreUseChatStore.getState().messages;
                const currentThreadId = useThreadStore.getState().activeThreadId;
                if (currentThreadId) {
                    setThreadMessages(currentThreadId, [...finalMessages]);
                }

                // Auto-approve tool calls
                for (const tc of toolCalls) {
                    await coreUseChatStore.getState().approveToolCall(assistantMsgId, tc.id);
                }
                coreUseChatStore.setState({ isLoading: false });
                return;
            }
            // If local response available (simple Q&A)
            else if (preprocessResult.local_response) {
                addMessage({
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `🤖 **本地模型回复**\n\n${preprocessResult.local_response}`
                });

                // Save thread messages
                const finalMessages = coreUseChatStore.getState().messages;
                const currentThreadId = useThreadStore.getState().activeThreadId;
                if (currentThreadId) {
                    setThreadMessages(currentThreadId, [...finalMessages]);
                    useThreadStore.getState().updateThreadTimestamp(currentThreadId);
                    useThreadStore.getState().incrementMessageCount(currentThreadId);
                }
                coreUseChatStore.setState({ isLoading: false });
                return;
            }
        }
    } catch (e) {
        console.log('[LocalModel] Preprocess failed, falling back to cloud:', e);
        // Continue to cloud API
    }

    // --- Direct Backend Invocation Logic ---

    // 1. Prepare Provider Config
    // Note: settings already retrieved above for intent recognition
    const providerData = settings.providers.find((p: any) => p.id === providerId);
    
    const providerConfig = {
        ...providerData,
        provider: providerId, 
        id: providerId,
        api_key: providerData?.apiKey || "",
        base_url: providerData?.baseUrl || "",
        apiKey: providerData?.apiKey || "",
        baseUrl: providerData?.baseUrl || "",
        models: [modelName],
        protocol: providerData?.protocol || "openai"
    };

    coreUseChatStore.setState({ isLoading: true });

    // 2. Add User Message
    // 移除特殊标记（如 [CHAT]、[TASK-EXECUTION]）用于显示，但保留原始 content 用于意图识别
    const displayContent = typeof content === 'string'
        ? content.replace(/^\[(CHAT|TASK-EXECUTION)\]\s*/, '').replace(/\[TASK-EXECUTION\]\s*/g, '')
        : content;

    // 检测是否为任务执行上下文（使用原始 content）
    const autoApproveTools = typeof content === 'string' && content.includes('[TASK-EXECUTION]');

    const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: displayContent,  // 使用清理后的内容显示
        // @ts-ignore - 添加自动审批标志
        autoApproveTools
    };
    // @ts-ignore
    coreUseChatStore.getState().addMessage(userMsg);
    
    // 3. Add Assistant Placeholder
    const assistantMsgId = crypto.randomUUID();
    const assistantMsgPlaceholder = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        // @ts-ignore - custom property for tracking stream order
        contentSegments: [] as ContentSegment[]
    };
    // @ts-ignore
    coreUseChatStore.getState().addMessage(assistantMsgPlaceholder);

    // 4. Prepare History with Smart Context Selection
    const allMessages = coreUseChatStore.getState().messages;
    const assistantPlaceholder = allMessages[allMessages.length - 1];  // 刚添加的占位符

    // 获取上下文配置
    const { maxContextMessages, enableSmartContextSelection, maxContextTokens } = useSettingsStore.getState();

    // 选择要发送的消息
    let messagesToSend: Message[];
    if (enableSmartContextSelection) {
        // v0.2.6 智能选择：支持 Token 限制
        const messagesWithoutPlaceholder = allMessages.slice(0, -1);
        messagesToSend = await selectMessagesForContext(
            messagesWithoutPlaceholder,
            maxContextMessages,
            modelName,  // 模型名称
            maxContextTokens  // Token 限制
        );

        // 调试日志：简化输出避免刷屏
        const selectedSummary = {
            total: messagesToSend.length,
            system: messagesToSend.filter(m => m.role === 'system').length,
            user: messagesToSend.filter(m => m.role === 'user').length,
            assistant: messagesToSend.filter(m => m.role === 'assistant').length,
            tools: messagesToSend.filter(m => m.toolCalls?.length).length,
        };
        console.log(`[Context] Selected ${messagesToSend.length}/${messagesWithoutPlaceholder.length} messages:`, selectedSummary);

        // 强制包含最后一条用户消息（防止被智能选择过滤）
        const userMessages = messagesWithoutPlaceholder.filter(m => m.role === 'user');
        if (userMessages.length > 0) {
            const lastUserMsg = userMessages[userMessages.length - 1];
            if (!messagesToSend.includes(lastUserMsg)) {
                console.log('[Chat Debug] Force-adding last user message that was filtered');
                messagesToSend.push(lastUserMsg);
            }
        }
    } else {
        // 传统模式：发送所有消息
        messagesToSend = allMessages.slice(0, -1);
    }

    // 辅助函数：确保 content 是字符串（处理 ContentPart[]）
    const ensureContentString = (content: any): string => {
        if (Array.isArray(content)) {
            return content.map((part: any) => part.type === 'text' ? part.text : '[image]').join('');
        }
        return content || '';
    };

    // 转换为API格式
    const msgHistory = messagesToSend.map(m => {
        const toolCalls = m.toolCalls
            ? m.toolCalls
                .filter(tc => tc.tool) // 过滤掉没有 tool 名称的
                .map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.tool,
                        arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {})
                    }
                }))
            : undefined;

        // 移除特殊标记（如 [CHAT]、[TASK-EXECUTION]）再发送给 AI
        let content = ensureContentString(m.content);
        // 清理所有内部标记
        content = content.replace(/^\[(CHAT|TASK-EXECUTION)\]\s*/, '');

        return {
            role: m.role,
            content: content,
            tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
            tool_call_id: m.tool_call_id
        };
    });

    // 5. Setup Listeners
    // const { listen } = await import('@tauri-apps/api/event');
    
    // Status Listener
    const unlistenStatus = await listen<string>(`${assistantMsgId}_status`, (event) => {
        const { messages } = coreUseChatStore.getState();
        const lastAssistantMsg = messages.find(m => m.id === assistantMsgId);
        if (lastAssistantMsg) {
            console.log(`[Chat] Status update: ${event.payload}`);
            if (!lastAssistantMsg.content) {
                const updatedMessages = messages.map(m => 
                    m.id === assistantMsgId ? { ...m, content: `_(${event.payload})_ \n\n` } : m
                );
                coreUseChatStore.setState({ messages: updatedMessages });
            }
        }
    });

    // Stream Content Listener - 接收流式消息内容
    const unlistenStream = await listen<string>(assistantMsgId, (event) => {
        const { messages } = coreUseChatStore.getState();
        let textChunk = '';
        let toolCallUpdate: any = null;

        try {
            // Parse JSON format: {"type":"content","content":"文本"}
            const payload = JSON.parse(event.payload);

            if (payload.type === 'content' && payload.content) {
                textChunk = payload.content;
            } else if (payload.type === 'tool_call' && payload.toolCall) {
                // Note: Rust backend sends camelCase "toolCall"
                toolCallUpdate = payload.toolCall;
            } else if (payload.type === 'thinking' || payload.type === 'tool-result' || payload.type === 'done') {
                // 忽略本地模型的内部消息类型，不显示在聊天中
                return;
            }
        } catch (e) {
            // 尝试解析多个拼接的 JSON 对象（边缘情况处理）
            const objects = event.payload.match(/\{[^{}]+\}/g);
            if (objects) {
                // 查找最后一个 type='content' 的对象
                for (let i = objects.length - 1; i >= 0; i--) {
                    try {
                        const obj = JSON.parse(objects[i]);
                        if (obj.type === 'content' && obj.content) {
                            textChunk = obj.content;
                            break;
                        }
                    } catch (e2) {
                        // 忽略解析失败的单个对象
                    }
                }
                // 如果没有找到 content，则不显示任何内容（静默忽略）
            }
        }

        if (textChunk || toolCallUpdate) {
            const updatedMessages = messages.map(m => {
                if (m.id === assistantMsgId) {
                    const newMsg = { ...m };

                    // Initialize contentSegments if not exists
                    // @ts-ignore
                    if (!newMsg.contentSegments) {
                        // @ts-ignore
                        newMsg.contentSegments = [];
                    }

                    if (textChunk) {
                        // Ensure textChunk is a string (prevent [object Object])
                        const safeTextChunk = typeof textChunk === 'string' ? textChunk : JSON.stringify(textChunk);
                        newMsg.content = (newMsg.content || '') + safeTextChunk;

                        // Track text segment in order with character position
                        // @ts-ignore
                        const order = newMsg.contentSegments.length;
                        // Calculate start position (before appending textChunk)
                        const startPos = (newMsg.content || '').length - textChunk.length;
                        // @ts-ignore
                        newMsg.contentSegments.push({
                            type: 'text' as const,
                            order,
                            timestamp: Date.now(),
                            content: textChunk,
                            startPos,  // Track character position for precise tool interleaving
                            endPos: newMsg.content.length
                        });
                    }

                    if (toolCallUpdate) {
                        console.log('[Chat] Received tool_call event:', toolCallUpdate);
                        const toolName = toolCallUpdate.function?.name || toolCallUpdate.tool;
                        console.log('[Chat] Tool name:', toolName);
                        const newArgsChunk = toolCallUpdate.function?.arguments || '';

                        const existingCalls = newMsg.toolCalls || [];
                        const existingIndex = existingCalls.findIndex(tc => tc.id === toolCallUpdate.id);

                        if (existingIndex !== -1) {
                            const existingCall = existingCalls[existingIndex];
                            const updatedCalls = [...existingCalls];

                            // Typewriter effect: concatenate arguments string
                            const updatedArgsString = ((existingCall as any).function?.arguments || '') + newArgsChunk;

                            // Try to parse JSON (handles escaping automatically)
                            let parsedArgs: any;
                            try {
                                parsedArgs = JSON.parse(updatedArgsString);
                                console.log('[Stream] JSON parse success:', parsedArgs);
                            } catch (e) {
                                // Partial JSON: extract fields via regex and manually unescape
                                parsedArgs = { ...existingCall.args }; // Keep previous values

                                // Extract content field with proper unescaping
                                const contentMatch = updatedArgsString.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                                if (contentMatch) {
                                    // Manually unescape JSON string
                                    let content = contentMatch[1];
                                    content = content
                                        .replace(/\\n/g, '\n')
                                        .replace(/\\r/g, '\r')
                                        .replace(/\\t/g, '\t')
                                        .replace(/\\"/g, '"')
                                        .replace(/\\\\/g, '\\');
                                    parsedArgs.content = content;
                                    console.log('[Stream] Regex extracted content (unescaped):', content.substring(0, 50));
                                }

                                // Extract rel_path field
                                const relPathMatch = updatedArgsString.match(/"rel_path"\s*:\s*"([^"]*)"/);
                                if (relPathMatch) {
                                    parsedArgs.rel_path = relPathMatch[1];
                                }
                            }

                            updatedCalls[existingIndex] = {
                                ...existingCall,
                                id: toolCallUpdate.id || existingCall.id,
                                tool: toolName || existingCall.tool,
                                args: parsedArgs,
                                function: {
                                    name: toolName || (existingCall as any).function?.name,
                                    arguments: updatedArgsString
                                },
                                isPartial: true
                            };
                            newMsg.toolCalls = updatedCalls;
                        } else {
                            // New tool call
                            // FILTER: Skip invalid tool names (empty, "unknown", whitespace)
                            // This prevents "unknown" tool calls from cluttering the UI
                            const isValidToolName = toolName &&
                                toolName !== 'unknown' &&
                                toolName.trim().length > 0;

                            if (!isValidToolName) {
                                console.warn(`[useChatStore] Skipping invalid tool call: tool="${toolName}", chunk="${newArgsChunk?.substring(0, 50)}"`);
                                // Skip this tool call, don't add it to the message
                                return newMsg;
                            }

                            let initialArgs: any;
                            try {
                                initialArgs = newArgsChunk ? JSON.parse(newArgsChunk) : {};
                            } catch (e) {
                                initialArgs = {};
                            }

                            const newToolCallId = toolCallUpdate.id || crypto.randomUUID();
                            const newToolCall = {
                                id: newToolCallId,
                                type: 'function' as const,
                                tool: toolName,  // Use toolName directly, no default
                                args: initialArgs,
                                function: {
                                    name: toolName,  // Use toolName directly, no default
                                    arguments: newArgsChunk
                                },
                                status: 'pending' as const,
                                isPartial: true
                            };
                            // @ts-ignore
                            newMsg.toolCalls = [...existingCalls, newToolCall];

                            // Track tool call segment in order
                            // @ts-ignore
                            const order = newMsg.contentSegments.length;
                            // @ts-ignore
                            newMsg.contentSegments.push({
                                type: 'tool' as const,
                                order,
                                timestamp: Date.now(),
                                toolCallId: newToolCallId
                            });
                        }
                    }
                    
                    return newMsg;
                }
                return m;
            });

            coreUseChatStore.setState({ messages: updatedMessages });
        }
    });

    // References Listener (RAG)
    const unlistenRefs = await listen<string[]>("codebase-references", (event) => {
        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m => 
                m.id === userMsg.id ? { ...m, references: event.payload } : m
            )
        }));
    });
    
    // History Compaction Listener (Auto-summarization Fix)
    const unlistenCompacted = await listen<any[]>(`${assistantMsgId}_compacted`, (event) => {
        console.log("[Chat] History compacted event received", event.payload);
        const compactedMessages = event.payload.map(m => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            toolCalls: m.tool_calls, // Note: snake_case from Rust
            tool_call_id: m.tool_call_id
        }));

        // Replace history but keep the currently streaming assistant message
        coreUseChatStore.setState({ messages: [...compactedMessages, assistantMsgPlaceholder] });
    });

    // Finish Listener - Finalize tool calls when streaming completes
    // Increase timeout for local LLMs (Ollama) which may be slower
    const finishTimeout = setTimeout(() => {
        console.warn(`[Chat] WARNING: _finish event timeout for ${assistantMsgId}_finish after 30 seconds`);
        console.warn(`[Chat] This suggests the backend stream did not complete properly`);
        // Timeout: cleanup listeners (but NOT unlistenFinish, so we can still handle late finish events)
        console.log(`[Chat] Cleaning up listeners due to timeout (except finish listener)`);
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
        unlistenError();
        // Note: We intentionally do NOT clean up unlistenFinish here
        // This allows late-arriving finish events to still be processed
    }, 30000);  // Increased to 30 seconds for local LLMs

    const unlistenFinish = await listen<string>(`${assistantMsgId}_finish`, async (event) => {
        clearTimeout(finishTimeout);
        console.log("[Chat] Stream finished event received", event.payload); // Updated log message

        // Finalize all partial tool calls
        const { messages } = coreUseChatStore.getState();
        const updatedMessages = messages.map(m => {
            if (m.id === assistantMsgId && m.toolCalls) {
                return {
                    ...m,
                    toolCalls: m.toolCalls.map(tc => ({
                        ...tc,
                        isPartial: false  // Mark as complete
                    }))
                };
            }
            return m;
        });

        coreUseChatStore.setState({ messages: updatedMessages });

        // Debug: Log tool calls found
        const assistantMsg = updatedMessages.find(m => m.id === assistantMsgId);
        console.log(`[Chat] Assistant message toolCalls:`, assistantMsg?.toolCalls?.length || 0);
        if (assistantMsg?.toolCalls) {
            console.log(`[Chat] Tool calls:`, assistantMsg.toolCalls.map(tc => ({
                id: tc.id,
                tool: tc.tool,
                status: tc.status,
                isPartial: tc.isPartial
            })));
        }

        // ✨ NEW: Auto-approve tool calls (same logic as in patchedSendMessage)
        const settings = useSettingsStore.getState();
        const assistantIndex = updatedMessages.findIndex(m => m.id === assistantMsgId);

        // Find the user message that triggered this assistant message
        let userMessageHasAutoApprove = false;
        if (assistantIndex > 0) {
            for (let i = assistantIndex - 1; i >= 0; i--) {
                if (updatedMessages[i].role === 'user') {
                    userMessageHasAutoApprove = (updatedMessages[i] as any).autoApproveTools === true;
                    console.log(`[Chat] User message autoApproveTools: ${userMessageHasAutoApprove}`);
                    break;
                }
            }
        }

        // Check both global setting and message-level flag
        const shouldAutoApprove = settings.agentAutoApprove || userMessageHasAutoApprove;

        console.log(`[Chat] Auto-approve check: global=${settings.agentAutoApprove}, message=${userMessageHasAutoApprove}, result=${shouldAutoApprove}`);

        if (shouldAutoApprove) {
            const message = updatedMessages.find(m => m.id === assistantMsgId);
            if (message && message.toolCalls) {
                const pendingToolCalls = message.toolCalls.filter(tc => tc.status === 'pending' && !tc.isPartial);
                
                if (pendingToolCalls.length > 0) {
                    console.log(`[Chat] Auto-approving ${pendingToolCalls.length} tool calls from patchedSendMessage`);

                    // 检查是否在自动工具调用循环中（防止无限循环）
                    const { messages } = coreUseChatStore.getState();
                    const recentToolCalls = messages
                        .slice(-5)  // 检查最近 5 条消息
                        .filter(m => m.toolCalls && m.toolCalls.length > 0);

                    // 如果最近有太多工具调用，可能是陷入了循环，停止自动继续
                    if (recentToolCalls.length >= 5) { // v0.2.6: 稍微放宽限制但增加严谨性
                        console.warn(`[Chat] Detected potential tool call loop, stopping auto-continue`);
                        coreUseChatStore.setState({ isLoading: false });
                    } else {
                        // 保持 isLoading 为 true，直到下一个响应生成
                        coreUseChatStore.setState({ isLoading: true });

                        // Execute all tool calls
                        for (const tc of pendingToolCalls) {
                            // @ts-ignore - third parameter not in type definition yet
                            await coreUseChatStore.getState().approveToolCall(assistantMsgId, tc.id, { skipContinue: true });
                        }

                        console.log(`[Chat] All tool calls executed from patchedSendMessage`);

                        // After all tools are executed, continue the conversation
                        const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                        if (providerConfig) {
                            console.log(`[Chat] Continuing conversation after tool execution (scheduled in 300ms)`);

                            // 使用 setTimeout 延迟调用
                            setTimeout(async () => {
                                console.log(`[Chat] Executing delayed continuation`);

                                // 手动清理当前函数的监听器
                                unlistenStatus();
                                unlistenStream();
                                unlistenRefs();
                                unlistenCompacted();
                                unlistenFinish();
                                unlistenError();

                                // Get updated messages with tool results
                                const finalMessages = coreUseChatStore.getState().messages;

                                // Continue the conversation - patchedGenerateResponse will keep isLoading: true
                                await patchedGenerateResponse(
                                    finalMessages,
                                    providerConfig,
                                    { enableTools: true }
                                );
                            }, 300);

                            // 重要：不在这里设置 isLoading: false，也不清理监听器（由延迟任务处理）
                            return;
                        } else {
                            coreUseChatStore.setState({ isLoading: false });
                        }
                    }
                }
            }
        }

        // Cleanup listeners (normal completion)
        console.log(`[Chat] Cleaning up listeners (normal completion)`);
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
        unlistenFinish();
        unlistenError();
        coreUseChatStore.setState({ isLoading: false });
    });

    // Error Listener - Handle stream errors
    const unlistenError = await listen<string>(`${assistantMsgId}_error`, (event) => {
        console.error("[Chat] Stream error", event.payload);

        const { messages } = coreUseChatStore.getState();
        coreUseChatStore.setState({
            messages: messages.map(m =>
                m.id === assistantMsgId ? { ...m, content: `❌ Error: ${event.payload}` } : m
            )
        });

        // Error: cleanup listeners
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
        unlistenFinish();
        unlistenError();
        coreUseChatStore.setState({ isLoading: false });
    });

    // 6. Invoke Backend
    try {
        await invoke('ai_chat', {
            providerConfig,
            messages: msgHistory,
            eventId: assistantMsgId,
            projectRoot: useFileStore.getState().rootPath,
            enableTools: true
        });
    } catch (e) {
        console.error('[Chat] Invoke error:', e);
        const { messages } = coreUseChatStore.getState();
        const errorMsg = e instanceof Error ? e.message : String(e);
        coreUseChatStore.setState({
            messages: messages.map(m => m.id === assistantMsgId ? {
                ...m,
                content: `❌ 发送失败: ${errorMsg}\n\n请检查：\n1. API Key 是否配置正确\n2. 网络连接是否正常\n3. 控制台是否有详细错误信息`
            } : m)
        });

        // Error: cleanup listeners
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
        unlistenFinish();
        unlistenError();
        coreUseChatStore.setState({ isLoading: false });
    }

    // Note: Listener cleanup is now handled in the _finish handler
    // This ensures listeners are not cleaned up before _finish event is received
};

const patchedGenerateResponse = async (history: any[], providerConfig: any, options?: { enableTools?: boolean }) => {
    console.log(">>> patchedGenerateResponse called");
    console.log("[Chat] History length:", history?.length);
    console.log("[Chat] Provider config:", providerConfig?.id);
    console.log("[Chat] Options:", options);

    // Debug: Print message history
    history.forEach((msg: any, i: number) => {
        console.log(`[Chat] History[${i}] role=${msg.role}, hasToolCalls=${!!msg.toolCalls}, toolCallId=${!!msg.tool_call_id}`);
        if (msg.toolCalls) {
            console.log(`[Chat]   toolCalls:`, msg.toolCalls.map((tc: any) => ({ tool: tc.tool, status: tc.status })));
        }
    });

    // 1. Prepare Config (Reuse logic or just use passed config if it's already correct)
    const settings = useSettingsStore.getState();
    const fullProviderConfig = settings.providers.find((p: any) => p.id === providerConfig.id) || providerConfig;
    
    const backendConfig = {
        ...fullProviderConfig,
        provider: fullProviderConfig.id,
        id: fullProviderConfig.id,
        api_key: fullProviderConfig.apiKey || "",
        base_url: fullProviderConfig.baseUrl || "",
        // Ensure we use the current model selected in settings
        models: [settings.currentModel],
        protocol: fullProviderConfig.protocol || "openai"
    };

    coreUseChatStore.setState({ isLoading: true });

    // 2. Add Assistant Placeholder
    const assistantMsgId = crypto.randomUUID();
    const assistantMsgPlaceholder = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: ''
    };
    // @ts-ignore
    coreUseChatStore.getState().addMessage(assistantMsgPlaceholder);

    // 3. Prepare History from Store (Source of Truth)
    // We ignore the `history` arg because we want the latest state including tool outputs we just added
    const messages = coreUseChatStore.getState().messages;

    // 辅助函数：确保 content 是字符串（处理 ContentPart[]）
    const ensureContentString = (content: any): string => {
        if (Array.isArray(content)) {
            return content.map((part: any) => part.type === 'text' ? part.text : '[image]').join('');
        }
        return content || '';
    };

    // Slice off the placeholder we just added
    const msgHistory = messages.slice(0, -1).map(m => {
        const toolCalls = m.toolCalls
            ? m.toolCalls
                .filter(tc => tc.tool) // 过滤掉没有 tool 名称的
                .map(tc => {
                    let argsString: string;
                    if ((tc as any).function?.arguments) {
                        argsString = (tc as any).function.arguments;
                    } else if (tc.args) {
                        argsString = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {});
                    } else {
                        argsString = '{}';
                    }
                    return {
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.tool,
                            arguments: argsString
                        }
                    };
                })
            : undefined;

        return {
            role: m.role,
            content: ensureContentString(m.content),
            tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
            tool_call_id: m.tool_call_id
        };
    });

    // 4. Setup Listeners (Duplicate logic from patchedSendMessage - refactoring would be better but keeping it self-contained for patch)
    // const { listen } = await import('@tauri-apps/api/event');
    
    const unlistenStatus = await listen<string>(`${assistantMsgId}_status`, (event) => {
        const { messages } = coreUseChatStore.getState();
        const lastAssistantMsg = messages.find(m => m.id === assistantMsgId);
        if (lastAssistantMsg && !lastAssistantMsg.content) {
            const updatedMessages = messages.map(m => 
                m.id === assistantMsgId ? { ...m, content: `_(${event.payload})_ \n\n` } : m
            );
            coreUseChatStore.setState({ messages: updatedMessages });
        }
    });

    const unlistenStream = await listen<string>(assistantMsgId, (event) => {
        const { messages } = coreUseChatStore.getState();
        let textChunk = '';
        let toolCallUpdate: any = null;
        try {
            const payload = JSON.parse(event.payload);
            if (payload.type === 'content' && payload.content) {
                textChunk = payload.content;
            } else if (payload.type === 'tool_call' && payload.toolCall) {
                toolCallUpdate = payload.toolCall;
            } else if (payload.type === 'thinking' || payload.type === 'tool-result' || payload.type === 'done') {
                // 忽略本地模型的内部消息类型，不显示在聊天中
                return;
            }
        } catch (e) {
            // 尝试解析多个拼接的 JSON 对象（边缘情况处理）
            const objects = event.payload.match(/\{[^{}]+\}/g);
            if (objects) {
                // 查找最后一个 type='content' 的对象
                for (let i = objects.length - 1; i >= 0; i--) {
                    try {
                        const obj = JSON.parse(objects[i]);
                        if (obj.type === 'content' && obj.content) {
                            textChunk = obj.content;
                            break;
                        }
                    } catch (e2) {
                        // 忽略解析失败的单个对象
                    }
                }
                // 如果没有找到 content，则不显示任何内容（静默忽略）
            }
        }

        if (textChunk || toolCallUpdate) {
            const updatedMessages = messages.map(m => {
                if (m.id === assistantMsgId) {
                    const newMsg = { ...m };
                    if (textChunk) {
                        // Ensure textChunk is a string (prevent [object Object])
                        const safeTextChunk = typeof textChunk === 'string' ? textChunk : JSON.stringify(textChunk);
                        newMsg.content = (newMsg.content || '') + safeTextChunk;
                    }
                    if (toolCallUpdate) {
                        console.log('[Chat/GenerateResponse] Received tool_call event:', toolCallUpdate);
                        const toolName = toolCallUpdate.function?.name || toolCallUpdate.tool;
                        console.log('[Chat/GenerateResponse] Tool name:', toolName);
                        const newArgsChunk = toolCallUpdate.function?.arguments || '';

                        const existingCalls = newMsg.toolCalls || [];
                        const existingIndex = existingCalls.findIndex(tc => tc.id === toolCallUpdate.id);

                        if (existingIndex !== -1) {
                            const existingCall = existingCalls[existingIndex];
                            const prevArgsString = (existingCall as any).function?.arguments || '';
                            const updatedArgsString = prevArgsString + newArgsChunk;

                            let parsedArgs: any;
                            try {
                                parsedArgs = JSON.parse(updatedArgsString);
                            } catch (e) {
                                parsedArgs = { ...existingCall.args };

                                const contentMatch = updatedArgsString.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                                if (contentMatch) {
                                    let content = contentMatch[1];
                                    content = content
                                        .replace(/\\n/g, '\n')
                                        .replace(/\\r/g, '\r')
                                        .replace(/\\t/g, '\t')
                                        .replace(/\\"/g, '"')
                                        .replace(/\\\\/g, '\\');
                                    parsedArgs.content = content;
                                }

                                const relPathMatch = updatedArgsString.match(/"rel_path"\s*:\s*"([^"]*)"/);
                                if (relPathMatch) {
                                    parsedArgs.rel_path = relPathMatch[1];
                                }
                            }

                            const updatedCalls = [...existingCalls];
                            updatedCalls[existingIndex] = {
                                ...existingCall,
                                id: toolCallUpdate.id || existingCall.id,
                                tool: toolName || existingCall.tool,
                                args: parsedArgs,
                                function: { name: toolName || (existingCall as any).function?.name, arguments: updatedArgsString },
                                isPartial: true
                            };
                            newMsg.toolCalls = updatedCalls;
                        } else {
                            // New tool call
                            // FILTER: Skip invalid tool names (empty, "unknown", whitespace)
                            // This prevents "unknown" tool calls from cluttering the UI
                            const isValidToolName = toolName &&
                                toolName !== 'unknown' &&
                                toolName.trim().length > 0;

                            if (!isValidToolName) {
                                console.warn(`[useChatStore] Skipping invalid tool call: tool="${toolName}", chunk="${newArgsChunk?.substring(0, 50)}"`);
                                // Skip this tool call, don't add it to the message
                                return newMsg;
                            }

                            let initialArgs: any;
                            try {
                                initialArgs = newArgsChunk ? JSON.parse(newArgsChunk) : {};
                            } catch (e) {
                                initialArgs = {};
                            }

                            const newToolCall = {
                                id: toolCallUpdate.id || crypto.randomUUID(),
                                type: 'function' as const,
                                tool: toolName,  // Use toolName directly, no default
                                args: initialArgs,
                                function: { name: toolName, arguments: newArgsChunk },  // Use toolName directly, no default
                                status: 'pending' as const,
                                isPartial: true
                            };
                            // @ts-ignore
                            newMsg.toolCalls = [...existingCalls, newToolCall];
                        }
                    }
                    return newMsg;
                }
                return m;
            });
            coreUseChatStore.setState({ messages: updatedMessages });
        }
    });

    const unlistenRefs = await listen<string[]>("codebase-references", (event) => { /* No user msg to attach to here, maybe just ignore or attach to last msg? */ });
    
    const unlistenCompacted = await listen<any[]>(`${assistantMsgId}_compacted`, (event) => {
        const compactedMessages = event.payload.map(m => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            toolCalls: m.tool_calls,
            tool_call_id: m.tool_call_id
        }));
        coreUseChatStore.setState({ messages: [...compactedMessages, assistantMsgPlaceholder] });
    });

    // Error Listener - Handle stream errors
    const unlistenError = await listen<string>(`${assistantMsgId}_error`, (event) => {
        console.error("[Chat/GenerateResponse] Stream error", event.payload);

        const { messages } = coreUseChatStore.getState();
        coreUseChatStore.setState({
            messages: messages.map(m => m.id === assistantMsgId ? { ...m, content: `❌ Error: ${event.payload}` } : m)
        });

        // Error: cleanup listeners
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
        unlistenError();
    });

    // Finish Listener - Clean up listeners when streaming completes
    const unlistenFinish = await listen<string>(`${assistantMsgId}_finish`, async (event) => {
        console.log("[Chat/GenerateResponse] Stream finished", event.payload);

        // Finalize all partial tool calls
        const { messages } = coreUseChatStore.getState();
        const updatedMessages = messages.map(m => {
            if (m.id === assistantMsgId && m.toolCalls) {
                return {
                    ...m,
                    toolCalls: m.toolCalls.map(tc => ({
                        ...tc,
                        isPartial: false  // Mark as complete
                    }))
                };
            }
            return m;
        });

        coreUseChatStore.setState({ messages: updatedMessages });

        // Clean up all listeners
        console.log("[Chat/GenerateResponse] Cleaning up listeners");
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
        unlistenFinish();
        unlistenError();
        console.log("[Chat/GenerateResponse] Setting isLoading to false");
        coreUseChatStore.setState({ isLoading: false });
    });

    // 5. Invoke Backend
    try {
        console.log(`[Chat] Invoking ai_chat with eventId: ${assistantMsgId}`);
        console.log(`[Chat] Message history length: ${msgHistory.length}`);
        console.log(`[Chat] Project root: ${useFileStore.getState().rootPath}`);
        console.log(`[Chat] Enable tools: true`);

        await invoke('ai_chat', {
            providerConfig: backendConfig,
            messages: msgHistory,
            eventId: assistantMsgId,
            projectRoot: useFileStore.getState().rootPath,
            enableTools: true
        });

        console.log(`[Chat] ai_chat invoke completed successfully`);
    } catch (e) {
        console.error('[Chat/GenerateResponse] Invoke error:', e);
        const { messages } = coreUseChatStore.getState();
        const errorMsg = e instanceof Error ? e.message : String(e);
        coreUseChatStore.setState({
            messages: messages.map(m => m.id === assistantMsgId ? { ...m, content: `❌ 发送失败: ${errorMsg}` } : m)
        });

        // Error: cleanup listeners
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
        unlistenFinish();
        unlistenError();
    }

    // Note: Listener cleanup is now handled in the _finish handler
    // This ensures listeners are not cleaned up before _finish event is received
};

const patchedApproveToolCall = async (
    messageId: string,
    toolCallId: string,
    options?: { skipContinue?: boolean }
) => {
    console.log(`[useChatStore] patchedApproveToolCall called - messageId: ${messageId}, toolCallId: ${toolCallId}, options:`, options);

    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

    if (!message || !toolCall) {
        console.error("Message or ToolCall not found");
        return;
    }

    // 1. Handle Agent Tool Calls (delegated to AgentStore)
    if ((toolCall as any).agentId) {
        const agentId = (toolCall as any).agentId;
        console.log(`[useChatStore] Using Agent approval flow for agent ${agentId}`);

        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? {
                    ...m,
                    toolCalls: m.toolCalls?.map(tc =>
                        tc.id === toolCallId ? { ...tc, status: 'approved' as const } : tc
                    )
                } : m
            )
        }));

        await useAgentStore.getState().approveAction(agentId, true);
        useFileStore.getState().refreshFileTree();
        return;
    }

    // 2. Handle File System Tools (Manual Invocation to fix snake_case args)
    const fsTools = ['agent_write_file', 'agent_read_file', 'agent_list_dir'];
    const toolName = toolCall.tool || (toolCall as any).function?.name;
    let relPath = '';  // 在 try 块外声明，以便 catch 块也能访问

    if (fsTools.includes(toolName)) {
        console.log(`[useChatStore] Intercepting FS tool: ${toolName}`);
        
        // Update status to approved
        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? {
                    ...m,
                    toolCalls: m.toolCalls?.map(tc =>
                        tc.id === toolCallId ? { ...tc, status: 'approved' as const } : tc
                    )
                } : m
            )
        }));

        try {
            const rootPath = useFileStore.getState().rootPath;
            if (!rootPath) throw new Error("No project root opened");

            // Fix arguments: snake_case (LLM) -> camelCase (Tauri)
            const args = toolCall.args || {};
            console.log('[FS Tool] Raw args:', JSON.stringify(args));
            console.log('[FS Tool] Raw args keys:', Object.keys(args));
            console.log('[FS Tool] args.rel_path:', args.rel_path);
            console.log('[FS Tool] args.relPath:', args.relPath);

            // Get default relPath based on tool type
            const getDefaultRelPath = () => {
                if (toolName === 'agent_list_dir') return '.';
                return '';
            };

            relPath = args.rel_path || args.relPath || getDefaultRelPath();
            let content: string = args.content || "";

            console.log('[FS Tool] Final relPath:', relPath);
            console.log('[FS Tool] Final content length:', content.length);

            // Debug: log content before unescaping
            console.log('[FS Tool] Content preview (first 200 chars):', content.substring(0, 200));
            console.log('[FS Tool] Has literal \\n:', content.includes('\\n'));
            console.log('[FS Tool] Has literal \\r\\n:', content.includes('\\r\\n'));
            console.log('[FS Tool] Has actual newline:', content.includes('\n'));

            // Content unescaping fix: if content is stringified with escaped newlines, restore them
            // Handle multiple escape formats
            if (typeof content === 'string' && (content.includes('\\n') || content.includes('\\r') || content.includes('\\t'))) {
                console.log('[FS Tool] Unescaping content...');
                content = content
                    .replace(/\\r\\n/g, '\n')   // Windows-style CRLF
                    .replace(/\\n/g, '\n')       // Unix-style LF
                    .replace(/\\r/g, '\r')       // CR
                    .replace(/\\t/g, '\t')       // Tab
                    .replace(/\\"/g, '"')        // Escaped quotes
                    .replace(/\\\\/g, '\\');     // Escaped backslashes (must be last)
                console.log('[FS Tool] Unescaped content preview:', content.substring(0, 200));
            }

            const tauriArgs = {
                rootPath,
                relPath,
                content
            };

            console.log(`[useChatStore] Invoking ${toolName} with`, tauriArgs);
            const result = await invoke(toolName, tauriArgs);
            const stringResult = typeof result === 'string' ? result : JSON.stringify(result);

            // Update status to completed
            coreUseChatStore.setState(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId ? {
                        ...m,
                        toolCalls: m.toolCalls?.map(tc =>
                            tc.id === toolCallId ? { ...tc, status: 'completed' as const, result: stringResult } : tc
                        )
                    } : m
                )
            }));

            // Sync with editor if the file is open
            const fileStore = useFileStore.getState();
            const openedFile = fileStore.openedFiles.find(f => f.path.endsWith(relPath));
            if (openedFile) {
                await fileStore.reloadFileContent(openedFile.id);
            }

            // Add Tool Output Message
            coreUseChatStore.getState().addMessage({
                id: crypto.randomUUID(),
                role: 'tool',
                content: i18n.t('tool.success', { toolName: `${toolName} > ${relPath}` }),
                tool_call_id: toolCallId
            });

            // Continue Conversation - 但对于本地模型执行的工具调用，不需要继续调用云端 API
            // 因为后端已经通过 content 事件发送了格式化的结果
            // 如果 skipContinue 选项为 true，也不自动继续（由调用者控制）
            const settings = useSettingsStore.getState();
            const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
            if (providerConfig && !(toolCall as any).isLocalModel && !options?.skipContinue) {
                await patchedGenerateResponse(
                    coreUseChatStore.getState().messages,
                    providerConfig,
                    { enableTools: true }
                );
            }

        } catch (e) {
            console.error(`[useChatStore] Tool execution failed:`, e);
            
            // Update status to failed
            coreUseChatStore.setState(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId ? {
                        ...m,
                        toolCalls: m.toolCalls?.map(tc =>
                            tc.id === toolCallId ? { ...tc, status: 'failed' as const, result: String(e) } : tc
                        )
                    } : m
                )
            }));

            // Add Error Output
            coreUseChatStore.getState().addMessage({
                id: crypto.randomUUID(),
                role: 'tool',
                content: i18n.t('tool.error', { toolName: `${toolName} > ${relPath}`, error: String(e) }),
                tool_call_id: toolCallId
            });
             // Still continue to let AI know it failed? 
             // Yes, usually better to let AI retry or apologize.
             const settings = useSettingsStore.getState();
             const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
             if (providerConfig) {
                 await patchedGenerateResponse(
                     coreUseChatStore.getState().messages, 
                     providerConfig, 
                     { enableTools: true }
                 );
             }
        }
        
        useFileStore.getState().refreshFileTree();
        return;
    }

    // 3. Fallback to Original Flow (for other tools)
    console.log(`[useChatStore] Using original approval flow`);
    await originalApproveToolCall(messageId, toolCallId);
    useFileStore.getState().refreshFileTree();
};

const patchedRejectToolCall = async (messageId: string, toolCallId: string) => {
    // Check if this is an Agent tool call
    const message = coreUseChatStore.getState().messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

    if (toolCall && (toolCall as any).agentId) {
        // Agent tool call: use Agent rejection flow
        const agentId = (toolCall as any).agentId;

        // Update tool call status to rejected
        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? {
                    ...m,
                    toolCalls: m.toolCalls?.map(tc =>
                        tc.id === toolCallId ? { ...tc, status: 'rejected' as const } : tc
                    )
                } : m
            )
        }));

        await useAgentStore.getState().approveAction(agentId, false);
    } else {
        // Regular tool call: use original flow
        await originalRejectToolCall(messageId, toolCallId);
    }

    // Refresh file tree after tool execution
    useFileStore.getState().refreshFileTree();
};

const approveAllToolCalls = async (messageId: string) => {
    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    if (!message || !message.toolCalls) return;

    for (const toolCall of message.toolCalls) {
        if (toolCall.status === 'pending' && !toolCall.isPartial) {
            await coreUseChatStore.getState().approveToolCall(messageId, toolCall.id);
        }
    }
};

const rejectAllToolCalls = async (messageId: string) => {
    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    if (!message || !message.toolCalls) return;

    for (const toolCall of message.toolCalls) {
        if (toolCall.status === 'pending' && !toolCall.isPartial) {
            await coreUseChatStore.getState().rejectToolCall(messageId, toolCall.id);
        }
    }
};

// Apply patches to the store
coreUseChatStore.setState({
    sendMessage: patchedSendMessage,
    // @ts-ignore - patching generateResponse
    generateResponse: patchedGenerateResponse,
    approveToolCall: patchedApproveToolCall,
    rejectToolCall: patchedRejectToolCall,
    // @ts-ignore - adding new methods to store
    approveAllToolCalls,
    // @ts-ignore - adding new methods to store
    rejectAllToolCalls,
    // @ts-ignore - adding history state
    inputHistory: [],
    // @ts-ignore
    historyIndex: -1
});

// ----------------------------------

// Re-export the core chatStore
export const useChatStore = coreUseChatStore;

// Re-export types
export type { ChatState, ToolCall, Message, ContentPart, ImageUrl, BackendMessage, AIProviderConfig } from 'ifainew-core';

// @ts-ignore
if (typeof window !== 'undefined') {
  (window as any).__chatStore = useChatStore;
}