/**
 * Mock for monaco-editor in tests
 *
 * Monaco Editor is a heavy dependency that doesn't work well in test environments.
 * This mock provides minimal interfaces to avoid import resolution errors.
 */

export const editor = {
  create: vi.fn(() => ({
    dispose: vi.fn(),
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    onDidChangeModelContent: vi.fn(),
    updateOptions: vi.fn(),
    getSelection: vi.fn(),
    setSelection: vi.fn(),
    focus: vi.fn(),
    layout: vi.fn(),
  })),
  defineTheme: vi.fn(),
  setTheme: vi.fn(),
};

export const languages = {
  register: vi.fn(),
  registerCompletionItemProvider: vi.fn(),
  registerHoverProvider: vi.fn(),
  registerDocumentFormattingEditProvider: vi.fn(),
  setLanguageConfiguration: vi.fn(),
};

export const MarkerSeverity = {
  Hint: 1,
  Info: 2,
  Warning: 4,
  Error: 8,
};

export const Uri = {
  file: (path: string) => ({ scheme: 'file', path }),
  parse: (uri: string) => ({ scheme: 'file', path: uri }),
};

export const Range = class Range {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;

  constructor(
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number
  ) {
    this.startLineNumber = startLineNumber;
    this.startColumn = startColumn;
    this.endLineNumber = endLineNumber;
    this.endColumn = endColumn;
  }
};

export const Position = class Position {
  lineNumber: number;
  column: number;

  constructor(lineNumber: number, column: number) {
    this.lineNumber = lineNumber;
    this.column = column;
  }
};

// Export all as named exports for compatibility
export * from 'monaco-editor';
