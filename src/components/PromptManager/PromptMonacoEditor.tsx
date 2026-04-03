import React, { useRef, useEffect, useCallback } from 'react';
import Editor, { OnMount, OnChange, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Configure monaco-editor to use local files
import { loader } from '@monaco-editor/react';
loader.config({ monaco });

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
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

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

    // 设置主题（支持 Handlebars 高亮）
    monaco.editor.defineTheme('handlebars-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'delimiter.handlebars', foreground: '4EC9B0' },
        { token: 'tag.helper', foreground: '569CD6', fontStyle: 'bold' },
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'comment.handlebar', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'property.yaml', foreground: '9CDCFE' },
        { token: 'delimiter.yaml', foreground: '808080' },
        { token: 'string.link', foreground: '9CDCFE', fontStyle: 'underline' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
      },
    });
  }, []);

  /**
   * 设置自动补全提供器
   */
  const setupCompletionProvider = useCallback((monaco: Monaco, variables: string[]) => {
    // Helper 函数列表
    const helpers = [
      { label: '{{#if}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '条件判断' },
      { label: '{{#unless}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '条件否定' },
      { label: '{{#each}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '循环遍历' },
      { label: '{{#with}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '上下文切换' },
      { label: '{{eq}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '等于比较' },
      { label: '{{ne}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '不等于比较' },
      { label: '{{gt}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '大于比较' },
      { label: '{{lt}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '小于比较' },
      { label: '{{and}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '逻辑与' },
      { label: '{{or}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '逻辑或' },
      { label: '{{not}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '逻辑非' },
      { label: '{{concat}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '字符串连接' },
      { label: '{{lookup}}', kind: monaco.languages.CompletionItemKind.Function, documentation: '查找属性' },
    ];

    monaco.languages.registerCompletionItemProvider('handlebars', {
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
          detail: '变量',
          documentation: `提示词变量: ${v}`,
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
  }, []);

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
    monaco.editor.setTheme('handlebars-theme');

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

    console.log('[PromptMonacoEditor] Editor mounted and configured');
  }, [variables, setupHandlebarsLanguage, setupCompletionProvider]);

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

  return (
    <div className="h-full w-full">
      <Editor
        height={height}
        language="handlebars"
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme="handlebars-theme"
        options={{
          readOnly,
          domReadOnly: readOnly,
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
        }}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">加载编辑器...</span>
          </div>
        }
      />
    </div>
  );
};
