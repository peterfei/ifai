/**
 * 统一的语言检测工具
 * 用于根据文件扩展名检测 Monaco Editor 支持的编程语言
 * v0.2.6 新增：扩展支持更多编程语言
 */

/**
 * 文件扩展名到 Monaco Editor 语言 ID 的映射
 * 完整支持列表：https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
 */
const FILE_EXT_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  'js': 'javascript',
  'jsx': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'mjs': 'javascript',
  'cjs': 'javascript',
  'mtsx': 'typescript',
  'ctsx': 'typescript',

  // Web Technologies
  'html': 'html',
  'htm': 'html',
  'xhtml': 'html',
  'css': 'css',
  'scss': 'scss',
  'sass': 'sass',
  'less': 'less',
  'styl': 'stylus',

  // Data Formats
  'json': 'json',
  'jsonc': 'json',
  'xml': 'xml',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'ini': 'ini',
  'properties': 'properties',
  'csv': 'csv',

  // Markdown & Documentation
  'md': 'markdown',
  'markdown': 'markdown',
  'mdx': 'markdown',

  // Shell & Scripts
  'sh': 'shell',
  'bash': 'shell',
  'zsh': 'shell',
  'fish': 'shell',
  'ps1': 'powershell',
  'psm1': 'powershell',
  'bat': 'bat',
  'cmd': 'bat',

  // System Languages
  'c': 'c',
  'h': 'c',
  'cpp': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  'hpp': 'cpp',
  'hh': 'cpp',
  'hxx': 'cpp',
  'cs': 'csharp',
  'fs': 'fsharp',
  'vb': 'vb',

  // Rust
  'rs': 'rust',

  // Go
  'go': 'go',

  // Python
  'py': 'python',
  'pyi': 'python',
  'pyw': 'python',
  'pyx': 'cython',

  // Java & JVM
  'java': 'java',
  'kt': 'kotlin',
  'kts': 'kotlin',
  'scala': 'scala',
  'groovy': 'groovy',
  'clj': 'clojure',
  'cljs': 'clojure',
  'cljc': 'clojure',

  // Ruby
  'rb': 'ruby',
  'gemspec': 'ruby',
  'rake': 'ruby',

  // PHP
  'php': 'php',
  'phtml': 'php',

  // Swift & Objective-C
  'swift': 'swift',
  'm': 'objective-c',
  'mm': 'objective-c',
  // Note: .h files are treated as C headers by default (see 'h': 'c' above)

  // Dart & Flutter
  'dart': 'dart',

  // Lua
  'lua': 'lua',

  // Perl
  'pl': 'perl',
  'pm': 'perl',
  't': 'perl',

  // R
  'r': 'r',
  'rmd': 'r',

  // SQL & Databases
  'sql': 'sql',
  'pgsql': 'pgsql',
  'plsql': 'plsql',

  // Configuration Files
  'dockerfile': 'dockerfile',
  'dockerignore': 'ignore',
  'gitignore': 'ignore',
  'hgignore': 'ignore',
  'cvsignore': 'ignore',
  'eslintignore': 'ignore',
  'prettierignore': 'ignore',
  'env': 'properties',
  'env.local': 'properties',
  'env.development': 'properties',
  'env.production': 'properties',
  'env.test': 'properties',
  'package.json': 'json',
  'package-lock.json': 'json',
  'yarn.lock': 'yaml',
  'composer.json': 'json',
  'composer.lock': 'json',

  // GraphQL
  'graphql': 'graphql',
  'gql': 'graphql',

  // Protobuf & Thrift
  'proto': 'proto',
  'thrift': 'thrift',

  // WebAssembly
  'wat': 'wat',
  'wasm': 'wasm',

  // Assembly
  'asm': 'asm',
  's': 'asm',
  'nasm': 'asm',

  // Terraform & HCL
  'tf': 'terraform',
  'tfvars': 'terraform',
  'hcl': 'hcl',

  // Vue & Svelte
  'vue': 'vue',
  'svelte': 'svelte',

  // JSX/TSX variants
  'astro': 'astro',

  // Config files
  'eslintrc': 'json',
  'eslintrc.js': 'javascript',
  'eslintrc.cjs': 'javascript',
  'eslintrc.yaml': 'yaml',
  'eslintrc.yml': 'yaml',
  'eslintrc.json': 'json',
  'prettierrc': 'json',
  'prettierrc.js': 'javascript',
  'prettierrc.cjs': 'javascript',
  'prettierrc.yaml': 'yaml',
  'prettierrc.yml': 'yaml',
  'prettierrc.json': 'json',
  'babelrc': 'json',
  'babelrc.js': 'javascript',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
};

