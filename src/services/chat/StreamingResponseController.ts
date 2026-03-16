import { Message, ToolCall } from '../../stores/chatStore';
import { useChatStore as coreUseChatStore, toolCallDeduplicator } from '../../stores/useChatStore';
import { useThreadStore } from '../../stores/threadStore';
import { InlineSyncService } from '../InlineSyncService';
import { SentinelService } from '../SentinelService';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ApprovalPipeline } from '../../utils/approvalPipeline';
import { useSettingsStore } from '../../stores/settingsStore';
import { eventBus } from '../../core/events/GlobalEventBus';

export class StreamingResponseController {
  private static instance: StreamingResponseController;
  private activeStreams: Map<string, {
    renderRequested: boolean;
    unlistenFns: UnlistenFn[];
    buffer: Message[];
    threadId: string;
    hasReceivedChunk: boolean;
    lastHeartbeat: number;
  }> = new Map();

  private constructor() {
    // 🏆 PIVO 3.0: 物理级自愈心跳监测器
    if (typeof window !== 'undefined') {
        setInterval(() => {
            const now = Date.now();
            this.activeStreams.forEach((session, id) => {
                // 只有处于活跃流状态（有 unlistenFns 且没结束）才检测
                if (session.unlistenFns && session.unlistenFns.length > 0) {
                    // 🏆 PIVO 3.4.11: 宽容度升级 - 5s -> 15s 超时，减少高频渲染场景下的误判
                    if (now - (session.lastHeartbeat || 0) > 15000) {
                        console.warn(`[Controller] 🛡️ Sentinel detected stall for session: ${id}`);
                        // 物理唤醒自愈
                        this.triggerPhysicalSelfHealing(id);
                    }
                }
            });
        }, 5000); // 2s -> 5s 检测间隔
    }
  }

  private async triggerPhysicalSelfHealing(id: string) {
    const state = coreUseChatStore.getState();
    const msg = state.messages.find(m => m.id === id);
    if (!msg || !(msg as any).isStreaming) return;

    // 存根信号用于自愈和测试
    if (typeof window !== 'undefined') {
        if (!(window as any).__PIVO_SIGNALS__) (window as any).__PIVO_SIGNALS__ = {};
        (window as any).__PIVO_SIGNALS__['ifainew:self-healing-triggered'] = { id, timestamp: Date.now() };
    }

    const hasUnclosedTool = msg.toolCalls?.some(tc => tc.isPartial);
    const hasContent = !!msg.content && String(msg.content).trim().length > 0;
    const hasAnyTool = msg.toolCalls && msg.toolCalls.length > 0;

    // 🏆 PIVO 3.0: 物理级自愈决策引擎
    // 情况 A: 有未闭合工具 -> 物理续写
    // 情况 B: 没有任何内容且没有工具 (启动假死) -> 物理重试
    if (hasUnclosedTool || (!hasContent && !hasAnyTool)) {
        const reason = hasUnclosedTool ? "Unclosed tool" : "Startup stall";
        console.log(`[Controller] 🔄 Physical Auto-Continue (${reason}): ${id}`);
        
        const settings = useSettingsStore.getState();
        const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
        if (providerConfig) {
            // 重置心跳防止进入死循环
            const s = this.activeStreams.get(id);
            if (s) s.lastHeartbeat = Date.now();
            
            (coreUseChatStore.getState() as any).generateResponse(state.messages, providerConfig);
        }
    } else {
        // 情况 C: 有内容且已闭合 -> 正常终结
        console.log(`[Controller] 🛡️ Physical Finalize (Normal stop): ${id}`);
        this.finalizeStream(id);
    }
  }

