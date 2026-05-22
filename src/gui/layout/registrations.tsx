import { layoutRegistry } from './layout-registry';
import { componentRegistry } from '../registry/component-registry';
import { ConversationListPanel } from './ConversationListPanel';
import { ConversationPanel } from './ConversationPanel';
import { ConversationDetailPanel } from './ConversationDetailPanel';
import { EditorPanel } from './EditorPanel';
import { TaskProgressPanel } from './TaskProgressPanel';
import { MOCK_TASK_DATA } from '../conversation/WORKFLOW_DSL';

/**
 * DSL 声明式布局注册
 *
 * 数据驱动：LayoutEngine 读取描述符 → PaneShell 渲染面板 → componentRegistry 解析组件
 * 增删面板只需修改数据，零过程式代码
 */
export function registerLayouts() {
  // ── 对话模式：三栏布局 ──
  layoutRegistry.register('conversation', {
    mode: 'conversation',
    panes: [
      { id: 'conversation-list', width: 260 },  // 对话列表（左栏）
      { id: 'conversation', flex: 1 },
      { id: 'conversation-detail', width: 300 },
    ],
  });

  // ── 编辑器模式：全宽编辑器 ──
  layoutRegistry.register('editor', {
    mode: 'editor',
    panes: [{ id: 'editor', flex: 1 }],
  });

  // ── 分屏模式：对话 + 编辑器各占一半 ──
  layoutRegistry.register('split', {
    mode: 'split',
    panes: [
      { id: 'conversation', flex: 1 },
      { id: 'editor', flex: 1 },
    ],
  });

  // ── 面板组件注册 ──
  componentRegistry.register('conversation-list', ConversationListPanel);
  componentRegistry.register('conversation', ConversationPanel);
  componentRegistry.register('conversation-detail', ConversationDetailPanel);
  componentRegistry.register('editor', EditorPanel);

  // TaskProgressPanel 使用 Mock 数据（后续对接真实数据）
  componentRegistry.register('conversation-task', () => (
    <TaskProgressPanel taskData={MOCK_TASK_DATA} />
  ));
}
