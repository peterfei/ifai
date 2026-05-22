import { layoutRegistry } from './layout-registry';
import { componentRegistry } from '../registry/component-registry';
import { ConversationPanel } from './ConversationPanel';
import { EditorPanel } from './EditorPanel';

/** 注册三种布局描述符和面板组件 */
export function registerLayouts() {
  // 布局描述符注册
  layoutRegistry.register('conversation', {
    mode: 'conversation',
    panes: [{ id: 'conversation', flex: 1 }],
  });

  layoutRegistry.register('editor', {
    mode: 'editor',
    panes: [{ id: 'editor', flex: 1 }],
  });

  layoutRegistry.register('split', {
    mode: 'split',
    panes: [
      { id: 'conversation', flex: 1 },
      { id: 'editor', flex: 1 },
    ],
  });

  // 面板组件注册
  componentRegistry.register('conversation', ConversationPanel);
  componentRegistry.register('editor', EditorPanel);
}
