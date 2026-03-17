// ============================================================================
// 暴露工具函数给 E2E 环境
// ============================================================================
if (typeof window !== 'undefined') {
    (window as any).recognizeIntent = (await import('../utils/intentRecognizer')).recognizeIntent;
    (window as any).checkAutoApprove = (await import('../utils/approvalPolicy')).shouldAutoApprove;
}

import { useChatStore as coreUseChatStore, registerStores, createToolCallDeduplicator } from 'ifainew-core';
import type { Message, ContentPart, ToolCall } from './chatStore';

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
import { recognizeIntent, shouldTriggerAgent } from '../utils/intentRecognizer';
import { shouldAutoApprove as checkAutoApprove } from '../utils/approvalPolicy';
import { autoSaveThread } from './persistence/threadPersistence';
import i18n from '../i18n/config';

import { ApprovalPipeline } from '../utils/approvalPipeline';
import { SentinelService } from '../services/SentinelService';
import { InlineSyncService } from '../services/InlineSyncService';
import { StreamingResponseController } from '../services/chat/StreamingResponseController';
import { MessageLifecycleService } from '../services/chat/MessageLifecycleService';
import { ICoreChatStore } from '../interfaces/ICoreChatStore';

// Content segment interface for tracking stream reception order
export interface ContentSegment {
  type: 'text' | 'tool';
  order: number;
  timestamp: number;
  content?: string;
  toolCallId?: string;
  startPos?: number;
  endPos?: number;
}

const threadMessages: Map<string, Message[]> = new Map();
export function getThreadMessages(threadId: string): Message[] { return threadMessages.get(threadId) || []; }
let isInternalSyncing = false;

export function setThreadMessages(threadId: string, messages: Message[]): void { 
    threadMessages.set(threadId, messages); 
    
    // 🏆 PIVO 3.0: 实时同步活跃线程数据 (带物理防循环锁)
    if (isInternalSyncing) return;

    const activeThreadId = useThreadStore.getState().activeThreadId;
    if (activeThreadId === threadId) {
        const currentMessages = coreUseChatStore.getState().messages;
        
        // 值相等检查
        const hasChanged = currentMessages.length !== messages.length || 
                           (messages.length > 0 && currentMessages[currentMessages.length - 1]?.id !== messages[messages.length - 1]?.id);

        if (hasChanged) {
            console.log(`[ChatStore] 🔄 Syncing active thread messages for: ${threadId}`);
            isInternalSyncing = true;
            try {
                coreUseChatStore.setState({ messages: [...messages] as any });
            } finally {
                isInternalSyncing = false;
            }
        }
    }
    
    autoSaveThread(threadId); 
}
export function clearThreadMessages(): void { threadMessages.clear(); }

export function switchThread(threadId: string): void {
  const threadStore = useThreadStore.getState();
  const currentThreadId = threadStore.activeThreadId;
  if (currentThreadId) {
    const currentMessages = coreUseChatStore.getState().messages;
    setThreadMessages(currentThreadId, [...currentMessages] as any);
  }
  threadStore.switchThread(threadId);
  const targetMessages = getThreadMessages(threadId);
  coreUseChatStore.setState({ messages: [...targetMessages] as any });
}

registerStores(useFileStore.getState, useSettingsStore.getState, useThreadStore.getState);

const getStoreAdapter = (): ICoreChatStore => ({
    messages: coreUseChatStore.getState().messages,
    isLoading: coreUseChatStore.getState().isLoading,
    addMessage: (msg: any) => coreUseChatStore.getState().addMessage(msg),
    updateMessageContent: (id: string, content: string, toolCalls?: any[]) => coreUseChatStore.getState().updateMessageContent(id, content, toolCalls),
    setLoading: (loading: boolean) => coreUseChatStore.setState({ isLoading: loading }),
    approveToolCall: (messageId: string, toolCallId: string, options?: any) => (coreUseChatStore.getState() as any).approveToolCall(messageId, toolCallId, options),
    rejectToolCall: (messageId: string, toolCallId: string) => (coreUseChatStore.getState() as any).rejectToolCall(messageId, toolCallId),
    setState: (updater: any) => coreUseChatStore.setState(updater)
} as any);

const originalSendMessage = coreUseChatStore.getState().sendMessage;
const originalAddMessage = coreUseChatStore.getState().addMessage;
const originalApproveToolCall = coreUseChatStore.getState().approveToolCall;
const originalRejectToolCall = coreUseChatStore.getState().rejectToolCall;

