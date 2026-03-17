// ============================================================================
// 暴露工具函数给 E2E 环境
// ============================================================================
if (typeof window !== 'undefined') {
    (window as any).recognizeIntent = recognizeIntent;
    (window as any).checkAutoApprove = checkAutoApprove;
}

// Wrapper for core library useChatStore

// Handles dependency injection of file and settings stores

import { useChatStore as coreUseChatStore, registerStores, createToolCallDeduplicator } from 'ifainew-core';
import type { Message, ContentPart, ToolCall } from './chatStore';

// 🏆 v0.3.8: 初始化 ToolCall 去重服务
export const toolCallDeduplicator = createToolCallDeduplicator();

export type { Message, ContentPart, ToolCall };

import { useFileStore } from './fileStore';
import { readFileContent } from '../utils/fileSystem';
import { useSettingsStore } from './settingsStore';

import { useAgentStore } from './agentStore';

import { globalConcurrencyManager } from '../utils/ConcurrencyManager';
import { useThreadStore } from './threadStore';
import { useSkillStore } from './skillStore';

import { invoke } from '@tauri-apps/api/core';

import { listen } from '@tauri-apps/api/event';

import { recognizeIntent, shouldTriggerAgent, formatAgentName } from '../utils/intentRecognizer';
import { shouldAutoApprove as checkAutoApprove, categorizeTool } from '../utils/approvalPolicy';
import { autoSaveThread } from './persistence/threadPersistence';

import { countMessagesTokens, getModelMaxTokens, calculateTokenUsagePercentage } from '../utils/tokenCounter';

import i18n from '../i18n/config';

// 🔥 版本区分:根据版本显示不同的提示
import { IS_COMMERCIAL } from '../config/edition';

import { ApprovalPipeline } from '../utils/approvalPipeline';
import { SentinelService } from '../services/SentinelService';
import { InlineSyncService } from '../services/InlineSyncService';

// ============================================================================
// 统一日志工具 - 规范化日志格式，便于调试和问题追踪
// ============================================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// 🏆 v0.4.1: 物理级 E2E 挂载 - 确保测试脚本能第一时间锁定 ChatStore
if (typeof window !== 'undefined') {
  const isE2E = (window as any).__E2E__ || 
                location.search.includes('e2e=true') || 
                (window as any).process?.env?.NODE_ENV === 'test';
  
  if (isE2E || import.meta.env.DEV) {
    (window as any).__chatStore = coreUseChatStore;
  }
}

type LogCategory = 'Chat' | 'Thread' | 'Tool' | 'Agent' | 'Context' | 'Stream' | 'LocalModel' | 'Intent';

const LOG_EMOJIS: Record<LogLevel, string> = {

  info: 'ℹ️',

  warn: '⚠️',

  error: '❌',

  debug: '🔍'

};

const LOG_COLORS: Record<LogLevel, string> = {

  info: '#3498db',   // 蓝色

  warn: '#f39c12',   // 橙色

  error: '#e74c3c',  // 红色

  debug: '#95a5a6'   // 灰色

};

/**

 * 统一的日志输出函数

 * @param category 日志分类

 * @param level 日志级别

 * @param message 日志消息

 * @param data 附加数据（可选）

 */

function log(category: LogCategory, level: LogLevel, message: string, data?: any): void {

  const emoji = LOG_EMOJIS[level];

  const prefix = `[${category}] ${emoji}`;

  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12); // HH:MM:SS.mmm

  const logMessage = `${timestamp} ${prefix} ${message}`;

  // 根据日志级别选择输出方法

  const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  if (data !== undefined) {

    consoleMethod(logMessage, data);

  } else {

    consoleMethod(logMessage);

  }

}

/**

 * 便捷的日志函数

 */

const logInfo = (category: LogCategory, message: string, data?: any) => log(category, 'info', message, data);

const logWarn = (category: LogCategory, message: string, data?: any) => log(category, 'warn', message, data);

const logError = (category: LogCategory, message: string, data?: any) => log(category, 'error', message, data);

const logDebug = (category: LogCategory, message: string, data?: any) => log(category, 'debug', message, data);

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

export function getThreadMessages(threadId: string): Message[] { return threadMessages.get(threadId) || []; }
export function setThreadMessages(threadId: string, messages: Message[]): void {
    threadMessages.set(threadId, messages);

    // 🏆 PIVO 3.0: 实时同步活跃线程数据
    const activeThreadId = useThreadStore.getState().activeThreadId;
    if (activeThreadId === threadId) {
        console.log(`[ChatStore] 🔄 Syncing active thread messages for: ${threadId}`);
        coreUseChatStore.setState({ messages: [...messages] });
    }

    autoSaveThread(threadId);
}
export function clearThreadMessages(): void { threadMessages.clear(); }

export function switchThread(threadId: string): void {

  const threadStore = useThreadStore.getState();

  const currentThreadId = threadStore.activeThreadId;

  // Save current thread messages before switching

  if (currentThreadId) {

    const currentMessages = coreUseChatStore.getState().messages;

    setThreadMessages(currentThreadId, [...currentMessages] as any);

  }

  // Switch to target thread

  threadStore.switchThread(threadId);

  // Load target thread messages

  const targetMessages = getThreadMessages(threadId);

  coreUseChatStore.setState({ messages: [...targetMessages] } as any);

  console.log(`[Thread] Switched from ${currentThreadId} to ${threadId}, loaded ${targetMessages.length} messages`);

}

// Register stores on first import

// Pass getState functions so core library can access current state

