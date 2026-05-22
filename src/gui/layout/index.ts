import { registerLayouts } from './registrations';

// 立即注册所有布局和组件（模块导入时执行）
// 确保 LayoutEngine 渲染前 layoutRegistry 已就绪
registerLayouts();

export type { PaneDescriptor, LayoutDescriptor } from './types';
export { layoutRegistry } from './layout-registry';
export { PaneShell } from './PaneShell';
export { LayoutEngine } from './LayoutEngine';
export { registerLayouts } from './registrations';
export { ConversationListPanel } from './ConversationListPanel';
export { ConversationPanel } from './ConversationPanel';
export { ConversationDetailPanel } from './ConversationDetailPanel';
export { EditorPanel } from './EditorPanel';
export { TaskProgressPanel } from './TaskProgressPanel';
export { GuiLayoutSwitcher } from './GuiLayoutSwitcher';
