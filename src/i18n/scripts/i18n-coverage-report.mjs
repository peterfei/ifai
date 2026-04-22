#!/usr/bin/env node

/**
 * i18n Coverage Report Generator
 *
 * Generates a comprehensive coverage report including:
 * - Key parity across all locales
 * - Empty/placeholder translations
 * - Component i18n adoption rate
 * - Hardcoded string count (reuses scan logic from core.mjs)
 * - Locale file statistics
 *
 * Usage:
 *   node src/i18n/scripts/i18n-coverage-report.mjs              # Full report
 *   node src/i18n/scripts/i18n-coverage-report.mjs --json        # JSON output
 *   node src/i18n/scripts/i18n-coverage-report.mjs --markdown    # Markdown table output
 *
 * Exit codes:
 *   0 - Report generated successfully
 */

import { readFileSync } from 'fs';
import { resolve, relative } from 'path';
import { collectKeys, collectValues, getLocaleFiles, getTsxFiles, scanFile, parseArgs, LOCALES_DIR, SRC_DIR } from './core.mjs';

// ─── CLI ─────────────────────────────────────────────────
const args = parseArgs();
const { json: jsonOutput, markdown: markdownOutput } = args;

// ─── Main ────────────────────────────────────────────────

function main() {
  const localeFiles = getLocaleFiles();

  // ── 1. Locale File Statistics ──
  const localeStats = {};
  const allKeys = {};
  const allValues = {};

  for (const file of localeFiles) {
    const name = file.replace('.json', '');
    const filePath = resolve(LOCALES_DIR, file);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    const keys = collectKeys(content);
    const values = collectValues(content);
    const emptyCount = values.filter(v => v.value.trim() === '').length;
    const placeholderCount = values.filter(v =>
      v.value.includes('{{') || v.value.includes('${') || v.value === v.key
    ).length;

    localeStats[name] = {
      file,
      totalKeys: keys.size,
      emptyTranslations: emptyCount,
      placeholderTranslations: placeholderCount,
      namespaces: Object.keys(content).length,
      fileSize: readFileSync(filePath, 'utf-8').length,
    };
    allKeys[name] = keys;
    allValues[name] = values;
  }

  // ── 2. Key Parity ──
  const referenceName = localeFiles[0].replace('.json', '');
  const referenceKeys = allKeys[referenceName];
  const parityIssues = [];

  for (const [name, keys] of Object.entries(allKeys)) {
    if (name === referenceName) continue;
    const missing = [...referenceKeys].filter(k => !keys.has(k));
    const extra = [...keys].filter(k => !referenceKeys.has(k));
    if (missing.length > 0) parityIssues.push({ locale: name, type: 'missing', count: missing.length, keys: missing.slice(0, 10) });
    if (extra.length > 0) parityIssues.push({ locale: name, type: 'extra', count: extra.length, keys: extra.slice(0, 10) });
  }

  // ── 3. Component i18n Adoption ──
  const componentsDir = resolve(SRC_DIR, 'src', 'components');
  const tsxFiles = getTsxFiles(componentsDir);
  let i18nAdopted = 0;
  let i18nNotAdopted = 0;
  const notAdoptedFiles = [];

  for (const file of tsxFiles) {
    const content = readFileSync(file, 'utf-8');
    if (content.includes('useTranslation')) {
      i18nAdopted++;
    } else {
      i18nNotAdopted++;
      if (notAdoptedFiles.length < 20) notAdoptedFiles.push(relative(SRC_DIR, file));
    }
  }

  const adoptionRate = tsxFiles.length > 0 ? ((i18nAdopted / tsxFiles.length) * 100).toFixed(1) : '0';

  // ── 4. Hardcoded String Count (reuses core.scanFile) ──
  let hardcodedFiles = 0;
  let hardcodedStrings = 0;
  const hardcodedByComponent = {};

  for (const file of tsxFiles) {
    const { issues } = scanFile(file, { lang: 'zh' });
    if (issues.length > 0) {
      hardcodedFiles++;
      hardcodedStrings += issues.length;
      const componentName = relative(SRC_DIR, file).replace(/^src\/components\//, '').replace(/\.(tsx?|jsx?)$/, '');
      hardcodedByComponent[componentName] = issues.length;
    }
  }

  // ── 5. Build Report ──
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalLocales: localeFiles.length,
      referenceKeys: referenceKeys.size,
      parityIssues: parityIssues.length,
      componentAdoptionRate: `${adoptionRate}%`,
      i18nAdopted,
      i18nNotAdopted,
      hardcodedFiles,
      hardcodedStrings,
    },
    localeStats,
    parityIssues,
    topHardcodedComponents: Object.entries(hardcodedByComponent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ component: name, hardcodedStrings: count })),
    notAdoptedComponents: notAdoptedFiles,
  };

  // ── Output ──
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else if (markdownOutput) {
    renderMarkdown(report);
  } else {
    renderTerminal(report);
  }
}

