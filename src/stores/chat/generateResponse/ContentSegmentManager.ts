/**
 * ContentSegmentManager - 流式内容分段管理器
 *
 * 职责：
 * - 追踪流式传输的阶段（pre-tool / in-tool / post-tool）
 * - 构建 ContentSegment[] 数组
 * - 维护渲染顺序
 *
 * @version 1.0.0
 */

import { chatEventBus, BasePayload } from '../eventBus/ChatEventBus';

/**
 * 流式阶段
 */
export type StreamPhase = 'pre-tool' | 'in-tool' | 'post-tool';

/**
 * 工具调用状态
 */
export type ToolCallStatus = 'pending' | 'approved' | 'executing' | 'completed' | 'failed';

/**
 * 内容段落类型
 */
export interface ContentSegment {
  // 基础字段
  type: 'text' | 'tool';
  order: number;
  timestamp: number;

  // Phase 字段（关键！）
  phase: StreamPhase;

  // Text segments
  content?: string;

  // Tool segments
  toolCallId?: string;
  toolName?: string;
  status?: ToolCallStatus;
}

/**
 * 工具调用接口
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  status?: ToolCallStatus;
  result?: any;
}

/**
 * 单个流的状态
 */
interface StreamState {
  correlationId: string;

  // 当前阶段
  currentPhase: StreamPhase;

  // Segments 列表
  segments: ContentSegment[];

  // 当前正在构建的 text segment
  currentTextSegment?: ContentSegment;

  // 工具调用计数（用于生成 order）
  toolCallCount: number;

  // 开始时间
  startTime: number;

  // 是否已完成
  isFinished: boolean;
}

/**
 * ContentSegmentManager 类
 */
export class ContentSegmentManager {
  private streams: Map<string, StreamState> = new Map();

  /**
   * 流式传输开始
   * 🏆 关键修复：支持续播重启
   */
  onStreamStart(correlationId: string): void {
    console.log('[ContentSegmentManager] 🚀 Stream started:', correlationId);

    // 如果流已存在且处于延迟清理状态，我们“复活”它
    if (this.streams.has(correlationId)) {
      const existingState = this.streams.get(correlationId)!;
      console.log('[ContentSegmentManager] 🔄 Re-activating existing stream for continuation:', correlationId);
      
      existingState.isFinished = false;
      
      // 🏆 物理对齐：续播通常紧接在工具调用之后，或由于截断
      // 如果没有段落，创建一个；如果有，后续 Chunk 会追加到最后一个段落
      if (existingState.segments.length === 0) {
        this.createNewTextSegment(existingState, existingState.currentPhase);
      }
      return;
    }

    const state: StreamState = {
      correlationId,
      currentPhase: 'pre-tool',
      segments: [],
      toolCallCount: 0,
      startTime: Date.now(),
      isFinished: false
    };

    this.streams.set(correlationId, state);

    // 创建初始 text segment（pre-tool 阶段）
    this.createNewTextSegment(state, 'pre-tool');

    // 触发事件
    chatEventBus.emit('chat:phase:changed', {
      correlationId,
      sessionId: '', // 将由调用方填充
      phase: 'pre-tool',
      previousPhase: null as any,
      timestamp: Date.now()
    } as any);
  }

  /**
   * 处理内容块
   */
  onContentChunk(delta: string, correlationId: string): void {
    const state = this.streams.get(correlationId);
    if (!state) {
      console.warn('[ContentSegmentManager] ⚠️ Stream not found:', correlationId);
      return;
    }

    if (state.isFinished) {
      console.warn('[ContentSegmentManager] ⚠️ Stream already finished, ignoring chunk:', correlationId);
      return;
    }

    // 🔥 FIX: 减少日志输出，每个字符不再打印日志
    // console.log('[ContentSegmentManager] 📝 Content chunk received:', {
    //     correlationId,
    //     delta: delta.substring(0, 30),
    //     phase: state.currentPhase
    // });

    // 追加到当前 text segment
    if (state.currentTextSegment) {
      state.currentTextSegment.content += delta;

      // 触发更新事件
      // 🏆 物理对齐：使用 order 查找，避免内存引用偏移
      const segmentIndex = state.segments.findIndex(s => s.order === state.currentTextSegment!.order);
      if (segmentIndex !== -1) {
        chatEventBus.emit('chat:segment:updated', {
          correlationId,
          sessionId: '',
          segmentId: `segment-${state.currentTextSegment.order}`,
          delta,
          timestamp: Date.now()
        } as any);
      }
    } else {
      // 🏆 物理自愈：如果没有 currentTextSegment，则尝试找到最后一个 text segment
      const lastTextSegment = [...state.segments].reverse().find(s => s.type === 'text');
      if (lastTextSegment) {
          state.currentTextSegment = lastTextSegment;
          this.onContentChunk(delta, correlationId); // 递归重试
      }
    }

  }

