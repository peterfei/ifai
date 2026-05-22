/**
 * ProgressCard 测试入口
 *
 * 在 AIChat 中添加测试命令，用户可以输入 /test-progress 查看 ProgressCard 效果
 */

import { useEffect } from 'react';
import { useChatStore } from '../../../stores/useChatStore';
import type { Message } from '../../../../types/ifainew-core';
import { MOCK_TASK_DATA } from '../WORKFLOW_DSL';

/**
 * useTestProgressCard — Hook 用于在 AIChat 中添加测试命令
 *
 * 使用方法：
 * 1. 在 AIChat 组件中调用此 Hook
 * 2. 在输入框中输入 "/test-progress"
 * 3. 即可看到 ProgressCard 渲染效果
 */
export function useTestProgressCard() {
  const addMessage = useChatStore((state) => state.addMessage);

  useEffect(() => {
    // 监听键盘快捷键：Ctrl+Shift+P 添加测试消息
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();

        // 创建测试消息
        const testMessage: Message = {
          id: `test-progress-${Date.now()}`,
          role: 'assistant',
          content: '',  // ProgressCard 不需要文本内容
          // 添加 ProgressCard 所需的数据
          cardType: 'progress',
          data: {
            title: MOCK_TASK_DATA.title,
            agentId: MOCK_TASK_DATA.activeAgent,
            progress: MOCK_TASK_DATA.progress,
          },
        } as any;

        addMessage(testMessage);
        console.log('[ProgressCard] 测试消息已添加，快捷键: Ctrl+Shift+P');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // 首次加载时提示用户
    console.log('[ProgressCard] 测试快捷键: Ctrl+Shift+P（添加测试进度卡片）');

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [addMessage]);
}

/**
 * 手动添加测试消息的函数（可在控制台调用）
 *
 * 使用方法：
 * 1. 打开浏览器控制台
 * 2. 输入: window.testProgressCard()
 */
export function testProgressCard() {
  const addMessage = (window as any).useChatStore?.getState?.().addMessage;
  if (!addMessage) {
    console.error('[ProgressCard] 无法访问 chatStore');
    return;
  }

  const testMessage: Message = {
    id: `test-progress-${Date.now()}`,
    role: 'assistant',
    content: '',
    cardType: 'progress',
    data: {
      title: '探索项目代码库结构',
      agentId: 'explore',
      progress: {
        currentStep: 4,
        totalSteps: 8,
        percentage: 50,
      },
    },
  } as any;

  addMessage(testMessage);
  console.log('[ProgressCard] 测试消息已添加');
}

// 挂载到 window 对象，方便控制台调用
(window as any).testProgressCard = testProgressCard;
