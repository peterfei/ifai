/**
 * LayoutDSL 编译器 — 声明 → CSS Flex 布局
 *
 * 纯函数：输入 LayoutDSL 声明，输出 CSS 字符串
 */

import type { LayoutDSL, PanelDecl } from '../layout-dsl';

/**
 * 编译单个面板的 CSS 规则
 */
function compilePanelDecl(mode: string, index: number, panel: PanelDecl): string[] {
  const lines: string[] = [];
  const selector = `.layout-${mode} > [data-pane-index="${index}"]`;

  // CSS 变量
  const vars: string[] = [];
  const rules: string[] = [];

  if (panel.width !== undefined) {
    vars.push(`  --layout-${mode}-${index}-width: ${panel.width}px;`);
    rules.push(`  width: ${panel.width}px;`);
    rules.push('  flex-shrink: 0;');
  }

  if (panel.flex !== undefined) {
    vars.push(`  --layout-${mode}-${index}-flex: ${panel.flex};`);
    rules.push(`  flex: ${panel.flex};`);
  }

  if (panel.minWidth !== undefined) {
    rules.push(`  min-width: ${panel.minWidth}px;`);
  }

  if (panel.maxWidth !== undefined) {
    rules.push(`  max-width: ${panel.maxWidth}px;`);
  }

  if (rules.length === 0 && vars.length === 0) return [];

  lines.push(`${selector} {`);
  lines.push(...vars);
  lines.push(...rules);
  lines.push('}');

  return lines;
}

/**
 * 编译 LayoutDSL 为 CSS 字符串
 */
export function compileLayout(layout: LayoutDSL): string {
  if (layout.panels.length === 0) return '';

  const lines: string[] = [];
  const mode = layout.mode;
  const gap = layout.gap ?? 0;

  // 容器规则
  lines.push(`.layout-${mode} {`);
  lines.push('  display: flex;');
  lines.push(`  gap: ${gap}px;`);
  lines.push('}');

  // 每个面板的规则
  for (let i = 0; i < layout.panels.length; i++) {
    const panelLines = compilePanelDecl(mode, i, layout.panels[i]);
    if (panelLines.length > 0) {
      lines.push('');
      lines.push(...panelLines);
    }
  }

  return lines.join('\n');
}