registerStores(useFileStore.getState, useSettingsStore.getState, useThreadStore.getState);

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
const originalAddMessage = coreUseChatStore.getState().addMessage;
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

        if (!content || typeof content !== 'string') return 0;

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

            let windowSelected: typeof selected = [];

            let currentTokens = 0;

            // 首先保留所有系统消息

            const systemMessages = selected.filter(s => s.message.role === 'system');

            windowSelected.push(...systemMessages);

            currentTokens += systemMessages.reduce((sum, s) => sum + s.estimatedTokens, 0);

            // 然后从最近的消息开始添加（倒序遍历 selected）

            const windowIndices = new Set(windowSelected.map(s => s.index));

            for (let i = selected.length - 1; i >= 0; i--) {

                const s = selected[i];

                if (s.message.role === 'system') continue;  // 已添加

                if (windowIndices.has(s.index)) continue;

                if (currentTokens + s.estimatedTokens <= maxTokenLimit) {

                    windowSelected.push(s);

                    windowIndices.add(s.index);

                    currentTokens += s.estimatedTokens;

                    // 🔥 v0.2.6 关键修复：如果添加了工具消息，必须确保其配对消息也被添加

                    // 如果是工具响应消息，确保其对应的 assistant tool_calls 消息也在窗口内

                    if (s.message.tool_call_id) {

                        const partner = selected.find(p => 

                            p.message.toolCalls && 

                            p.message.toolCalls.some(tc => tc.id === s.message.tool_call_id)

                        );

                        if (partner && !windowIndices.has(partner.index)) {

                            windowSelected.push(partner);

                            windowIndices.add(partner.index);

                            currentTokens += partner.estimatedTokens;

                        }

                    }

                    // 如果是包含 tool_calls 的 assistant 消息，确保其所有响应也在窗口内

                    if (s.message.toolCalls && s.message.toolCalls.length > 0) {

                        const partners = selected.filter(p => 

                            p.message.tool_call_id && 

                            s.message.toolCalls?.some(tc => tc.id === p.message.tool_call_id)

                        );

                        for (const p of partners) {

                            if (!windowIndices.has(p.index)) {

                                windowSelected.push(p);

                                windowIndices.add(p.index);

                                currentTokens += p.estimatedTokens;

                            }

                        }

                    }

                } else if (windowSelected.length < systemMessages.length + 3) {

                    // 至少保留系统消息 + 最后 3 条消息

                    windowSelected.push(s);

                    windowIndices.add(s.index);

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

    // 7. 返回消息（去重后的）同时执行最后的鲁棒性检查：移除无效的工具消息

    const result = selected.map(s => s.message).filter(msg => {

        if (msg.role === 'tool' && (!msg.tool_call_id || msg.tool_call_id.trim() === '')) {

            console.warn('[Context] Dropping tool message with missing tool_call_id to prevent API error');

            return false;

        }

        return true;

    });

    return result;

}

// 🔥 v0.3.6: 工业级多模态数据缓存 - 解决 localStorage QuotaExceededError
// 将大体积 Base64 图片保留在内存中，不存入受限的持久化存储
const multimodalCache = new Map<string, any[]>();

/**
 * 🏆 v0.4.1: 全局消息拦截器 (Store-Level Interceptor)
 * 
 * 物理级加固：拦截所有工具消息结果，自动转换特定的工具输出为 UI 元数据。
 */
const patchedAddMessage = (message: Message) => {
    // 1. 物理拦截 agent_list_dir 结果
    if (message.role === 'tool' && typeof message.content === 'string') {
        const content = message.content.trim();
        if (content.startsWith('[') && content.endsWith(']')) {
            try {
                const files = JSON.parse(content);
                if (Array.isArray(files) && files.length > 0) {
                    const isFileList = files.every(f => typeof f === 'string');
                    if (isFileList) {
                        // 注入 ExploreProgress 结构
                        (message as any).exploreProgress = {
                            phase: 'completed',
                            progress: { total: files.length, scanned: files.length, byDirectory: {} },
                            scannedFiles: files
                        };
                        console.log("[ChatStore] 🌳 Global Interceptor: Injected exploreProgress to tool result");

                        // 2. 物理同步：查找并更新父助理消息
                        // 稍微延迟确保消息已入库或状态已稳定
                        setTimeout(() => {
                            const state = coreUseChatStore.getState();
                            const msgs = state.messages;
                            const idx = msgs.findIndex(m => m.id === message.id);
                            if (idx > 0) {
                                for (let i = idx - 1; i >= 0; i--) {
                                    if (msgs[i].role === 'assistant') {
                                        console.log("[ChatStore] 🌳 Proactively syncing exploreProgress to assistant bubble:", msgs[i].id);
                                        coreUseChatStore.setState(s => ({
                                            messages: s.messages.map(m => m.id === msgs[i].id ? 
                                                { ...m, exploreProgress: (message as any).exploreProgress } : m)
                                        }));
                                        break;
                                    }
                                }
                            }
                        }, 50);
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }

    return originalAddMessage(message as any);
};

const patchedSendMessage = async (content: string | any[], providerId: string, modelName: string, options: any = {}) => {
    const { addMessage } = coreUseChatStore.getState();
        // ... 原有逻辑 ...
    const callId = crypto.randomUUID().slice(0, 8);
    console.log(`>>> [${callId}] patchedSendMessage called:`, typeof content === 'string' ? content.slice(0, 50) : 'array');

    // 🔥 v0.3.6: 预生成消息 ID 并缓存多模态数据
    const msgId = crypto.randomUUID();
    if (Array.isArray(content)) {
        multimodalCache.set(msgId, content);
        console.log(`[Multimodal] Data cached for message ${msgId}, parts: ${content.length}`);
    }

    // 🚀 v0.3.5: 引用物理化 - 符号级精准注入
    let enrichedContent = typeof content === 'string' ? content : '';
    if (typeof content === 'string' && content.includes('[#')) {
        const refMatches = [...content.matchAll(/\[#(.*?)\]\((.*?)(?::(\d+)-(\d+))?\)/g)];
        if (refMatches.length > 0) {
            console.log('[Chat] 🧠 GodMode: Loading ' + refMatches.length + ' references');
            const contents = await Promise.all(refMatches.map(async (m) => {
                const [name, path, start, end] = [m[1], m[2], m[3], m[4]];
                try {
                    const text = await readFileContent(path);
                    if (start && end) {
                        const snippet = text.split('\n').slice(parseInt(start) - 1, parseInt(end)).join('\n');
                        return `\n\n--- SYMBOL: ${name} IN ${path} (Lines ${start}-${end}) ---\n${snippet}\n--- END ---`;
                    }
                    return `\n\n--- FILE: ${path} ---\n${text}\n--- END ---`;
                } catch { return `\n[Error reading ${path}]`; }
            }));
            enrichedContent += contents.join('');
        }
    }

    // 追踪用户消息是否已添加，防止双气泡问题

    let userMessageAdded = false;

    // 🔥 用户消息 ID（用于 RAG 引用监听器）

    let userMsgId: string;

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

      coreUseChatStore.setState({ messages: currentThreadMessages } as any);

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
        const supportedAgents = ['/explore', '/review', '/test', '/doc', '/refactor'];

        if (supportedAgents.includes(command)) {
            // 🏆 PIVO 3.0: 废除斜杠命令触发的独立 Agent，回归 Chat-Native
            console.log('[SlashCommand] 🚀 Intercepted slash command, redirecting to PIVO flow:', command);
            
            userMsgId = crypto.randomUUID();
            addMessage({
                id: userMsgId,
                role: 'user',
                content: textInput,
                multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content
            });
            userMessageAdded = true;

            // 🔥 自动更新线程标题
            const currentThread = threadStore.getThread(activeThreadId!);
            if (currentThread) {
                const isDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(currentThread.title);
                if (isDefaultTitle) {
                    threadStore.updateThreadTitleFromMessage(activeThreadId!, textInput);
                }
            }

            // 允许流程继续向下执行，从而触发下方的 AI 请求逻辑
        }
    }

    // 🔥 v0.3.0 多模态检测：如果当前消息包含图片，跳过意图识别和本地模型预处理

    // 因为本地模型不支持 Vision，必须路由到云端 Vision LLM

    // 并且图片识别应该由云端 LLM 处理，而不是 Agent

    const currentContentHasImages = Array.isArray(content) &&

        content.some((part: any) => part.type === 'image_url');

    if (currentContentHasImages) {

        console.log('[AI Chat] 🖼️ Image detected in current message, skipping intent recognition and local model preprocessing');

    }

    // --- Natural Language Intent Recognition ---

    // Check if settings enable natural language agent triggering

    const enableNaturalLanguageTrigger = settings.enableNaturalLanguageAgentTrigger !== false; // Default to true

    // 🔥 v0.3.9: 在 E2E 环境下显式降低阈值，确保测试稳定性
    const confidenceThreshold = (window as any).VITE_TEST_ENV === 'e2e' ? 0.3 : (settings.agentTriggerConfidenceThreshold || 0.7);

    // 🔥 如果包含图片，跳过意图识别（图片识别应该由云端 LLM 处理）

    const editorMode = (window as any).__IFAI_EDITOR_MODE__ || "vibe";
    if (enableNaturalLanguageTrigger && textInput && !currentContentHasImages && !options.isInlineTask) {
        const intentResult = (window as any).recognizeIntent(textInput);
        
        // Log intent recognition result for debugging
        console.log('[NaturalLanguageTrigger] Intent recognized:', intentResult);

                if (shouldTriggerAgent(intentResult, confidenceThreshold)) {

                    const isVibeBlocked = editorMode === "vibe" && (intentResult.category !== 'read' && intentResult.category !== 'demo');

        

                    if (isVibeBlocked) {

                        console.log('[NaturalLanguageTrigger] vibe mode: skipping destructive intent');

                                        } else {

                                            // 🏆 PIVO 3.0: 废除独立 Agent 逻辑，回归 Chat-Native

                                            console.log('[NaturalLanguageTrigger] 🚀 Intercepted intent, redirecting to PIVO flow:', intentResult.type);

                                            

                                            // 1. 添加用户消息（如果还没添加）

                                            if (!userMessageAdded) {

                                                userMsgId = crypto.randomUUID();

                                                addMessage({

                                                    id: userMsgId,

                                                    role: 'user',

                                                    content: textInput,

                                                    multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content

                                                });

                                                userMessageAdded = true;

                                            }

                            

                                            // 🏆 FIXED: 不再直接 return，允许流程继续滑入下方的 AI 请求逻辑

                                        }

                    

                }

         else if (intentResult && intentResult.confidence > 0.5) {

            // Medium confidence: Log for future improvement

            console.log('[NaturalLanguageTrigger] Medium confidence intent detected but not triggered:', intentResult);

        }

    }

    // --- Local Model Preprocessing (Simple Q&A) ---

    // Check if local model should handle this request

    // 🔥 v0.3.0 多模态检测：如果当前消息包含图片，跳过本地模型预处理

    // 因为本地模型不支持 Vision，必须路由到云端 Vision LLM

    //（图片检测已在意图识别之前完成）

    // Get current messages for preprocessing

    const allCurrentMessages = coreUseChatStore.getState().messages;

    // 🔥 如果包含图片，跳过本地模型预处理

    if (!currentContentHasImages) {

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

            // 🔥 v0.3.0 修复：先检查是否有实际的本地响应或工具调用

            // 如果没有，说明本地模型实际上无法处理，应该回退到云端 API

            const hasLocalContent = preprocessResult.local_response ||

                (preprocessResult.has_tool_calls && preprocessResult.tool_calls && preprocessResult.tool_calls.length > 0);

            if (!hasLocalContent) {

                console.log('[LocalModel] should_use_local=true but no local_response/tool_calls, falling back to cloud API');

                // 不添加用户消息，跳过本地处理，让后续云端 API 逻辑处理

            } else {

                // 有本地内容，执行本地处理逻辑...

            // Add user message (if not already added by slash commands or natural language trigger)
            if (!userMessageAdded) {
                const userMsgId = crypto.randomUUID();
                addMessage({
                    id: userMsgId,
                    role: 'user',
                    content: textInput,
                    multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content
                });
                userMessageAdded = true;
            }

            // 🔥 自动更新线程标题（本地模型路径也触发）

            const currentThread = threadStore.getThread(activeThreadId!);

            if (currentThread) {

                const isDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(currentThread.title);

                if (isDefaultTitle) {

                    console.log('[ChatStore] Auto-updating thread title from local model:', textInput);

                    threadStore.updateThreadTitleFromMessage(activeThreadId!, textInput);

                }

            }

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

                    setThreadMessages(currentThreadId, [...finalMessages] as any);

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

                    setThreadMessages(currentThreadId, [...finalMessages] as any);

                    useThreadStore.getState().updateThreadTimestamp(currentThreadId);

                    useThreadStore.getState().incrementMessageCount(currentThreadId);

                }

                coreUseChatStore.setState({ isLoading: false });

                return;

            }

            }  // 🔥 关闭 else 分支（hasLocalContent === true）

        }

    } catch (e) {

        console.log('[LocalModel] Preprocess failed, falling back to cloud:', e);

        // Continue to cloud API

    }

    }  // 🔥 关闭 if (!currentContentHasImages) 分支

    // --- Direct Backend Invocation Logic ---

    // ✅ 修复：检查是否有正在流式传输的消息，避免重复创建占位符

    const { messages: currentMessages } = coreUseChatStore.getState();

    const lastAssistantMsg = currentMessages.filter(m => m.role === 'assistant').pop() as any;

    const isLastMessageStreaming = lastAssistantMsg && (

        !lastAssistantMsg.content ||

        (typeof lastAssistantMsg.content === 'string' && lastAssistantMsg.content.trim() === '') ||

        (lastAssistantMsg.contentSegments && lastAssistantMsg.contentSegments.length > 0)

    );

    if (isLastMessageStreaming) {

        console.warn('[Chat] Detected streaming assistant message, user wants to send new message');

        console.log('[Chat] Edition:', IS_COMMERCIAL ? 'Commercial (PRO)' : 'Community');

        // 🔥 版本区分处理:根据版本显示不同提示

        if (!IS_COMMERCIAL) {

          // 社区版:显示友好提示

          console.log('[Chat] Community Edition: Showing feature limitation message');

          coreUseChatStore.setState({ isLoading: false });

          const { addMessage } = coreUseChatStore.getState();

          addMessage({

            id: crypto.randomUUID(),

            role: 'assistant',

            content: '💡 **提示**: 快速连续发送消息功能仅在 PRO 版本中可用。\n\n请等待当前响应完成后,再发送下一条消息。升级到 PRO 版本可体验更流畅的对话体验。'

          });

          return;  // 社区版:停止处理新请求

        } else {

          // 商业版:自动取消前一个响应

          console.log('[Chat] Commercial Edition: Auto-cancelling previous response');

          coreUseChatStore.setState({

            messages: coreUseChatStore.getState().messages.map(m =>

                m.id === lastAssistantMsg.id

                    ? { ...m, content: lastAssistantMsg.content || '⏸️ 响应已取消' }

                    : m

            ),

            isLoading: false  // 重置加载状态

          });

          // 不显示警告,继续处理新请求

          // 用户发送新消息意味着他们想要放弃前一个响应

        }

    }

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

    // 2. Add User Message (if not already added by slash commands or local model)

    if (!userMessageAdded) {

        // 移除特殊标记（如 [CHAT]、[TASK-EXECUTION]）用于显示，但保留原始 content 用于意图识别

        const displayContent = typeof content === 'string'

            ? content.replace(/^\[(CHAT|TASK-EXECUTION)\]\s*/, '').replace(/\[TASK-EXECUTION\]\s*/g, '')

            : content;

        // 检测是否为任务执行上下文（使用原始 content）

        const autoApproveTools = typeof content === 'string' && content.includes('[TASK-EXECUTION]');

        // 🔥 v0.3.6: 消息脱敏持久化
        // 如果是数组（多模态），生成一个不含巨大 Base64 的显示版内容用于存入 Store (localStorage)
        let storageContent = displayContent;
        if (Array.isArray(displayContent)) {
            storageContent = displayContent.map(part => {
                if (part.type === 'image_url' && part.image_url?.url) {
                    // 只有当 Base64 长度确实很大时才脱敏
                    return { 
                        ...part, 
                        image_url: { 
                            ...part.image_url, 
                            url: part.image_url.url.length > 5000 ? 'PREVIEW_DATA_HIDDEN' : part.image_url.url 
                        } 
                    };
                }
                return part;
            });
        }

        console.log(`[Chat] Adding user message ${msgId}, storage size: ${JSON.stringify(storageContent).length}`);

        const userMsg = {
            id: msgId, // 使用 v0.3.6 预生成的 ID
            role: 'user' as const,
            content: storageContent,  // 使用脱敏后的内容持久化
            // @ts-ignore - 添加自动审批标志
            autoApproveTools,
            // 🔥 v0.3.7: 透传元数据
            isInlineTask: options.isInlineTask,
            displayLabel: options.displayLabel
        };

        // @ts-ignore
        coreUseChatStore.getState().addMessage(userMsg);
        userMessageAdded = true;

        // 🔥 v0.3.7: 强制同步到持久化层
        if (activeThreadId) {
            setThreadMessages(activeThreadId, coreUseChatStore.getState().messages as any);
        }


        // 🔥 自动更新线程标题（类似豆包，使用首条消息内容作为标题）

        // 检查是否是默认标题，如果是则更新为消息内容

        const currentThread = threadStore.getThread(activeThreadId!);

        if (currentThread) {

            const isDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(currentThread.title);

            if (isDefaultTitle) {

                console.log('[ChatStore] Auto-updating thread title from first message:', displayContent);

                threadStore.updateThreadTitleFromMessage(activeThreadId!, displayContent);

            }

        }

    }

    // 3. Add Assistant Placeholder

    const assistantMsgId = crypto.randomUUID();

    const assistantMsgPlaceholder = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        // @ts-ignore - custom property for tracking stream order
        contentSegments: [] as ContentSegment[],
        // 🔥 v0.3.7: 透传元数据
        isInlineTask: options.isInlineTask,
        displayLabel: options.displayLabel
    };


    // @ts-ignore
    coreUseChatStore.getState().addMessage(assistantMsgPlaceholder);

    // 🔥 v0.3.7: 强制同步到持久化层
    if (activeThreadId) {
        setThreadMessages(activeThreadId, coreUseChatStore.getState().messages as any);
    }

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

            messagesWithoutPlaceholder as any,

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

            if (!messagesToSend.includes(lastUserMsg as any)) {

                console.log('[Chat Debug] Force-adding last user message that was filtered');

                messagesToSend.push(lastUserMsg as any);

            }

        }

    } else {

        // 传统模式：发送所有消息

        messagesToSend = allMessages.slice(0, -1) as any;

    }

    // 🔥 v0.3.0 多模态修复：辅助函数处理消息内容

    // 如果 content 是 ContentPart[] 数组，保持原样发送给后端

    // 如果 content 是字符串，清理特殊标记

    const prepareMessageContent = (content: any): any => {

        // 如果是 ContentPart[] 数组，直接返回（包含图片）

        if (Array.isArray(content)) {

            return content;

        }

        // 如果是字符串，清理特殊标记

        let contentStr = content || '';

        if (typeof contentStr === 'string') {

            contentStr = contentStr.replace(/^\[(CHAT|TASK-EXECUTION)\]\s*/, '');

        }

        return contentStr;

    };

    // 转换为API格式
    let msgHistory = messagesToSend.map(m => {
        const toolCalls = m.toolCalls
            ? m.toolCalls
                .filter(tc => tc.tool)
                .map(tc => {
                    const argsString = (tc as any).function?.arguments || "{}";
                    return {
                        id: tc.id,
                        type: "function",
                        function: {
                            name: tc.tool,
                            arguments: typeof argsString === "string" ? argsString : JSON.stringify(argsString || {})
                        }
                    };
                })
            : undefined;
        const content = prepareMessageContent(m.content);
        return {
            role: m.role,
            content: content,
            tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
            tool_call_id: m.tool_call_id
        };
    });

    // 🚀 v0.3.6: PIVO 2.0 物理授权注入
    const isChinese = i18n.language?.startsWith("zh");
    
    // 🔥 v0.3.7: 针对 Inline 任务强化指令
    const inlineInstruction = options.isInlineTask 
        ? (isChinese 
            ? "\n\n【核心要求】你现在正在进行原位(Inline)代码编辑。请直接调用 agent_write_file 或 agent_replace_text 物理修改用户选中的代码。严禁只给出 Markdown 代码块建议。" 
            : "\n\n[CORE REQUIREMENT] You are performing an In-place (Inline) edit. MUST call agent_write_file or agent_replace_text to physically modify the code. DO NOT just provide code blocks in chat.")
        : "";

    const PIVO_PROMPT = (isChinese 
        ? `【物理工具箱授权】
你现在拥有 PIVO 2.0 全量物理执行权限。请根据需要直接调用以下工具：
- agent_execute_command: 执行系统命令或查询
- agent_write_file: 写入或重构代码文件
- agent_read_file: 读取物理文件内容
- agent_scan_project: 快速扫描项目全景

【准则】你是一名资深的物理执行专家，请直接行动，严禁只用文字描述。`
        : `[PIVO 2.0 PHYSICAL TOOL AUTHORIZATION]
You have full execution permissions. Directly call:
- agent_execute_command: execute system commands
- agent_write_file: write/refactor code
- agent_read_file: read physical files
- agent_scan_project: scan project topology.`) + inlineInstruction;
    if (!msgHistory.some(m => m.content === PIVO_PROMPT) && msgHistory.length < 5) {
        msgHistory.unshift({ 
            role: "system", 
            content: PIVO_PROMPT,
            tool_calls: [],
            tool_call_id: ""
        });
    }

    // 5. Setup Listeners
    // Status Listener
    const unlistenStatus = await listen<string>(`${assistantMsgId}_status`, (event) => {
        const { messages } = coreUseChatStore.getState();
        const lastAssistantMsg = messages.find(m => m.id === assistantMsgId);
        if (lastAssistantMsg) {
            const safePayload = typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload);
            console.log(`[Chat] Status update: ${safePayload}`);
            if (!lastAssistantMsg.content) {
                const updatedMessages = messages.map(m => 
                    m.id === assistantMsgId ? { ...m, content: `_(${safePayload})_ \n\n` } : m
                );
                coreUseChatStore.setState({ messages: updatedMessages });
            }
        }
    });

    // Stream Content Listener
    let renderRequested = false;
    let pendingChunks: { textChunk?: string, toolCallUpdate?: any }[] = [];

    const flushUpdates = () => {
        if (pendingChunks.length === 0) return;
        const chunksToProcess = [...pendingChunks];
        pendingChunks = [];
        coreUseChatStore.setState(((state: any) => {
            const updatedMessages = state.messages.map(m => {
                if (m.id === assistantMsgId) {
                    const newMsg: Message = { ...m };
                    if (!(newMsg as any).contentSegments) (newMsg as any).contentSegments = [];
                    for (const chunk of chunksToProcess) {
                        if (chunk.textChunk) {
                            const safeTextChunk = typeof chunk.textChunk === "string" ? chunk.textChunk : JSON.stringify(chunk.textChunk);
                            newMsg.content = (newMsg.content || "") + safeTextChunk;
                            
                            // 🔥 v0.3.7: 同步文本块以提取 PIVO 计划
                            InlineSyncService.syncState("", "", safeTextChunk);

                            const order = ((newMsg as any).contentSegments || []).length;
                            const startPos = (newMsg.content || "").length - safeTextChunk.length;
                            (newMsg as any).contentSegments = [...((newMsg as any).contentSegments || []), {
                                type: "text" as const, order, timestamp: Date.now(),
                                content: safeTextChunk, startPos, endPos: newMsg.content.length
                            }];
                        }
                        if (chunk.toolCallUpdate) {
                            const toolCallUpdate = chunk.toolCallUpdate;
                            const deltaName = toolCallUpdate.function?.name || "";
                            const newArgsChunk = toolCallUpdate.function?.arguments || "";
                            const existingCalls = newMsg.toolCalls || [];
                            const existingIndex = existingCalls.findIndex(tc => {
                                if (toolCallUpdate.id && tc.id === toolCallUpdate.id) return true;
                                if (toolCallUpdate.index !== undefined && toolCallUpdate.index !== null) {
                                    return (tc as any).index === toolCallUpdate.index;
                                }
                                return false;
                            });

                            if (existingIndex !== -1) {
                                const existingCall = existingCalls[existingIndex];
                                const updatedCalls = [...existingCalls];
                                const existingName = (existingCall as any).function?.name || "";
                                const updatedName = (existingName === "unknown" ? "" : existingName) + deltaName;
                                const updatedArgsString = ((existingCall as any).function?.arguments || "") + newArgsChunk;
                                
                                let parsedArgs: any;
                                try { parsedArgs = JSON.parse(updatedArgsString); }
                                catch (e) {
                                    parsedArgs = { ...existingCall.args };
                                    const safeArgsString = String(updatedArgsString);
                                    const contentMatch = safeArgsString.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)(?:\\|"?$)/s);
                                    if (contentMatch) {
                                        let content = contentMatch[1];
                                        content = content.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
                                        parsedArgs.content = content;
                                    }
                                    const relPathMatch = safeArgsString.match(/"rel_path"\s*:\s*"([^"]*)"?/);
                                    if (relPathMatch) parsedArgs.rel_path = relPathMatch[1];
                                }

                                updatedCalls[existingIndex] = {
                                    ...existingCall,
                                    id: toolCallUpdate.id || existingCall.id,
                                    tool: updatedName || (existingCall as any).tool,
                                    args: parsedArgs,
                                    function: { name: updatedName, arguments: updatedArgsString },
                                    isPartial: toolCallUpdate.isPartial ?? existingCall.isPartial,
                                    batchId: (existingCall as any).batchId
                                } as any;

                                InlineSyncService.syncState(updatedName, parsedArgs.content);

                                if (updatedCalls[existingIndex].isPartial === false) {
                                    const tc = updatedCalls[existingIndex];
                                    const latestEditorMode = (window as any).__IFAI_EDITOR_MODE__ || "standard";
                                    const settings = useSettingsStore.getState();
                                    
                                    ApprovalPipeline.processAutoApproval(
                                        {
                                            settings, 
                                            editorMode: latestEditorMode as any,
                                            isSessionTrusted: false, 
                                            toolName: tc.tool, 
                                            isSandbox: true, 
                                            userMessageHasAutoApprove: false
                                        },
                                        () => {
                                            (window as any).__chatStore?.getState().approveToolCall(assistantMsgId, tc.id, { skipContinue: true });
                                        }
                                    );
                                }
                                newMsg.toolCalls = updatedCalls;
                            } else {
                                const toolName = deltaName || "unknown";
                                
                                // 🔥 v0.3.7: 新工具创建时立即触发同步
                                InlineSyncService.syncState(toolName, "");

                                let initialArgs: any = {};
                                try { 
                                    initialArgs = newArgsChunk ? JSON.parse(newArgsChunk) : {}; 
                                } catch (e) { 
                                    const safeArgsString = String(newArgsChunk);
                                    const contentMatch = safeArgsString.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)(?:\\|"?$)/s);
                                    if (contentMatch) {
                                        let content = contentMatch[1];
                                        content = content.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
                                        initialArgs.content = content;
                                    }
                                    const relPathMatch = safeArgsString.match(/"rel_path"\s*:\s*"([^"]*)"?/);
                                    if (relPathMatch) initialArgs.rel_path = relPathMatch[1];
                                }
                                
                                const newToolCallId = toolCallUpdate.id || `call_${crypto.randomUUID()}`;
                                
                                // Batching logic
                                const aggregatableTools = ["agent_scan_project", "agent_list_dir", "agent_read_file", "agent_search", "list_dir", "read_file", "agent_list_directory", "list directory", "read file"];
                                const currentEditorMode = (window as any).__IFAI_EDITOR_MODE__ || "vibe";
                                const lowerToolName = toolName.toLowerCase();
                                let batchId: string | undefined = undefined;
                                if (aggregatableTools.some(t => lowerToolName.includes(t))) {
                                    const lastToolCall = existingCalls.length > 0 ? existingCalls[existingCalls.length - 1] : null;
                                    if (lastToolCall && (lastToolCall as any).batchId && aggregatableTools.some(t => (lastToolCall as any).tool.toLowerCase().includes(t))) {
                                        batchId = (lastToolCall as any).batchId;
                                    } else if (currentEditorMode === "vibe" || currentEditorMode === "spec") {
                                        const prevAssistantMsg = coreUseChatStore.getState().messages.filter(m => m.role === "assistant" && m.id !== assistantMsgId).pop();
                                        const prevBatchId = (prevAssistantMsg?.toolCalls?.find(tc => (tc as any).batchId) as any)?.batchId;
                                        if (prevBatchId && typeof prevBatchId === "string" && prevBatchId.startsWith("batch_")) {
                                            batchId = prevBatchId;
                                        } else {
                                            batchId = `batch_${crypto.randomUUID().slice(0, 8)}`;
                                        }
                                    }
                                }

                                const newToolCall = {
                                    id: newToolCallId, type: "function" as const, 
                                    tool: toolName, args: initialArgs,
                                    function: { name: toolName, arguments: newArgsChunk },
                                    status: "pending" as const, isPartial: true, index: toolCallUpdate.index,
                                    batchId
                                };
                                newMsg.toolCalls = [...existingCalls, newToolCall];
                                const order = ((newMsg as any).contentSegments || []).length;
                                (newMsg as any).contentSegments = [...((newMsg as any).contentSegments || []), { type: "tool" as const, order, timestamp: Date.now(), toolCallId: newToolCallId }];
                            }
                        }
                    }
                                        return newMsg;
                }
                return m;
            });
            return { messages: updatedMessages };
        }) as any);
    };

    const unlistenStream = await listen<string>(assistantMsgId, (event) => {
        let textChunk = "";
        let toolCallUpdate: any = null;
        try {
            const rawPayload: any = event.payload;
            if (!rawPayload) return;
            const parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
            if (parsed.type === "content") textChunk = parsed.content;
            else if (parsed.type === "tool_call") toolCallUpdate = parsed.toolCall;
        } catch (e) { /* ignore */ }

        if (textChunk || toolCallUpdate) {
            pendingChunks.push({ textChunk, toolCallUpdate });
            if (!renderRequested) {
                renderRequested = true;
                requestAnimationFrame(() => { flushUpdates(); renderRequested = false; });
            }
        }
    });

    const unlistenFinish = await listen<string>(`${assistantMsgId}_finish`, async () => {
        flushUpdates();
        
        // 🚀 v0.3.6: 状态自愈巡检 (State Self-Healing)
        // 强制关闭所有残留的 isPartial 状态，并物理还原 args
        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m => m.id === assistantMsgId ? {
                ...m,
                toolCalls: m.toolCalls?.map(tc => {
                    let finalArgs = tc.args || {};
                    if (Object.keys(finalArgs).length === 0 && (tc as any).function?.arguments) {
                        try { finalArgs = JSON.parse((tc as any).function.arguments); } catch (e) {}
                    }
                    return { ...tc, isPartial: false, args: finalArgs };
                })
            } : m)
        }));

        // 🏆 自动执行保底：触发那些刚被自愈闭合的工具
        flushUpdates(); // 再次刷新以确保状态同步到局部变量
        
        const finalizedMessages = coreUseChatStore.getState().messages;
        const settings = useSettingsStore.getState();
        const currentThreadId = useThreadStore.getState().activeThreadId || "default";
        
        const message = finalizedMessages.find(m => m.id === assistantMsgId);
        if (message && message.toolCalls) {
            const latestEditorMode = (window as any).__IFAI_EDITOR_MODE__ || "standard";
            const pendingToolCalls = message.toolCalls.filter(tc => {
                return tc.status === "pending" && !tc.isPartial && checkAutoApprove({
                    settings, editorMode: latestEditorMode as any,
                    isSessionTrusted: false, toolName: tc.tool, isSandbox: true, userMessageHasAutoApprove: false
                });
            });

            if (pendingToolCalls.length > 0) {
                const promises = pendingToolCalls.map(tc => (coreUseChatStore.getState() as any).approveToolCall(assistantMsgId, tc.id, { skipContinue: true }));
                await Promise.all(promises);
                const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                if (providerConfig) {
                    setTimeout(async () => {
                        const latestMsg = coreUseChatStore.getState().messages.find(m => m.id === assistantMsgId);
                        if (latestMsg?.toolCalls?.some(tc => tc.status === "approved")) return;
                        unlistenStatus(); unlistenStream(); unlistenFinish(); unlistenError();
                        await patchedGenerateResponse(coreUseChatStore.getState().messages, providerConfig, { enableTools: (window.__IFAI_EDITOR_MODE__ !== "vibe") });
                    }, 800);
                    return;
                }
            }
        }
        unlistenStatus(); unlistenStream(); unlistenFinish(); unlistenError();
        coreUseChatStore.setState({ isLoading: false });
    });

    const unlistenError = await listen<string>(`${assistantMsgId}_error`, (event) => {
        const safe = typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload);
        const displayError = safe.includes("429") ? "⚠️ **API 速率限制 (429)**: 您当前的消息发送过于频繁..." : safe;
        coreUseChatStore.setState(s => ({ messages: s.messages.map(m => m.id === assistantMsgId ? { ...m, content: `❌ Error: ${displayError}` } : m), isLoading: false }));
        unlistenStatus(); unlistenStream(); unlistenFinish(); unlistenError();
    });


    // 6. Invoke Backend
    try {
        // 🔥 v0.5.0: 增强型模式判定 (SendMessage 路径)
        // 🚀 v0.5.0: 优先尊重 options.enableTools，否则根据模式判定
        const currentMode = (window as any).__IFAI_EDITOR_MODE__;
        // 🔥 v0.3.7: 如果是 Inline 任务，必须开启工具，否则无法物理修改代码
        const shouldEnableTools = (options.isInlineTask || options?.enableTools !== undefined)
            ? (options.enableTools ?? true)
            : (currentMode !== "vibe");

        // 🏆 PIVO 2.0: 最终外发数据审计日志
        console.log(`[Chat] 📡 FINAL REQUEST AUDIT:`, {
            messageCount: msgHistory.length,
            hasPivoPrompt: msgHistory.some(m => typeof m.content === 'string' && m.content.includes("PIVO 2.0")),
            targetModel: modelName,
            pivoPromptPreview: PIVO_PROMPT.slice(0, 150) + "..."
        });

        await invoke('ai_chat', {
            providerConfig,
            messages: msgHistory.map((m, i) => {
                // 🔥 v0.3.6 FIX: 鲁棒的还原逻辑
                // 无论是否是最后一条，只要是 user 消息且存在脱敏标记，就尝试从缓存还原
                if (m.role === 'user' && Array.isArray(m.content)) {
                    // 查找原始完整数据（根据内容特征匹配或 ID 匹配，这里我们优先处理当前正在发送的消息）
                    const isCurrentSendingMsg = i === msgHistory.length - 1;
                    const cachedContent = isCurrentSendingMsg ? multimodalCache.get(msgId) : null;
                    
                    if (cachedContent) {
                        return { ...m, content: cachedContent };
                    }

                    // 兜底处理：如果不是当前消息，但包含 PREVIEW_DATA_HIDDEN
                    const hasHiddenData = m.content.some(p => p.type === 'image_url' && p.image_url?.url === 'PREVIEW_DATA_HIDDEN');
                    if (hasHiddenData) {
                        // 尝试从缓存中查找历史数据 (TODO: 长期历史可以考虑引入 IndexedDB 缓存)
                        console.warn(`[Multimodal] Found desensitized message in history (index ${i}), attempting late binding...`);
                    }
                }

                // 处理引用注入 (仅针对最后一条文本消息)
                const isLastUserMsg = i === msgHistory.length - 1 && m.role === 'user';
                if (isLastUserMsg && typeof content === 'string') {
                    return { ...m, content: enrichedContent };
                }

                return { role: m.role, content: m.content };
            }),
            eventId: assistantMsgId,
            projectRoot: useFileStore.getState().rootPath,
            enableTools: shouldEnableTools,
            activeSkillIds: (window as any).__IFAI_ACTIVE_SKILLS__ || [],
            mode: currentMode || "vibe"
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
        if (typeof unlistenStatus === 'function') unlistenStatus();
        if (typeof unlistenStream === 'function') unlistenStream();
        if (typeof unlistenFinish === 'function') unlistenFinish();
        if (typeof unlistenError === 'function') unlistenError();

        coreUseChatStore.setState({ isLoading: false });

    }

    // Note: Listener cleanup is now handled in the _finish handler

    // This ensures listeners are not cleaned up before _finish event is received

};

const patchedGenerateResponse = async (
history: any[], providerConfig: any, options?: { enableTools?: boolean }) => {

    console.log(">>> patchedGenerateResponse called");
    // 🏆 v0.3.8: PIVO 商业版 Sentinel 扫描
    SentinelService.scanForUuid(history);

    const settings = useSettingsStore.getState();

    const fullProviderConfig = settings.providers.find((p: any) => p.id === providerConfig.id) || providerConfig;

    const backendConfig = {

        ...fullProviderConfig, provider: fullProviderConfig.id, id: fullProviderConfig.id,

        api_key: fullProviderConfig.apiKey || "", base_url: fullProviderConfig.baseUrl || "",

        models: [settings.currentModel], protocol: fullProviderConfig.protocol || "openai"

    };

    coreUseChatStore.setState({ isLoading: true });

    const currentMessages = coreUseChatStore.getState().messages;

    let reusableAssistantMsgId: string | null = null;

    for (let i = currentMessages.length - 1; i >= 0; i--) {

        const msg = currentMessages[i];

        if (msg.role === 'assistant' && (!msg.content || (typeof msg.content === 'string' && msg.content.trim().length === 0)) && msg.toolCalls && msg.toolCalls.length > 0) {

            reusableAssistantMsgId = msg.id;

            break;

        }

    }

    let assistantMsgId: string;

    if (reusableAssistantMsgId) {

        assistantMsgId = reusableAssistantMsgId;

        console.log('[patchedGenerateResponse] 复用 assistant 消息:', assistantMsgId);

    } else {

        assistantMsgId = crypto.randomUUID();

        const assistantMsgPlaceholder = {

            id: assistantMsgId, role: 'assistant' as const, content: '', contentSegments: [] as ContentSegment[]

        };

        // @ts-ignore

        coreUseChatStore.getState().addMessage(assistantMsgPlaceholder);

    }

    const messages = coreUseChatStore.getState().messages;

    let messagesForHistory = messages;

    const lastMsg = messages[messages.length - 1];

    if (lastMsg && lastMsg.id === assistantMsgId && lastMsg.role === 'assistant' && (!lastMsg.content || lastMsg.content === '')) {

        messagesForHistory = messages.slice(0, -1);

    }

    const msgHistory = messagesForHistory.map(m => {

        const toolCalls = m.toolCalls?.filter(tc => tc.tool).map(tc => {

            const argsString = (tc as any).function?.arguments || (typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}));

            return { id: tc.id, type: 'function', function: { name: tc.tool, arguments: argsString } };

        });

        return {

            role: m.role,

            content: Array.isArray(m.content) ? m.content : (m.content || ''),

            tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,

            tool_call_id: m.tool_call_id

        };

    });

    // 🏆 PIVO 3.0: 调试消息历史
    console.log('[Chat] 📋 Message history for AI:', {
        total: msgHistory.length,
        roles: msgHistory.map(m => m.role),
        hasToolMessages: msgHistory.some(m => m.role === 'tool'),
        lastRole: msgHistory[msgHistory.length - 1]?.role,
        history: msgHistory.map(m => ({ role: m.role, content_length: typeof m.content === 'string' ? m.content.length : 0, has_tool_calls: !!m.tool_calls, tool_call_id: m.tool_call_id }))
    });

    let renderRequested = false;

    let localMessagesBuffer: Message[] = [...coreUseChatStore.getState().messages] as any;

    const unlistenStatus = await listen<string>(`${assistantMsgId}_status`, (event) => {

        const safe = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);

        localMessagesBuffer = localMessagesBuffer.map(m => (m.id === assistantMsgId && !m.content) ? { ...m, content: `_(${safe})_ 

` } : m);

        if (!renderRequested) {

            renderRequested = true;

            requestAnimationFrame(() => { coreUseChatStore.setState({ messages: [...localMessagesBuffer] } as any); renderRequested = false; });

        }

    });

    const unlistenStream = await listen<string>(assistantMsgId, (event) => {

        let textChunk = '';

        let toolCallUpdate: any = null;

        try {

            const raw: any = event.payload;

            if (!raw) return;

            if (typeof raw === 'object') {

                if (raw.type === 'content') textChunk = String(raw.content);

                else if (raw.type === 'tool_call') toolCallUpdate = raw.toolCall;

            } else if (typeof raw === 'string') {

                try {

                    const p = JSON.parse(raw);

                    if (p.type === 'content') textChunk = String(p.content);

                    else if (p.type === 'tool_call') toolCallUpdate = p.toolCall;

                } catch {

                    const objs = raw.match(/\{[^{}]+\}/g);

                    if (objs) {

                        const p = JSON.parse(objs[objs.length-1]);

                        if (p.type === 'content') textChunk = String(p.content);

                    }

                }

            }

        } catch (e) { console.error('[Stream] Parse error', e); }

        if (textChunk || toolCallUpdate) {

            localMessagesBuffer = localMessagesBuffer.map(m => {

                if (m.id === assistantMsgId) {

                    const newMsg: Message = { ...m };

                    newMsg.contentSegments = m.contentSegments ? [...m.contentSegments] : [];

                    if (textChunk) {

                        newMsg.content = (newMsg.content || '') + textChunk;

                        const order = newMsg.contentSegments.length;

                        const startPos = (newMsg.content || '').length - textChunk.length;

                        newMsg.contentSegments = [...newMsg.contentSegments, { type: 'text' as const, order, timestamp: Date.now(), content: textChunk, startPos, endPos: newMsg.content.length }];

                    }

                    if (toolCallUpdate) {
                        console.log('[Chat] 🔧 Received tool call update:', toolCallUpdate);

                        const toolName = toolCallUpdate.function?.name || toolCallUpdate.tool;

                        const newArgs = toolCallUpdate.function?.arguments || '';

                        const existingCalls = newMsg.toolCalls || [];

                        const idx = existingCalls.findIndex(tc => (toolCallUpdate.id && tc.id === toolCallUpdate.id) || (toolCallUpdate.id === null && (tc as any).index === toolCallUpdate.index));

                                                if (idx !== -1) {

                                                    const tc = existingCalls[idx];

                                                    const argsStr = ((tc as any).function?.arguments || '') + newArgs;

                                                    

                                                    // 🏆 物理加固：确保 arguments 源码被完整保留

                                                    const updated = [...existingCalls];

                                                    let parsed = { ...tc.args };

                                                    try { parsed = JSON.parse(argsStr); } catch (e) { /* 解析中状态 */ }

                                                    

                                                    updated[idx] = { 

                                                        ...tc, 

                                                        args: parsed, 

                                                        function: { name: toolName, arguments: argsStr }, 

                                                        isPartial: true 

                                                    } as any;

                                                    newMsg.toolCalls = updated;

                                                }

                         else {
                            const tid = toolCallUpdate.id || crypto.randomUUID();
                            let initialArgs: any = {};
                            try {
                                initialArgs = newArgs ? JSON.parse(newArgs) : {};
                            } catch (e) {
                                const safeArgsString = String(newArgs);
                                const contentMatch = safeArgsString.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)(?:\\|"?$)/s);
                                if (contentMatch) {
                                    let content = contentMatch[1];
                                    content = content.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
                                    initialArgs.content = content;
                                }
                                const relPathMatch = safeArgsString.match(/"rel_path"\s*:\s*"([^"]*)"?/);
                                if (relPathMatch) initialArgs.rel_path = relPathMatch[1];
                            }
                            
                            const tc = { id: tid, type: 'function' as const, tool: toolName, args: initialArgs, function: { name: toolName, arguments: newArgs }, status: 'pending' as const, isPartial: true, index: toolCallUpdate.index } as any;
                            newMsg.toolCalls = [...existingCalls, tc];

                            const order = newMsg.contentSegments.length;

                            newMsg.contentSegments = [...newMsg.contentSegments, { type: 'tool' as const, order, timestamp: Date.now(), toolCallId: tid }];

                        }

                    }

                    return newMsg;

                }

                return m;

            });

            if (!renderRequested) {

                renderRequested = true;

                requestAnimationFrame(() => { coreUseChatStore.setState({ messages: [...localMessagesBuffer] } as any); renderRequested = false; });

            }

        }

    });

    const unlistenFinish = await listen<string>(`${assistantMsgId}_finish`, async (event) => {

        console.log("[Chat/GenerateResponse] Stream finished");

        // 🔥 v0.3.7: 处理 Inline 任务的自动收尾
        InlineSyncService.handleResponseFinish();

        // 🏆 PIVO 3.0: 强制同步 buffer - 确保 requestAnimationFrame 中的更新已生效
        // 避免 finish 事件先于工具调用更新到达 store 的竞态条件
        coreUseChatStore.setState({ messages: [...localMessagesBuffer] } as any);

        console.log("[Chat/Sentinel] Force finalizing tool calls for:", assistantMsgId);

        coreUseChatStore.setState(s => ({
            messages: s.messages.map(m => {
                // 🏆 PIVO 3.0: 移除 && m.toolCalls 条件 - 即使 toolCalls 为空也要处理消息
                if (m.id === assistantMsgId) {
                    // 🏆 保护：如果没有 toolCalls，直接返回原消息
                    if (!m.toolCalls || m.toolCalls.length === 0) {
                        return { ...m, isStreaming: false };
                    }
                    return {
                        ...m,
                        toolCalls: m.toolCalls.map(tc => {
                            if (tc.status === 'pending' || tc.isPartial) {
                                let finalArgs = tc.args || {};
                                if ((tc as any).function?.arguments) {
                                    try {
                                        const parsed = JSON.parse((tc as any).function.arguments);
                                        finalArgs = { ...finalArgs, ...parsed };
                                    } catch (e) { /* keep existing */ }
                                }
                                return { ...tc, isPartial: false, args: finalArgs };
                            }
                            return tc;
                        })
                    };
                }
                return m;
            })
        }));

        // 更新本地 buffer 保持同步
        localMessagesBuffer = coreUseChatStore.getState().messages;

        // 🏆 调试：检查 localMessagesBuffer 中的工具调用
        const bufferMsg = localMessagesBuffer.find(m => m.id === assistantMsgId);
        console.log('[Chat/Finish] 🔍 Local buffer state:', {
            hasToolCalls: !!(bufferMsg && bufferMsg.toolCalls),
            toolCallsCount: bufferMsg?.toolCalls?.length || 0,
            toolCalls: bufferMsg?.toolCalls?.map(tc => ({ tool: tc.tool, status: tc.status, isPartial: tc.isPartial }))
        });

        const settings = useSettingsStore.getState();

        const finalizedMessages = coreUseChatStore.getState().messages;

        const assistantIndex = finalizedMessages.findIndex(m => m.id === assistantMsgId);

        let userMessageHasAutoApprove = false;

        // 🔥 查找授权标志：检查上一条用户消息或当前助手消息
        const currentAssistantMsg = finalizedMessages.find(m => m.id === assistantMsgId);
        if (currentAssistantMsg && (currentAssistantMsg as any).autoApproveTools === true) {
            userMessageHasAutoApprove = true;
        } else if (assistantIndex > 0) {
            for (let i = assistantIndex - 1; i >= 0; i--) {
                if (finalizedMessages[i].role === 'user') {
                    userMessageHasAutoApprove = (finalizedMessages[i] as any).autoApproveTools === true;
                    break;
                }
            }
        }

        const approvalMode = settings.agentApprovalMode || 'session-once';

        const currentThreadId = useThreadStore.getState().activeThreadId || 'default';
        const sessionTrust = settings.trustedSessions?.[currentThreadId];
        const isSessionTrusted = sessionTrust ? Date.now() < sessionTrust.expiresAt : false;

        const message = finalizedMessages.find(m => m.id === assistantMsgId);
        console.log('[Chat/Finish] 🔍 Looking for message:', assistantMsgId, {
            found: !!message,
            hasToolCalls: !!(message && message.toolCalls),
            toolCallsCount: message?.toolCalls?.length || 0
        });

        if (message && message.toolCalls) {
            console.log('[Chat/Finish] 🔍 Found message with tool calls:', {
                toolCalls: message.toolCalls.length,
                tools: message.toolCalls.map(tc => ({ tool: tc.tool, status: tc.status, isPartial: tc.isPartial }))
            });

            // 🔥 FIX: 重新从 window 获取最新模式
            const latestEditorMode = (window as any).__IFAI_EDITOR_MODE__ || 'standard';

            const pendingToolCalls = message.toolCalls.filter(tc => {
                const isPending = tc.status === 'pending';
                const isComplete = !tc.isPartial;
                const isAdvancedMode = latestEditorMode === 'spec' || latestEditorMode === 'vibe';

                console.log('[Chat/Finish] 🔎 Filtering tool:', tc.tool, {
                    isPending, isComplete, isAdvancedMode,
                    willPass: isPending && (isComplete || isAdvancedMode)
                });

                if (!isPending || (!isComplete && !isAdvancedMode)) return false;

                // 使用统一策略判断当前工具是否应自动批准
                return checkAutoApprove({
                    settings,
                    editorMode: latestEditorMode as any,
                    isSessionTrusted,
                    toolName: tc.tool,
                    isSandbox: true,
                    userMessageHasAutoApprove
                });
            });

            console.log('[Chat/Finish] ✅ Pending tools after filter:', pendingToolCalls.length);

            if (pendingToolCalls.length > 0) {
                // 执行所有待处理的工具
                const promises = pendingToolCalls.map(tc => 
                    (coreUseChatStore.getState() as any).approveToolCall(assistantMsgId, tc.id, { skipContinue: true })
                );
                
                // 等待这一批工具全部执行完毕
                await Promise.all(promises);

                const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                if (providerConfig) {
                    // 🏆 物理削峰：延迟 800ms 触发，给 UI 和后端留出喘息时间，并防止 429
                    setTimeout(async () => {
                        // 再次检查是否有其他工具正在运行（例如刚被批准的或者长耗时的）
                        const latestMessages = coreUseChatStore.getState().messages;
                        const latestMsg = latestMessages.find(m => m.id === assistantMsgId);
                        const anyRunning = latestMsg?.toolCalls?.some(tc => tc.status === 'approved' || tc.isPartial);
                        
                        if (anyRunning) {
                            console.log('[Chat] ⏳ Delaying feedback: tools still running');
                            return; // 由最后一个完成的工具来触发 feedback
                        }

                        console.log('[Chat] 🚀 Batch tools completed, sending aggregated feedback');
                        unlistenStatus(); unlistenStream(); unlistenFinish(); unlistenError();
                        await patchedGenerateResponse(coreUseChatStore.getState().messages, providerConfig, { enableTools: (window.__IFAI_EDITOR_MODE__ !== "vibe") });
                    }, 800);
                    return;
                }
            }
        }

        unlistenStatus(); unlistenStream(); unlistenFinish(); unlistenError();
        coreUseChatStore.setState({ isLoading: false });
    });

    const unlistenError = await listen<string>(`${assistantMsgId}_error`, (event) => {
        const safe = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
        console.error(`[Chat Error] ${safe}`);

        let displayError = safe;
        if (safe.includes('429')) {
            displayError = '⚠️ **API 速率限制 (429)**: 您当前的消息发送过于频繁，AI 暂时无法响应。请等待约 10-30 秒后再次发送或刷新页面。';
        }

        coreUseChatStore.setState(s => ({ 
            messages: s.messages.map(m => m.id === assistantMsgId ? { ...m, content: `❌ Error: ${displayError}` } : m), 
            isLoading: false 
        }));

        unlistenStatus(); unlistenStream(); unlistenFinish(); unlistenError();
    });

        try {
            // 🔥 v0.5.0: 增强型模式判定
            const currentMode = (window as any).__IFAI_EDITOR_MODE__;
            const shouldEnableTools = options?.enableTools !== undefined 
                ? options.enableTools 
                : (currentMode !== "vibe");

            await invoke('ai_chat', { 
                providerConfig: backendConfig, 
                messages: msgHistory, 
                eventId: assistantMsgId, 
                projectRoot: useFileStore.getState().rootPath, 
                enableTools: shouldEnableTools,
                activeSkillIds: (window as any).__IFAI_ACTIVE_SKILLS__ || [],
                mode: currentMode || "vibe"
            });

                

        } catch (e) {

    

        coreUseChatStore.setState(s => ({ messages: s.messages.map(m => m.id === assistantMsgId ? { ...m, content: `❌ Error: ${e}` } : m), isLoading: false }));

        unlistenStatus(); unlistenStream(); unlistenFinish(); unlistenError();

    }

};

