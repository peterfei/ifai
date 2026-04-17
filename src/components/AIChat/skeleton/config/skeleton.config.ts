/**
 * AIChat 骨架屏配置
 *
 * 元编程架构：纯配置驱动，零业务逻辑
 * 修改此文件即可调整骨架屏行为
 */

import { useChatStore } from '../../../../stores/chat/CoreStoreProxy';
import { LoadingPhaseConfig } from '../StateMachineTypes';
import { SkeletonDesign } from '../SkeletonDSL';
import { DetectorConfig } from '../DetectorTypes';

/**
 * AIChat 状态机配置
 *
 * 定义加载阶段和状态转换规则
 *
 * 阶段说明：
 * - initial: 初始状态（短暂）
 * - loading: 初次加载（无消息）→ 全屏骨架屏
 * - streaming: 流式加载（有消息+isLoading）→ 单消息气泡骨架屏
 * - ready: 就绪状态
 * - error: 超时错误
 */
export const AI_CHAT_STATE_MACHINE: LoadingPhaseConfig[] = [
  {
    phase: 'initial',
    enter: () => {
      console.log('[Skeleton] Enter initial phase');
      // 显示骨架屏
      document.documentElement.setAttribute('data-skeleton-phase', 'initial');
    },
    transitions: {
      'store:ready': 'loading',
      'timeout': 'error',
    },
    detect: () => {
      // 简化：初始阶段总是检测为 false，让其他逻辑控制
      return false;
    },
  },
  {
    phase: 'loading',
    enter: () => {
      console.log('[Skeleton] Enter loading phase (full screen)');
      document.documentElement.setAttribute('data-skeleton-phase', 'loading');
    },
    transitions: {
      'messages:loaded': 'streaming',
      'timeout': 'error',
    },
    detect: () => {
      const store = useChatStore.getState();
      // 🔥 FIX: 只在初次加载时短暂显示全屏骨架屏
      // 如果 store 已就绪且有/没有消息，都应该进入下一个状态
      // 不应该一直停留在 loading
      return false; // 始终返回 false，让状态机继续检查其他状态
    },
  },
  {
    phase: 'streaming',
    enter: () => {
      console.log('[Skeleton] Enter streaming phase (single message bubble)');
      document.documentElement.setAttribute('data-skeleton-phase', 'streaming');
    },
    transitions: {
      'streaming:complete': 'ready',
      'timeout': 'error',
    },
    detect: () => {
      const store = useChatStore.getState();
      // 🔥 流式加载：有消息且正在加载 → 显示单消息气泡骨架屏
      return store && store.messages.length > 0 && store.isLoading === true;
    },
  },
  {
    phase: 'ready',
    exit: () => {
      console.log('[Skeleton] Exit ready phase');
      document.documentElement.removeAttribute('data-skeleton-phase');
    },
    transitions: {},
    detect: () => {
      const store = useChatStore.getState();
      // 🔥 FIX: ready 状态应该是默认状态
      // - 有消息且不在加载，或
      // - 没有消息但 store 已就绪（新对话）
      return store !== null && store !== undefined;
    },
  },
  {
    phase: 'error',
    enter: () => {
      console.error('[Skeleton] Timeout error');
      document.documentElement.setAttribute('data-skeleton-phase', 'error');
    },
    transitions: {},
    detect: () => false,
  },
];

/**
 * AIChat 骨架屏结构配置
 *
 * 使用 DSL 定义骨架屏的视觉结构
 */
export const AI_CHAT_SKELETON_DESIGN: SkeletonDesign = {
  container: {
    position: 'overlay',
    animation: 'fade',
    duration: 300,
  },
  structure: [
    {
      type: 'repeat',
      count: '3-5',
      content: {
        type: 'flex',
        direction: 'column',
        gap: 16,
        children: [
          {
            type: 'flex',
            direction: 'row',
            gap: 8,
            children: [
              {
                type: 'block',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
              },
              {
                type: 'flex',
                direction: 'column',
                gap: 4,
                children: [
                  {
                    type: 'block',
                    width: '60-80%',
                    height: '16px',
                    borderRadius: 4,
                  },
                  {
                    type: 'block',
                    width: '40-60%',
                    height: '16px',
                    borderRadius: 4,
                  },
                ],
              },
            ],
          },
          {
            type: 'block',
            width: '100%',
            height: '60-120px',
            borderRadius: 8,
            shimmer: true,
          },
        ],
      },
    },
  ],
};

/**
 * AIChat 状态检测器配置
 *
 * 定义状态检测规则
 */
export const AI_CHAT_DETECTORS: DetectorConfig[] = [
  {
    event: 'store:ready',
    source: '$chatStore',
    condition: (v) => v !== null && v !== undefined,
    debounce: 100,
  },
  {
    event: 'messages:loaded',
    source: '$chatStore.messages.length',
    condition: (v) => v > 0,
    debounce: 100,
  },
  {
    event: 'input:ready',
    source: '$inputReady',
    condition: (v) => v === true,
    debounce: 0,
  },
  {
    event: 'timeout',
    source: '$elapsed',
    condition: (v) => v > 5000,
    debounce: 0,
  },
];

/**
 * AIChat 完整骨架屏配置
 *
 * 骨架屏场景说明：
 * - initial/loading 阶段 → 全屏骨架屏（使用 DSLRenderer）
 * - streaming 阶段 → 单消息气泡骨架屏（在 VirtualMessageList 中使用 StreamingMessageSkeleton 组件）
 */
export const AI_CHAT_SKELETON_CONFIG = {
  stateMachine: AI_CHAT_STATE_MACHINE,
  structure: AI_CHAT_SKELETON_DESIGN, // 全屏骨架屏设计
  detectors: AI_CHAT_DETECTORS,
};
