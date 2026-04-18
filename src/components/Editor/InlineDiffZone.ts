import * as monaco from 'monaco-editor';
import i18n from '../../i18n/config';

/**
 * 实现 Monaco 原生 ZoneWidget 的包装
 * 备注：在 Monaco 中，ZoneWidget 需要手动管理其容器 DOM 的渲染
 */
export class InlineDiffZone {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private domNode: HTMLElement | null = null;
  private viewZoneId: string | null = null;
  private currentLineNumber: number = -1;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
  }

  public show(lineNumber: number, heightInLines: number, content: string) {
    // 🔥 优化：如果已经在当前行，执行原地更新
    if (this.viewZoneId !== null && this.currentLineNumber === lineNumber && this.domNode) {
      const pre = this.domNode.querySelector('pre');
      if (pre) {
        pre.innerText = content;
        // 动态更新高度
        this.editor.changeViewZones((changeAccessor) => {
          changeAccessor.layoutZone(this.viewZoneId!);
        });
        return;
      }
    }

    this.hide();
    this.currentLineNumber = lineNumber;
    const rootStyles = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      rootStyles.getPropertyValue(name).trim() || fallback;
    const dark = document.documentElement.dataset.theme !== 'light';

    const domNode = document.createElement('div');
    domNode.className = 'monaco-inline-diff-zone';
    domNode.style.backgroundColor = token('--bg-elevated', dark ? '#21262d' : '#ffffff');
    if (CSS.supports('backdrop-filter', 'blur(12px)')) {
        domNode.style.backdropFilter = 'blur(10px)';
    }
    domNode.style.borderLeft = `3px solid ${token('--accent-color', '#4b89ff')}`;
    domNode.style.borderTop = `1px solid ${token('--accent-soft-border', 'rgba(75, 137, 255, 0.28)')}`;
    domNode.style.borderBottom = `1px solid ${token('--accent-soft-border', 'rgba(75, 137, 255, 0.28)')}`;
    domNode.style.width = '100%';
    domNode.style.display = 'flex';
    domNode.style.flexDirection = 'column';
    domNode.style.boxShadow = dark
      ? '0 18px 44px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.04)'
      : '0 16px 34px rgba(56, 68, 84, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.78)';
    domNode.style.zIndex = '100';
    domNode.style.overflow = 'hidden';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '8px 16px';
    header.style.backgroundColor = token('--accent-soft-bg', 'rgba(75, 137, 255, 0.15)');
    header.style.borderBottom = `1px solid ${token('--accent-soft-border', 'rgba(75, 137, 255, 0.28)')}`;
    header.style.fontSize = '11px';
    header.style.color = token('--accent-color', '#4b89ff');
    header.style.fontWeight = '600';
    header.innerHTML = `
        <div style="display: flex; align-items: center;">
            <span style="margin-right: 8px; font-size: 14px;">✦</span>
            ${i18n.t('editor.inlineDiff.title')}
        </div>
        <div style="opacity: 0.72; font-size: 10px;">${i18n.t('editor.inlineDiff.hint')}</div>
    `;
    domNode.appendChild(header);

    const scrollContainer = document.createElement('div');
    scrollContainer.style.flex = '1';
    scrollContainer.style.overflowY = 'auto';
    scrollContainer.style.maxHeight = '100%';
    scrollContainer.style.pointerEvents = 'auto';

    // 🏆 PIVO 3.0: 物理级事件隔离
    // 拦截鼠标滚动，防止触发主编辑器滚动
    scrollContainer.addEventListener('wheel', (e) => {
        e.stopPropagation();
    }, { passive: false });

    // 拦截鼠标点击与拖拽，允许选择文本和操作滚动条
    scrollContainer.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    // 拦截点击事件
    scrollContainer.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    const styleId = 'monaco-diff-zone-scrollbar-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .monaco-inline-diff-zone ::-webkit-scrollbar { width: 8px; }
            .monaco-inline-diff-zone ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, rgba(116, 128, 145, 0.52)); border-radius: 4px; }
            .monaco-inline-diff-zone ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover, rgba(154, 166, 180, 0.78)); }
        `;
        document.head.appendChild(style);
    }

    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.padding = '20px 20px 60px 20px';
    pre.style.color = token('--text-secondary', dark ? '#c4ccd6' : '#405065');
    pre.style.fontSize = '12.5px';
    pre.style.fontFamily = 'var(--font-mono, var(--monaco-monospace-font, Menlo, Monaco, monospace))';
    pre.style.lineHeight = '1.6';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-all';
    pre.style.opacity = '0.92';
    pre.innerText = content;

    scrollContainer.appendChild(pre);
    domNode.appendChild(scrollContainer);

    this.domNode = domNode;

    this.editor.changeViewZones((changeAccessor) => {
      this.viewZoneId = changeAccessor.addZone({
        afterLineNumber: lineNumber,
        heightInLines: heightInLines,
        domNode: this.domNode!
      });
    });
  }

  public hide() {
    if (this.viewZoneId !== null) {
      this.editor.changeViewZones((changeAccessor) => {
        changeAccessor.removeZone(this.viewZoneId!);
      });
      this.viewZoneId = null;
    }
    this.domNode = null;
    this.currentLineNumber = -1;
  }
}
