/**
 * ProgressCard 测试工具
 *
 * 使用方法：
 * 1. 启动应用: npm run tauri:dev
 * 2. 打开浏览器控制台
 * 3. 复制粘贴下面的代码到控制台
 */

import type { Message } from '../../../types/ifainew-core';
import { MOCK_TASK_DATA } from '../WORKFLOW_DSL';

/**
 * 在控制台中执行此函数，添加测试进度卡片到聊天
 */
function addTestProgressCard() {
  // 获取 chatStore（从 window 对象）
  const stores = (window as any).__STORES__;
  if (!stores) {
    console.error('❌ 找不到 stores。请确保应用已启动。');
    return;
  }

  const chatStore = Object.values(stores).find((s: any) => s?.addMessage);
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }

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

  // 添加消息
  chatStore.addMessage(testMessage);
  console.log('✅ ProgressCard 测试消息已添加！');
  console.log('📊 测试数据:', testMessage.data);
}

// 执行测试
addTestProgressCard();

// 导出函数，方便用户手动调用
(window as any).addTestProgressCard = addTestProgressCard;

console.log('=================================');
console.log('📋 ProgressCard 测试工具');
console.log('=================================');
console.log('✅ 测试消息已添加到聊天！');
console.log('');
console.log('💡 提示：');
console.log('  - 再次添加测试卡片，请在控制台输入：');
console.log('    addTestProgressCard()');
console.log('=================================');
