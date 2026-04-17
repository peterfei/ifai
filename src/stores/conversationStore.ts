/**
 * Section 5.3: 对话管理 Store
 *
 * 使用 Zustand 管理对话总结和会话笔记状态
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  SessionNotesData,
  TokenStats,
  ArchiveInfo,
  ArchiveDetail,
  RestoreOptions,
  SummaryConfig,
  Message,
  CompactResult
} from '../types/conversation';
import type { AIProviderConfig } from '../stores/settingsStore';

/**
 * 对话 Store 状态
 */
interface ConversationStore {
  // ==================== 状态 ====================

  /**
   * 当前会话笔记
   */
  sessionNotes: SessionNotesData | null;

  /**
   * Token 统计
   */
  tokenStats: TokenStats | null;

  /**
   * 归档列表
   */
  archives: ArchiveInfo[];

  /**
   * 加载状态
   */
  isLoading: boolean;

  /**
   * 错误信息
   */
  error: string | null;

  // ==================== 操作 ====================

  /**
   * 创建新会话笔记
   */
  createNotes: (sessionId: string, projectRoot: string) => Promise<void>;

  /**
   * 从消息中提取笔记
   */
  extractNotesFromMessages: (messages: Message[]) => Promise<void>;

  /**
   * 添加技术概念
   */
  addTechConcept: (name: string, description: string, category: string) => Promise<void>;

  /**
   * 添加文件变更
   */
  addFileChange: (path: string, action: string, reason: string) => Promise<void>;

  /**
   * 添加错误修复
   */
  addErrorFix: (errorMessage: string, errorType: string, solution: string, filePath?: string) => Promise<void>;

  /**
   * 添加待办任务
   */
  addTodoTask: (description: string, priority: string) => Promise<void>;

  /**
   * 更新待办任务状态
   */
  updateTodoStatus: (taskId: string, status: string) => Promise<void>;

  /**
   * 生成笔记摘要
   */
  generateNotesSummary: () => Promise<void>;

  /**
   * 保存笔记
   */
  saveNotes: () => Promise<void>;

  /**
   * 加载笔记
   */
  loadNotes: (sessionId: string) => Promise<void>;

  /**
   * 导出笔记为 Markdown
   */
  exportNotesToMarkdown: () => Promise<string>;

  /**
   * 导出笔记为 JSON
   */
  exportNotesToJSON: () => Promise<string>;

  /**
   * 获取 Token 统计
   */
  getTokenStats: (messages: Message[], model: string) => Promise<void>;

  /**
   * 检查是否需要总结
   */
  shouldSummarize: (messages: Message[]) => Promise<boolean>;

  /**
   * 生成对话总结
   */
  generateSummary: (messages: Message[], providerConfig: AIProviderConfig) => Promise<string>;

  /**
   * 压缩对话
   */
  compactConversation: (messages: Message[], summary: string, keepLastN?: number) => Promise<CompactResult>;

  /**
   * 获取归档列表
   */
  loadArchives: () => Promise<void>;

  /**
   * 加载归档详细内容
   */
  loadArchiveDetail: (archiveId: string) => Promise<ArchiveDetail | null>;

  /**
   * 恢复归档到对话
   */
  restoreArchive: (archiveId: string, options?: RestoreOptions) => Promise<boolean>;

  /**
   * 清除错误
   */
  clearError: () => void;

  /**
   * 重置状态
   */
  reset: () => void;
}

/**
 * 创建对话 Store
 */