// ─── Renderers (data → output, no logic mixed in) ────────

function renderTerminal(r) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊 i18n Coverage Report`);
  console.log(`${'═'.repeat(60)}\n`);

  console.log(`  Locales: ${r.summary.totalLocales}`);
  console.log(`  Reference Keys: ${r.summary.referenceKeys}`);
  console.log(`  Parity Issues: ${r.summary.parityIssues > 0 ? `❌ ${r.summary.parityIssues}` : '✅ 0'}`);
  console.log(`  Component i18n Adoption: ${r.summary.componentAdoptionRate} (${r.summary.i18nAdopted}/${r.summary.i18nAdopted + r.summary.i18nNotAdopted})`);
  console.log(`  Hardcoded String Files: ${r.summary.hardcodedFiles}`);
  console.log(`  Hardcoded String Lines: ${r.summary.hardcodedStrings}`);

  console.log(`\n  ── Locale Statistics ─────────────────────`);
  for (const [name, stats] of Object.entries(r.localeStats)) {
    const emptyIcon = stats.emptyTranslations > 0 ? ` ⚠️ ${stats.emptyTranslations} empty` : '';
    console.log(`  ${name.padEnd(10)} ${String(stats.totalKeys).padStart(5)} keys${emptyIcon}`);
  }

  if (r.topHardcodedComponents.length > 0) {
    console.log(`\n  ── Top Hardcoded Components ───────────`);
    for (const item of r.topHardcodedComponents.slice(0, 10)) {
      console.log(`  ${item.component.padEnd(45)} ${String(item.hardcodedStrings).padStart(3)} lines`);
    }
  }

  if (r.parityIssues.length > 0) {
    console.log(`\n  ── Parity Issues ───────────────────────`);
    for (const issue of r.parityIssues) {
      console.log(`  ${issue.locale}: ${issue.type} ${issue.count} keys`);
    }
  }

  console.log(`\n${'═'.repeat(60)}\n`);
}

function renderMarkdown(r) {
  console.log(`# i18n Coverage Report\n`);
  console.log(`> Generated: ${r.generatedAt}\n`);
  console.log(`## Summary\n`);
  console.log(`| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| Locales | ${r.summary.totalLocales} |`);
  console.log(`| Reference Keys | ${r.summary.referenceKeys} |`);
  console.log(`| Parity Issues | ${r.summary.parityIssues} |`);
  console.log(`| Component i18n Adoption | ${r.summary.componentAdoptionRate} (${r.summary.i18nAdopted}/${r.summary.i18nAdopted + r.summary.i18nNotAdopted}) |`);
  console.log(`| Hardcoded String Files | ${r.summary.hardcodedFiles} |`);
  console.log(`| Hardcoded String Lines | ${r.summary.hardcodedStrings} |`);

  console.log(`\n## Locale Statistics\n`);
  console.log(`| Locale | Keys | Empty | Placeholders | Namespaces | Size (bytes) |`);
  console.log(`|--------|------|-------|-------------|------------|-------------|`);
  for (const [name, stats] of Object.entries(r.localeStats)) {
    console.log(`| ${name} | ${stats.totalKeys} | ${stats.emptyTranslations} | ${stats.placeholderTranslations} | ${stats.namespaces} | ${stats.fileSize.toLocaleString()} |`);
  }

  if (r.topHardcodedComponents.length > 0) {
    console.log(`\n## Top Components with Hardcoded Strings\n`);
    console.log(`| Component | Hardcoded Lines |`);
    console.log(`|-----------|-----------------|`);
    for (const item of r.topHardcodedComponents) {
      console.log(`| ${item.component} | ${item.hardcodedStrings} |`);
    }
  }

  if (r.parityIssues.length > 0) {
    console.log(`\n## Parity Issues\n`);
    for (const issue of r.parityIssues) {
      console.log(`- **${issue.locale}**: ${issue.type} ${issue.count} keys`);
      if (issue.keys.length > 0) console.log(`  - ${issue.keys.join(', ')}`);
    }
  }
  console.log('');
}

main();
