import { create } from 'zustand';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Agent, AgentEventPayload } from '../types/agent';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';
import { useChatStore as coreUseChatStore } from 'ifainew-core';
import { useThreadStore } from './threadStore';
import { useProposalStore } from './proposalStore';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

/**
 * 任务树节点接口（用于解析）
 */
interface ParsedTaskNode {
  id: string;
  title: string;
  children?: ParsedTaskNode[];
}

/**
 * 从任务树构建树状日志显示
 * @param node 任务节点
 * @param depth 深度（用于缩进）
 * @param prefix 前缀（用于树状连接线）
 * @param isRoot 是否是根节点
 * @returns 日志数组
 */
function buildTaskTreeLogs(node: ParsedTaskNode, depth: number = 0, prefix: string = '', isRoot: boolean = false): string[] {
  const logs: string[] = [];

  // 如果是根节点，直接显示标题
  if (isRoot) {
    logs.push(`📋 ${node.title}`);
    // 处理子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach((child, index) => {
        const isLast = index === node.children!.length - 1;
        const childPrefix = isLast ? '  └─ ' : '  ├─ ';
        const childLogs = buildTaskTreeLogs(child, depth + 1, childPrefix, false);
        logs.push(...childLogs);
      });
    }
  } else {
    // 非根节点，添加前缀
    logs.push(`${prefix}📋 ${node.title}`);

    // 处理子节点（递归）
    if (node.children && node.children.length > 0) {
      // 计算子节点的前缀
      const parentIsLast = prefix.includes('└─');
      const childBasePrefix = parentIsLast ? '    ' : '│   ';

      node.children.forEach((child, index) => {
        const isLast = index === node.children!.length - 1;
        const childPrefix = `${childBasePrefix}${isLast ? '└─ ' : '├─ '}`;
        const childLogs = buildTaskTreeLogs(child, depth + 1, childPrefix, false);
        logs.push(...childLogs);
      });
    }
  }

  return logs;
}

/**
 * 从不完整的 JSON 中增量提取任务标题（带层级关系）
 * @param buffer 当前的文本缓冲区
 * @param existingLogs 已存在的日志（用于去重）
 * @returns 新提取的日志行（带树状结构）
 */
