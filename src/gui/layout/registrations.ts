import { layoutRegistry } from './layout-registry';
import { componentRegistry } from '../registry/component-registry';
import { TaskProgressPanel } from './TaskProgressPanel';
import { ConversationDetailPanel } from './ConversationDetailPanel';
import type { LayoutDescriptor } from './types';

/**
 * 注册所有布局和面板组件
 * 这个函数可以在测试中调用，也可以在应用启动时调用
 */
export function registerLayouts() {
  // 注册面板组件
  componentRegistry.register('conversation-task', TaskProgressPanel);
  componentRegistry.register('conversation-detail', ConversationDetailPanel);

  // 注册布局描述符

  // conversation 布局：三栏（左中右）
  layoutRegistry.register('conversation', {
    mode: 'conversation',
    panes: [
      { id: 'left', width: 320, flex: 0 },
      { id: 'center', width: 'auto', flex: 1 },
      { id: 'right', width: 400, flex: 0 },
    ],
  } as unknown as LayoutDescriptor);

  // editor 布局：单栏全屏
  layoutRegistry.register('editor', {
    mode: 'editor',
    panes: [
      { id: 'main', width: '100%', flex: 1 },
    ],
  } as unknown as LayoutDescriptor);

  // split 布局：两栏（左编辑器，右AI聊天）
  layoutRegistry.register('split', {
    mode: 'split',
    panes: [
      { id: 'editor', width: '50%', flex: 1 },
      { id: 'aichat', width: '50%', flex: 1 },
    ],
  } as unknown as LayoutDescriptor);

  console.log('✅ Layout registrations complete');
  console.log('📋 Registered layouts:', layoutRegistry.entries().map(([id]) => id));
  console.log('🧩 Registered components:', componentRegistry.entries().map(([id]) => id));
}

// 自动执行注册（在生产环境中）
if (typeof window !== 'undefined') {
  registerLayouts();
}
