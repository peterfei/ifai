#!/usr/bin/env node

/**
 * i18n Hardcoded String Scanner
 *
 * Scans component files for hardcoded Chinese/English strings that should
 * be internationalized via useTranslation(). Reports violations with
 * file path, line number, and the offending string.
 *
 * Usage:
 *   node src/i18n/scripts/scan-hardcoded-strings.mjs                    # Scan all .tsx files
 *   node src/i18n/scripts/scan-hardcoded-strings.mjs --lang zh          # Only scan Chinese strings
 *   node src/i18n/scripts/scan-hardcoded-strings.mjs --dir src/components/AIChat
 *   node src/i18n/scripts/scan-hardcoded-strings.mjs --json             # JSON output
 *   node src/i18n/scripts/scan-hardcoded-strings.mjs --fix              # Auto-generate i18n key stubs
 *
 * Exit codes:
 *   0 - No hardcoded strings found (or within threshold)
 *   1 - Hardcoded strings detected
 *   2 - Usage error
 */

import { writeFileSync } from 'fs';
import { resolve, relative } from 'path';
import { getTsxFiles, scanFile, parseArgs, SRC_DIR } from './core.mjs';

// ─── CLI ─────────────────────────────────────────────────
const args = parseArgs();
const { json: jsonOutput, fix: fixMode, lang: targetLang, dir: targetDir } = args;
const scanDir = targetDir ?? resolve(SRC_DIR, 'src', 'components');
const maxIssues = 200;

// ─── Fix Mode: Generate i18n Key Stubs ──────────────────

function generateFixStub(errors) {
  const stubs = {};
  for (const issue of errors) {
    if (issue.severity !== 'error') continue;

    const parts = issue.file.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '').split('/');
    const namespace = parts.slice(0, -1).join('.');
    const component = parts[parts.length - 1];
    const valuePreview = issue.value.slice(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
    const key = `${namespace}.${component}.hardcoded_${valuePreview}`;

    if (!stubs[key]) {
      stubs[key] = {
        'zh-CN': issue.value,
        'en-US': '',
        'ru-RU': '',
        _file: issue.file,
        _line: issue.line,
      };
    }
  }
  return stubs;
}

// ─── Main ────────────────────────────────────────────────

function main() {
  console.error(`\n🔍 Scanning for hardcoded strings in: ${relative(SRC_DIR, scanDir)}`);
  console.error(`   Language filter: ${targetLang}\n`);

  const files = getTsxFiles(scanDir);
  const allIssues = [];

  for (const file of files) {
    const { issues } = scanFile(file, { lang: targetLang, maxIssues: maxIssues - allIssues.length });
    for (const issue of issues) {
      allIssues.push({ file: relative(SRC_DIR, file), ...issue });
    }
    if (allIssues.length >= maxIssues) {
      console.error(`⚠️  Stopped after ${maxIssues} issues (use --dir to narrow scope)\n`);
      break;
    }
  }

  // Deduplicate by file+line+type
  const seen = new Set();
  const unique = allIssues.filter(i => {
    const k = `${i.file}:${i.line}:${i.type}:${i.value.slice(0, 20)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const errors = unique.filter(i => i.severity === 'error');
  const warnings = unique.filter(i => i.severity === 'warning');

  if (jsonOutput) {
    console.log(JSON.stringify({
      status: errors.length > 0 ? 'fail' : 'pass',
      total: unique.length,
      errors: errors.length,
      warnings: warnings.length,
      issues: unique,
    }, null, 2));
  } else {
    console.error(`📊 Scan Results:`);
    console.error(`   Files scanned: ${files.length}`);
    console.error(`   Issues found: ${unique.length}`);
    console.error(`   Errors (in i18n-aware files): ${errors.length}`);
    console.error(`   Warnings (files without i18n): ${warnings.length}\n`);

    if (unique.length > 0) {
      const byFile = {};
      for (const issue of unique) {
        (byFile[issue.file] ??= []).push(issue);
      }
      for (const [file, issues] of Object.entries(byFile)) {
        console.error(`\n📄 ${file} (${issues.length} issue${issues.length > 1 ? 's' : ''})`);
        for (const issue of issues) {
          const icon = issue.severity === 'error' ? '❌' : '⚠️';
          console.error(`   ${icon} L${issue.line}: ${issue.type === 'chinese-jsx' ? 'JSX' : 'str'} "${issue.value.slice(0, 50)}${issue.value.length > 50 ? '...' : ''}"`);
        }
      }
    }
  }

  // Fix mode
  if (fixMode && errors.length > 0) {
    const stubs = generateFixStub(errors);
    const stubPath = resolve(SRC_DIR, 'src', 'i18n', 'locales', '_hardcoded_stubs.json');
    writeFileSync(stubPath, JSON.stringify(stubs, null, 2), 'utf-8');
    console.error(`\n🔧 Generated ${Object.keys(stubs).length} key stubs → ${relative(SRC_DIR, stubPath)}`);
    console.error(`   Review and merge these into the appropriate locale files.\n`);
  }

  if (errors.length > 0) process.exit(1);
}

main();