function extractTaskTitlesIncremental(buffer: string, existingLogs: string[]): string[] {
  const newLogs: string[] = [];
  const seenTitles = new Set(existingLogs.filter(log => log.includes('📋')).map(log => log.replace(/^[├│└─ ]+📋 /, '')));

  // 尝试解析部分 JSON 结构来构建层级关系
  try {
    // 找到所有 { ... "title": "...", "children": [ ... ] ... } 模式
    // 使用栈来跟踪嵌套层级
    const stack: Array<{ title: string; depth: number; parentIsLast: boolean }> = [];
    let depth = 0;
    let inChildren = false;
    let currentTitle = '';

    // 简单的 token 匹配
    const tokens = buffer.split(/([{}[\]",])/).filter(t => t.trim());
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token === '{') {
        depth++;
      } else if (token === '}') {
        if (currentTitle && depth > 0) {
          // 检查是否已经显示过
          if (!seenTitles.has(currentTitle)) {
            // 构建前缀
            const parent = stack[stack.length - 1];
            let prefix = '';
            if (parent) {
              prefix = parent.parentIsLast ? '    ' : '│   ';
            }
            const isLast = i < tokens.length - 1 && tokens[i + 1]?.trim() === ']';
            prefix += isLast ? '└─ ' : '├─ ';

            newLogs.push(`${prefix}📋 ${currentTitle}`);
            seenTitles.add(currentTitle);
          }
        }
        currentTitle = '';
        depth--;
      } else if (token === '[') {
        inChildren = true;
      } else if (token === ']') {
        inChildren = false;
        if (stack.length > 0) {
          stack.pop();
        }
      } else if (token === '"title"') {
        // 下一个 token 应该是 :
        if (tokens[i + 1]?.trim() === ':') {
          // 再下一个应该是字符串值
          const valueToken = tokens[i + 2];
          if (valueToken) {
            currentTitle = valueToken.replace(/^["']|["']$/g, '');
          }
        }
      }

      i++;
    }

    // 如果上面解析失败，回退到简单模式
    if (newLogs.length === 0) {
      const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
      let match;
      while ((match = titleRegex.exec(buffer)) !== null) {
        const title = match[1];
        if (!seenTitles.has(title) && !newLogs.some(log => log.includes(title))) {
          newLogs.push(`📋 ${title}`);
          seenTitles.add(title);
        }
      }
    }
  } catch (e) {
    // 出错时回退到简单模式
    const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = titleRegex.exec(buffer)) !== null) {
      const title = match[1];
      if (!seenTitles.has(title) && !newLogs.some(log => log.includes(title))) {
        newLogs.push(`📋 ${title}`);
        seenTitles.add(title);
      }
    }
  }

  return newLogs;
}

/**
 * 将流式内容格式化为 Markdown（只显示 title 和 description）
 * @param buffer 原始 JSON 缓冲区
 * @param previousContent 之前的内容（用于去重）
 * @returns Markdown 格式的文本
 */
function formatStreamToMarkdown(buffer: string, previousContent: string = ''): string {
  try {
    // 移除 markdown 代码块标记
    const cleanBuffer = buffer.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // 提取所有的 title 和 description
    const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
    const descRegex = /"description"\s*:\s*"([^"]+)"/g;

    const tasks: Array<{ title: string; description: string }> = [];
    let match;

    // 提取所有任务
    while ((match = titleRegex.exec(cleanBuffer)) !== null) {
      tasks.push({ title: match[1], description: '' });
    }

    // 重置并提取 description
    titleRegex.lastIndex = 0;
    let descIndex = 0;
    while ((match = descRegex.exec(cleanBuffer)) !== null) {
      if (descIndex < tasks.length) {
        tasks[descIndex].description = match[1];
        descIndex++;
      }
    }

    // 只返回新增的任务（去重）
    const previousTitles = new Set();
    const prevTitleRegex = /"title"\s*:\s*"([^"]+)"/g;
    let prevMatch;
    while ((prevMatch = prevTitleRegex.exec(previousContent)) !== null) {
      previousTitles.add(prevMatch[1]);
    }

    const newTasks = tasks.filter(t => !previousTitles.has(t.title));

    // 格式化为 Markdown
    const lines: string[] = [];
    for (const task of newTasks) {
      lines.push(`**${task.title}**`);
      if (task.description) {
        lines.push(`> ${task.description}`);
      }
      lines.push(''); // 空行分隔
    }

    return lines.join('\n');
  } catch (e) {
    // 失败时返回空字符串（避免显示乱码）
    return '';
  }
}

interface AgentState {
  runningAgents: Agent[];
  activeListeners: Record<string, UnlistenFn>;
  agentToMessageMap: Record<string, string>;
  // Track tool calls that have been auto-approved to prevent duplicate approvals
  autoApprovedToolCalls: Set<string>;
  launchAgent: (agentType: string, task: string, chatMsgId?: string, threadId?: string) => Promise<string>;
  removeAgent: (id: string) => void;
  initEventListeners: () => Promise<() => void>;
  approveAction: (id: string, approved: boolean) => Promise<void>;
  clearCompletedAgents: () => void;
}