  /**
   * 处理工具调用
   */
  onToolCall(toolCall: ToolCall, correlationId: string): void {
    const state = this.streams.get(correlationId);
    if (!state) {
      console.warn('[ContentSegmentManager] ⚠️ Stream not found:', correlationId);
      return;
    }

    if (state.isFinished) {
      console.warn('[ContentSegmentManager] ⚠️ Stream already finished, ignoring tool call:', correlationId);
      return;
    }

    console.log('[ContentSegmentManager] 🔧 Tool call received:', {
      correlationId,
      toolName: toolCall.function.name,
      currentPhase: state.currentPhase
    });

    const previousPhase = state.currentPhase;

    // 完成当前 text segment（如果有）
    if (state.currentTextSegment && state.currentTextSegment.content) {
      this.finalizeCurrentTextSegment(state);
    }

    // 更新阶段
    if (state.currentPhase === 'pre-tool') {
      state.currentPhase = 'in-tool';
    }
    // 如果已经是 in-tool，保持不变（多工具场景）
    // 如果是 post-tool，重新进入 in-tool（工具重试）

    // 创建 tool segment
    const toolSegment: ContentSegment = {
      type: 'tool',
      order: this.getNextOrder(state),
      timestamp: Date.now(),
      phase: state.currentPhase,
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      status: toolCall.status || 'pending'
    };

    state.segments.push(toolSegment);
    state.toolCallCount++;

    console.log('[ContentSegmentManager] ✅ Tool segment created:', {
      order: toolSegment.order,
      toolName: toolSegment.toolName
    });

    // 触发事件
    chatEventBus.emit('chat:segment:created', {
      correlationId,
      sessionId: '',
      segment: toolSegment,
      timestamp: Date.now()
    } as any);

    if (previousPhase !== state.currentPhase) {
      chatEventBus.emit('chat:phase:changed', {
        correlationId,
        sessionId: '',
        phase: state.currentPhase,
        previousPhase,
        timestamp: Date.now()
      } as any);
    }

    // 创建新的 text segment（用于后续内容）
    this.createNewTextSegment(state, state.currentPhase);
  }

  /**
   * 流式传输结束
   */
  onStreamFinish(correlationId: string): void {
    const state = this.streams.get(correlationId);
    if (!state) {
      console.warn('[ContentSegmentManager] ⚠️ Stream not found:', correlationId);
      return;
    }

    console.log('[ContentSegmentManager] 🏁 Stream finished:', correlationId);

    // 完成当前 text segment（如果有内容）
    if (state.currentTextSegment && state.currentTextSegment.content) {
      this.finalizeCurrentTextSegment(state);
    }

    state.isFinished = true;

    // 🔧 FIX: 不再发射 chat:stream:finished，由 StreamingResponseController 统一发射
    // 避免无限循环：StreamingResponseController -> StoreMapper -> ContentSegmentManager -> StoreMapper -> ...
    // chatEventBus.emit('chat:stream:finished', {
    //   correlationId,
    //   sessionId: '',
    //   timestamp: Date.now()
    // } as any);

    // 延迟清理（给其他模块时间处理）
    setTimeout(() => {
      this.cleanup(correlationId);
    }, 5000);
  }

  /**
   * 获取 segments
   */
  getSegments(correlationId: string): ContentSegment[] {
    const state = this.streams.get(correlationId);
    if (!state) {
      console.warn('[ContentSegmentManager] ⚠️ Stream not found:', correlationId);
      return [];
    }

    // 返回 segments 的副本，防止外部修改
    return [...state.segments];
  }

  /**
   * 获取当前阶段
   */
  getCurrentPhase(correlationId: string): StreamPhase {
    const state = this.streams.get(correlationId);
    return state?.currentPhase || 'pre-tool';
  }

  /**
   * 检查流是否活跃
   */
  isStreamActive(correlationId: string): boolean {
    const state = this.streams.get(correlationId);
    return state ? !state.isFinished : false;
  }

  /**
   * 清理流状态（带缓冲的延迟清理）
   * 🏆 关键修复：为续播留出窗口期
   */
  private cleanup(correlationId: string): void {
    console.log('[ContentSegmentManager] ⏳ Scheduling delayed cleanup for stream:', correlationId);
    
    // 30秒后执行真正的物理删除，给续播留出足够的时间
    setTimeout(() => {
      // 在删除前再次确认，如果流已经重新变得活跃（isFinished === false），则取消删除
      const state = this.streams.get(correlationId);
      if (state && !state.isFinished) {
        console.log('[ContentSegmentManager] 🛡️ Cleanup cancelled: Stream became active again:', correlationId);
        return;
      }
      
      console.log('[ContentSegmentManager] 🧹 Executing physical cleanup for stream:', correlationId);
      this.streams.delete(correlationId);
    }, 30000);
  }

  /**
   * 创建新的 text segment
   */
  private createNewTextSegment(state: StreamState, phase: StreamPhase): void {
    const textSegment: ContentSegment = {
      type: 'text',
      order: this.getNextOrder(state),
      timestamp: Date.now(),
      phase,
      content: ''
    };

    state.segments.push(textSegment);
    state.currentTextSegment = textSegment;

    console.log('[ContentSegmentManager] 📝 New text segment created:', {
      order: textSegment.order,
      phase
    });

    // 触发事件
    chatEventBus.emit('chat:segment:created', {
      correlationId: state.correlationId,
      sessionId: '',
      segment: textSegment,
      timestamp: Date.now()
    } as any);
  }

  /**
   * 完成当前 text segment
   */
  private finalizeCurrentTextSegment(state: StreamState): void {
    if (!state.currentTextSegment) {
      return;
    }

    console.log('[ContentSegmentManager] ✅ Text segment finalized:', {
      order: state.currentTextSegment.order,
      contentLength: state.currentTextSegment.content.length
    });

    state.currentTextSegment = undefined;
  }

  /**
   * 获取下一个 order 号
   */
  private getNextOrder(state: StreamState): number {
    return state.segments.length + 1;
  }
}

// 导出单例实例
export const contentSegmentManager = new ContentSegmentManager();
