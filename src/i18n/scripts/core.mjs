#!/usr/bin/env node

/**
 * i18n Scripts — Shared Core
 *
 * Single source of truth for shared utilities used by:
 *   - check-i18n-parity.mjs
 *   - scan-hardcoded-strings.mjs
 *   - i18n-coverage-report.mjs
 *
 * DRY principle: if a function appears in more than one script,
 * it belongs here.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

// ─── Constants ───────────────────────────────────────────

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const LOCALES_DIR = resolve(__dirname, '..', 'locales');
export const SRC_DIR = resolve(__dirname, '..', '..', '..');

/** Directories to skip during recursive file traversal */
export const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', '__tests__', '.git', 'coverage', 'scripts',
]);

// ─── Locale Utilities ────────────────────────────────────

/**
 * Recursively collect all leaf key paths from a nested object.
 * Returns a Set of dot-joined paths like "settings.general.title"
 */
export function collectKeys(obj, prefix = '') {
  const keys = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const subKey of collectKeys(value, path)) keys.add(subKey);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

/**
 * Recursively collect all leaf entries as { key, value } pairs.
 */
export function collectValues(obj, prefix = '') {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...collectValues(value, path));
    } else {
      entries.push({ key: path, value: String(value) });
    }
  }
  return entries;
}

/**
 * Load and parse a JSON locale file.
 */
