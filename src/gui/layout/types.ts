import type { GuiLayoutMode } from '../../stores/layoutStore';
import type { ComponentType } from 'react';

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

/** PanelStack 面板配置 */
export interface PanelConfig {
  id: string;
  title: string;
  component: ComponentType<{ title?: string }>;
  defaultSize: number;     // px
  minSize?: number;        // px, default 40
  collapsible?: boolean;   // default true
}
