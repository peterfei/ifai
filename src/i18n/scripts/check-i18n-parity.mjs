#!/usr/bin/env node

/**
 * i18n Locale Key Parity Checker
 *
 * Recursively compares JSON key structures across all locale files.
 * Ensures every locale has exactly the same set of keys.
 *
 * Usage:
 *   node src/i18n/scripts/check-i18n-parity.mjs              # Check all locales
 *   node src/i18n/scripts/check-i18n-parity.mjs --base main   # Only check changed keys vs base
 *   node src/i18n/scripts/check-i18n-parity.mjs --json        # Output JSON format
 *
 * Exit codes:
 *   0 - All locales have identical key structures
 *   1 - Key mismatch detected
 *   2 - Usage error
 */

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { collectKeys, loadLocale, loadAllLocales, parseArgs } from './core.mjs';

// ─── CLI ─────────────────────────────────────────────────
const args = parseArgs();
const { json: jsonOutput, quiet, base: baseBranch } = args;

// ─── Incremental Diff ────────────────────────────────────

function getChangedKeys(baseBranch, localeFiles) {
  try {
    const diff = execSync(
      `git diff ${baseBranch} --name-only -- "src/i18n/locales/*.json"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (!diff) return null;

    const changedFiles = diff.split('\n').filter(Boolean);
    const changedKeys = { added: new Set(), removed: new Set() };

    for (const file of changedFiles) {
      const currentKeys = existsSync(file)
        ? collectKeys(loadLocale(file))
        : new Set();

      const baseContent = execSync(
        `git show ${baseBranch}:${file}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const baseKeys = collectKeys(JSON.parse(baseContent));

      for (const k of currentKeys) {
        if (!baseKeys.has(k)) changedKeys.added.add(k);
      }
      for (const k of baseKeys) {
        if (!currentKeys.has(k)) changedKeys.removed.add(k);
      }
    }

    return changedKeys;
  } catch (e) {
    console.error(`[ERROR] Failed to diff against branch "${baseBranch}": ${e.message}`);
    process.exit(2);
  }
}

// ─── Main ────────────────────────────────────────────────

function main() {
  const locales = loadAllLocales();
  const localeNames = Object.keys(locales).sort();

  const keySets = {};
  for (const [name, data] of Object.entries(locales)) {
    keySets[name] = collectKeys(data);
  }

  // ── --base mode: only check changed keys ──
  if (baseBranch) {
    const changes = getChangedKeys(baseBranch);
    if (!changes) {
      if (!quiet) console.log('[OK] No locale file changes detected against base branch.');
      process.exit(0);
    }

    const keysToCheck = new Set([...changes.added, ...changes.removed]);
    if (keysToCheck.size === 0) {
      if (!quiet) console.log('[OK] No key structure changes detected against base branch.');
      process.exit(0);
    }

    const issues = [];
    for (const key of changes.added) {
      for (const name of localeNames) {
        if (!keySets[name].has(key)) issues.push({ type: 'missing', key, locale: name });
      }
    }
    for (const key of changes.removed) {
      for (const name of localeNames) {
        if (keySets[name].has(key)) issues.push({ type: 'orphan', key, locale: name });
      }
    }

    if (issues.length > 0) {
      if (jsonOutput) {
        console.log(JSON.stringify({ status: 'fail', issues }, null, 2));
      } else {
        console.error(`\n[FAIL] ${issues.length} key parity issue(s) against "${baseBranch}":\n`);
        for (const { type, key, locale } of issues) {
          const icon = type === 'missing' ? '❌' : '⚠️';
          const desc = type === 'missing'
            ? `Missing in ${locale}`
            : `Orphaned in ${locale} (removed from other locales)`;
          console.error(`  ${icon} ${key} → ${desc}`);
        }
        console.error('');
      }
      process.exit(1);
    }

    if (!quiet) console.log(`[OK] All ${keysToCheck.size} changed keys are in sync across ${localeNames.length} locales.`);
    process.exit(0);
  }

  // ── Full parity check ──
  const referenceName = localeNames[0];
  const referenceKeys = keySets[referenceName];

  const report = { reference: referenceName, totalKeys: referenceKeys.size, locales: {}, issues: [] };

  for (const name of localeNames) {
    const keys = keySets[name];
    const missing = new Set([...referenceKeys].filter(k => !keys.has(k)));
    const extra = new Set([...keys].filter(k => !referenceKeys.has(k)));

    report.locales[name] = {
      total: keys.size,
      missing: missing.size,
      extra: extra.size,
      missingKeys: [...missing].sort(),
      extraKeys: [...extra].sort(),
    };

    for (const key of missing) report.issues.push({ type: 'missing', key, locale: name, reference: referenceName });
    for (const key of extra) report.issues.push({ type: 'extra', key, locale: name, reference: referenceName });
  }

  // ── Output ──
  if (jsonOutput) {
    console.log(JSON.stringify({ status: report.issues.length === 0 ? 'pass' : 'fail', ...report }, null, 2));
  } else {
    console.log(`\n📋 i18n Locale Parity Report`);
    console.log(`   Reference: ${referenceName} (${referenceKeys.size} keys)`);
    console.log(`   Locales: ${localeNames.join(', ')}\n`);

    for (const [name, info] of Object.entries(report.locales)) {
      const icon = info.missing === 0 && info.extra === 0 ? '✅' : '❌';
      console.log(`   ${icon} ${name}: ${info.total} keys`);
      if (info.missing > 0) {
        console.log(`      Missing: ${info.missing} keys`);
        const show = info.missing <= 10 ? info.missingKeys : [...info.missingKeys.slice(0, 5), `... and ${info.missing - 5} more`];
        for (const k of show) console.log(`        - ${k}`);
      }
      if (info.extra > 0) {
        console.log(`      Extra: ${info.extra} keys`);
        const show = info.extra <= 10 ? info.extraKeys : [...info.extraKeys.slice(0, 5), `... and ${info.extra - 5} more`];
        for (const k of show) console.log(`        + ${k}`);
      }
    }

    if (report.issues.length > 0) {
      console.error(`\n[FAIL] ${report.issues.length} parity issue(s) found.\n`);
      process.exit(1);
    } else {
      console.log(`\n[OK] All locales have identical key structures.\n`);
    }
  }
}

main();