export function loadLocale(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Get all .json locale files in the locales directory, sorted.
 */
export function getLocaleFiles() {
  return readdirSync(LOCALES_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .sort();
}

/**
 * Get all locale data as { name: object } map.
 * Exits with code 2 on parse failure.
 */
export function loadAllLocales() {
  const files = getLocaleFiles();
  if (files.length === 0) {
    console.error('[ERROR] No locale files found in', LOCALES_DIR);
    process.exit(2);
  }
  const locales = {};
  for (const file of files) {
    const name = file.replace('.json', '');
    try {
      locales[name] = loadLocale(resolve(LOCALES_DIR, file));
    } catch (e) {
      console.error(`[ERROR] Failed to parse ${file}: ${e.message}`);
      process.exit(2);
    }
  }
  return locales;
}

// ─── File Traversal ──────────────────────────────────────

/**
 * Recursively collect .ts/.tsx files from a directory.
 * Skips directories listed in SKIP_DIRS.
 */
export function getTsxFiles(dir) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        files.push(...getTsxFiles(fullPath));
      } else if (entry.isFile() && (extname(entry.name) === '.tsx' || extname(entry.name) === '.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return files;
}

// ─── CLI Argument Parsing ────────────────────────────────

/**
 * Parse common CLI flags from process.argv.
 *
 * Returns an object with:
 *   - json:    boolean (--json)
 *   - quiet:   boolean (--quiet)
 *   - base:    string | null (--base <branch>)
 *   - dir:     string | null (--dir <path>, resolved relative to SRC_DIR)
 *   - lang:    string (--lang zh|en|all, default 'all')
 *   - fix:     boolean (--fix)
 *   - markdown: boolean (--markdown)
 *   - positional: string[] (remaining non-flag args)
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const result = { positional: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--json':    result.json = true; break;
      case '--quiet':   result.quiet = true; break;
      case '--fix':     result.fix = true; break;
      case '--markdown': result.markdown = true; break;
      case '--base':
        result.base = argv[++i] ?? null;
        break;
      case '--dir':
        result.dir = argv[++i] ? resolve(SRC_DIR, argv[i]) : null;
        break;
      case '--lang':
        result.lang = argv[++i] ?? 'all';
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`[ERROR] Unknown flag: ${arg}`);
          process.exit(2);
        }
        result.positional.push(arg);
    }
    i++;
  }
  // Defaults
  result.json     ??= false;
  result.quiet    ??= false;
  result.fix      ??= false;
  result.markdown ??= false;
  result.lang     ??= 'all';
  return result;
}

// ─── Hardcoded String Detection ──────────────────────────

/** CJK Unified Ideographs character class */
export const CHINESE_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/**
 * Patterns that should NOT be flagged as hardcoded UI strings.
 * Used by both scan-hardcoded-strings.mjs and i18n-coverage-report.mjs.
 */
export const EXCLUSION_PATTERNS = [
  // i18n key references
  /['"`][\w.]+['"`]\s*\)/,           // t('some.key')
  /i18n\.t\(/,                         // i18n.t(
  /useTranslation/,                    // hook import
  // Import statements
  /import\s+.*from\s+['"].*i18n/,
  // Comments
  /\/\/.*[\u4e00-\u9fff]/,            // Chinese in // comments
  /\/\*[\s\S]*?\*\//,                 // Block comments
  // Console.log / debug
  /console\.(log|warn|error|debug|info)/,
  // Type definitions
  /type\s+\w+\s*=/,
  /interface\s+\w+/,
  // Test descriptions
  /describe\s*\(/,
  /it\s*\(/,
  /test\s*\(/,
  /expect\(/,
  // CSS class strings
  /className:\s*['"`]/,
  /class=\{/,
  // Data attributes
  /data-testid/,
  /data-/,
  // File paths and URLs
  /\.(tsx?|jsx?|json|css|md|yaml|yml)\b/,
  /https?:\/\//,
  // Error codes / constants
  /ERR_[A-Z_]+/,
  /'[^']*'[.,;]\s*$/,
  // Placeholders already in i18n
  /placeholder:\s*t\(/,
  /title:\s*t\(/,
  /label:\s*t\(/,
  // Template literal with t() call
  /\$\{t\(/,
  // Test assertions
  /\.toBe\(/,
  /\.toContain\(/,
  /\.toHaveTextContent\(/,
];

/**
 * Check if a line should be excluded from hardcoded string detection.
 */
export function isLineExcluded(line) {
  return EXCLUSION_PATTERNS.some(p => p.test(line));
}

/** Match string literals containing Chinese: '中文', "中文", `中文` */
export const CHINESE_STRING_REGEX = /(['"`])([^'"`\n]*[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff][^'"`\n]*)\1/g;

/** Match JSX text content with Chinese */
export const JSX_CHINESE_REGEX = />([^<>\n]*[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff][^<>\n]*)</g;

/**
 * Scan a single file for hardcoded strings.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {object}  opts
 * @param {string}  opts.lang - 'zh', 'en', 'all'
 * @param {number}  opts.maxIssues - Stop after this many (0 = unlimited)
 * @returns {{ issues: Array, hasI18n: boolean }}
 */
export function scanFile(filePath, { lang = 'all', maxIssues = 0 } = {}) {
  const issues = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const hasI18n = content.includes('useTranslation');

  for (let i = 0; i < lines.length; i++) {
    if (maxIssues > 0 && issues.length >= maxIssues) break;

    const line = lines[i];
    const lineNum = i + 1;
    if (isLineExcluded(line)) continue;

    if (lang === 'zh' || lang === 'all') {
      // String literals
      for (const match of line.matchAll(CHINESE_STRING_REGEX)) {
        const str = match[2];
        if (str.length < 2) continue;
        if (str.startsWith('//') || str.startsWith('*') || str.startsWith('TODO')) continue;
        issues.push({ line: lineNum, type: 'chinese-string', value: str, severity: hasI18n ? 'error' : 'warning' });
      }
      // JSX text
      for (const match of line.matchAll(JSX_CHINESE_REGEX)) {
        const text = match[1].trim();
        if (text.length < 2) continue;
        if (isLineExcluded(text)) continue;
        issues.push({ line: lineNum, type: 'chinese-jsx', value: text, severity: hasI18n ? 'error' : 'warning' });
      }
    }
  }

  return { issues, hasI18n };
}