const autoApprovedIds = new Set();
const patchedApproveToolCall = async (
    messageId: string,
    toolCallId: string,
    options?: { skipContinue?: boolean }
) => {
    // 🔥 PIVO 2.0: 结构化审批引擎（标准路径）
    const settings = useSettingsStore.getState();
    const useNewEngine = settings.enableNewApprovalEngine !== false; // 默认为开启

    // 🏆 PIVO 2.0: 增强拦截逻辑 (物理级加固版)
    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);
    const toolName = toolCall?.tool || '';
    const agentId = (toolCall as any)?.agentId;

    const isSupportedByNewEngine = [
        "agent_write_file", "agent_read_file", "agent_list_dir", 
        "agent_delete_file", "agent_list_functions", "agent_scan_project",
        "bash", "agent_bash", "agent_execute_command", "execute_bash_command", "agent_run_shell_command",
        "agent_search", "search_semantic", "agent_batch_read", "init_rag_index",
        "get_file_symbols"
    ].includes(toolName);

    if (useNewEngine && isSupportedByNewEngine && !agentId) {
        return await globalConcurrencyManager.run(async () => {
            console.log(`[ApprovalEngine] 🛡️ INTERCEPTED: ${toolName} | ID: ${toolCallId}`);
            try {
                const { getApprovalCoordinator } = await import('../core/approval');
                const coordinator = getApprovalCoordinator();

                // 物理双轨抓取：强制读取原始字符串源码
                const latestState = coreUseChatStore.getState();
                const latestMsg = latestState.messages.find(m => m.id === messageId);
                const latestToolCall = latestMsg?.toolCalls?.find(tc => tc.id === toolCallId);

                if (latestToolCall) {
                    let finalArgs = latestToolCall.args || {};
                    const rawArgsStr = (latestToolCall as any).function?.arguments || "";

                    // 🏆 核心逻辑：如果 args 为空，物理强力反序列化源码
                    if (rawArgsStr) {
                        try {
                            const parsed = JSON.parse(rawArgsStr);
                            finalArgs = { ...finalArgs, ...parsed };
                            console.log(`[ApprovalEngine] 🧠 Physical recovery success for ${toolName}.`);
                        } catch (e) {
                            const m = rawArgsStr.match(/"rel_path"\s*:\s*"([^"]+)"/);
                            if (m) finalArgs.rel_path = m[1];
                        }
                    }

                    // 🏆 PIVO 3.0: 物理级影子参数注入 (Shadow Parameter Hydration)
                    // 针对 agent_read_file，如果 AI 忘记传路径，自动补全为当前活跃文件
                    if (latestToolCall.tool === 'agent_read_file' && !finalArgs.rel_path && !finalArgs.path) {
                        const fileState = useFileStore.getState();
                        const activeFile = fileState.openedFiles.find(f => f.id === fileState.activeFileId);
                        const fallbackPath = activeFile?.path;

                        if (fallbackPath) {
                            console.log(`[ChatStore] 💧 Shadow Hydration: Injected path "${fallbackPath}" into ${latestToolCall.tool}`);
                            finalArgs.rel_path = fallbackPath;
                            // 同步回 toolCall 对象以保持 UI 显示一致
                            (latestToolCall as any).args = finalArgs;
                        } else {
                            // 实在没招了，才走静默报错逻辑
                            console.warn(`[ChatStore] 🛡️ Shadow Hydration failed: No active file found.`);
                            const silentError = { success: false, content: "[Error] rel_path is required but was not provided. Please retry with target file path.", error: "Missing mandatory parameter: rel_path" };

                            coreUseChatStore.setState(s => ({
                                messages: s.messages.map(m => m.id === messageId ? {
                                    ...m, toolCalls: m.toolCalls?.map(tc => tc.id === toolCallId ? { ...tc, status: "failed" as const, result: silentError.content, output: silentError.content } : tc)
                                } : m)
                            }));

                            coreUseChatStore.getState().addMessage({ id: crypto.randomUUID(), role: "tool", content: silentError.content, tool_call_id: toolCallId });

                            if (!options?.skipContinue) {
                                const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                                if (providerConfig) setTimeout(async () => { await (window as any).__chatStore?.getState().generateResponse(coreUseChatStore.getState().messages, providerConfig); }, 100);
                            }
                            return;
                        }
                    }

                    await coordinator.createApproval(messageId, { id: latestToolCall.id, tool: latestToolCall.tool, args: finalArgs });

                    // 🏆 v0.3.8: PIVO Sentinel Pre-Hook
                    SentinelService.beforeExecute(latestToolCall.tool, finalArgs);

                    const result = await coordinator.approve(toolCallId);

                    // 🏆 v0.3.8: PIVO Sentinel Post-Hook
                    SentinelService.afterExecute(latestToolCall.tool, result);

                    // 🏆 PIVO 3.0: 物理保真度保全 - 严禁在同步层修改原始数据类型
                    const finalResult = result.content || result.error || "";

                    console.log(`[ChatStore] 💾 Synchronizing tool result:`, {
                        tool: latestToolCall.tool,
                        success: result.success,
                        contentSize: finalResult.length
                    });

                    // 同步结果
                    coreUseChatStore.setState(s => ({
                        messages: s.messages.map(m => m.id === messageId ? {
                            ...m, toolCalls: m.toolCalls?.map(tc => tc.id === toolCallId ? {
                                ...tc,
                                status: result.success ? "completed" as const : "failed" as const,
                                // 🚀 保持原始字符串，确保 package-lock.json 等文件不被破坏
                                result: finalResult,
                                output: finalResult
                            } : tc)
                        } : m)
                    }));

                    coreUseChatStore.getState().addMessage({ id: crypto.randomUUID(), role: "tool", content: finalResult, tool_call_id: toolCallId });

                    // 🏆 v0.3.9: 物理级主动刷新资源管理器与编辑器同步
                    // 如果是写入类工具且成功，立即触发刷新，不完全依赖异步订阅者
                    const isWritingTool = ['agent_write_file', 'agent_replace', 'agent_insert_code', 'agent_delete_file', 'bash', 'agent_bash', 'agent_execute_command'].includes(latestToolCall.tool);
                    if (result.success && isWritingTool) {
                        console.log(`[ChatStore] 🔄 Tool "${latestToolCall.tool}" success, triggering immediate file tree refresh.`);
                        const fileState = useFileStore.getState();
                        fileState.refreshFileTreeDebounced();

                        // 🏆 PIVO 3.0: 实时编辑器内容物理同步
                        // 如果改动的是当前已打开的文件，强制同步内存中的 content，触发 Monaco 物理刷新
                        const targetPath = finalArgs.path || finalArgs.rel_path || finalArgs.file_path;
                        if (targetPath) {
                            const openedFile = fileState.openedFiles.find(f =>
                                f.path === targetPath ||
                                (fileState.rootPath && f.path === `${fileState.rootPath}/${targetPath}`)
                            );
                            if (openedFile) {
                                // 尝试从 JSON 响应中提取 newContent (支持 Diff 协议)
                                let updatedContent = "";
                                try {
                                    const parsed = JSON.parse(result.content || "");
                                    updatedContent = parsed.newContent || finalArgs.content || "";
                                } catch (e) {
                                    // 兜底：如果不是 JSON，直接使用 AI 写入的内容
                                    updatedContent = finalArgs.content || "";
                                }

                                if (updatedContent) {
                                    console.log(`[ChatStore] ⚡ Physical Sync: Updating opened file "${targetPath}" content.`);
                                    fileState.updateFileContent(openedFile.id, updatedContent);
                                    fileState.setFileDirty(openedFile.id, false); // 磁盘已同步，重置为非 dirty
                                }
                            }
                        }
                    }

                    if (!options?.skipContinue && result.success) {
                        const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                        if (providerConfig) setTimeout(async () => { await patchedGenerateResponse(coreUseChatStore.getState().messages, providerConfig); }, 300);
                    }
                    return;
                }  // <-- 闭合 if (latestToolCall)
            } catch (e) {
                console.error('[ApprovalEngine] Critical Failure:', e);
            }
        });
    }

    return await globalConcurrencyManager.run(async () => {
        console.log(`[useChatStore] patchedApproveToolCall called - messageId: ${messageId}, toolCallId: ${toolCallId}`);
        const state = coreUseChatStore.getState();
        let message = state.messages.find(m => m.id === messageId);
        let toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

        if (!message || !toolCall) {
            const agentStore = useAgentStore.getState();
            const canonicalId = agentStore.deduplicator.getCanonicalId(toolCallId);
            if (canonicalId) {
                message = state.messages.find(m => m.id === messageId);
                toolCall = message?.toolCalls?.find(tc => tc.id === canonicalId);
            }
            if (!toolCall) return;
        }

        const TERMINAL_STATES = ["completed", "failed", "rejected"];
        if (TERMINAL_STATES.includes(toolCall.status)) return;

        if ((toolCall as any).agentId) {
            const agentId = (toolCall as any).agentId;
            coreUseChatStore.setState(s => ({
                messages: s.messages.map(m => m.id === messageId ? {
                    ...m, toolCalls: m.toolCalls?.map(tc => tc.id === toolCallId ? { ...tc, status: "approved" as const } : tc)
                } : m)
            }));
            await useAgentStore.getState().approveAction(agentId, true);
            return;
        }

        const fsTools = ["agent_write_file", "agent_read_file", "agent_list_dir", "agent_delete_file", "agent_list_functions", "agent_read_file_range", "agent_scan_project"];
        const toolName = toolCall.tool || (toolCall as any).function?.name;
        let relPath = toolCall.args?.rel_path || toolCall.args?.path || (toolName === "agent_list_dir" ? "." : "");

        if (fsTools.includes(toolName)) {
            coreUseChatStore.setState(s => ({
                messages: s.messages.map(m => m.id === messageId ? {
                    ...m, toolCalls: m.toolCalls?.map(tc => tc.id === toolCallId ? { ...tc, status: "approved" as const } : tc)
                } : m)
            }));

            try {
                const rootPath = useFileStore.getState().rootPath;
                if (!rootPath) throw new Error("No project root");

                let outputContent: any;
                const finalTauriArgs = { rootPath, relPath, ...(toolCall.args || {}) };

                // 🏆 v0.3.8: PIVO Sentinel Pre-Hook
                SentinelService.beforeExecute(toolName, finalTauriArgs);

                if (toolName === "agent_scan_project") {
                    outputContent = await invoke("agent_scan_project", { 
                        rootPath, 
                        relPath, 
                        maxDepth: (toolCall.args || {}).max_depth || (toolCall.args || {}).maxDepth || 3 
                    });
                } else if (toolName === "agent_list_functions") {
                    outputContent = await invoke("agent_list_functions", { rootPath, relPath });
                } else {
                    outputContent = await invoke(toolName, finalTauriArgs);
                }

                // 🏆 v0.3.8: PIVO Sentinel Post-Hook
                SentinelService.afterExecute(toolName, outputContent);

                // 🏆 v0.3.6: 增强型结果解析，防止 undefined 漏洞
                let stringResult: string;
                if (outputContent && typeof outputContent === "object" && "content" in outputContent) {
                    stringResult = String((outputContent as any).content);
                } else {
                    stringResult = typeof outputContent === "object" ? JSON.stringify(outputContent) : String(outputContent);
                }

                // 🏆 v0.4.1: 逻辑已迁移至全局 addMessage 拦截器 (patchedAddMessage)
                // 这里只需简单更新工具状态，UI 元数据注入将自动发生
                coreUseChatStore.setState(s => ({
                    messages: s.messages.map(m => m.id === messageId ? {
                        ...m, toolCalls: m.toolCalls?.map(tc => tc.id === toolCallId ? { ...tc, status: "completed" as const, result: stringResult } : tc)
                    } : m)
                }));

                // Add tool result message
                coreUseChatStore.getState().addMessage({
                    id: crypto.randomUUID(),
                    role: "tool",
                    content: stringResult,
                    tool_call_id: toolCallId
                });

                // 🚀 v0.3.6: 自动触发 AI 下一轮回复 (核心修复)
                if (!options?.skipContinue) {
                    const settings = useSettingsStore.getState();
                    const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                    if (providerConfig) {
                        console.log("[Chat] Tool execution finished, auto-continuing conversation...");
                        // 稍微延迟，确保 Store 状态已完全写入
                        setTimeout(async () => {
                            await patchedGenerateResponse(coreUseChatStore.getState().messages, providerConfig);
                        }, 300);
                    }
                }

            } catch (e) {
                console.error("[Chat] Tool error:", e);
                coreUseChatStore.setState(s => ({
                    messages: s.messages.map(m => m.id === messageId ? {
                        ...m, toolCalls: m.toolCalls?.map(tc => tc.id === toolCallId ? { ...tc, status: "failed" as const, result: String(e) } : tc)
                    } : m)
                }));
            }
        } else {
            await originalApproveToolCall(messageId, toolCallId);
        }
        useFileStore.getState().refreshFileTree();
    });
};