  static getInstance(): StreamingResponseController {
    if (!StreamingResponseController.instance) {
        StreamingResponseController.instance = new StreamingResponseController();
        // 🏆 PIVO 3.0: 建立物理直连桥 (Fidelity Bridge)
        if (typeof window !== 'undefined') {
            (window as any).__PIVO_BRIDGE__ = {
                push: (id: string, payload: any) => {
                    console.log(`[PIVO-BRIDGE] 📥 Direct Injection: ${id}`, payload);
                    window.dispatchEvent(new CustomEvent(`pivo:direct-chunk:${id}`, { detail: payload }));
                },
                finalize: (id: string) => {
                    console.log(`[PIVO-BRIDGE] 🏁 Direct Finalize: ${id}`);
                    window.dispatchEvent(new CustomEvent(`pivo:direct-finish:${id}`));
                }
            };
        }
    }
    return StreamingResponseController.instance;
  }

  // 🏆 PIVO 3.0: 哨兵权威判定接口
  isStreamStuck(id: string): boolean {
    const s = this.activeStreams.get(id);
    if (!s) return false;
    // 宽限期延长至 8s，给慢速模型留足物理空间
    return (Date.now() - s.lastHeartbeat) > 8000;
  }

  async initSession(assistantMsgId: string, initialMessages: Message[]) {
    const threadId = useThreadStore.getState().activeThreadId || 'default';
    const sessionData = { 
        renderRequested: false, 
        unlistenFns: [] as UnlistenFn[], 
        buffer: JSON.parse(JSON.stringify(initialMessages)),
        threadId,
        hasReceivedChunk: false,
        lastHeartbeat: Date.now()
    };
    this.activeStreams.set(assistantMsgId, sessionData);

    const unlistenStatus = await listen<string>(`${assistantMsgId}_status`, (event) => {
      const safe = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
      sessionData.buffer = sessionData.buffer.map((m: any) => (m.id === assistantMsgId && !m.content) ? { ...m, content: `_(${safe})_\n\n` } : m);
      sessionData.lastHeartbeat = Date.now();
      this.requestRender(assistantMsgId);
    });
    sessionData.unlistenFns.push(unlistenStatus);

    const unlistenStream = await listen<string>(assistantMsgId, (event) => {
      this.handleEventChunk(assistantMsgId, sessionData, event.payload);
    });
    sessionData.unlistenFns.push(unlistenStream);

    // 🏆 PIVO 3.0 Bridge: 侧边信号直连 (E2E 环境极其稳定)
    const bridgeHandler = (e: any) => this.handleEventChunk(assistantMsgId, sessionData, e.detail);
    window.addEventListener(`pivo:direct-chunk:${assistantMsgId}`, bridgeHandler);
    sessionData.unlistenFns.push(() => window.removeEventListener(`pivo:direct-chunk:${assistantMsgId}`, bridgeHandler));

    const unlistenFinish = await listen<string>(`${assistantMsgId}_finish`, async () => {
      await this.finalizeStream(assistantMsgId);
    });
    sessionData.unlistenFns.push(unlistenFinish);

    const bridgeFinishHandler = () => this.finalizeStream(assistantMsgId);
    window.addEventListener(`pivo:direct-finish:${assistantMsgId}`, bridgeFinishHandler);
    sessionData.unlistenFns.push(() => window.removeEventListener(`pivo:direct-finish:${assistantMsgId}`, bridgeFinishHandler));

    const unlistenError = await listen<string>(`${assistantMsgId}_error`, (event) => {
      const safe = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
      this.forceUpdateStore(assistantMsgId, (m: any) => ({ ...m, content: `❌ Error: ${safe}`, isStreaming: false }));
      this.cleanup(assistantMsgId);
    });
    sessionData.unlistenFns.push(unlistenError);
  }

