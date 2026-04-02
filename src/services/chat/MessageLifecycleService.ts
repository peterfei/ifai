import { Message } from '../../stores/chatStore';
import { ICoreChatStore } from '../../interfaces/ICoreChatStore';
import { readFileContent } from '../../utils/fileSystem';
import { selectMessagesForContext } from '../../utils/contextFilter';
import { IS_COMMERCIAL } from '../../config/edition';
import i18n from '../../i18n/config';
import { recognizeIntent, shouldTriggerAgent } from '../../utils/intentRecognizer';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';

export class MessageLifecycleService {
  private static multimodalCache = new Map<string, any[]>();

  static async interceptAddMessage(message: Message, store: ICoreChatStore): Promise<Message> {
    if (message.role === 'tool' && typeof message.content === 'string') {
        const content = message.content.trim();
        // 🏆 PIVO 3.0: 物理结构化识别 - 兼容数组和 agent_scan_project 的对象格式
        if ((content.startsWith('[') && content.endsWith(']')) || (content.startsWith('{') && content.endsWith('}'))) {
            try {
                const parsed = JSON.parse(content);
                let files: string[] = [];
                
                if (Array.isArray(parsed)) {
                    files = parsed;
                } else if (parsed && typeof parsed === 'object' && parsed.structure) {
                    // 🚀 agent_scan_project 的特殊格式，扁平化 structure 以供预览
                    files = Object.keys(parsed.structure);
                }

                if (files.length > 0 && files.every(f => typeof f === 'string')) {
                    (message as any).exploreProgress = {
                        phase: 'completed',
                        progress: { total: files.length, scanned: files.length, byDirectory: {} },
                        scannedFiles: files,
                        // 🏆 物理透传：保存原始结构以供更高级的树形渲染
                        rawStructure: parsed && parsed.structure ? parsed.structure : null
                    };
                    setTimeout(() => {
                        const msgs = store.messages;
                        const idx = msgs.findIndex(m => m.id === message.id);
                        if (idx > 0) {
                            for (let i = idx - 1; i >= 0; i--) {
                                if (msgs[i].role === 'assistant') {
                                    (store as any).setState((s: any) => ({
                                        messages: s.messages.map((m: any) => m.id === msgs[i].id ? 
                                            { ...m, exploreProgress: (message as any).exploreProgress } : m)
                                    }));
                                    break;
                                }
                            }
                        }
                    }, 50);
                }
            } catch (e) {}
        }
    }
    return message;
  }

