import React, { useRef, useEffect, useCallback } from 'react';
import Editor, { OnMount, OnChange, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { AppTheme, getMonacoBaseTheme, isDarkTheme } from '../../utils/theme';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Configure monaco-editor to use local files
import { loader } from '@monaco-editor/react';
loader.config({ monaco });

const getThemeToken = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const getThemeTokenChain = (names: string[], fallback: string): string => {
  for (const name of names) {
    const value = getThemeToken(name, '');
    if (value) {
      return value;
    }
  }

  return fallback;
};

const toMonacoForeground = (value: string): string => value.trim().replace(/^#/, '');

const createHandlebarsTheme = (theme: AppTheme): monaco.editor.IStandaloneThemeData => {
  const background = getThemeTokenChain(['--code-bg', '--bg-secondary', '--bg-primary'], 'transparent');
  const foreground = getThemeTokenChain(['--text-primary', '--text-secondary'], 'currentColor');
  const muted = getThemeTokenChain(['--text-subtle', '--text-muted', '--text-secondary'], foreground);
  const accent = getThemeTokenChain(['--accent-color', '--info-color'], foreground);
  const info = getThemeTokenChain(['--info-color', '--accent-color'], accent);
  const success = getThemeTokenChain(['--success-color', '--accent-color'], accent);
  const warning = getThemeTokenChain(['--warning-color', '--accent-color'], accent);
  const border = getThemeTokenChain(['--border-color', '--border-strong'], muted);
  const selection = getThemeTokenChain(['--selected-bg', '--accent-soft-bg', '--hover-bg'], 'transparent');
  const lineHighlight = getThemeTokenChain(['--hover-soft', '--selected-bg', '--accent-soft-bg'], selection);

  return {
    base: getMonacoBaseTheme(theme),
    inherit: true,
    rules: [
      { token: 'delimiter.handlebars', foreground: toMonacoForeground(accent) },
      { token: 'tag.helper', foreground: toMonacoForeground(info), fontStyle: 'bold' },
      { token: 'variable', foreground: toMonacoForeground(foreground) },
      { token: 'comment.handlebars', foreground: toMonacoForeground(success), fontStyle: 'italic' },
      { token: 'property.yaml', foreground: toMonacoForeground(accent) },
      { token: 'delimiter.yaml', foreground: toMonacoForeground(muted) },
      { token: 'string.link', foreground: toMonacoForeground(accent), fontStyle: 'underline' },
      { token: 'string.strong', foreground: toMonacoForeground(warning), fontStyle: 'bold' },
      { token: 'string.emphasis', foreground: toMonacoForeground(info), fontStyle: 'italic' },
      { token: 'keyword', foreground: toMonacoForeground(accent), fontStyle: 'bold' },
      { token: 'string', foreground: toMonacoForeground(foreground) },
    ],
    colors: {
      'editor.background': background,
      'editor.foreground': foreground,
      'editorGutter.background': background,
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': foreground,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': selection,
      'editor.inactiveSelectionBackground': selection,
      'editor.lineHighlightBackground': lineHighlight,
      'editor.lineHighlightBorder': border,
    },
  };
};

interface PromptMonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  variables?: string[];
  height?: string | number;
}

/**
 * PromptMonacoEditor - 专用于提示词编辑的 Monaco Editor 组件
 *
 * 功能：
 * - Markdown + Handlebars 语法高亮
 * - 变量自动补全（{{variable}}）
 * - Helper 函数补全（{{eq}}, {{if}}, {{each}} 等）
 * - 实时错误检查
 */
export const PromptMonacoEditor: React.FC<PromptMonacoEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  variables = [],
  height = '100%',
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionProviderRef = useRef<monaco.IDisposable | null>(null);
  const layoutTimeoutsRef = useRef<number[]>([]);
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  const monacoThemeName = dark ? 'handlebars-theme-dark' : 'handlebars-theme-light';

  const applyHandlebarsTheme = useCallback((monacoInstance: Monaco) => {
    monacoInstance.editor.defineTheme(monacoThemeName, createHandlebarsTheme(theme));
  }, [monacoThemeName, theme]);

  const scheduleEditorLayout = useCallback(() => {
    const relayout = () => {
      const editor = editorRef.current;
      const container = containerRef.current;
      if (!editor || !container) {
        return;
      }

      const width = container.clientWidth;
      const heightValue = container.clientHeight;
      if (width <= 0 || heightValue <= 0) {
        return;
      }

      monaco.editor.remeasureFonts();
      editor.layout({ width, height: heightValue });
      editor.render(true);
    };

    layoutTimeoutsRef.current.forEach(window.clearTimeout);
    layoutTimeoutsRef.current = [];

    window.requestAnimationFrame(relayout);
    layoutTimeoutsRef.current.push(window.setTimeout(relayout, 80));
    layoutTimeoutsRef.current.push(window.setTimeout(relayout, 220));
  }, []);

  /**
   * 设置 Handlebars 语言配置
   */
  const setupHandlebarsLanguage = useCallback((monaco: Monaco) => {
    // 注册 Handlebars 语言
    monaco.languages.register({
      id: 'handlebars',
      extensions: ['.md', '.handlebars', '.hbs'],
      aliases: ['Handlebars', 'handlebars', 'Markdown'],
      mimetypes: ['text/html.handlebars', 'text/markdown'],
    });

    // 设置语言配置（支持 {{ }} 语法）
    monaco.languages.setLanguageConfiguration('handlebars', {
      brackets: [
        ['{{', '}}'],
        ['{{{', '}}}'],
        ['{%', '%}'],
      ],
      autoClosingPairs: [
        { open: '{{', close: '}}' },
        { open: '[[', close: ']]' },
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    });

    // 基于 Markdown 进行语法高亮
    monaco.languages.setMonarchTokensProvider('handlebars', {
      tokenizer: {
        root: [
          // Handlebars 变量: {{variable}}
          [/{{{\{?/, 'delimiter.handlebars'],
          [/}}}?/, 'delimiter.handlebars'],

          // Handlebars 注释: {{!-- --}}
          [/{{!--[\s\S]*?--}}/, 'comment.handlebars'],

          // Handlebars helper: {{#if}}, {{each}}, etc.
          [/(#[a-zA-Z_]\w*)/, 'tag.helper'],

          // 变量名
          [/([a-zA-Z_]\w*)/, 'variable'],

          // Markdown 标题
          [/^(\s{0,3})(#{1,6}\s.*)$/, ['whitespace', 'keyword']],

          // Markdown 代码块
          [/```.*$/, 'string', '@codeBlock'],

          // Markdown 链接
          [/\[.*?\]\(.*?\)/, 'string.link'],

          // Markdown 粗体/斜体
          [/\*\*\*.*?\*\*\*/, 'string.strong'],
          [/\*\*.*?\*\*/, 'string.strong'],
          [/\*.*?\*/, 'string.emphasis'],

          // YAML Front Matter
          [/^---$/, 'delimiter.yaml'],
          [/^\w+:\s.*$/, 'property.yaml'],
        ],
        codeBlock: [
          [/```/, 'string', '@pop'],
          [/.*$/, 'string'],
        ],
      },
    });

  }, []);

  /**
   * 设置自动补全提供器
   */
  const setupCompletionProvider = useCallback((monaco: Monaco, variables: string[]) => {
    completionProviderRef.current?.dispose();

    // Helper 函数列表
    const helpers = [
      { label: '{{#if}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.if') },
      { label: '{{#unless}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.unless') },
      { label: '{{#each}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.each') },
      { label: '{{#with}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.with') },
      { label: '{{eq}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.eq') },
      { label: '{{ne}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.ne') },
      { label: '{{gt}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.gt') },
      { label: '{{lt}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.lt') },
      { label: '{{and}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.and') },
      { label: '{{or}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.or') },
      { label: '{{not}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.not') },
      { label: '{{concat}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.concat') },
      { label: '{{lookup}}', kind: monaco.languages.CompletionItemKind.Function, documentation: t('promptManager.monaco.helpers.lookup') },
    ];

    completionProviderRef.current = monaco.languages.registerCompletionItemProvider('handlebars', {
      triggerCharacters: ['{', ' ', '@'],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // 检查是否在 {{ }} 中
        const lineContent = model.getLineContent(position.lineNumber);
        const beforeCursor = lineContent.substring(0, position.column - 1);

        // 变量补全
        const variableSuggestions = variables.map(v => ({
          label: v,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: `{{${v}}}`,
          detail: t('promptManager.monaco.variableDetail'),
          documentation: t('promptManager.monaco.variableDocumentation', { variable: v }),
          range,
        }));

        // Helper 函数补全
        const helperSuggestions = helpers.map(h => ({
          ...h,
          insertText: h.label.startsWith('{{') ? h.label : `{{${h.label}}}`,
          range,
        }));

        // 合并建议
        const suggestions = [...variableSuggestions, ...helperSuggestions];

        return { suggestions };
      },
    });
  }, [t]);

  /**
   * 编辑器挂载后的初始化
   */
  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 设置 Handlebars 语言
    setupHandlebarsLanguage(monaco);

    // 设置自动补全
    setupCompletionProvider(monaco, variables);

    // 应用主题
    applyHandlebarsTheme(monaco);
    monaco.editor.setTheme(monacoThemeName);

    // 设置编辑器选项
    editor.updateOptions({
      fontSize: 14,
      lineHeight: 24,
      fontFamily: "'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      renderWhitespace: 'selection',
      suggest: {
        showKeywords: false,
        showSnippets: false,
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
    });
  }, [variables, setupHandlebarsLanguage, setupCompletionProvider, monacoThemeName, applyHandlebarsTheme]);

  /**
   * 处理内容变化
   */
  const handleEditorChange: OnChange = useCallback((newValue) => {
    if (newValue !== undefined) {
      onChange(newValue);
    }
  }, [onChange]);

  /**
   * 当 variables 变化时，重新设置自动补全
   */
  useEffect(() => {
    if (monacoRef.current) {
      setupCompletionProvider(monacoRef.current, variables);
    }
  }, [variables, setupCompletionProvider]);

  useEffect(() => {
    return () => {
      completionProviderRef.current?.dispose();
      layoutTimeoutsRef.current.forEach(window.clearTimeout);
      layoutTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (monacoRef.current) {
      applyHandlebarsTheme(monacoRef.current);
      monacoRef.current.editor.setTheme(monacoThemeName);
    }
  }, [monacoThemeName, applyHandlebarsTheme]);

  useEffect(() => {
    const container = containerRef.current;
    const handleWindowResize = () => {
      scheduleEditorLayout();
    };

    const resizeObserver = container
      ? new ResizeObserver(() => {
          scheduleEditorLayout();
        })
      : null;

    if (container && resizeObserver) {
      resizeObserver.observe(container);
    }

    let unlistenResize: (() => void) | undefined;
    void getCurrentWindow().onResized(() => {
      scheduleEditorLayout();
    }).then((cleanup) => {
      unlistenResize = cleanup;
    }).catch((error) => {
      console.warn('[PromptMonacoEditor] Failed to subscribe window resize:', error);
    });

    window.addEventListener('resize', handleWindowResize);
    scheduleEditorLayout();

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver?.disconnect();
      unlistenResize?.();
      layoutTimeoutsRef.current.forEach(window.clearTimeout);
      layoutTimeoutsRef.current = [];
    };
  }, [scheduleEditorLayout]);

  useEffect(() => {
    scheduleEditorLayout();
  }, [scheduleEditorLayout, theme, height]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <Editor
        height={height}
        language="handlebars"
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={monacoThemeName}
        options={{
          readOnly,
          domReadOnly: readOnly,
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
        }}
        loading={
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-soft-border)] border-t-[var(--accent-color)]"></div>
            <span className="theme-text-subtle ml-3 text-sm">{t('promptManager.monaco.loading')}</span>
          </div>
        }
      />
    </div>
  );
};
