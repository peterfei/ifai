/**
 * OpenSpec 提案状态管理 Store
 * v0.2.6 新增
 *
 * 使用 Zustand 管理提案状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from './fileStore';
import {
  OpenSpecProposal,
  ProposalStatus,
  ProposalLocation,
  CreateProposalOptions,
  UpdateProposalOptions,
  ProposalIndex,
} from '../types/proposal';

/**
 * 提案状态
 */
interface ProposalState {
  /** 当前正在查看或编辑的提案 */
  currentProposal: OpenSpecProposal | null;
  /** 提案列表索引 */
  index: ProposalIndex;
  /** 是否正在创建提案 */
  isCreating: boolean;
  /** 是否正在验证提案 */
  isValidating: boolean;
  /** 是否显示审核弹窗 */
  isReviewModalOpen: boolean;
  /** 待审核的提案 ID */
  pendingReviewProposalId: string | null;
  /** 错误信息 */
  error: string | null;

  /** 设置当前提案 */
  setCurrentProposal: (proposal: OpenSpecProposal | null) => void;
  /** 更新当前提案 */
  updateCurrentProposal: (updates: UpdateProposalOptions) => void;
  /** 创建新提案 */
  createProposal: (options: CreateProposalOptions) => Promise<OpenSpecProposal>;
  /** 保存提案到文件 */
  saveProposal: (proposal: OpenSpecProposal) => Promise<void>;
  /** 从文件加载提案 */
  loadProposal: (id: string, location: ProposalLocation) => Promise<OpenSpecProposal>;
  /** 删除提案 */
  deleteProposal: (id: string, location: ProposalLocation) => Promise<void>;
  /** 移动提案 */
  moveProposal: (id: string, from: ProposalLocation, to: ProposalLocation) => Promise<void>;
  /** 刷新提案索引 */
  refreshIndex: () => Promise<void>;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 清空当前提案 */
  clearCurrent: () => void;
  /** 打开审核弹窗 */
  openReviewModal: (proposalId: string) => void;
  /** 关闭审核弹窗 */
  closeReviewModal: () => void;
}

/**
 * 创建提案 Store
 */
export const useProposalStore = create<ProposalState>()(
  persist(
    (set, get) => ({
      // 初始状态
      currentProposal: null,
      index: {
        proposals: [],
        lastUpdated: 0,
      },
      isCreating: false,
      isValidating: false,
      isReviewModalOpen: false,
      pendingReviewProposalId: null,
      error: null,

      // 设置当前提案
      setCurrentProposal: (proposal) => {
        set({ currentProposal: proposal });
      },

      // 更新当前提案
      updateCurrentProposal: (updates) => {
        const { currentProposal } = get();
        if (currentProposal) {
          const updated: OpenSpecProposal = {
            ...currentProposal,
            ...updates,
            updatedAt: Date.now(),
          };
          set({ currentProposal: updated });
        }
      },

      // 创建新提案
      createProposal: async (options) => {
        set({ isCreating: true, error: null });

        try {
          // 生成唯一 ID
          const id = options.id || generateProposalId(options.why);

          // 创建提案对象
          const now = Date.now();
          const proposal: OpenSpecProposal = {
            id,
            path: `.ifai/proposals/${id}/`,
            status: 'draft',
            location: 'proposals',
            why: options.why,
            whatChanges: options.whatChanges,
            impact: options.impact,
            tasks: options.tasks,
            specDeltas: options.specDeltas,
            design: options.design,
            createdAt: now,
            updatedAt: now,
            validated: false,
          };

          // 获取项目根目录
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          // 调用后端保存提案
          await invoke('save_proposal', {
            proposal,
            location: 'proposals',
            rootPath,
          });

          // 刷新索引（不在这里更新 currentProposal，避免循环）
          await get().refreshIndex();

          // 一次性更新所有状态，避免多次触发更新
          set({
            currentProposal: proposal,
            isCreating: false
          });

          return proposal;
        } catch (e) {
          const errorMsg = `Failed to create proposal: ${e}`;
          set({ error: errorMsg, isCreating: false });
          throw new Error(errorMsg);
        }
      },

      // 保存提案
      saveProposal: async (proposal) => {
        set({ error: null });

        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          await invoke('save_proposal', {
            proposal,
            location: proposal.location,
            rootPath,
          });

          // 刷新索引
          await get().refreshIndex();

          // 更新当前提案
          set({ currentProposal: proposal });
        } catch (e) {
          const errorMsg = `Failed to save proposal: ${e}`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }
      },

      // 从文件加载提案
      loadProposal: async (id, location) => {
        set({ error: null });

        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          const proposal: OpenSpecProposal = await invoke('load_proposal', {
            id,
            location,
            rootPath,
          });

          set({ currentProposal: proposal });
          return proposal;
        } catch (e) {
          const errorMsg = `Failed to load proposal: ${e}`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }
      },

      // 删除提案
      deleteProposal: async (id, location) => {
        set({ error: null });

        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          await invoke('delete_proposal', { id, location, rootPath });

          // 如果删除的是当前提案，清空
          const { currentProposal } = get();
          if (currentProposal?.id === id) {
            set({ currentProposal: null });
          }

          // 刷新索引
          await get().refreshIndex();
        } catch (e) {
          const errorMsg = `Failed to delete proposal: ${e}`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }
      },

      // 移动提案
      moveProposal: async (id, from, to) => {
        set({ error: null });

        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            throw new Error('No project root opened');
          }

          await invoke('move_proposal', { id, from, to, rootPath });

          // 刷新索引
          await get().refreshIndex();

          // 如果是当前提案，更新位置
          const { currentProposal } = get();
          if (currentProposal?.id === id) {
            set({
              currentProposal: {
                ...currentProposal,
                location: to,
                path: `.ifai/${to}/${id}/`,
              },
            });
          }
        } catch (e) {
          const errorMsg = `Failed to move proposal: ${e}`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }
      },

      // 刷新提案索引
      refreshIndex: async () => {
        set({ error: null });

        try {
          const rootPath = useFileStore.getState().rootPath;
          if (!rootPath) {
            // 如果没有打开项目，返回空索引
            set({ index: { proposals: [], lastUpdated: 0 } });
            return;
          }

          const index: ProposalIndex = await invoke('list_proposals', { rootPath });
          set({ index });
        } catch (e) {
          const errorMsg = `Failed to refresh index: ${e}`;
          set({ error: errorMsg });
          console.error('[ProposalStore]', errorMsg);
        }
      },

      // 设置错误信息
      setError: (error) => {
        set({ error });
      },

      // 清空当前提案
      clearCurrent: () => {
        set({ currentProposal: null });
      },

      // 打开审核弹窗
      openReviewModal: (proposalId) => {
        set({
          isReviewModalOpen: true,
          pendingReviewProposalId: proposalId,
        });
      },

      // 关闭审核弹窗
      closeReviewModal: () => {
        set({
          isReviewModalOpen: false,
          pendingReviewProposalId: null,
        });
      },
    }),
    {
      name: 'proposal-storage',
      version: 1,
      // 持久化配置
      partialize: (state) => ({
        index: state.index,
        // 不持久化 currentProposal，避免占用太多空间
      }),
      migrate: (persistedState: any, version: number) => {
        console.log(`[ProposalStore] Migrating from version ${version} to 1`);
        return persistedState;
      },
    }
  )
);

/**
 * 生成提案 ID
 */
function generateProposalId(why: string): string {
  // 提取关键词
  const keywords = why
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3);

  const slug = keywords.join('-') || 'proposal';
  const timestamp = Date.now().toString(36);

  return `${slug}-${timestamp}`;
}