  static async interceptSendMessage(
    content: string | any[], 
    options: any, 
    store: ICoreChatStore
  ): Promise<{ enrichedContent: string; userMsgId: string; userMessageAdded: boolean; shouldStop?: boolean }> {
    const userMsgId = crypto.randomUUID();
    let enrichedContent = typeof content === 'string' ? content : '';
    let userMessageAdded = false;

    const lastAssistantMsg = store.messages.filter(m => m.role === 'assistant').pop() as any;
    const isLastMessageStreaming = lastAssistantMsg && (
        !lastAssistantMsg.content ||
        (typeof lastAssistantMsg.content === 'string' && lastAssistantMsg.content.trim() === '') ||
        (lastAssistantMsg.contentSegments && lastAssistantMsg.contentSegments.length > 0)
    );

    if (isLastMessageStreaming) {
        if (!IS_COMMERCIAL) {
          store.setLoading(false);
          store.addMessage({ id: crypto.randomUUID(), role: 'assistant', content: '💡 **提示**: 快速连续发送消息功能仅在 PRO 版本中可用。' } as any);
          return { enrichedContent, userMsgId, userMessageAdded, shouldStop: true };
        } else {
          (store as any).setState((s: any) => ({
            messages: s.messages.map((m: any) => m.id === lastAssistantMsg.id ? { ...m, content: lastAssistantMsg.content || '⏸️ 响应已取消' } : m),
            isLoading: false
          }));
        }
    }

    if (Array.isArray(content)) this.multimodalCache.set(userMsgId, content);

    if (typeof content === 'string' && content.includes('[#')) {
        const refMatches = [...content.matchAll(/\[#(.*?)\]\((.*?)(?::(\d+)-(\d+))?\)/g)];
        if (refMatches.length > 0) {
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

    let textInput = typeof content === 'string' ? content.trim() : (Array.isArray(content) ? content.map(p => p.type === 'text' ? p.text : '').join(' ').trim() : "");
    const currentContentHasImages = Array.isArray(content) && content.some((part: any) => part.type === 'image_url');
    
    if (textInput && !currentContentHasImages && !options.isInlineTask) {
        const intentResult = recognizeIntent(textInput);
        if (shouldTriggerAgent(intentResult, (window as any).VITE_TEST_ENV === 'e2e' ? 0.3 : 0.7)) {
            store.addMessage({ id: userMsgId, role: 'user', content: textInput, multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content } as any);
            userMessageAdded = true;
        }
    }

    if (!currentContentHasImages && textInput) {
        try {
            const messagesForLocal = store.messages.slice(-10).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));
            messagesForLocal.push({ role: 'user', content: textInput });
            const preprocessPromise = invoke<any>('local_model_preprocess', { messages: messagesForLocal });
            const preprocessResult = await Promise.race([preprocessPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))]) as any;
            if (preprocessResult?.should_use_local) {
                if (!userMessageAdded) { store.addMessage({ id: userMsgId, role: 'user', content: textInput } as any); userMessageAdded = true; }
                if (preprocessResult.has_tool_calls) {
                    const assistantMsgId = crypto.randomUUID();
                    const toolCalls = preprocessResult.tool_calls.map((tc: any) => ({ id: crypto.randomUUID(), type: 'function', tool: tc.name, args: tc.arguments, function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }, status: 'pending', isLocalModel: true }));
                    store.addMessage({ id: assistantMsgId, role: 'assistant', content: '', toolCalls } as any);
                    for (const tc of toolCalls) await store.approveToolCall(assistantMsgId, tc.id);
                    store.setLoading(false);
                    return { enrichedContent, userMsgId, userMessageAdded, shouldStop: true };
                } else if (preprocessResult.local_response) {
                    store.addMessage({ id: crypto.randomUUID(), role: 'assistant', content: `🤖 **本地模型回复**\n\n${preprocessResult.local_response}` } as any);
                    store.setLoading(false);
                    return { enrichedContent, userMsgId, userMessageAdded, shouldStop: true };
                }
            }
        } catch (e) {}
    }

    return { enrichedContent, userMsgId, userMessageAdded, shouldStop: false };
  }

  /**
   * 🏆 PIVO 3.0: 响应式任务拆解引擎服务化
   * 监听消息变化并在合适时机触发 Pivo 任务生成
   */
  static triggerTaskBreakdown(lastMessage: Message, history: Message[]) {
    if (lastMessage.role !== 'assistant' || (lastMessage as any).hasTriggeredBreakdown) return;

    const userMessage = history.slice().reverse().find(m => m.role === 'user');
    if (userMessage) {
        const textInput = typeof userMessage.content === 'string' ? userMessage.content : 
                         ((userMessage as any).multiModalContent?.find((p: any) => p.type === 'text')?.text || '');
        
        const intentResult = recognizeIntent(textInput);
        // 如果意图明确为“重构”、“修改”或置信度极高，则触发 PIVO 任务拆解
        if (intentResult && (intentResult.category === 'write' || intentResult.confidence > 0.8)) {
            (lastMessage as any).hasTriggeredBreakdown = true;
            invoke('pivo_generate_tasks', { intent: textInput })
                .then((tasks: any) => {
                    const pivoStore = (window as any).__pivoStore;
                    if (pivoStore && tasks?.length > 0) {
                        console.log(`[Lifecycle] 🌳 PIVO Task Breakdown triggered for: ${lastMessage.id}`);
                        pivoStore.getState().setTaskTree(lastMessage.id, tasks);
                    }
                }).catch(() => {});
        }
    }
  }

  static async prepareContext(messages: Message[], maxMessages: number, model: string, maxTokens: number): Promise<Message[]> {
    return await selectMessagesForContext(messages, maxMessages, model, maxTokens);
  }

