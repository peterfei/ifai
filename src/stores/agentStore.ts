import { create } from 'zustand';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Agent, AgentEventPayload } from '../types/agent';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';
import { useChatStore as coreUseChatStore } from 'ifainew-core';
import { useThreadStore } from './threadStore';
import { useProposalStore } from './proposalStore';
import { useTaskBreakdownStore } from './taskBreakdownStore';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { openFileFromPath } from '../utils/fileActions';
import { useTaskStore } from './taskStore';
// 🔥 模块化导入 - 从核心库
import { createAgentListeners, type IAgentEventListener } from 'ifainew-core';
import { createToolCallDeduplicator, type IToolCallDeduplicator } from 'ifainew-core';
// 🔥 格式化器导入
import { buildTaskTreeLogs, type ParsedTaskNode } from './agent/formatters/taskTree';
import { extractTaskTitlesIncremental } from './agent/formatters/incrementalParser';
import { formatStreamToMarkdown } from './agent/formatters/markdownFormatter';
// 🔥 服务导入
import { syncAgentActionToTaskMonitor } from './agent/services/taskMonitorSync';
// 🔥 事件处理器辅助函数
import { sliceLogs, shouldUpdateStatus, extractTaskTreeFromBuffer, extractTitleFromBuffer, isTitleAlreadyShown } from './agent/handlers/handlerHelpers';
// 🔥 Agent 启动辅助函数
import { convertProviderConfigToBackend, validateLaunchPrerequisites, generateAgentId, generateEventId } from './agent/handlers/agentLaunch';
// 🔥 资源限制器
import { createAgentResourceLimiter, type IAgentResourceLimiter } from './agent/agentResourceLimiter';

// 辅助函数已从 handlers 模块导入

interface AgentState {
  runningAgents: Agent[];
  // 🔥 模块化：使用 AgentEventListener 接口
  listeners: IAgentEventListener;
  agentToMessageMap: Record<string, string>;
  // Track tool calls that have been auto-approved to prevent duplicate approvals
  autoApprovedToolCalls: Set<string>;
  // 🔥 模块化：使用 ToolCallDeduplicator 接口
  deduplicator: IToolCallDeduplicator;
  // 🔥 资源限制器
  resourceLimiter: IAgentResourceLimiter;
  launchAgent: (agentType: string, task: string, chatMsgId?: string, threadId?: string) => Promise<string>;
  removeAgent: (id: string) => void;
  initEventListeners: () => Promise<() => void>;
  approveAction: (id: string, approved: boolean) => Promise<void>;
  clearCompletedAgents: () => void;
  // Helper to sync agent actions to Mission Control
  syncAgentActionToTaskMonitor: (id: string, agentType: string, status: any, log?: string) => void;
}

