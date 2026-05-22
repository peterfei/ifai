import type { GuiLayoutMode } from '../../stores/layoutStore';

/** 单个面板的描述符 */
export interface PaneDescriptor {
  id: string;
  width?: number;
  flex?: number;
}

/** 一种布局模式的完整描述 */
export interface LayoutDescriptor {
  mode: GuiLayoutMode;
  panes: PaneDescriptor[];
}