/**
 * 特殊文件名到语言 ID 的映射（如 Dockerfile, Makefile 等）
 */
const SPECIAL_FILE_NAMES: Record<string, string> = {
  'dockerfile': 'dockerfile',
  'dockerfile.prod': 'dockerfile',
  'dockerfile.dev': 'dockerfile',
  'dockerfile.production': 'dockerfile',
  'dockerfile.development': 'dockerfile',
  'makefile': 'makefile',
  'cmakelists.txt': 'cmake',
  'rakefile': 'ruby',
  'gemfile': 'ruby',
  'vagrantfile': 'ruby',
  'procfile': 'properties',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.env': 'properties',
  '.env.example': 'properties',
  '.env.local': 'properties',
  '.env.development': 'properties',
  '.env.production': 'properties',
  '.env.test': 'properties',
  'package.json': 'json',
  'package-lock.json': 'json',
  'yarn.lock': 'yaml',
  'composer.json': 'json',
  'composer.lock': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
  '.eslintrc': 'json',
  '.eslintrc.json': 'json',
  '.eslintrc.yaml': 'yaml',
  '.eslintrc.yml': 'yaml',
  '.eslintrc.js': 'javascript',
  '.prettierrc': 'json',
  '.prettierrc.json': 'json',
  '.prettierrc.yaml': 'yaml',
  '.prettierrc.yml': 'yaml',
  '.prettierrc.js': 'javascript',
  '.babelrc': 'json',
  '.babelrc.js': 'javascript',
};

/**
 * 根据文件路径检测语言
 * @param filePath - 文件路径
 * @returns Monaco Editor 语言 ID
 */
export function detectLanguageFromPath(filePath: string): string {
  if (!filePath) return 'plaintext';

  // 获取文件名（不含路径）
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  const baseName = fileName.split('.')[0];

  // 检查特殊文件名
  if (SPECIAL_FILE_NAMES[fileName] || SPECIAL_FILE_NAMES[baseName]) {
    return SPECIAL_FILE_NAMES[fileName] || SPECIAL_FILE_NAMES[baseName] || 'plaintext';
  }

  // 获取文件扩展名
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return 'plaintext';

  // 查找扩展名对应语言
  return FILE_EXT_TO_LANGUAGE[ext] || 'plaintext';
}

/**
 * 获取语言的显示名称（用于 UI 展示）
 * @param languageId - Monaco Editor 语言 ID
 * @returns 语言的显示名称
 */
export function getLanguageDisplayName(languageId: string): string {
  const displayNames: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'less': 'Less',
    'json': 'JSON',
    'xml': 'XML',
    'yaml': 'YAML',
    'markdown': 'Markdown',
    'python': 'Python',
    'rust': 'Rust',
    'go': 'Go',
    'java': 'Java',
    'c': 'C',
    'cpp': 'C++',
    'csharp': 'C#',
    'fsharp': 'F#',
    'php': 'PHP',
    'ruby': 'Ruby',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'scala': 'Scala',
    'dart': 'Dart',
    'shell': 'Shell',
    'powershell': 'PowerShell',
    'bat': 'Batch',
    'sql': 'SQL',
    'graphql': 'GraphQL',
    'dockerfile': 'Dockerfile',
    'vue': 'Vue',
    'svelte': 'Svelte',
    'terraform': 'Terraform',
    'lua': 'Lua',
    'r': 'R',
    'plaintext': 'Plain Text',
  };

  return displayNames[languageId] || languageId;
}

/**
 * 检查语言是否支持语法高亮
 * @param languageId - Monaco Editor 语言 ID
 * @returns 是否支持语法高亮
 */
export function isLanguageSupported(languageId: string): boolean {
  // Monaco Editor 默认支持大部分语言
  // 这里只列出明确不支持的或有特殊处理的
  const unsupportedLanguages = new Set([
    'plaintext', // plaintext 也有基础高亮
  ]);

  return !unsupportedLanguages.has(languageId) && languageId !== 'plaintext';
}

/**
 * 导出扩展名映射供外部使用
 */
export { FILE_EXT_TO_LANGUAGE, SPECIAL_FILE_NAMES };