function unescapeToolArguments(args: any): any {
    if (args && typeof args.content === 'string') {
        args.content = args.content.replace(/\\n/g, '\n').replace(/\\\"/g, '"');
    }
    return args;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runningAgents: [],
  // 🔥 模块化：使用监听器工厂
  listeners: createAgentListeners(),
  agentToMessageMap: {},
  autoApprovedToolCalls: new Set<string>(),
  // 🔥 模块化：使用去重器工厂
  deduplicator: createToolCallDeduplicator(),
  // 🔥 资源限制器
  resourceLimiter: createAgentResourceLimiter(),

  // 🔥 从服务模块导入
  syncAgentActionToTaskMonitor,

  launchAgent: async (agentType: string, task: string, chatMsgId?: string, threadId?: string) => {
    // 1. 生成 ID
    const id = generateAgentId();
    const eventId = generateEventId(id);

    // 2. 资源限制检查
    const { resourceLimiter } = get();
    const resourceCheck = resourceLimiter.validateLaunch(id);
    if (!resourceCheck.canLaunch) {
      throw new Error(`Resource limit reached: ${resourceCheck.reason}`);
    }

    // Get current thread ID if not provided
    const currentThreadId = threadId || useThreadStore.getState().activeThreadId;

    // 3. 验证前置条件
    const projectRoot = useFileStore.getState().rootPath;
    const settingsStore = useSettingsStore.getState();
    const providerConfig = settingsStore.providers.find(p => p.id === settingsStore.currentProviderId);

    validateLaunchPrerequisites({ projectRoot, providerConfig });

    // 4. 转换 provider 配置
    const backendProviderConfig = convertProviderConfigToBackend(providerConfig!);

    // 4. Setup message mapping if needed
    if (chatMsgId) {
        set(state => ({ agentToMessageMap: { ...state.agentToMessageMap, [id]: chatMsgId } }));
    }

    console.log(`[AgentStore] launchAgent - id: ${id}, eventId: ${eventId}, chatMsgId: ${chatMsgId || 'NONE'}, threadId: ${currentThreadId || 'NONE'}`);

    // 5. Setup Listener FIRST - This is critical for industrial grade reliability
    // We register the listener BEFORE calling the backend to catch the very first event.
    let thinkingBuffer = "";
    let lastFlush = 0;

    const unlisten = await listen<AgentEventPayload>(eventId, (event) => {
        console.log(`[AgentStore] 🎯 Listener triggered! eventId: ${eventId}, agentId: ${id}`);
        const payload = event.payload;
        if (!payload || typeof payload !== 'object') return;

        console.log(`[AgentStore] Scoped event for ${id}:`, payload.type, payload);

        const chatState = coreUseChatStore.getState();
        const msgId = get().agentToMessageMap[id];

        // DEBUG: Log msgId status for all events
        console.log(`[AgentStore] DEBUG - Event type: ${payload.type}, msgId: ${msgId || 'UNDEFINED'}, agentId: ${id}`);
        console.log(`[AgentStore] DEBUG - agentToMessageMap:`, get().agentToMessageMap);

        // 🔥 FIX v0.3.8.2: 检查消息是否仍在当前 thread 中
        // 如果用户切换了 thread，chatStore.messages 会被替换，不再包含此 agent 的消息
        if (msgId) {
            const messageExists = chatState.messages.some(m => m.id === msgId);
            if (!messageExists) {
                console.warn(`[AgentStore] ⚠️ Message ${msgId} not found in current thread - skipping event (thread may have switched)`);
                return;
            }
        }

        if (!msgId && payload.type === 'tool_call') {
            console.warn(`[AgentStore] No msgId found for agent ${id} - cannot process tool calls`);
        }
        
        // --- Status Update ---
        if (payload.type === 'status' && (payload as any).status) {
            const { status, progress } = (payload as any);
            set(state => ({
                runningAgents: state.runningAgents.map(a => 
                    a.id === id ? { ...a, status: status as any, progress } : a
                )
            }));
            // Sync to Mission Control
            get().syncAgentActionToTaskMonitor(id, agentType, status);
        }
        // --- Log Update ---
        else if (payload.type === 'log' && (payload as any).message) {
            const message = (payload as any).message;
            set(state => ({
                runningAgents: state.runningAgents.map(a => {
                    if (a.id !== id) return a;
                    const newLogs = sliceLogs([...a.logs, message], 100);
                    // 🔥 使用辅助函数判断状态修复
                    const needsStatusFix = shouldUpdateStatus(a.status);
                    return { ...a, logs: newLogs, status: needsStatusFix ? 'running' : a.status };
                })
            }));
            // Sync to Mission Control
            get().syncAgentActionToTaskMonitor(id, agentType, 'running', message);
        }
        // --- Content Streaming ---
        else if (payload.type === 'thinking' || (payload as any).type === 'content') {
            const chunk = (payload.content || (payload as any).content) || "";
            thinkingBuffer += chunk;

            const now = Date.now();
            const timeSinceLast = now - lastFlush;

            if (now - lastFlush > 10) {  // Reduced from 100ms to 10ms for faster streaming
                const currentBuffer = thinkingBuffer;

                // Update runningAgents (for GlobalAgentMonitor display)
                set(state => ({
                    runningAgents: state.runningAgents.map(a => {
                        if (a.id !== id) return a;

                        // 对于 task-breakdown agent，实时显示生成的内容
                        const shouldShowStreaming = a.type === 'task-breakdown';
                        let newLogs = a.logs;

                        if (shouldShowStreaming && currentBuffer.trim().length > 0) {
                            // 🔥 使用辅助函数解析 taskTree
                            const taskTree = extractTaskTreeFromBuffer(currentBuffer);
                            if (taskTree) {
                                console.log('[AgentStore] Parsed taskTree:', JSON.stringify(taskTree, (key, value) => {
                                    if (key === 'children' && Array.isArray(value)) {
                                        return `[${value.length} children]`;
                                    }
                                    return value;
                                }, 2));

                                const treeLogs = buildTaskTreeLogs(taskTree, 0, '', true);
                                const baseLogs = a.logs.slice(0, 3);
                                newLogs = [...baseLogs, ...treeLogs];
                            } else {
                                // 使用增量解析
                                const incrementalLogs = extractTaskTitlesIncremental(currentBuffer, a.logs);
                                if (incrementalLogs.length > 0) {
                                    const baseLogs = a.logs.slice(0, 3);
                                    newLogs = [...baseLogs, ...incrementalLogs];
                                } else {
                                    // 回退到简单模式
                                    const title = extractTitleFromBuffer(currentBuffer);
                                    if (title && !isTitleAlreadyShown(a.logs, title)) {
                                        newLogs = [...a.logs, `📋 ${title}`];
                                    }
                                }
                            }
                        }

                        const latestLogs = sliceLogs(newLogs, 50); // 只保留最近 50 条

                        return {
                            ...a,
                            content: (a.content || "") + currentBuffer,
                            logs: latestLogs
                        };
                    })
                }));

                // ✅ FIX: Also sync to coreUseChatStore.messages for chat display
                const msgId = get().agentToMessageMap[id];
                if (!msgId) {
                    console.warn(`[AgentStore] ⚠️ No msgId mapping for agent ${id}, cannot update thinking content`);
                    return;
                }

                const agent = get().runningAgents.find(a => a.id === id);
                const { messages } = coreUseChatStore.getState();
                const currentMsg = messages.find(m => m.id === msgId);

                if (!currentMsg) {
                    console.warn(`[AgentStore] ⚠️ Message ${msgId} not found in chatStore, cannot update thinking content`);
                    console.warn(`[AgentStore] Current messages count: ${messages.length}`);
                    return;
                }

                console.log(`[AgentStore] 📝 Updating thinking content: +${currentBuffer.length} chars, total: ${(currentMsg.content || "").length + currentBuffer.length}`);

                // 🔥 FIX: 检测是否是占位文本（如 "🤔 正在思考..."），如果是则清除
                // 当实际 LLM 内容开始出现时，应该清除之前的占位文本
                const placeholderPatterns = ['🤔 正在思考', '🔧 正在处理工具', '🚀 正在执行'];
                const currentContent = currentMsg.content || '';
                const hasPlaceholder = placeholderPatterns.some(p => currentContent.includes(p));
                const isRealContent = !placeholderPatterns.some(p => currentBuffer.includes(p));

                // Helper to strip placeholder text with surrounding newlines
                const stripPlaceholder = (content: string): string => {
                    let cleaned = content;
                    for (const pattern of placeholderPatterns) {
                        const regex = new RegExp(`\\n?${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n?`, 'g');
                        cleaned = cleaned.replace(regex, '');
                    }
                    // Clean up leading/trailing newlines
                    return cleaned.replace(/^\n+|\n+$/g, '');
                };

                // 对于 task-breakdown agent，使用格式化的 Markdown（增量追加）
                if (agent?.type === 'task-breakdown') {
                    // 处理 content 可能是数组的情况
                    let previousContent = '';
                    if (typeof currentMsg.content === 'string') {
                        previousContent = currentMsg.content;
                    } else if (Array.isArray(currentMsg.content)) {
                        previousContent = (currentMsg.content as any).map((p: any) => p.type === 'text' ? p.text : '').join('');
                    }

                    const newContent = formatStreamToMarkdown(currentBuffer, previousContent);
                    // 追加新内容
                    const updatedContent = previousContent + newContent;
                    const updatedMessages = messages.map(m => {
                        if (m.id === msgId) {
                            return { ...m, content: updatedContent };
                        }
                        return m;
                    });
                    coreUseChatStore.setState({ messages: updatedMessages });
                } else {
                    // 其他 agent，使用原始内容
                    const updatedMessages = messages.map(m => {
                        if (m.id === msgId) {
                            // 🔥 FIX: 如果有占位文本且这是真实内容，清除占位文本
                            let finalContent = (m.content || "") + currentBuffer;
                            if (hasPlaceholder && isRealContent && currentContent.length < 200) {
                                // 清除占位文本，只保留新内容
                                finalContent = currentBuffer;
                                console.log(`[AgentStore] 🔥 Clearing placeholder, using real content: "${currentBuffer.slice(0, 30)}..."`);
                            }
                            return { ...m, content: finalContent };
                        }
                        return m;
                    });
                    coreUseChatStore.setState({ messages: updatedMessages });
                    console.log(`[AgentStore] ✅ Thinking content updated for agent ${id}`);
                }

                thinkingBuffer = "";
                lastFlush = now;
            }
        } 
        // --- Tool Calls ---
        else if (payload.type === 'tool_call') {
            const toolCall = payload.toolCall;
            // Debug log for tool call events
            console.log(`[AgentStore] Received tool_call: tool=${toolCall?.tool}, partial=${toolCall?.isPartial}, content_len=${toolCall?.args?.content?.length || 0}`);

            // FILTER: Skip invalid/unknown tool calls to prevent cluttering UI
            // When tool name is empty, undefined, or "unknown", treat as regular conversation
            const isValidTool = toolCall?.tool &&
                toolCall.tool !== 'unknown' &&
                toolCall.tool.trim().length > 0;

            if (!isValidTool) {
                console.warn(`[AgentStore] Skipping invalid tool call: tool="${toolCall?.tool}", id="${toolCall?.id}"`);
                // Don't process this tool call at all - it will be handled as regular text content
                return;
            }

            if (toolCall && msgId) {
                // 🔥 FIX v0.3.8.2: 添加诊断日志
                console.log(`[AgentStore] 🔍 Processing tool_call for message: ${msgId}, tool: ${toolCall.tool}, toolCallId: ${toolCall.id}`);
                console.log(`[AgentStore] 🔍 Current thread has ${chatState.messages.length} messages`);

                const liveToolCall = {
                    id: toolCall.id,
                    type: 'function' as const,
                    tool: toolCall.tool,
                    args: unescapeToolArguments(toolCall.args),
                    function: {
                        name: toolCall.tool,
                        arguments: JSON.stringify(toolCall.args)
                    },
                    status: 'pending' as const,
                    isPartial: toolCall.isPartial,
                    agentId: id
                };

                let messageUpdated = false;
                let isNewToolCall = false;
                const updatedMessages = chatState.messages.map(m => {
                    if (m.id === msgId) {
                        const existing = m.toolCalls || [];

                        // 🔥 FIX v0.3.6: 基于签名去重 - 处理智谱 API 发送不同 ID 但相同内容的 tool_call
                        // 先按签名查找，如果找不到再按 ID 查找
                        const signature = `${liveToolCall.tool}:${JSON.stringify(liveToolCall.args)}`;
                        const signatureIndex = existing.findIndex(tc =>
                            tc.tool === liveToolCall.tool &&
                            JSON.stringify(tc.args) === JSON.stringify(liveToolCall.args)
                        );

                        const index = signatureIndex !== -1
                            ? signatureIndex
                            : existing.findIndex(tc => tc.id === liveToolCall.id);

                        // 🔥 FIX v0.3.6 修正版: 只有在智谱 API 发送具有相同签名但不同 ID 的
                        // 新 tool_call 时才跳过。如果是对现有 tool_call 的更新（index === signatureIndex），
                        // 则允许更新以处理 isPartial 等状态变化。
                        if (index === -1 && signatureIndex !== -1) {
                            // 🔥 FIX v0.3.7: 记录被跳过的 ID 到保留 ID 的映射
                            // 这样当用户点击被跳过的 tool_call 的批准按钮时，可以重定向到正确的 ID
                            const canonicalId = existing[signatureIndex].id;
                            const skippedId = liveToolCall.id;
                            console.log(`[AgentStore] 🔥 Skipping duplicate NEW tool_call by signature: tool=${liveToolCall.tool}`);
                            console.log(`[AgentStore] 📋 Recording ID mapping: ${skippedId} -> ${canonicalId}`);

                            // 🔥 模块化：使用 deduplicator 记录映射关系
                            const currentState = get();
                            currentState.deduplicator.addDuplicate(skippedId, canonicalId);

                            return m;
                        }

                        if (index !== -1) {
                            // Check if content actually changed (deduplication for streaming updates)
                            const prevContent = (existing[index] as any).args?.content || '';
                            const nextContent = liveToolCall.args?.content || '';
                            const prevIsPartial = (existing[index] as any).isPartial;

                            // If content hasn't changed and both are in partial state, skip this update
                            // 🔥 FIX v0.3.3: 必须同时检查 isPartial 没有变化，否则会错过状态转换
                            if (prevContent === nextContent &&
                                prevIsPartial === liveToolCall.isPartial &&
                                liveToolCall.isPartial &&
                                prevIsPartial) {
                                // Content and isPartial unchanged, skip update to avoid unnecessary re-renders
                                return m;
                            }

                            // Update existing tool call
                            const newToolCalls = [...existing];
                            const existingStatus = newToolCalls[index].status;

                            // Define terminal states that should NEVER be overwritten
                            const TERMINAL_STATES = ['completed', 'failed', 'rejected'];

                            newToolCalls[index] = {
                                ...newToolCalls[index],
                                ...liveToolCall,
                                // CRITICAL: Never overwrite terminal states
                                status: TERMINAL_STATES.includes(existingStatus)
                                    ? existingStatus  // Keep existing terminal state
                                    : (existingStatus === 'approved' && liveToolCall.isPartial)
                                        ? existingStatus  // Don't revert approved state with partial update
                                        : liveToolCall.status  // Otherwise use new status
                            };
                            messageUpdated = true;
                            return { ...m, toolCalls: newToolCalls };
                        } else {
                            // Add new tool call
                            isNewToolCall = true;
                            messageUpdated = true;
                            return { ...m, toolCalls: [...existing, liveToolCall] };
                        }
                    }
                    return m;
                });

                if (messageUpdated) {
                    // 🔥 FIX v0.3.8.2: 确认日志
                    console.log(`[AgentStore] ✅ Tool call added/updated in message: tool=${liveToolCall.tool}, toolCallId: ${liveToolCall.id}, isNew: ${isNewToolCall}`);
                    coreUseChatStore.setState({ messages: updatedMessages });

                    // Clear auto-approved flag for new tool calls to allow auto-approve on retry
                    if (isNewToolCall) {
                        const currentState = get();
                        const newSet = new Set(currentState.autoApprovedToolCalls);
                        newSet.delete(liveToolCall.id);
                        set({ autoApprovedToolCalls: newSet });
                    }

                    // Only trigger auto-approve if it's NOT partial and hasn't been auto-approved yet
                    const isNewlyCompleted = !liveToolCall.isPartial;
                    const wasAlreadyAutoApproved = get().autoApprovedToolCalls.has(liveToolCall.id);

                    console.log(`[AgentStore] Auto-approve check: isNewlyCompleted=${isNewlyCompleted}, wasAlreadyAutoApproved=${wasAlreadyAutoApproved}`);

                    if (isNewlyCompleted && !wasAlreadyAutoApproved) {
                        const settings = useSettingsStore.getState();
                        console.log(`[AgentStore] Auto-approve setting: ${settings.agentAutoApprove}`);

                        if (settings.agentAutoApprove) {
                            // Mark as auto-approved BEFORE calling to prevent race condition
                            const currentState = get();
                            const newSet = new Set(currentState.autoApprovedToolCalls);
                            newSet.add(liveToolCall.id);
                            set({ autoApprovedToolCalls: newSet });

                            setTimeout(async () => {
                                const approveToolCall = coreUseChatStore.getState().approveToolCall;
                                if (approveToolCall) {
                                    try {
                                        await approveToolCall(msgId, toolCall.id);
                                    } catch (error) {
                                        console.error(`[AgentStore] Auto-approve failed:`, error);
                                    }
                                }
                            }, 200);
                        } else {
                            // 🔥 DEBUG: 确认工具调用需要手动批准
                            console.log(`[AgentStore] 🔥 Tool call requires manual approval:`, {
                                toolCallId: liveToolCall.id,
                                tool: liveToolCall.tool,
                                status: liveToolCall.status,
                                isPartial: liveToolCall.isPartial,
                                msgId,
                                agentId: id
                            });
                        }
                    }
                }
            }
            // v0.2.6: 处理独立运行的 agent（无 msgId）的工具调用
            // 例如从提案审核弹窗启动的 task-breakdown agent
            else if (toolCall && !msgId) {
                console.log(`[AgentStore] 📎 Processing tool call for standalone agent: tool=${toolCall.tool}, agent=${id}, isPartial=${toolCall.isPartial}`);

                // 只有当工具调用完整时才自动批准
                const isNewlyCompleted = !toolCall.isPartial;

                // 注意：独立 agent 不检查 wasAlreadyAutoApproved
                // 因为每轮 AI 响应的 toolCall.id 会从 _0 重新开始
                if (isNewlyCompleted) {
                    // 立即自动批准工具调用
                    setTimeout(async () => {
                        try {
                            console.log(`[AgentStore] 📎 Auto-approving agent action: agent=${id}, tool=${toolCall.tool}`);
                            await invoke('approve_agent_action', {
                                id: id,      // agent ID
                                approved: true
                            });
                            console.log(`[AgentStore] ✅ Agent action approved: tool=${toolCall.tool}`);
                        } catch (error) {
                            console.error(`[AgentStore] ❌ Failed to approve agent action:`, error);
                        }
                    }, 50); // 较短延迟，因为独立 agent 需要快速响应
                }
            }
        }
        // --- Final Result ---
        else if (payload.type === 'result') {
            const result = payload.result || "";
            console.log(`[AgentStore] Result received for agent ${id}, msgId: ${msgId || 'NONE'}`);

            // Sync to Mission Control
            get().syncAgentActionToTaskMonitor(id, agentType, 'completed', '✅ 任务圆满完成');

            if (msgId) {
                const { messages, isLoading } = coreUseChatStore.getState();
                console.log(`[AgentStore] Before setState: isLoading=${isLoading}`);

                // ⚡️ FIX: 为工具调用设置 result，使得 ToolApproval 组件能显示输出
                // Agent 的最终响应（result）包含了所有工具执行的摘要和输出
                const updatedMessages = messages.map(m => {
                    if (m.id === msgId) {
                        return {
                            ...m,
                            content: result,
                            agentId: undefined,      // ✅ Clear agent ID so isAgentStreaming becomes false
                            isAgentLive: false,       // ✅ Clear live marker so highlighting appears
                            // 🐛 FIX: Update tool call status to completed and set result
                            toolCalls: m.toolCalls?.map(tc => {
                                const isCompleted = (tc.status === 'approved' || tc.status === 'pending');
                                return {
                                    ...tc,
                                    status: isCompleted ? 'completed' as const : tc.status,
                                    // ⚡️ FIX: 为完成的工具设置 result（包含 Agent 的完整响应）
                                    // 这样 ToolApproval 组件就能显示 bash 命令的输出
                                    ...(isCompleted && !tc.result ? { result } : {})
                                };
                            })
                        };
                    }
                    return m;
                });

                coreUseChatStore.setState({
                    messages: updatedMessages,
                    isLoading: false
                });
                console.log(`[AgentStore] After setState: isLoading=${coreUseChatStore.getState().isLoading}`);
            }

            // Get the agent before updating status to check thread info
            const agent = get().runningAgents.find(a => a.id === id);
            const activeThreadId = useThreadStore.getState().activeThreadId;

            set(state => ({
                runningAgents: state.runningAgents.map(a => {
                    if (a.id === id) {
                        const completionLog = `✅ 任务完成 (${Math.round((Date.now() - a.startTime) / 1000)}s)`;
                        // 对于 task-breakdown agent，不设置过期时间，让用户手动关闭
                        const shouldExpire = a.type !== 'task-breakdown';
                        return {
                            ...a,
                            status: 'completed',
                            progress: 1.0,
                            expiresAt: shouldExpire ? Date.now() + 10000 : undefined,
                            logs: [...a.logs, completionLog]
                        };
                    }
                    return a;
                })
            }));

            // Show notification if agent completed in background thread
            if (agent && agent.threadId && agent.threadId !== activeThreadId) {
                const thread = useThreadStore.getState().getThread(agent.threadId);
                if (thread) {
                    // Mark thread as having unread activity
                    useThreadStore.getState().updateThread(agent.threadId, { hasUnreadActivity: true });

                    // Show toast notification
                    toast.success('后台任务完成', {
                        description: `"${agent.type}" 在 "${thread.title}" 中已完成`,
                        action: {
                            label: '查看',
                            onClick: () => {
                                useThreadStore.getState().setActiveThread(agent.threadId!);
                            },
                        },
                    });
                }
            }

            // v0.2.6: Handle proposal-generator agent completion
            console.log('[AgentStore] 📋 Checking agent completion:', {
                agentId: id,
                agentType: agent?.type,
                hasResult: !!result,
                resultLength: result?.length || 0
            });

            if (agent?.type === 'proposal-generator' && result) {
                console.log('[AgentStore] 📋 Proposal generator completed, processing Markdown...');
                console.log('[AgentStore] 📋 Result preview:', result.substring(0, 200));
                (async () => {
                    try {
                        // 导入 Markdown 解析器
                        const { parseProposalFromMarkdown } = await import('../utils/proposalMarkdownParser');

                        // 从 Markdown 中解析 proposal 数据（不消耗 token）
                        console.log('[AgentStore] 📋 Parsing Markdown to extract proposal data...');
                        const parsedProposal = parseProposalFromMarkdown(result);

                        if (parsedProposal) {
                            console.log('[AgentStore] 📋 Parsed proposal data:', {
                                changeId: parsedProposal.changeId,
                                tasksCount: parsedProposal.tasks.length,
                                specDeltasCount: parsedProposal.specDeltas.length
                            });

                            // Create proposal using the proposalStore
                            const proposalStore = useProposalStore.getState();

                            // Build proposal object from parsed data
                            const proposalOptions = {
                                id: parsedProposal.changeId,
                                why: parsedProposal.why,
                                whatChanges: parsedProposal.whatChanges,
                                impact: parsedProposal.impact,
                                tasks: parsedProposal.tasks,
                                specDeltas: parsedProposal.specDeltas,
                            };

                            console.log('[AgentStore] 📋 Creating proposal...');
                            const proposal = await proposalStore.createProposal(proposalOptions);

                            console.log('[AgentStore] ✅ Proposal created:', proposal.id);

                            // Show success toast
                            toast.success('提案生成成功', {
                                description: `"${parsedProposal.changeId}" 已创建，正在打开审核...`,
                            });

                            // 延迟打开审核弹窗，避免在当前渲染周期内触发状态更新
                            console.log('[AgentStore] 📋 Scheduling review modal open for:', proposal.id);
                            setTimeout(() => {
                                console.log('[AgentStore] 📋 Opening review modal for:', proposal.id);
                                proposalStore.openReviewModal(proposal.id);
                                console.log('[AgentStore] 📋 Review modal should be open now');
                            }, 100);
                        } else {
                            console.warn('[AgentStore] ⚠️ Failed to parse proposal from Markdown');
                            // 即使解析失败，Markdown 也已经显示在聊天中
                            toast.info('提案已生成', {
                                description: '提案内容已显示在聊天中，但无法创建审核记录',
                            });
                        }
                    } catch (error) {
                        console.error('[AgentStore] ❌ Failed to process proposal result:', error);
                        // 即使处理失败，Markdown 也已经显示在聊天中
                        toast.error('提案处理失败', {
                            description: '提案内容已显示，但无法打开审核弹窗',
                        });
                    }
                })();
            }
            // v0.2.6: Handle task-breakdown agent completion
            else if (agent?.type === 'task-breakdown' && result) {
                console.log('[AgentStore] 📋 Task breakdown completed, processing result...');
                console.log('[AgentStore] 📋 Result preview:', result.substring(0, 200));
                (async () => {
                    try {
                        // 检查结果是否为空或只有空白字符
                        const trimmedResult = result.trim();
                        if (!trimmedResult || trimmedResult.length < 10) {
                            throw new Error('AI 返回结果为空或过短，无法解析任务拆解');
                        }

                        // Extract JSON from the result (handle markdown code blocks)
                        let jsonStr = result;
                        const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                        if (codeBlockMatch) {
                            jsonStr = codeBlockMatch[1];
                            console.log('[AgentStore] 📋 Extracted JSON from code block');
                        } else {
                            // 如果没有代码块，尝试直接解析
                            console.log('[AgentStore] 📋 No code block found, parsing raw result');
                        }

                        // 清理 JSON 字符串
                        jsonStr = jsonStr.trim();
                        if (!jsonStr || jsonStr.length < 10) {
                            throw new Error('提取的 JSON 内容为空');
                        }

                        console.log('[AgentStore] 📋 Parsing JSON...', {
                            length: jsonStr.length,
                            preview: jsonStr.substring(0, 100)
                        });
                        // Parse the task breakdown data
                        const breakdownData = JSON.parse(jsonStr);

                        console.log('[AgentStore] 📋 Parsed breakdown data:', {
                            hasId: !!breakdownData.id,
                            hasTitle: !!breakdownData.title,
                            hasTaskTree: !!breakdownData.taskTree,
                            breakdownId: breakdownData.id
                        });

                        // 验证并修复数据结构
                        if (breakdownData.taskTree) {
                            // 如果缺少 id，生成一个
                            if (!breakdownData.id) {
                                breakdownData.id = `tb-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                                console.log('[AgentStore] 📋 Generated id for breakdown:', breakdownData.id);
                            }

                            // 如果缺少 title，从 taskTree.title 获取
                            if (!breakdownData.title && breakdownData.taskTree.title) {
                                breakdownData.title = breakdownData.taskTree.title;
                                console.log('[AgentStore] 📋 Extracted title from taskTree:', breakdownData.title);
                            }

                            // 如果仍然没有 title，使用默认值
                            if (!breakdownData.title) {
                                breakdownData.title = '任务拆解';
                                console.log('[AgentStore] 📋 Using default title');
                            }

                            // 如果缺少 description，使用 taskTree.description 或默认值
                            if (!breakdownData.description) {
                                breakdownData.description = breakdownData.taskTree.description || '任务拆解结果';
                                console.log('[AgentStore] 📋 Generated description:', breakdownData.description);
                            }

                            // 如果缺少 originalPrompt，使用 description
                            if (!breakdownData.originalPrompt) {
                                breakdownData.originalPrompt = breakdownData.description;
                                console.log('[AgentStore] 📋 Generated originalPrompt');
                            }

                            // 确保 updatedAt 存在
                            if (!breakdownData.updatedAt) {
                                breakdownData.updatedAt = Date.now();
                            }

                            console.log('[AgentStore] 📋 Final breakdown structure:', {
                                id: breakdownData.id,
                                title: breakdownData.title,
                                description: breakdownData.description,
                                hasTaskTree: !!breakdownData.taskTree
                            });
                            // Save task breakdown using the taskBreakdownStore
                            const taskBreakdownStore = useTaskBreakdownStore.getState();

                            // Build breakdown object from agent result
                            const breakdown = {
                                ...breakdownData,
                                createdAt: Date.now(),
                                status: 'draft' as const,
                            };

                            console.log('[AgentStore] 📋 Saving task breakdown...');
                            await taskBreakdownStore.saveBreakdown(breakdown);

                            console.log('[AgentStore] ✅ Task breakdown saved:', breakdown.id);

                            // v0.2.6: 直接打开提案 markdown 文件，不再显示任务树 UI
                            if (breakdownData.proposalReference && breakdownData.proposalReference.proposalId) {
                                const rootPath = useFileStore.getState().rootPath;
                                const proposalId = breakdownData.proposalReference.proposalId;
                                const proposalPath = `${rootPath}/.ifai/changes/${proposalId}/proposal.md`;

                                console.log('[AgentStore] 📄 Opening proposal file:', proposalPath);

                                // 打开提案文件
                                const success = await openFileFromPath(proposalPath);

                                if (success) {
                                    toast.success('任务拆解完成', {
                                        description: `已打开提案：${breakdownData.title}`,
                                    });
                                } else {
                                    // 如果打开失败，回退到任务树面板
                                    taskBreakdownStore.setCurrentBreakdown(breakdown);
                                    taskBreakdownStore.setPanelOpen(true);
                                    toast.success('任务拆解完成', {
                                        description: `"${breakdownData.title}" 已生成`,
                                        action: {
                                            label: '查看任务树',
                                            onClick: () => {
                                                taskBreakdownStore.setPanelOpen(true);
                                            },
                                        },
                                    });
                                }
                            } else {
                                // 没有提案关联，显示任务树面板
                                taskBreakdownStore.setCurrentBreakdown(breakdown);
                                taskBreakdownStore.setPanelOpen(true);
                                toast.success('任务拆解完成', {
                                    description: `"${breakdownData.title}" 已生成`,
                                    action: {
                                        label: '查看',
                                        onClick: () => {
                                            taskBreakdownStore.setPanelOpen(true);
                                        },
                                    },
                                });
                            }

                        } else {
                            console.warn('[AgentStore] ⚠️ Invalid breakdown data structure:', breakdownData);
                            toast.error('任务拆解格式错误', {
                                description: 'AI 返回的数据格式不正确',
                            });
                        }
                    } catch (error) {
                        console.error('[AgentStore] ❌ Failed to process task breakdown result:', error);
                        toast.error('任务拆解处理失败', {
                            description: error instanceof Error ? error.message : '未知错误',
                        });
                    }
                })();
            } else {
                console.log('[AgentStore] 📋 Skipped proposal/task processing:', {
                    reason: !agent?.type ? 'no agent' : (agent?.type !== 'proposal-generator' && agent?.type !== 'task-breakdown') ? 'wrong agent type' : 'no result',
                    agentType: agent?.type
                });
            }
        }
        // --- Tool Result (bash command output, etc.) ---
        else if (payload.type === 'tool_result') {
            const toolCallId = payload.toolCallId;
            const result = payload.result;
            const success = payload.success;

            console.log(`[AgentStore] Tool result received: toolCallId=${toolCallId}, success=${success}`);

            if (toolCallId && msgId) {
                // 🔥 FIX: Parse JSON string result if applicable
                // The backend sends tool results as JSON strings for structured data (agent_write_file, etc.)
                console.log(`[AgentStore] 🔍 Debug result type:`, typeof result);
                console.log(`[AgentStore] 🔍 Debug result isArray?:`, Array.isArray(result));
                console.log(`[AgentStore] 🔍 Debug result:`, result);

                let parsedResult: any = result;
                if (typeof result === 'string') {
                    try {
                        // Try to parse as JSON
                        parsedResult = JSON.parse(result);
                        console.log(`[AgentStore] ✅ Parsed tool result as JSON:`, typeof parsedResult);
                    } catch {
                        // Not JSON, keep as string
                        console.log(`[AgentStore] ⚠️ Tool result is not JSON, keeping as string`);
                    }
                } else if (Array.isArray(result)) {
                    // Result is already an array (agent_list_dir, etc.)
                    // The formatter can handle arrays directly
                    console.log(`[AgentStore] 📋 Result is already an array with ${(result as any[]).length} elements`);
                    parsedResult = result;
                }

                // ⚡️ FIX: 只更新 result 字段，不修改 status
                // 让 Agent 的 result 事件处理器统一管理 status，避免破坏 Agent 流程
                const { messages } = coreUseChatStore.getState();
                coreUseChatStore.setState({
                    messages: messages.map(m => {
                        if (m.id === msgId && m.toolCalls) {
                            return {
                                ...m,
                                toolCalls: m.toolCalls.map(tc => {
                                    if (tc.id === toolCallId) {
                                        console.log(`[AgentStore] Updating tool result for ${toolCallId}`);
                                        // 只设置 result，保持 status 不变
                                        // status 会在 Agent 完成时由 result 事件处理器统一更新
                                        return {
                                            ...tc,
                                            result: parsedResult,
                                            success: success
                                        };
                                    }
                                    return tc;
                                })
                            };
                        }
                        return m;
                    })
                });
            }
        }
        // --- Explore Progress ---
        else if (payload.type === 'explore_progress') {
            const progress = payload.exploreProgress;
            if (progress) {
                console.log(`[AgentStore] 📂 Explore progress event:`, {
                    phase: progress.phase,
                    currentFile: progress.currentFile,
                    currentPath: progress.currentPath,
                    scanned: progress.progress?.scanned,
                    total: progress.progress?.total,
                    hasScannedFiles: !!progress.scannedFiles,
                    scannedFilesCount: progress.scannedFiles?.length || 0
                });

                // Update agent with explore progress data
                set(state => ({
                    runningAgents: state.runningAgents.map(a => {
                        if (a.id !== id) return a;

                        // Maintain scannedFiles list
                        let scannedFiles = a.exploreProgress?.scannedFiles || [];
                        console.log(`[AgentStore] Before update: scannedFiles=${scannedFiles.length}, currentFile=${progress.currentFile}`);

                        // Check if currentFile is new to add log entry
                        const isNewFile = progress.currentFile && !scannedFiles.includes(progress.currentFile);

                        if (progress.currentFile && !scannedFiles.includes(progress.currentFile)) {
                            scannedFiles = [progress.currentFile, ...scannedFiles].slice(0, 10); // Keep last 10 files
                            console.log(`[AgentStore] Added file: ${progress.currentFile}, new count=${scannedFiles.length}`);
                        }

                        // For completed phase, preserve currentFile and scannedFiles even if progress doesn't have them
                        const finalCurrentFile = progress.currentFile || a.exploreProgress?.currentFile;
                        if (progress.phase === 'completed' && !finalCurrentFile && scannedFiles.length > 0) {
                            console.log(`[AgentStore] Completed phase: preserving ${scannedFiles.length} files without currentFile`);
                        }

                        // Build exploreProgress object carefully to preserve scannedFiles
                        const newExploreProgress: any = {
                            ...(a.exploreProgress || {}),
                            ...progress,
                        };

                        // Special handling: preserve progress data when transitioning to analyzing phase
                        // (backend sends hardcoded total=1, scanned=1 which is incorrect)
                        if (progress.phase === 'analyzing' && a.exploreProgress?.progress) {
                            newExploreProgress.progress = a.exploreProgress.progress;
                        }

                        // Explicitly preserve currentFile if new value is null/undefined
                        newExploreProgress.currentFile = progress.currentFile || a.exploreProgress?.currentFile;
                        // Always preserve scannedFiles - use calculated value if exists, otherwise preserve old
                        if (scannedFiles.length > 0) {
                            newExploreProgress.scannedFiles = scannedFiles;
                        } else if (a.exploreProgress?.scannedFiles) {
                            // Keep old scannedFiles if new ones are empty
                            newExploreProgress.scannedFiles = a.exploreProgress.scannedFiles;
                        }

                        console.log(`[AgentStore] After update: phase=${progress.phase}, currentFile=${newExploreProgress.currentFile}, scannedFiles=${newExploreProgress.scannedFiles?.length || 0}`);

                        // Add log entry when a new file is being scanned
                        let newLogs = a.logs || [];
                        if (isNewFile && progress.currentFile) {
                            // Format as tree structure: group files by directory
                            const parts = progress.currentFile.split('/').filter(p => p);
                            const fileName = parts.pop() || progress.currentFile;
                            const dirPath = parts.join('/');

                            // Check if this directory was already shown in recent logs
                            // Look backwards through logs to find if we're already in this directory
                            let alreadyInDir = false;
                            for (let i = newLogs.length - 1; i >= 0; i--) {
                                const log = newLogs[i];
                                if (log.startsWith(`📁 ${dirPath}`)) {
                                    alreadyInDir = true;
                                    break;
                                }
                                // If we hit another directory header, stop looking
                                if (log.startsWith('📁 ')) {
                                    break;
                                }
                            }

                            if (parts.length > 0) {
                                if (!alreadyInDir) {
                                    // New directory, show directory path
                                    newLogs = [...newLogs, `📁 ${dirPath}`];
                                }
                                // Add file with proper tree prefix
                                newLogs = [...newLogs, `  ├─ ${fileName}`];
                            } else {
                                newLogs = [...newLogs, `📄 ${fileName}`];
                            }
                        }

                        return {
                            ...a,
                            exploreProgress: newExploreProgress,
                            currentStep: `${progress.phase}: ${progress.progress.scanned}/${progress.progress.total}`,
                            progress: progress.progress.total > 0
                                ? progress.progress.scanned / progress.progress.total
                                : a.progress,
                            logs: newLogs
                        };
                    })
                }));

                // Sync to message for UI display
                // Try to find message by msgId first, then by agentId as fallback
                const { messages } = coreUseChatStore.getState();
                const targetMsgId = msgId || (messages as any[]).find(m => m.agentId === id)?.id;

                if (targetMsgId) {
                    const currentMsg = messages.find(m => m.id === targetMsgId);

                    // Calculate scannedFiles for message too
                    let msgScannedFiles = currentMsg?.exploreProgress?.scannedFiles || [];
                    if (progress.currentFile && !msgScannedFiles.includes(progress.currentFile)) {
                        msgScannedFiles = [progress.currentFile, ...msgScannedFiles].slice(0, 10);
                    }

                    // Build message exploreProgress object
                    const newMsgExploreProgress: any = {
                        ...(currentMsg?.exploreProgress || {}),
                        ...progress,
                    };

                    // Special handling: preserve progress data when transitioning to analyzing phase
                    if (progress.phase === 'analyzing' && currentMsg?.exploreProgress?.progress) {
                        newMsgExploreProgress.progress = currentMsg.exploreProgress.progress;
                    }

                    newMsgExploreProgress.currentFile = progress.currentFile || currentMsg?.exploreProgress?.currentFile;
                    if (msgScannedFiles.length > 0) {
                        newMsgExploreProgress.scannedFiles = msgScannedFiles;
                    } else if (currentMsg?.exploreProgress?.scannedFiles) {
                        newMsgExploreProgress.scannedFiles = currentMsg.exploreProgress.scannedFiles;
                    }

                    console.log(`[AgentStore] Message update: msgId=${msgId}, targetMsgId=${targetMsgId}, phase=${progress.phase}, scannedFiles=${newMsgExploreProgress.scannedFiles?.length || 0}`);

                    coreUseChatStore.setState({
                        messages: messages.map(m => m.id === targetMsgId ? {
                            ...m,
                            exploreProgress: newMsgExploreProgress,
                        } : m)
                    });
                } else {
                    console.warn(`[AgentStore] No message found for agent ${id} to update explore progress`);
                }
            }
        }
        // --- Explore Findings ---
        else if (payload.type === 'explore_findings') {
            const findings = payload.exploreFindings;
            if (findings) {
                console.log(`[AgentStore] Explore findings:`, findings.summary);

                // Store findings in agent AND update exploreProgress phase to completed
                set(state => ({
                    runningAgents: state.runningAgents.map(a => {
                        if (a.id !== id) return a;
                        // When completed, update progress to 100%
                        const completedProgress = a.exploreProgress?.progress
                            ? {
                                ...a.exploreProgress.progress,
                                scanned: a.exploreProgress.progress.total
                            }
                            : undefined;

                        return {
                            ...a,
                            exploreFindings: findings,
                            exploreProgress: a.exploreProgress ? {
                                ...a.exploreProgress,
                                phase: 'completed',
                                progress: completedProgress
                            } : undefined
                        };
                    })
                }));

                // Sync findings to message for UI display
                // Try to find message by msgId first, then by agentId as fallback
                const { messages } = coreUseChatStore.getState();
                const targetMsgId = msgId || (messages as any[]).find(m => m.agentId === id)?.id;

                // Get the agent's latest exploreProgress (with scannedFiles)
                const agent = get().runningAgents.find(a => a.id === id);

                console.log(`[AgentStore] Explore findings sync: msgId=${msgId}, targetMsgId=${targetMsgId}, agentId=${id}`);
                console.log(`[AgentStore] Agent exploreProgress:`, {
                    phase: agent?.exploreProgress?.phase,
                    scannedFiles: agent?.exploreProgress?.scannedFiles?.length || 0,
                    progress: agent?.exploreProgress?.progress
                });

                if (targetMsgId) {
                    coreUseChatStore.setState({
                        messages: messages.map(m => {
                            if (m.id !== targetMsgId) return m;

                            // Use agent's exploreProgress as source of truth (with scannedFiles)
                            const agentExploreProgress = agent?.exploreProgress;
                            const msgExploreProgress = m.exploreProgress;

                            // Merge: prefer agent data, fallback to message data
                            const baseExploreProgress = agentExploreProgress || msgExploreProgress;

                            // Update progress to 100% when completed
                            const completedProgress = baseExploreProgress?.progress
                                ? {
                                    ...baseExploreProgress.progress,
                                    scanned: baseExploreProgress.progress.total
                                }
                                : undefined;

                            return {
                                ...m,
                                exploreFindings: findings,
                                exploreProgress: baseExploreProgress ? {
                                    ...baseExploreProgress,
                                    phase: 'completed',
                                    progress: completedProgress
                                } : undefined
                            };
                        })
                    });
                } else {
                    console.warn(`[AgentStore] No message found for agent ${id} to update explore findings`);
                }
            }
        }
        // --- Error ---
        else if (payload.type === 'error') {
            // Sync to Mission Control
            get().syncAgentActionToTaskMonitor(id, agentType, 'failed', `❌ 错误: ${payload.error}`);

            if (msgId) {
                const { messages } = coreUseChatStore.getState();
                coreUseChatStore.setState({
                    messages: messages.map(m => m.id === msgId ? {
                        ...m,
                        content: `❌ Agent Error: ${payload.error}`,
                        agentId: undefined,      // ✅ Clear agent ID
                        isAgentLive: false       // ✅ Clear live marker
                    } : m),
                    isLoading: false
                });
            }

            // Get the agent before updating status to check thread info
            const agent = get().runningAgents.find(a => a.id === id);
            const activeThreadId = useThreadStore.getState().activeThreadId;

            set(state => ({
                runningAgents: state.runningAgents.map(a => {
                    if (a.id === id) {
                        // 对于 task-breakdown agent，不设置过期时间
                        const shouldExpire = a.type !== 'task-breakdown';
                        return {
                            ...a,
                            status: 'failed',
                            expiresAt: shouldExpire ? Date.now() + 10000 : undefined
                        };
                    }
                    return a;
                })
            }));

            // Show notification if agent failed in background thread
            if (agent && agent.threadId && agent.threadId !== activeThreadId) {
                const thread = useThreadStore.getState().getThread(agent.threadId);
                if (thread) {
                    // Mark thread as having unread activity
                    useThreadStore.getState().updateThread(agent.threadId, { hasUnreadActivity: true });

                    // Show toast notification
                    toast.error('后台任务失败', {
                        description: `"${agent.type}" 在 "${thread.title}" 中执行失败`,
                        action: {
                            label: '查看',
                            onClick: () => {
                                useThreadStore.getState().setActiveThread(agent.threadId!);
                            },
                        },
                    });
                }
            }
        }
    });

    // 🔥 模块化：使用 listeners.register() 存储 unlisten 函数
    const { listeners } = get();
    listeners.register(id, unlisten);

    console.log(`[AgentStore] ✅ Listener registered for eventId: ${eventId}`);

    // 4. Create Agent entry in Store
    const newAgent: Agent = {
        id,
        name: `${agentType} Task`,
        type: agentType,
        status: 'initializing',
        progress: 0,
        logs: [
            `🚀 ${agentType} agent 启动...`,
            `📋 任务: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`,
            `⏳ 正在分析任务...`
        ],
        content: "",
        startTime: Date.now(),
        threadId: currentThreadId, // Associate with thread
    };
    set(state => ({ runningAgents: [newAgent, ...state.runningAgents] }));

    // 🔥 资源限制器：记录启动
    get().resourceLimiter.recordLaunch(id);

    // Sync to Mission Control
    get().syncAgentActionToTaskMonitor(id, agentType, 'initializing', `🚀 ${agentType} agent 启动...`);

    // 4.5. Add agent task to thread if threadId exists
    if (currentThreadId) {
        useThreadStore.getState().addAgentTask(currentThreadId, id);
        console.log(`[AgentStore] Added agent ${id} to thread ${currentThreadId}`);
    }

    // 5. Invoke Backend FINALLY
    // By now, the listener is active and the agent entry exists in state.
    try {
        console.log(`[AgentStore] 🚀 About to invoke backend launch_agent with id: ${id}, eventId: agent_${id}`);
        await invoke('launch_agent', {
            id,
            agentType,
            task,
            projectRoot,
            providerConfig: backendProviderConfig
        });
    } catch (error) {
        console.error("Failed to launch agent:", error);
        set(state => ({
            runningAgents: state.runningAgents.map(a => 
                a.id === id ? { ...a, status: 'failed', logs: [...a.logs, `❌ Launch failed: ${error}`] } : a
            )
        }));
        if (unlisten) unlisten();
    }

    return id;
  },

  approveAction: async (id: string, approved: boolean) => {
      console.log(`[AgentStore] approveAction called: id=${id}, approved=${approved}`);
      try {
          await invoke('approve_agent_action', { id, approved });
          console.log(`[AgentStore] approve_agent_action invoke successful`);
          set(state => ({
              runningAgents: state.runningAgents.map(a =>
                  a.id === id ? { ...a, pendingApproval: undefined } : a
              )
          }));
      } catch (error) {
          console.error(`[AgentStore] ❌ approve_agent_action invoke failed:`, error);
          throw error;
      }
  },

  removeAgent: (id: string) => {
      const { listeners, runningAgents, resourceLimiter } = get();
      const agent = runningAgents.find(a => a.id === id);

      // Remove from thread store if associated
      if (agent?.threadId) {
          useThreadStore.getState().removeAgentTask(agent.threadId, id);
          console.log(`[AgentStore] Removed agent ${id} from thread ${agent.threadId}`);
      }

      // 🔥 模块化：使用 listeners.cleanup()
      listeners.cleanup(id);
      // 🔥 资源限制器：记录完成
      resourceLimiter.recordCompletion(id);
      set(state => {
          const { [id]: __, ...remainingMap } = state.agentToMessageMap;
          return {
              runningAgents: state.runningAgents.filter(a => a.id !== id),
              agentToMessageMap: remainingMap
          };
      });
  },

  clearCompletedAgents: () => {
      set(state => {
          const running = [];
          const completed = [];
          state.runningAgents.forEach(a => {
              if (a.status === 'completed' || a.status === 'failed') completed.push(a);
              else running.push(a);
          });
          // 🔥 模块化：使用 listeners.cleanup() 批量清理
          const { listeners, resourceLimiter } = get();
          completed.forEach(a => {
              listeners.cleanup(a.id);
              resourceLimiter.recordCompletion(a.id);
          });
          return { runningAgents: running };
      });
  },

  initEventListeners: async () => {
      console.log('[AgentStore] 🎯 Global event listeners initialized');
      const unlisteners: UnlistenFn[] = [];

      // We still keep global status listener as a fallback or for other UI parts
      const unlistenStatus = await listen('agent:status', (event: any) => {
        const { id, status, progress } = event.payload;
        set(state => {
            const agent = state.runningAgents.find(a => a.id === id);
            if (agent && (agent.status !== status || agent.progress !== progress)) {
                return { runningAgents: state.runningAgents.map(a => a.id === id ? { ...a, status: status as any, progress } : a) };
            }
            return state;
        });
      });
      unlisteners.push(unlistenStatus);

      return () => {
          console.log('[AgentStore] 🛑 Cleaning up global event listeners...');
          unlisteners.forEach(u => u());
      };
  }
}));

// 🔥 E2E 测试支持：暴露 agentStore 到 window 对象
// @ts-ignore
if (typeof window !== 'undefined') {
  (window as any).__agentStore = useAgentStore;
  // 🔥 确保在 DOM 加载后再次设置（应对模块加载时机问题）
  if (typeof document !== 'undefined') {
    const setStore = () => {
      (window as any).__agentStore = useAgentStore;
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setStore);
    } else {
      // DOM 已经加载完成，立即设置
      setTimeout(setStore, 0);
    }
  }
}