const patchedRejectToolCall = async (messageId: string, toolCallId: string) => {
    await originalRejectToolCall(messageId, toolCallId);
};

// Apply patches to the store
coreUseChatStore.setState({
    sendMessage: patchedSendMessage,
    addMessage: patchedAddMessage,
    generateResponse: patchedGenerateResponse,
    approveToolCall: patchedApproveToolCall,
    rejectToolCall: patchedRejectToolCall,
    approveAllToolCalls: async (mid: string) => {
        const msg = coreUseChatStore.getState().messages.find(m => m.id === mid);
        if (!msg?.toolCalls) return;
        for (const tc of msg.toolCalls) if (tc.status === "pending") await (coreUseChatStore.getState() as any).approveToolCall(mid, tc.id);
    }
} as any);

// 🔥 v0.3.7: 建立全局自动持久化订阅（带防抖和物理清理保护）
let persistenceTimeout: any = null;
coreUseChatStore.subscribe((state, prevState) => {
    if (state.messages !== prevState.messages) {
        const threadId = useThreadStore.getState().activeThreadId;
        if (threadId) {
            if (persistenceTimeout) clearTimeout(persistenceTimeout);
            persistenceTimeout = setTimeout(async () => {
                try {
                    // 仅在空闲或重要节点同步，减少压力
                    setThreadMessages(threadId, state.messages as any);
                } catch (e) {
                    if (e instanceof Error && (e.name === 'QuotaExceededError' || e.message.includes('quota'))) {
                        console.error('[Persistence] Storage quota exceeded! Emergency cleanup initiated...');
                        // 物理级强力清理：获取所有线程，删除最旧的 5 个
                        const threads = useThreadStore.getState().getAllThreads();
                        const oldestThreads = threads.slice(-5);
                        for (const t of oldestThreads) {
                            const { threadPersistence } = await import('./persistence/threadPersistence');
                            await threadPersistence.deleteThreadPhysical(t.id);
                            useThreadStore.getState().deleteThread(t.id);
                        }
                        // 清理完重试一次保存当前线程
                        try { setThreadMessages(threadId, state.messages as any); } catch {}
                    }
                }
            }, 2000); // 2秒防抖
        }
    }
});