const patchedAddMessage = async (message: Message) => {
    const interceptedMessage = await MessageLifecycleService.interceptAddMessage(message, getStoreAdapter());
    return originalAddMessage(interceptedMessage as any);
};

const patchedSendMessage = async (content: string | any[], providerId: string, modelName: string, options: any = {}) => {
    // 🏆 v0.5.0: 物理级激活调试哨兵
    initDebugEventListeners();

    const store = getStoreAdapter();
    const settings = useSettingsStore.getState();
    const threadStore = useThreadStore.getState();
    let activeThreadId = threadStore.activeThreadId;
    if (!activeThreadId) activeThreadId = threadStore.createThread();
    
    const currentThreadMessages = getThreadMessages(activeThreadId);
    if (currentThreadMessages.length > 0 && coreUseChatStore.getState().messages.length === 0) {
        coreUseChatStore.setState({ messages: currentThreadMessages as any });
    }

    const lifecycleResult = await MessageLifecycleService.interceptSendMessage(content, options, store);
    if (lifecycleResult.shouldStop) return;

    const { userMsgId, userMessageAdded } = lifecycleResult;
    const providerData = settings.providers.find((p: any) => p.id === providerId);
    const providerConfig = {
        ...providerData, provider: providerId, id: providerId, protocol: providerData?.protocol || "openai",
        api_key: providerData?.apiKey || "", base_url: providerData?.baseUrl || "", models: [modelName]
    };

    const displayContent = typeof content === 'string' ? content.replace(/^\[(CHAT|TASK-EXECUTION)\]\s*/, '').replace(/\[TASK-EXECUTION\]\s*/g, '') : content;

    // 🏆 PIVO 3.0: 物理标题同步 - 确保所有路径（包括拦截路径）都能更新标题
    const currentThread = threadStore.getThread(activeThreadId!);
    if (currentThread && /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(currentThread.title)) {
        threadStore.updateThreadTitleFromMessage(activeThreadId!, displayContent as any);
    }

    if (!userMessageAdded) {
        const autoApproveTools = typeof content === 'string' && content.includes('[TASK-EXECUTION]');
        coreUseChatStore.getState().addMessage({
            id: userMsgId, role: 'user', content: displayContent as any,
            // @ts-ignore
            autoApproveTools, isInlineTask: options.isInlineTask, displayLabel: options.displayLabel
        });
    }
    await patchedGenerateResponse(coreUseChatStore.getState().messages, providerConfig, { ...options, userMsgId, enrichedContent: lifecycleResult.enrichedContent, originalContent: content });
};

const patchedGenerateResponse = async (history: any[], providerConfig: any, options?: any) => {
    const store = getStoreAdapter();
    const settings = useSettingsStore.getState();
    const assistantMsgId = crypto.randomUUID();

    // 🏆 PIVO 3.0: 物理骨架屏锁定 - 立即同步设置 isLoading
    coreUseChatStore.setState({ isLoading: true });

    SentinelService.scanForUuid(history);
    const { maxContextMessages, enableSmartContextSelection, maxContextTokens } = settings;
    let messagesToContext = history;
    if (enableSmartContextSelection) messagesToContext = await MessageLifecycleService.prepareContext(history, maxContextMessages, settings.currentModel, maxContextTokens);

    const lastUserMsg = history.slice().reverse().find(m => m.role === 'user');
    const autoApproveTools = (lastUserMsg as any)?.autoApproveTools || false;

    const assistantMsg = {
        id: assistantMsgId, role: 'assistant', content: '', isStreaming: true,
        // @ts-ignore
        autoApproveTools, contentSegments: [] as ContentSegment[], 
        isInlineTask: options?.isInlineTask, displayLabel: options?.displayLabel,
        pivo_started_at: Date.now() // 哨兵宽限期凭据
    };
    coreUseChatStore.getState().addMessage(assistantMsg as any);

    let currentMessages = coreUseChatStore.getState().messages;
    if (!currentMessages.some(m => m.id === assistantMsgId)) currentMessages = [...currentMessages, assistantMsg as any];

    await StreamingResponseController.getInstance().initSession(assistantMsgId, currentMessages as any);

    try {
        const currentMode = (window as any).__IFAI_EDITOR_MODE__;
        const shouldEnableTools = options?.isInlineTask || (options?.enableTools !== undefined ? options.enableTools : currentMode !== "vibe");
        const msgHistory = MessageLifecycleService.transformToApiHistory(messagesToContext, {
            isInlineTask: options?.isInlineTask, isChinese: i18n.language?.startsWith("zh"),
            msgId: options?.userMsgId, enrichedContent: options?.enrichedContent, content: options?.originalContent || ""
        });

        console.log(`[Chat] 📡 Invoking ai_chat for eventId: ${assistantMsgId}`);
        await invoke('ai_chat', {
            providerConfig: {
                ...providerConfig,
                api_key: providerConfig.apiKey || providerConfig.api_key || "",
                base_url: providerConfig.baseUrl || providerConfig.base_url || ""
            },
            messages: msgHistory, eventId: assistantMsgId, projectRoot: useFileStore.getState().rootPath,
            enableTools: shouldEnableTools, activeSkillIds: (window as any).__IFAI_ACTIVE_SKILLS__ || [], mode: currentMode || "vibe"
        });
    } catch (e) {
        console.error('[Chat] Invoke error:', e);
        coreUseChatStore.setState((s: any) => ({
            messages: s.messages.map((m: any) => m.id === assistantMsgId ? { ...m, content: `❌ Error: ${e}`, isStreaming: false } : m),
            isLoading: false
        }));
    }
};