  static transformToApiHistory(messages: Message[], options: any) {
    const { isInlineTask, isChinese, msgId, enrichedContent, content } = options;
    console.log(`[Lifecycle] 🔄 transformToApiHistory: messages.length=${messages.length}, msgId=${msgId}`);
    
    const prepareMessageContent = (c: any): any => {
        if (Array.isArray(c)) return c;
        return (c || '').replace(/^\[(CHAT|TASK-EXECUTION)\]\s*/, '');
    };

    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
    console.log(`[Lifecycle] 🔍 lastUserIndex: ${lastUserIndex}`);

    let msgHistory = messages.map((m, i) => {
        const toolCalls = m.toolCalls?.filter(tc => tc.tool).map(tc => ({ id: tc.id, type: "function", function: { name: tc.tool, arguments: (tc as any).function?.arguments || JSON.stringify(tc.args || {}) } }));
        let mContent = prepareMessageContent(m.content);
        
        // 🏆 PIVO 3.0: 增强型多模态保真度逻辑
        // 如果是最后一条用户消息，则尝试从缓存或 enrichedContent 中恢复内容
        if (i === lastUserIndex && m.role === 'user') {
            if (Array.isArray(mContent) && msgId) {
                const cached = MessageLifecycleService.multimodalCache.get(msgId);
                console.log(`[Lifecycle] 📦 Syncing multimodal content for index ${i}, cached found: ${!!cached}`);
                if (cached) mContent = cached;
            } else if (typeof content === 'string' && enrichedContent) {
                mContent = enrichedContent;
            }
        }
        
        return { role: m.role, content: mContent, tool_calls: (toolCalls?.length ? toolCalls : undefined), tool_call_id: m.tool_call_id };
    });

    console.log(`[Lifecycle] 📝 msgHistory roles: ${msgHistory.map(m => m.role).join(', ')}`);


    const rootPath = useFileStore.getState().rootPath;
    const workspaceInfo = rootPath ? (isChinese ? `\n【当前工作区】${rootPath}` : `\n[CURRENT WORKSPACE] ${rootPath}`) : "";

    const inlineInstruction = isInlineTask ? (isChinese ? "\n\n【核心要求】你现在正在进行原位(Inline)代码编辑。请直接调用 agent_write_file 或 agent_replace_text 物理修改用户选中的代码。严禁只给出 Markdown 代码块建议。" : "\n\n[CORE REQUIREMENT] You are performing an In-place (Inline) edit. MUST call agent_write_file or agent_replace_text to physically modify the code. DO NOT just provide code blocks in chat.") : "";
    const PIVO_PROMPT = (isChinese ? `【物理工具箱授权】
你现在拥有 PIVO 2.0 全量物理执行权限。请根据需要直接调用以下工具：
- agent_execute_command: 执行系统命令或查询
- agent_write_file: 写入或重构代码文件
- agent_read_file: 读取物理文件内容
- agent_scan_project: 快速扫描项目全景
${workspaceInfo}

【准则】你是一名资深的物理执行专家，请直接行动，严禁只用文字描述。` : `[PIVO 2.0 PHYSICAL TOOL AUTHORIZATION]
You have full execution permissions. Directly call:
- agent_execute_command: execute system commands
- agent_write_file: write/refactor code
- agent_read_file: read physical files
- agent_scan_project: scan project topology.
${workspaceInfo}

[PRINCIPLE] Action oriented. No mere descriptions.`) + inlineInstruction;

    // 🔥 FIX: 移除旧的 PIVO 系统提示，确保使用最新的 workspaceInfo
    // 旧的 PIVO_PROMPT 可能包含错误的 rootPath，所以需要先移除再添加
    const pivoSystemPromptMarker = isChinese ? '【物理工具箱授权】' : '[PIVO 2.0 PHYSICAL TOOL AUTHORIZATION]';
    msgHistory = msgHistory.filter((m: any) => {
      // 移除旧的 PIVO 系统提示（通过标识符识别）
      const isOldPIVOPrompt = m.role === 'system' && (
        m.content?.includes(pivoSystemPromptMarker)
      );
      return !isOldPIVOPrompt;
    });

    // 添加最新的 PIVO_PROMPT
    msgHistory.unshift({ role: "system", content: PIVO_PROMPT } as any);

    return msgHistory;
  }
}