export const useConversationStore = create<ConversationStore>()(
  subscribeWithSelector((set, get) => ({
    // ==================== 初始状态 ====================

    sessionNotes: null,
    tokenStats: null,
    archives: [],
    isLoading: false,
    error: null,

    // ==================== 操作实现 ====================

    /**
     * 创建新会话笔记
     */
    createNotes: async (sessionId: string, projectRoot: string) => {
      set({ isLoading: true, error: null });
      try {
        // 动态导入以避免初始化问题
        const { invoke } = await import('@tauri-apps/api/core');
        const notes = await invoke<SessionNotesData>('create_session_notes', {
          sessionId,
          projectRoot
        });
        set({ sessionNotes: notes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 从消息中提取笔记
     */
    extractNotesFromMessages: async (messages: Message[]) => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedNotes = await invoke<SessionNotesData>('extract_notes_from_messages', {
          notes: sessionNotes,
          messages
        });
        set({ sessionNotes: updatedNotes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 添加技术概念
     */
    addTechConcept: async (name: string, description: string, category: string) => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedNotes = await invoke<SessionNotesData>('add_tech_concept', {
          notes: sessionNotes,
          name,
          description,
          category
        });
        set({ sessionNotes: updatedNotes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 添加文件变更
     */
    addFileChange: async (path: string, action: string, reason: string) => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedNotes = await invoke<SessionNotesData>('add_file_change_to_notes', {
          notes: sessionNotes,
          path,
          action,
          reason
        });
        set({ sessionNotes: updatedNotes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 添加错误修复
     */
    addErrorFix: async (errorMessage: string, errorType: string, solution: string, filePath?: string) => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedNotes = await invoke<SessionNotesData>('add_error_fix_to_notes', {
          notes: sessionNotes,
          errorMessage,
          errorType,
          solution,
          filePath
        });
        set({ sessionNotes: updatedNotes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 添加待办任务
     */
    addTodoTask: async (description: string, priority: string) => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedNotes = await invoke<SessionNotesData>('add_todo_task_to_notes', {
          notes: sessionNotes,
          description,
          priority
        });
        set({ sessionNotes: updatedNotes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 更新待办任务状态
     */
    updateTodoStatus: async (taskId: string, status: string) => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedNotes = await invoke<SessionNotesData>('update_todo_task_status', {
          notes: sessionNotes,
          taskId,
          status
        });
        set({ sessionNotes: updatedNotes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 生成笔记摘要
     */
    generateNotesSummary: async () => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const updatedNotes = await invoke<SessionNotesData>('generate_notes_summary', {
          notes: sessionNotes
        });
        set({ sessionNotes: updatedNotes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 保存笔记
     */
    saveNotes: async () => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke<string>('save_session_notes', {
          notes: sessionNotes
        });
        set({ isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 加载笔记
     */
    loadNotes: async (sessionId: string) => {
      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const projectRoot = await invoke<string>('get_project_root', {});
        const notes = await invoke<SessionNotesData>('load_session_notes', {
          projectRoot,
          sessionId
        });
        set({ sessionNotes: notes, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 导出笔记为 Markdown
     */
    exportNotesToMarkdown: async () => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return '';
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('export_notes_to_markdown', {
          notes: sessionNotes
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        return '';
      }
    },

    /**
     * 导出笔记为 JSON
     */
    exportNotesToJSON: async () => {
      const { sessionNotes } = get();
      if (!sessionNotes) {
        set({ error: 'No active session notes' });
        return '';
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('export_notes_to_json', {
          notes: sessionNotes
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        return '';
      }
    },

    /**
     * 获取 Token 统计
     */
    getTokenStats: async (messages: Message[], model: string) => {
      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const stats = await invoke<TokenStats>('get_token_stats', {
          messages,
          model
        });
        set({ tokenStats: stats, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 检查是否需要总结
     */
    shouldSummarize: async (messages: Message[]) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<boolean>('should_summarize_conversation', {
          messages
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    },

    /**
     * 生成对话总结
     */
    generateSummary: async (messages: Message[], providerConfig: AIProviderConfig) => {
      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const projectRoot = await invoke<string>('get_project_root', {});
        const summary = await invoke<string>('summarize_conversation', {
          projectRoot,
          messages,
          providerConfig
        });
        set({ isLoading: false });
        return summary;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
        return '';
      }
    },

    /**
     * 压缩对话（集成多格式归档）
     *
     * 🔥 元编程：自动归档原始对话到多种格式
     * - JSON: 机器可读，用于 API 查询
     * - Markdown: 人类可读，用于 Git 和 LLM 输入
     */
    compactConversation: async (messages: Message[], summary: string, keepLastN = 10) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');

        // 🔥 1. 先压缩对话
        const compacted = await invoke<Message[]>('compact_conversation', {
          messages,
          summary,
          keep_last_n: keepLastN
        });

        // 🔥 2. 异步归档原始对话（不阻塞压缩流程）
        try {
          const projectRoot = await invoke<string>('get_project_root', {});
          const { conversationArchiveService } = await import('../core/archive/ConversationArchiveService');

          conversationArchiveService.archiveConversation(messages, summary, projectRoot, {
            formats: ['json', 'markdown'],
            pretty: true,
            metadata: {
              version: '1.0.0',
              originalMessageCount: messages.length
            }
          }).catch(err => {
            console.error('[ArchiveService] Archive failed:', err);
          });
        } catch (archiveError) {
          // 归档失败不影响压缩结果
          console.warn('[ConversationStore] Archive service error (non-blocking):', archiveError);
        }

        return {
          original_count: messages.length,
          compressed_count: compacted.length,
          summary,
          messages: compacted
        };
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        return {
          original_count: messages.length,
          compressed_count: messages.length,
          summary,
          messages
        };
      }
    },

    /**
     * 获取归档列表
     */
    loadArchives: async () => {
      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const projectRoot = await invoke<string>('get_project_root', {});
        const archives = await invoke<ArchiveInfo[]>('get_conversation_archives', {
          projectRoot,
          limit: 50
        });
        set({ archives, isLoading: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
      }
    },

    /**
     * 加载归档详细内容
     */
    loadArchiveDetail: async (archiveId: string) => {
      set({ isLoading: true, error: null });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const projectRoot = await invoke<string>('get_project_root', {});

        // 调用后端加载归档详情
        const detail = await invoke<any>('load_conversation_archive', {
          projectRoot,
          archiveId
        });

        set({ isLoading: false });
        return detail as ArchiveDetail;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
        return null;
      }
    },

    /**
     * 恢复归档到对话
     */
    restoreArchive: async (archiveId: string, options: RestoreOptions = { mode: 'replace' }) => {
      set({ isLoading: true, error: null });
      try {
        // 1. 加载归档详细内容
        const detail = await get().loadArchiveDetail(archiveId);

        if (!detail) {
          throw new Error('Failed to load archive detail');
        }

        // 2. 根据选项恢复消息
        // 注意：这里需要访问 chatStore，所以需要在调用处处理
        // 此方法只负责加载归档内容，实际的恢复逻辑由调用方处理

        set({ isLoading: false });
        return true;
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false
        });
        return false;
      }
    },

    /**
     * 清除错误
     */
    clearError: () => {
      set({ error: null });
    },

    /**
     * 重置状态
     */
    reset: () => {
      set({
        sessionNotes: null,
        tokenStats: null,
        archives: [],
        isLoading: false,
        error: null
      });
    }
  }))
);

/**
 * 选择器辅助函数
 */
export const selectSessionNotes = (state: ConversationStore) => state.sessionNotes;
export const selectTokenStats = (state: ConversationStore) => state.tokenStats;
export const selectArchives = (state: ConversationStore) => state.archives;
export const selectIsLoading = (state: ConversationStore) => state.isLoading;
export const selectError = (state: ConversationStore) => state.error;