  private handleEventChunk(assistantMsgId: string, sessionData: any, payload: any) {
    let textChunk = '';
    let toolCallUpdate: any = null;
    try {
      if (!payload) return;
      const p = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (p.type === 'content') textChunk = String(p.content);
      else if (p.type === 'tool_call') toolCallUpdate = p.toolCall;
    } catch (e) {}

    if (textChunk || toolCallUpdate) {
      sessionData.lastHeartbeat = Date.now();

      if (!sessionData.hasReceivedChunk) {

          sessionData.hasReceivedChunk = true;
          setTimeout(() => coreUseChatStore.setState({ isLoading: false }), 50);
      }

      // 🏆 PIVO 3.0: 精准物理引用锁定 - 仅更新当前活跃消息，保护历史消息引用
      sessionData.buffer = sessionData.buffer.map((m: any) => {
        if (m.id !== assistantMsgId) return m; // 物理保留历史引用，防止 React 冗余重绘

        const newMsg: Message = { ...m, isStreaming: true };
        if (!(newMsg as any).contentSegments) (newMsg as any).contentSegments = [];
        
        if (textChunk) {
          const prevContent = String(newMsg.content || '');
          
          // 🏆 PIVO 3.0: 工业级消重算法 (物理级消除乱码)
          let overlapIdx = 0;
          const checkLimit = Math.min(prevContent.length, textChunk.length, 50); 
          for (let i = 1; i <= checkLimit; i++) {
              if (prevContent.endsWith(textChunk.substring(0, i))) {
                  overlapIdx = i;
              }
          }
          
          let cleanChunk = textChunk.substring(overlapIdx);
          
          // B. 🚀 物理增强：检测“交叉错位叠加” (防突变乱码)
          if (cleanChunk.length > 3 && prevContent.length > 10) {
              const tail = prevContent.slice(-15);
              const chunkHead = cleanChunk.slice(0, 5);
              
              const isTechnicalWord = /^[a-zA-Z0-9\-\/._]+$/.test(cleanChunk) && cleanChunk.length < 10;
              let matchCount = 0;
              for (const char of chunkHead) {
                  if (tail.includes(char)) matchCount++;
              }
              
              if (matchCount >= 3 && !isTechnicalWord) {
                  let realStart = 0;
                  for (let j = 0; j < cleanChunk.length; j++) {
                      if (!tail.includes(cleanChunk[j])) {
                          realStart = j;
                          break;
                      }
                  }
                  cleanChunk = cleanChunk.substring(realStart);
              }
          }
          
          if (cleanChunk.length > 0) {
              newMsg.content = prevContent + cleanChunk;
              (newMsg as any).contentSegments.push({ 
                  type: 'text', 
                  order: (newMsg as any).contentSegments.length, 
                  timestamp: Date.now(), 
                  content: cleanChunk, 
                  startPos: prevContent.length, 
                  endPos: newMsg.content.length 
              });
              InlineSyncService.syncState("", "", cleanChunk);
          }
        }
        if (toolCallUpdate) this.processToolCallUpdate(newMsg, toolCallUpdate, assistantMsgId);
        return newMsg;
      });
      this.requestRender(assistantMsgId);
    }
  }

  private requestRender(id: string) {
    const s = this.activeStreams.get(id);
    if (!s || s.renderRequested) return;
    
    // 🏆 PIVO 3.0: 物理哨兵自愈判定
    const now = Date.now();
    if (now - (s.lastHeartbeat || 0) > 5000) {
        console.warn(`[Controller] 🛡️ Physical stall detected: ${id}`);
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('ifainew:stream-stalled', JSON.stringify({ id, timestamp: now }));
        }
    }

    const currentThreadId = useThreadStore.getState().activeThreadId || 'default';
    if (s.threadId !== currentThreadId) return; 

    // 🔥 物理锁：确保节流周期内只有一个待执行任务
    s.renderRequested = true;