// 🏆 v0.3.7: PIVO 自动触发与状态同步引擎 (Chat-Native Observer)
coreUseChatStore.subscribe((state, prevState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const prevLastMessage = prevState.messages[prevState.messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'assistant') return;

    // --- 逻辑 A: 初始触发 (仅在消息刚创建时) ---
    if (!prevLastMessage || prevLastMessage.id !== lastMessage.id) {
        const userMessage = state.messages.slice().reverse().find(m => m.role === 'user');
        if (userMessage) {
            const textInput = typeof userMessage.content === 'string' ? userMessage.content : 
                             (userMessage.multiModalContent?.find(p => p.type === 'text')?.text || '');
            
            const intentResult = recognizeIntent(textInput);
            if (intentResult && (intentResult.category === 'write' || intentResult.confidence > 0.8)) {
                invoke('pivo_generate_tasks', { intent: textInput })
                    .then((tasks: any) => {
                        const { usePivoStore } = (window as any).__pivoStore ? { usePivoStore: (window as any).__pivoStore } : { usePivoStore: null };
                        if (usePivoStore && tasks?.length > 0) {
                            usePivoStore.getState().setTaskTree(lastMessage.id, tasks);
                        }
                    }).catch(() => {});
            }
        }
    }

    // --- 逻辑 B: 状态实时同步 (监听工具调用结果) ---
    const { usePivoStore } = (window as any).__pivoStore ? { usePivoStore: (window as any).__pivoStore } : { usePivoStore: null };
    if (!usePivoStore) return;

    const currentTasks = usePivoStore.getState().taskTrees[lastMessage.id];
    if (!currentTasks || currentTasks.length === 0) return;

    // 1. 映射 Implement 任务
    const hasSuccessfulWrite = lastMessage.toolCalls?.some(tc => 
        (tc.tool === 'agent_write_file' || tc.tool === 'agent_replace') && 
        (tc.status === 'completed' || (tc.status as any) === 'executed')
    );
    if (hasSuccessfulWrite) {
        const implTask = currentTasks.find(t => t.task_type === 'Implement' && t.status !== 'success');
        if (implTask) usePivoStore.getState().updateTaskStatus(lastMessage.id, implTask.id, 'success');
    }

    // 2. 映射 Verify 任务
    const hasSuccessfulVerify = lastMessage.toolCalls?.some(tc => 
        tc.tool === 'agent_run_shell' && (tc.status === 'completed' || (tc.status as any) === 'executed')
    );
    if (hasSuccessfulVerify) {
        const verifyTask = currentTasks.find(t => t.task_type === 'Verify' && t.status !== 'success');
        if (verifyTask) usePivoStore.getState().updateTaskStatus(lastMessage.id, verifyTask.id, 'success');
    }

    // 3. 兜底逻辑：如果 AI 回复结束，且内容表达了肯定或结束的语义
    if (!(lastMessage as any).isStreaming) {
        const content = lastMessage.content;
        const completionKeywords = ['成功', '完成', '好了', '完善', '完毕', '结束', 'done', 'complete', 'success', 'ready'];
        const hasCompletionKeyword = completionKeywords.some(k => content.includes(k));
        const isLengthyEnough = content.length > 30; // 避免太短的无意义回复触发

        if (hasCompletionKeyword || isLengthyEnough) {
            console.log('[PIVO Observer] 🏁 检测到 AI 回复结束且语义完整，强制同步任务状态');
            currentTasks.forEach(t => {
                if (t.status === 'pending' || t.status === 'running') {
                    usePivoStore.getState().updateTaskStatus(lastMessage.id, t.id, 'success');
                }
            });
        }
    }
});

