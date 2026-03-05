import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { listen } from '@tauri-apps/api/event';
import { PersistenceManager } from '../services/storage/PersistenceManager';

export interface TaskNode {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'healing';
  task_type: 'Plan' | 'Implement' | 'Verify' | 'Optimize';
  children: TaskNode[];
}

interface PivoState {
  taskTrees: Record<string, TaskNode[]>; // messageId -> tasks
  activeMessageId: string | null; // 当前正在“持有”任务列表的消息 ID
  isHydrating: boolean; // 🏆 PIVO 3.0: 异步加载状态
  setTaskTree: (messageId: string, tasks: TaskNode[]) => void;
  updateTaskStatus: (messageId: string, taskId: string, status: TaskNode['status']) => void;
  setActiveMessageId: (messageId: string | null) => void;
  initEventListener: () => Promise<() => void>;
  syncState: (state: Partial<PivoState>) => void;
}

export const usePivoStore = create<PivoState>()(
  persist(
    (set, get) => ({
      taskTrees: {},
      activeMessageId: null,
      isHydrating: true,

      syncState: (newState) => set((state) => ({ ...state, ...newState })),

      setTaskTree: (messageId, tasks) => {
        set((state) => ({
          taskTrees: {
            ...state.taskTrees,
            [messageId]: tasks,
          },
          activeMessageId: messageId, // 设为最新的持有者
        }));
      },

      setActiveMessageId: (messageId) => set({ activeMessageId: messageId }),

      updateTaskStatus: (messageId, taskId, status) => {
        set((state) => {
          const tasks = state.taskTrees[messageId];
          if (!tasks) return state;

          const updateNode = (nodes: TaskNode[]): TaskNode[] => {
            return nodes.map((node) => {
              if (node.id === taskId) {
                return { ...node, status };
              }
              if (node.children.length > 0) {
                return { ...node, children: updateNode(node.children) };
              }
              return node;
            });
          };

          return {
            taskTrees: {
              ...state.taskTrees,
              [messageId]: updateNode(tasks),
            },
          };
        });
      },

      initEventListener: async () => {
        const unlisten = await listen<{ messageId: string; taskId: string; status: TaskNode['status'] }>(
          'pivo-task-updated',
          (event) => {
            const { messageId, taskId, status } = event.payload;
            get().updateTaskStatus(messageId, taskId, status);
          }
        );
        return unlisten;
      },
    }),
    {
      name: 'pivo-task-trees', // PersistenceManager 会自动路由到 IndexedDB
      storage: createJSONStorage(() => PersistenceManager.getInstance()),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.syncState({ isHydrating: false });
          console.log('[PivoStore] ✅ Task trees rehydrated from IndexedDB');
        }
      }
    }
  )
);

// 🏆 v0.4.1: 物理级 E2E 挂载 - 确保测试脚本能第一时间锁定 Store
if (typeof window !== 'undefined') {
  const isE2E = (window as any).__E2E__ || 
                location.search.includes('e2e=true') || 
                (window as any).process?.env?.NODE_ENV === 'test';
  
  if (isE2E || import.meta.env.DEV) {
    (window as any).__pivoStore = usePivoStore;
  }
}