// 🏆 v0.3.8: 终极哨兵 (权威判定版)
coreUseChatStore.subscribe((state, prevState) => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' &&  (lastMsg as any).isStreaming && !state.isLoading) {
        // 🏆 PIVO 3.0: 权威物理判定
        // 哨兵不再根据 Store 的陈旧快照做猜测，而是直接询问控制器的实时心跳
        if (!StreamingResponseController.getInstance().isStreamStuck(lastMsg.id)) return;

        console.log('[Sentinel] 🛡️ Authoritative stuck state detected, force finalizing:', lastMsg.id);
        coreUseChatStore.setState(s => ({
            messages: s.messages.map(m => m.id === lastMsg.id ? { ...m, isStreaming: false } : m)
        }));
    }
});

const patchedApproveToolCall = async (messageId: string, toolCallId: string, options?: { skipContinue?: boolean }) => {
    const settings = useSettingsStore.getState();
    const useNewEngine = settings.enableNewApprovalEngine !== false;
    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);
    const toolName = toolCall?.tool || '';

    const isSupportedByNewEngine = ["agent_write_file", "agent_read_file", "agent_list_dir", "agent_delete_file", "agent_list_functions", "agent_scan_project", "bash", "agent_bash", "agent_execute_command", "execute_bash_command", "agent_run_shell_command", "agent_search", "search_semantic", "agent_batch_read", "init_rag_index", "get_file_symbols"].includes(toolName);

    if (useNewEngine && isSupportedByNewEngine && !(toolCall as any).agentId) {
        return await globalConcurrencyManager.run(async () => {
            const { getApprovalCoordinator } = await import('../core/approval');
            const coordinator = getApprovalCoordinator();
            const latestState = coreUseChatStore.getState();
            const latestMsg = latestState.messages.find(m => m.id === messageId);
            const latestToolCall = latestMsg?.toolCalls?.find(tc => tc.id === toolCallId);
            if (latestToolCall) {
                let finalArgs = latestToolCall.args || {};
                const rawArgsStr = (latestToolCall as any).function?.arguments || "";
                if (rawArgsStr) try { finalArgs = { ...finalArgs, ...JSON.parse(rawArgsStr) }; } catch {}

                // 🏆 PIVO 3.0: 物理级影子参数注入 (Shadow Parameter Hydration)
                // 针对 agent_read_file 和 agent_write_file，如果 AI 忘记传路径，自动补齐为当前活跃文件或任务目标
                const isFilePathMissing = !finalArgs.path && !finalArgs.rel_path && !finalArgs.file_path;
                const isFileTool = ['agent_read_file', 'agent_write_file', 'agent_replace', 'agent_insert_code'].includes(latestToolCall.tool);

                if (isFileTool && isFilePathMissing) {
                    const fileState = useFileStore.getState();
                    const activeFileId = fileState.activeFileId;
                    const activeFile = activeFileId ? fileState.openedFiles.find(f => f.id === activeFileId) : null;
                    const rootPath = fileState.rootPath;
                    
                    // 优先级 1: 尝试从 PIVO 任务树中获取目标路径 (针对 Implement 任务)
                    const pivoStore = (window as any).__pivoStore;
                    const currentTasks = pivoStore?.getState()?.taskTrees[messageId];
                    const taskPath = currentTasks?.find((t: any) => t.target_path && t.status !== 'success')?.target_path;

                    // 优先级 2: 活跃编辑器路径
                    let fallbackPath = taskPath || activeFile?.path;
                    
                    if (fallbackPath) {
                        // 🏆 v0.3.9: 物理级路径纠偏 (Path Sanitization)
                        // 如果是绝对路径，且位于当前项目内，则物理剥离根路径，转为相对路径
                        if (rootPath && fallbackPath.startsWith(rootPath)) {
                            console.log(`[ChatStore] 🛡️ Path Sanitization: Converting absolute path to relative for ${latestToolCall.tool}`);
                            fallbackPath = fallbackPath.replace(rootPath, '').replace(/^\/+/, '');
                        }

                        console.log(`[ChatStore] 💧 Shadow Hydration: Injected relative path "${fallbackPath}" into ${latestToolCall.tool}`);
                        // 兼容多种参数名
                        if (latestToolCall.tool === 'agent_read_file') {
                            finalArgs.rel_path = fallbackPath;
                            finalArgs.path = fallbackPath; // 双向兼容
                        } else {
                            finalArgs.path = fallbackPath;
                            finalArgs.file_path = fallbackPath; // 双向兼容
                        }
                        
                        // 🔥 重要：同步回 toolCall 对象以保持 UI 显示一致
                        (latestToolCall as any).args = { ...finalArgs };
                    } else if (latestToolCall.tool === 'agent_read_file') {
                        // 只有读取操作且实在没招了，才走静默报错逻辑
                        console.warn(`[ChatStore] 🛡️ Shadow Hydration failed: No active file found.`);
                        const silentError = { success: false, content: "[Error] rel_path is required but was not provided. Please retry with target file path.", error: "Missing mandatory parameter: rel_path" };
                        // ... 其余逻辑保持不变
                        
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
                SentinelService.beforeExecute(latestToolCall.tool, finalArgs);
                const result = await coordinator.approve(toolCallId);
                SentinelService.afterExecute(latestToolCall.tool, result);

                // 🏆 PIVO 3.0: 物理保真度保全 - 严禁在同步层修改原始数据类型
                const finalResult = result.content || result.error || "";
                
                console.log(`[ChatStore] 💾 Synchronizing tool result:`, {
                    tool: latestToolCall.tool,
                    success: result.success,
                    contentSize: finalResult.length
                });

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

                // 🏆 v0.3.9: 物理级主动刷新资源管理器
                // 如果是写入类工具且成功，立即触发刷新，不完全依赖异步订阅者
                const isWritingTool = ['agent_write_file', 'agent_replace', 'agent_insert_code', 'agent_delete_file', 'bash', 'agent_bash', 'agent_execute_command'].includes(latestToolCall.tool);
                if (result.success && isWritingTool) {
                    console.log(`[ChatStore] 🔄 Tool "${latestToolCall.tool}" success, triggering immediate file tree refresh.`);
                    useFileStore.getState().refreshFileTreeDebounced();
                }

                coreUseChatStore.getState().addMessage({ id: crypto.randomUUID(), role: "tool", content: result.content || result.error || "", tool_call_id: toolCallId });
                if (!options?.skipContinue && result.success) {
                    const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                    if (providerConfig) setTimeout(async () => { await (window as any).__chatStore?.getState().generateResponse(coreUseChatStore.getState().messages, providerConfig); }, 300);
                }
                return;
            }
        });
    }
    return await originalApproveToolCall(messageId, toolCallId);
};

coreUseChatStore.setState({
    sendMessage: patchedSendMessage,
    addMessage: patchedAddMessage,
    generateResponse: patchedGenerateResponse,
    approveToolCall: patchedApproveToolCall,
    rejectToolCall: originalRejectToolCall,
    approveAllToolCalls: async (mid: string) => {
        const msg = coreUseChatStore.getState().messages.find(m => m.id === mid);
        if (!msg?.toolCalls) return;
        for (const tc of msg.toolCalls) if (tc.status === "pending") await (coreUseChatStore.getState() as any).approveToolCall(mid, tc.id);
    }
} as any);

let persistenceTimeout: any = null;
coreUseChatStore.subscribe((state, prevState) => {
    if (state.messages !== prevState.messages) {
        const threadId = useThreadStore.getState().activeThreadId;
        if (threadId) {
            if (persistenceTimeout) clearTimeout(persistenceTimeout);
            persistenceTimeout = setTimeout(async () => { setThreadMessages(threadId, state.messages as any); }, 2000);
        }
    }
});

// 🏆 v0.3.7: PIVO 自动触发与状态同步引擎 (Chat-Native Observer)
coreUseChatStore.subscribe((state, prevState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;

    // 1. 触发任务拆解 (PIVO 3.0 服务化版本)
    MessageLifecycleService.triggerTaskBreakdown(lastMessage as any, state.messages as any);

    // 2. 任务状态同步
    const pivoStore = (window as any).__pivoStore;
    if (!pivoStore) return;

    const currentTasks = pivoStore.getState().taskTrees[lastMessage.id];
    if (!currentTasks || currentTasks.length === 0) return;

    const hasSuccessfulWrite = lastMessage.toolCalls?.some(tc => 
        (tc.tool === 'agent_write_file' || tc.tool === 'agent_replace' || tc.tool === 'agent_insert_code' || tc.tool === 'agent_delete_file') && 
        (tc.status === 'completed' || (tc.status as any) === 'executed')
    );
    if (hasSuccessfulWrite) {
        const implTask = currentTasks.find((t: any) => t.task_type === 'Implement' && t.status !== 'success');
        if (implTask) pivoStore.getState().updateTaskStatus(lastMessage.id, implTask.id, 'success');
        
        // 🔥 v0.3.9: 物理级文件树自动同步
        useFileStore.getState().refreshFileTreeDebounced();
    }

    const hasSuccessfulVerify = lastMessage.toolCalls?.some(tc => 
        tc.tool === 'agent_run_shell' && (tc.status === 'completed' || (tc.status as any) === 'executed')
    );
    if (hasSuccessfulVerify) {
        const verifyTask = currentTasks.find((t: any) => t.task_type === 'Verify' && t.status !== 'success');
        if (verifyTask) pivoStore.getState().updateTaskStatus(lastMessage.id, verifyTask.id, 'success');
    }

    if (! (lastMessage as any).isStreaming) {
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : '';
        const completionKeywords = ['成功', '完成', '好了', '完善', '完毕', '结束', 'done', 'complete', 'success', 'ready'];
        const hasCompletionKeyword = completionKeywords.some(k => content.includes(k));
        if (hasCompletionKeyword || content.length > 30) {
            currentTasks.forEach((t: any) => {
                if (t.status === 'pending' || t.status === 'running') {
                    pivoStore.getState().updateTaskStatus(lastMessage.id, t.id, 'success');
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
export async function initDebugEventListeners() {
    if (isDebugInitialized) return;
    
    // 检查 Tauri 物理环境
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        console.warn('[ChatStore] 📡 Tauri internals not found, deferring DebuggerAgent initialization.');
        return;
    }

    isDebugInitialized = true;
    console.log('[ChatStore] 📡 Activating DebuggerAgent Physical Sentry...');
    
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
        const fileStore = useFileStore.getState();
        const rootPath = fileStore.rootPath;

        // 🏆 v0.5.0: 物理级路径纠偏 (Normalize Path)
        let normalizedPath = file;
        if (rootPath && normalizedPath.startsWith(rootPath)) {
            normalizedPath = normalizedPath.replace(rootPath, '').replace(/^\/+/, '');
        }

        if (inlineStore) {
            inlineStore.setState({
                isInlineEditVisible: true,
                currentFilePath: normalizedPath,
                originalCode: original,
                modifiedCode: modified,
                pivoStage: 'implement'
            });
        }
    });
}

initDebugEventListeners();

export const useChatStore = coreUseChatStore;
if (typeof window !== 'undefined') {
    (window as any).__chatStore = coreUseChatStore;
    // 🏆 PIVO 3.0: 暴露核心状态机给测试环境 (Authoritative Wait Support)
    Object.defineProperty(window, '__CHAT_STORE_STATE__', {
        get: () => coreUseChatStore.getState(),
        enumerable: true,
        configurable: true
    });
}