// 🏆 v0.3.8: Inline Sync Service Observer - 监听工具状态变更
coreUseChatStore.subscribe((state, prevState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.toolCalls) return;

    const prevLastMessage = prevState.messages.find(m => m.id === lastMessage.id);

    lastMessage.toolCalls.forEach(tc => {
        const prevTc = prevLastMessage?.toolCalls?.find(ptc => ptc.id === tc.id);
        if (tc.status !== prevTc?.status) {
            InlineSyncService.updateToolStatus(tc.tool, tc.status);
        }
    });
});

// 🏆 v0.5.0: DebuggerAgent 实时同步引擎 (强同步初始化)
let isDebugInitialized = false;
function initDebugEventListeners() {
    if (isDebugInitialized) return;
    isDebugInitialized = true;
    
    console.log('[ChatStore] 📡 Initializing DebuggerAgent Event Listeners (Sync)...');
    
    // 1. 监听步骤开始
    listen<{ messageId: string; stepLabel: string; status?: string }>('debug:step:start', (event) => {
        const { messageId, stepLabel, status } = event.payload;
        const pivoStore = (window as any).__pivoStore;
        if (!pivoStore) return;
        
        console.log('[ChatStore] 🚀 Debug Step Start:', stepLabel);
        pivoStore.getState().addTask(messageId, {
            id: `debug-${messageId}-${stepLabel.replace(/\s+/g, '-')}`,
            label: stepLabel,
            status: (status as any) || 'running',
            task_type: 'Verify',
            children: []
        });
    });

    // 2. 监听步骤成功
    listen<{ messageId: string; stepLabel: string }>('debug:step:success', (event) => {
        const { messageId, stepLabel } = event.payload;
        const pivoStore = (window as any).__pivoStore;
        if (!pivoStore) return;
        
        pivoStore.getState().updateTaskStatusByLabel(messageId, stepLabel, 'success');
    });

    // 3. 监听内联预览事件
    listen<{ file: string; original: string; modified: string }>('debug:diff:preview', (event) => {
        const { file, original, modified } = event.payload;
        const inlineStore = (window as any).__inlineEditStore;
        if (inlineStore) {
            inlineStore.setState({
                isInlineEditVisible: true,
                currentFilePath: file,
                originalCode: original,
                modifiedCode: modified,
                pivoStage: 'implement'
            });
        }
    });
}

initDebugEventListeners();

export const useChatStore = coreUseChatStore;
