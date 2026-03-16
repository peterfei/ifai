import * as monaco from 'monaco-editor';

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

    const domNode = document.createElement('div');
    domNode.className = 'monaco-inline-diff-zone';
    // 🏆 PIVO 3.0: 物理幻影背景 - 毛玻璃 + 深度阴影
    domNode.style.backgroundColor = 'rgba(25, 25, 25, 0.85)';
    if (CSS.supports('backdrop-filter', 'blur(12px)')) {
        domNode.style.backdropFilter = 'blur(12px)';
    }
    domNode.style.borderLeft = '4px solid #3b82f6';
    domNode.style.borderTop = '1px solid rgba(59, 130, 246, 0.2)';
    domNode.style.borderBottom = '1px solid rgba(59, 130, 246, 0.2)';
    domNode.style.width = '100%';
    domNode.style.display = 'flex';
    domNode.style.flexDirection = 'column';
    domNode.style.boxShadow = '0 20px 50px rgba(0,0,0,0.6), inset 0 0 20px rgba(59, 130, 246, 0.05)';
    domNode.style.zIndex = '100';
    domNode.style.overflow = 'hidden';

    // 🏆 PIVO 3.0: 物理标题栏 - 增加操作提示
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '8px 16px';
    header.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
    header.style.borderBottom = '1px solid rgba(59, 130, 246, 0.1)';
    header.style.fontSize = '11px';
    header.style.color = '#60a5fa';
    header.style.fontWeight = '600';
    header.innerHTML = `
        <div style="display: flex; align-items: center;">
            <span style="margin-right: 8px; font-size: 14px;">✦</span> 
            AI 构思的代码建议 (物理预览)
        </div>
        <div style="opacity: 0.7; font-size: 10px;">ESC 退出 • CMD+K 应用</div>
    `;
    domNode.appendChild(header);

    // 🏆 PIVO 3.0: 独立滚动容器
    const scrollContainer = document.createElement('div');
    scrollContainer.style.flex = '1';
    scrollContainer.style.overflowY = 'auto';
    scrollContainer.style.maxHeight = '100%';
    scrollContainer.style.pointerEvents = 'auto'; // 显式允许交互

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

    // 自定义滚动条样式
    const styleId = 'monaco-diff-zone-scrollbar-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .monaco-inline-diff-zone ::-webkit-scrollbar { width: 8px; }
            .monaco-inline-diff-zone ::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.3); border-radius: 4px; }
            .monaco-inline-diff-zone ::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.5); }
        `;
        document.head.appendChild(style);
    }

    const pre = document.createElement('pre');
    pre.style.margin = '0';
    // 🏆 PIVO 3.0: 物理级底部留白 - 确保最后一行绝不被截断
    pre.style.padding = '20px 20px 60px 20px'; 
    pre.style.color = '#e2e8f0';
    pre.style.fontSize = '13px';
    pre.style.fontFamily = 'var(--monaco-monospace-font, Menlo, Monaco, monospace)';
    pre.style.lineHeight = '1.6';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-all';
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
