/**
 * 拖拽状态管理 Store
 * v0.3.0: 用于区分文件拖拽的目标区域（编辑器 vs 聊天输入框）
 */

import { create } from 'zustand';

interface DragDropState {
  /** 拖拽是否悬停在聊天输入区域 */
  isDragOverChat: boolean;
  /** 设置拖拽悬停在聊天区域 */
  setDragOverChat: (value: boolean) => void;
}

export const useDragDropStore = create<DragDropState>(set => ({
  isDragOverChat: false,
  setDragOverChat: (value: boolean) => set({ isDragOverChat: value }),
}));