function unescapeToolArguments(args: any): any {
    if (args && typeof args.content === 'string') {
        args.content = args.content.replace(/\\n/g, '\n').replace(/\\\"/g, '"');
    }
    return args;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runningAgents: [],
  activeListeners: {},
  agentToMessageMap: {},
  autoApprovedToolCalls: new Set<string>(),
  
  launchAgent: async (agentType: string, task: string, chatMsgId?: string, threadId?: string) => {
    // 1. Pre-generate ID
    const id = uuidv4();
    const eventId = `agent_${id}`;

    // Get current thread ID if not provided
    const currentThreadId = threadId || useThreadStore.getState().activeThreadId;

    const projectRoot = useFileStore.getState().rootPath;
    if (!projectRoot) throw new Error("No project root available");

    const settingsStore = useSettingsStore.getState();
    const providerConfig = settingsStore.providers.find(p => p.id === settingsStore.currentProviderId);
    if (!providerConfig) throw new Error("No AI provider configured");

    // Convert frontend providerConfig to backend format
    // We spread the original config first to include all fields (like 'enabled', 'name', 'id')
    // Then add compatibility aliases (snake_case, provider/id)
    const backendProviderConfig = {
      ...providerConfig,
      provider: providerConfig.protocol, // Alias for backend compatibility
      api_key: providerConfig.apiKey,    // snake_case alias
      base_url: providerConfig.baseUrl,  // snake_case alias
    };

    // 2. Setup message mapping if needed
    if (chatMsgId) {
        set(state => ({ agentToMessageMap: { ...state.agentToMessageMap, [id]: chatMsgId } }));
    }

    console.log(`[AgentStore] launchAgent - id: ${id}, eventId: ${eventId}, chatMsgId: ${chatMsgId || 'NONE'}, threadId: ${currentThreadId || 'NONE'}`);

    // 3. Setup Listener FIRST - This is critical for industrial grade reliability
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
        }
        // --- Log Update ---
        else if (payload.type === 'log' && (payload as any).message) {
            const message = (payload as any).message;
            set(state => ({
                runningAgents: state.runningAgents.map(a => {
                    if (a.id !== id) return a;
                    const newLogs = [...a.logs, message].slice(-100);
                    // Defensive status fix: if we get logs, the agent is definitely active.
                    // Only fix initializing and idle states, preserve waitingfortool (valid state)
                    const needsStatusFix = a.status === 'initializing' || a.status === 'idle';
                    return { ...a, logs: newLogs, status: needsStatusFix ? 'running' : a.status };
                })
            }));
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
                            // 尝试解析完整的 taskTree JSON 结构
                            try {
                                // 移除可能的 markdown 代码块标记
                                const cleanBuffer = currentBuffer
                                    .replace(/```json\s*/g, '')
                                    .replace(/```\s*/g, '')
                                    .trim();

                                // 尝试找到完整的 taskTree 对象（使用括号匹配）
                                const taskTreeStart = cleanBuffer.indexOf('"taskTree"');
                                if (taskTreeStart !== -1) {
                                    // 从 taskTree 开始找完整的对象
                                    let braceCount = 0;
                                    let startPos = -1;
                                    let endPos = -1;

                                    for (let i = taskTreeStart; i < cleanBuffer.length; i++) {
                                        if (cleanBuffer[i] === '{') {
                                            if (startPos === -1) startPos = i;
                                            braceCount++;
                                        } else if (cleanBuffer[i] === '}') {
                                            braceCount--;
                                            if (braceCount === 0 && startPos !== -1) {
                                                endPos = i + 1;
                                                break;
                                            }
                                        }
                                    }

                                    if (startPos !== -1 && endPos !== -1) {
                                        const taskTreeJson = cleanBuffer.substring(startPos, endPos);
                                        try {
                                            const parsed = JSON.parse(`{"taskTree":${taskTreeJson}}`);
                                            if (parsed.taskTree) {
                                                // 调试：打印解析结果
                                                console.log('[AgentStore] Parsed taskTree:', JSON.stringify(parsed.taskTree, (key, value) => {
                                                    if (key === 'children' && Array.isArray(value)) {
                                                        return `[${value.length} children]`;
                                                    }
                                                    return value;
                                                }, 2));

                                                // 构建树状显示
                                                const treeLogs = buildTaskTreeLogs(parsed.taskTree, 0, '', true);
                                                console.log('[AgentStore] Tree logs:', treeLogs);

                                                // 只保留前 3 条日志（启动日志）
                                                const baseLogs = a.logs.slice(0, 3);
                                                newLogs = [...baseLogs, ...treeLogs];
                                            }
                                        } catch (e2) {
                                            // JSON 还不完整，使用增量解析
                                            const incrementalLogs = extractTaskTitlesIncremental(cleanBuffer, a.logs);
                                            if (incrementalLogs.length > 0) {
                                                const baseLogs = a.logs.slice(0, 3);
                                                newLogs = [...baseLogs, ...incrementalLogs];
                                            }
                                        }
                                    } else {
                                        // 还没找到完整的 taskTree，使用增量解析
                                        const incrementalLogs = extractTaskTitlesIncremental(cleanBuffer, a.logs);
                                        if (incrementalLogs.length > 0) {
                                            const baseLogs = a.logs.slice(0, 3);
                                            newLogs = [...baseLogs, ...incrementalLogs];
                                        }
                                    }
                                } else {
                                    // 还没有 taskTree，使用增量解析
                                    const incrementalLogs = extractTaskTitlesIncremental(cleanBuffer, a.logs);
                                    if (incrementalLogs.length > 0) {
                                        const baseLogs = a.logs.slice(0, 3);
                                        newLogs = [...baseLogs, ...incrementalLogs];
                                    }
                                }
                            } catch (e) {
                                // 解析失败，回退到简单模式
                                console.log('[AgentStore] Parse error, using fallback:', e);
                                const titleMatch = currentBuffer.match(/"title"\s*:\s*"([^"]+)"/);
                                if (titleMatch && titleMatch[1]) {
                                    const title = titleMatch[1];
                                    const alreadyShown = a.logs.some(log => log.includes(title));
                                    if (!alreadyShown) {
                                        newLogs = [...a.logs, `📋 ${title}`];
                                    }
                                }
                            }
                        }

                        const latestLogs = newLogs.slice(-50); // 只保留最近 50 条

                        return {
                            ...a,
                            content: (a.content || "") + currentBuffer,
                            logs: latestLogs
                        };
                    })
                }));

                // ✅ FIX: Also sync to coreUseChatStore.messages for chat display
                const msgId = get().agentToMessageMap[id];
                if (msgId) {
                    const agent = get().runningAgents.find(a => a.id === id);
                    const { messages } = coreUseChatStore.getState();
                    const currentMsg = messages.find(m => m.id === msgId);

                    // 对于 task-breakdown agent，使用格式化的 Markdown（增量追加）
                    if (agent?.type === 'task-breakdown' && currentMsg) {
                        // 处理 content 可能是数组的情况
                        let previousContent = '';
                        if (typeof currentMsg.content === 'string') {
                            previousContent = currentMsg.content;
                        } else if (Array.isArray(currentMsg.content)) {
                            previousContent = currentMsg.content.map(p => p.type === 'text' ? p.text : '').join('');
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
                    } else if (currentMsg) {
                        // 其他 agent，使用原始内容
                        const updatedMessages = messages.map(m => {
                            if (m.id === msgId) {
                                return { ...m, content: (m.content || "") + currentBuffer };
                            }
                            return m;
                        });
                        coreUseChatStore.setState({ messages: updatedMessages });
                    }
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
                        const index = existing.findIndex(tc => tc.id === liveToolCall.id);

                        if (index !== -1) {
                            // Check if content actually changed (deduplication for streaming updates)
                            const prevContent = (existing[index] as any).args?.content || '';
                            const nextContent = liveToolCall.args?.content || '';

                            // If content hasn't changed and both are in partial state, skip this update
                            if (prevContent === nextContent &&
                                liveToolCall.isPartial &&
                                (existing[index] as any).isPartial) {
                                // Content unchanged, skip update to avoid unnecessary re-renders
                                return m;
                            }

                            // Update existing tool call
                            const newToolCalls = [...existing];
                            newToolCalls[index] = {
                                ...newToolCalls[index],
                                ...liveToolCall,
                                // If it was already approved/completed, don't revert status
                                status: (newToolCalls[index].status !== 'pending' && !liveToolCall.isPartial)
                                    ? newToolCalls[index].status
                                    : liveToolCall.status
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

                    if (isNewlyCompleted && !wasAlreadyAutoApproved) {
                        const settings = useSettingsStore.getState();
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
                        }
                    }
                }
            }
        }
        // --- Final Result ---
        else if (payload.type === 'result') {
            const result = payload.result || "";
            console.log(`[AgentStore] Result received for agent ${id}, msgId: ${msgId || 'NONE'}`);
            if (msgId) {
                const { messages, isLoading } = coreUseChatStore.getState();
                console.log(`[AgentStore] Before setState: isLoading=${isLoading}`);
                coreUseChatStore.setState({
                    messages: messages.map(m => m.id === msgId ? {
                        ...m,
                        content: result,
                        agentId: undefined,      // ✅ Clear agent ID so isAgentStreaming becomes false
                        isAgentLive: false       // ✅ Clear live marker so highlighting appears
                    } : m),
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
            if (agent?.type === 'proposal-generator' && result) {
                console.log('[AgentStore] 📋 Proposal generator completed, processing result...');
                (async () => {
                    try {
                        // Extract JSON from the result (handle markdown code blocks)
                        let jsonStr = result;
                        const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                        if (codeBlockMatch) {
                            jsonStr = codeBlockMatch[1];
                        }

                        // Parse the proposal data
                        const proposalData = JSON.parse(jsonStr);

                        if (proposalData.changeId && proposalData.proposal) {
                            // Create proposal using the proposalStore
                            const proposalStore = useProposalStore.getState();

                            // Build proposal object from agent result
                            const proposalOptions = {
                                id: proposalData.changeId,
                                why: proposalData.proposal.why || '',
                                whatChanges: proposalData.proposal.whatChanges || [],
                                impact: proposalData.proposal.impact || { specs: [], files: [], breakingChanges: false },
                                tasks: proposalData.tasks || [],
                                specDeltas: proposalData.specDeltas || [],
                                design: proposalData.design,
                            };

                            const proposal = await proposalStore.createProposal(proposalOptions);

                            console.log('[AgentStore] ✅ Proposal created:', proposal.id);

                            // Show success toast
                            toast.success('提案生成成功', {
                                description: `"${proposalData.changeId}" 已创建，等待审核`,
                            });

                            // Open the review modal
                            proposalStore.openReviewModal(proposal.id);
                        } else {
                            console.warn('[AgentStore] ⚠️ Invalid proposal data structure:', proposalData);
                            toast.error('提案格式错误', {
                                description: 'AI 返回的数据格式不正确',
                            });
                        }
                    } catch (error) {
                        console.error('[AgentStore] ❌ Failed to process proposal result:', error);
                        toast.error('提案处理失败', {
                            description: error instanceof Error ? error.message : '未知错误',
                        });
                    }
                })();
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
                const targetMsgId = msgId || messages.find(m => m.agentId === id)?.id;

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
                const targetMsgId = msgId || messages.find(m => m.agentId === id)?.id;

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

    // Store listener cleanup
    set(state => ({ activeListeners: { ...state.activeListeners, [id]: unlisten } }));

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
      await invoke('approve_agent_action', { id, approved });
      set(state => ({
          runningAgents: state.runningAgents.map(a => 
              a.id === id ? { ...a, pendingApproval: undefined } : a
          )
      }));
  },

  removeAgent: (id: string) => {
      const { activeListeners, runningAgents } = get();
      const agent = runningAgents.find(a => a.id === id);

      // Remove from thread store if associated
      if (agent?.threadId) {
          useThreadStore.getState().removeAgentTask(agent.threadId, id);
          console.log(`[AgentStore] Removed agent ${id} from thread ${agent.threadId}`);
      }

      if (activeListeners[id]) activeListeners[id]();
      set(state => {
          const { [id]: _, ...remainingListeners } = state.activeListeners;
          const { [id]: __, ...remainingMap } = state.agentToMessageMap;
          return {
              runningAgents: state.runningAgents.filter(a => a.id !== id),
              activeListeners: remainingListeners,
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
          completed.forEach(a => { if (state.activeListeners[a.id]) state.activeListeners[a.id](); });
          const newListeners = { ...state.activeListeners };
          completed.forEach(a => delete newListeners[a.id]);
          return { runningAgents: running, activeListeners: newListeners };
      });
  },

  initEventListeners: async () => {
      console.log('[AgentStore] 🎯 Global event listeners initialized');
      const unlisteners: UnlistenFn[] = [];

      // We still keep global status listener as a fallback or for other UI parts
      const unlistenStatus = await listen('agent:status', (event: any) => {
        const { id, status, progress } = event.payload;
        useAgentStore.setState(state => {
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