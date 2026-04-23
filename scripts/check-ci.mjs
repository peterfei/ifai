#!/usr/bin/env node
/**
 * CI 类型检查 — 自动处理 ifainew-core 缺失
 *
 * ifainew-core 是 Tauri Rust crate 生成的模块，CI 中没有 Rust 编译环境。
 * 此脚本检测 ifainew-core 是否存在，不存在时使用 .d.ts 声明文件。
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IFAINEW_CORE_PATH = path.resolve(ROOT, '../ifainew-core/typescript/src');
const DTS_DIR = path.join(ROOT, 'src/types/ifainew-core');
const DTS_PATH = path.join(DTS_DIR, 'index.d.ts');

try {
  const hasRealTypes = fs.existsSync(path.join(IFAINEW_CORE_PATH, 'index.ts'));

  if (!hasRealTypes) {
    console.log('[check:ci] ifainew-core not found, using .d.ts stub...');

    if (!fs.existsSync(DTS_PATH)) {
      console.error('[check:ci] Error: src/types/ifainew-core.d.ts not found!');
      process.exit(1);
    }

    execSync('npx tsc --noEmit --skipLibCheck -p tsconfig.ci.json', {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } else {
    console.log('[check:ci] ifainew-core found, using real types...');
    execSync('npx tsc --noEmit --skipLibCheck', {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }

  console.log('[check:ci] TypeScript type check passed!');
} catch (error) {
  process.exit(1);
}