    setTimeout(() => {
      // 🏆 物理二次检查：确保会话依然活跃且处于同一线程
      const session = this.activeStreams.get(id);
      if (session && session.renderRequested) {
        coreUseChatStore.setState({ messages: [...session.buffer] as any });
        
        // 🏆 PIVO 3.4.9: 物理事件驱动同步 - 必须在 State 更新后发射，确保 Virtualizer 拿到的是最新 count
        eventBus.emit('chat:content-updated', { messageId: id });

        session.renderRequested = false;
      }
    }, 80);
  }

  private extractPartialArgs(argsStr: string): any {
    let parsed: any = {};
    try { 
      parsed = JSON.parse(argsStr); 
    } catch (e) {
      // 🏆 PIVO 3.0: 鲁棒性正则提取 (支持未闭合 JSON)
      const contentMatch = argsStr.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/s);
      if (contentMatch) {
          parsed.content = contentMatch[1].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
      }
      
      // 🏆 PIVO 3.0: 物理级路径捕获 - 采用非约束性匹配以支持流式内容
      const pathMatch = argsStr.match(/"(?:rel_)?path"\s*:\s*"(.*)/s);
      if (pathMatch) {
          let val = pathMatch[1];
          // 如果 argsStr 中在 val 之后确实存在符合 JSON 结构的闭合引号，则进行截断
          const structClosingMatch = val.match(/"\s*[,}\n]/);
          if (structClosingMatch) {
              val = val.substring(0, structClosingMatch.index);
          }
          parsed.rel_path = val;
          parsed.path = val;
      }

      // 🏆 v0.5.0: 增强型命令提取 - 支持 cmd 和 command，使用 /s 模式以匹配多行内容
      const commandMatch = argsStr.match(/"(?:command|cmd)"\s*:\s*"((?:[^"\\]|\\.)*)/s);
      if (commandMatch) {
          parsed.command = commandMatch[1].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
          parsed.cmd = parsed.command; // 双向兼容
      }
    }
    return parsed;
  }

  private processToolCallUpdate(msg: Message, update: any, assistantMsgId: string) {
    const deltaName = update.function?.name || update.tool || '';
    const newArgs = update.function?.arguments || '';
    const existingCalls = msg.toolCalls || [];
    let cid = update.id;
    if (update.id) cid = toolCallDeduplicator.getCanonicalId(update.id) || update.id;

    const idx = existingCalls.findIndex(tc => (cid && tc.id === cid) || (update.index !== undefined && (tc as any).index === update.index));
    const isPartial = update.isPartial ?? true;

    if (idx !== -1) {
      const tc = existingCalls[idx];
      // 🏆 PIVO 3.0: 支持碎片化名字拼接 (DeepSeek 风格)
      const toolName = (tc.tool || '') + deltaName;
      const argsStr = ((tc as any).function?.arguments || '') + newArgs;
      const parsed = this.extractPartialArgs(argsStr);
      
      const updated = [...existingCalls];
      updated[idx] = { ...tc, tool: toolName, args: parsed, function: { name: toolName, arguments: argsStr }, isPartial: isPartial } as any;
      msg.toolCalls = updated;
      if (parsed.content) InlineSyncService.syncState(toolName, parsed.content);
      
      const segments = (msg as any).contentSegments || [];
      const hasSegment = segments.some((seg: any) => seg.toolCallId === updated[idx].id);
      if (!hasSegment) {
          segments.push({ type: 'tool', order: segments.length, timestamp: Date.now(), toolCallId: updated[idx].id });
          (msg as any).contentSegments = segments;
      }

      if (isPartial === false) {
        ApprovalPipeline.processAutoApproval({ settings: useSettingsStore.getState(), editorMode: (window as any).__IFAI_EDITOR_MODE__ || "standard", isSessionTrusted: false, toolName: toolName, isSandbox: true, userMessageHasAutoApprove: (msg as any).autoApproveTools || false }, () => {
          (coreUseChatStore.getState() as any).approveToolCall(assistantMsgId, updated[idx].id, { skipContinue: true });
        });
      }
    } else {
      const tid = cid || `call_${crypto.randomUUID()}`;
      const iArgs = this.extractPartialArgs(newArgs);
      const tc = { id: tid, type: 'function', tool: deltaName, args: iArgs, function: { name: deltaName, arguments: newArgs }, status: 'pending', isPartial: isPartial, index: update.index } as any;
      msg.toolCalls = [...existingCalls, tc];
      if (!(msg as any).contentSegments) (msg as any).contentSegments = [];
      (msg as any).contentSegments.push({ type: 'tool', order: (msg as any).contentSegments.length, timestamp: Date.now(), toolCallId: tid });
      InlineSyncService.syncState(deltaName, iArgs.content || "");
    }
  }

  async finalizeStream(id: string) {
    const session = this.activeStreams.get(id);
    if (!session) return;

    this.forceUpdateStore(id, (m: any) => ({
        ...m, 
        isStreaming: false,
        toolCalls: m.toolCalls?.map((tc: any) => {
          let fArgs = tc.args || {};
          if ((!fArgs || Object.keys(fArgs).length === 0 || tc.isPartial) && (tc as any).function?.arguments) {
            try { 
                fArgs = JSON.parse((tc as any).function.arguments); 
            } catch (e) {
                // 🏆 PIVO 3.0: 物理级最后一次挽救 - 强制使用正则提取器
                fArgs = this.extractPartialArgs((tc as any).function.arguments);
            }
          }
          // 🏆 PIVO 3.0: 物理保留所有字段（包括 result），仅更新 isPartial 和 args
          return { ...tc, isPartial: false, args: fArgs };
        })
    }));

    const updatedState = coreUseChatStore.getState();
    const finalizedMsg = updatedState.messages.find(m => m.id === id);
    let hasFollowUp = false;

    if (finalizedMsg?.toolCalls) {
        const pendingTCs = finalizedMsg.toolCalls.filter((tc: any) => tc.status === 'pending');
        if (pendingTCs.length > 0) {
            hasFollowUp = true; // 🏆 关键：检测到有自动执行工具，标记为非终结态
            pendingTCs.forEach((tc: any) => {
                ApprovalPipeline.processAutoApproval({ settings: useSettingsStore.getState(), editorMode: (window as any).__IFAI_EDITOR_MODE__ || "standard", isSessionTrusted: false, toolName: tc.tool, isSandbox: true, userMessageHasAutoApprove: (finalizedMsg as any).autoApproveTools || false }, () => {
                    (coreUseChatStore.getState() as any).approveToolCall(id, tc.id, { skipContinue: true });
                });
            });
            setTimeout(async () => {
                const latestState = coreUseChatStore.getState();
                const latestMsg = latestState.messages.find(m => m.id === id);
                const anyRunning = latestMsg?.toolCalls?.some(tc => tc.status === 'pending' || tc.status === 'approved' || tc.status === 'executing' || tc.isPartial);
                if (!anyRunning) {
                    const settings = useSettingsStore.getState();
                    const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
                    if (providerConfig) (window as any).__chatStore?.getState().generateResponse(latestState.messages, providerConfig);
                }
            }, 1000);
        }
    }

    // 🏆 PIVO 3.0: 物理闭环 (异步化解决 flushSync 冲突)
    console.log(`[PIVO-SIGNAL] 🏁 Stream Finalized: ${id}`);
    
    // 用于 E2E 自动化测试的权威信号存根
    if (typeof window !== 'undefined') {
        if (!(window as any).__PIVO_SIGNALS__) (window as any).__PIVO_SIGNALS__ = {};
        (window as any).__PIVO_SIGNALS__['ifainew:stream-finished'] = { id, timestamp: Date.now() };
    }

    // 🏆 物理隔离：通过 EventBus 广播结束，让任务拆解在下一帧触发
    eventBus.emit('ifainew:stream-finished', { id });

    window.dispatchEvent(new CustomEvent('ifainew:stream-finished', { detail: { id } }));
    // 发送旧版 finish 事件以保证兼容性
    window.dispatchEvent(new CustomEvent(`${id}_finish`, { detail: { payload: 'done' } }));

    InlineSyncService.handleResponseFinish();
    this.cleanup(id);
  }

  private forceUpdateStore(id: string, updateFn: (msg: any) => any) {
    coreUseChatStore.setState((state: any) => ({
        messages: state.messages.map((m: any) => m.id === id ? updateFn(m) : m),
        isLoading: false
    }));
  }

  private cleanup(id: string) {
    console.log(`[PIVO-SIGNAL] 🧹 Cleaning up session: ${id}`);
    const s = this.activeStreams.get(id);
    if (s) { 
        if (s.unlistenFns) {
            s.unlistenFns.forEach(u => u()); 
        }
        this.activeStreams.delete(id); 
    }
    window.dispatchEvent(new CustomEvent('ifainew:session-cleaned', { detail: { id } }));
  }
}
