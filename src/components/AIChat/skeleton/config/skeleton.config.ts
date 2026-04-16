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
      console.log('[Skeleton] Enter loading phase');
      document.documentElement.setAttribute('data-skeleton-phase', 'loading');
    },
    transitions: {
      'messages:loaded': 'ready',
      'input:ready': 'ready',
      'timeout': 'error',
    },
    detect: () => {
      const store = useChatStore.getState();
      return store && store.messages.length === 0;
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
      return store && store.messages.length > 0;
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
 */
export const AI_CHAT_SKELETON_CONFIG = {
  stateMachine: AI_CHAT_STATE_MACHINE,
  structure: AI_CHAT_SKELETON_DESIGN,
  detectors: AI_CHAT_DETECTORS,
};
