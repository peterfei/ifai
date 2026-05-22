/**
 * LayoutDSL — 布局声明类型
 *
 * 声明式布局规范，编译为 CSS Flex 布局样式
 */

/** 面板声明 */
export interface PanelDecl {
  id: string;
  width?: number;          // 固定宽度 px
  flex?: number;           // 弹性比例
  minWidth?: number;       // 最小宽度 px
  maxWidth?: number;       // 最大宽度 px
}

/** 布局声明 */
export interface LayoutDSL {
  mode: string;
  gap?: number;            // 面板间距 px, default 0
  panels: PanelDecl[];
}
