/**
 * 批量更新测试文件导入路径
 *
 * 将:
 *   import { setupE2ETestEnvironment } from './setup-utils';
 *
 * 更新为:
 *   import { setupE2ETestEnvironment } from '../setup-utils';
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// 测试文件目录
const testDirs = [
  'tests/e2e/chat',
  'tests/e2e/agent',
  'tests/e2e/tools',
  'tests/e2e/ui',
  'tests/e2e/editor',
  'tests/e2e/diff',
  'tests/e2e/version',
  'tests/e2e/openspec',
  'tests/e2e/integration',
];

async function updateImports() {
  let updatedCount = 0;
  let skippedCount = 0;

  for (const dir of testDirs) {
    const pattern = path.join(dir, '**/*.spec.ts');
    const files = glob.sync(pattern, { cwd: process.cwd() });

    for (const file of files) {
      const fullPath = path.resolve(file);
      let content = fs.readFileSync(fullPath, 'utf-8');
      const originalContent = content;

      // 替换导入路径
      content = content.replace(
        /from ['"]\.\/setup-utils['"]/g,
        "from '../setup-utils'"
      );

      // 添加测试标签和文档注释（如果还没有）
      if (!content.includes('@fast') && !content.includes('@medium') &&
          !content.includes('@slow') && !content.includes('@regression')) {
        // 尝试从文件名推断标签
        const fileName = path.basename(file);
        let tag = '@medium';

        if (fileName.includes('repro-') || fileName.includes('regression')) {
          tag = '@regression';
        } else if (fileName.includes('perf') || fileName.includes('persistence')) {
          tag = '@slow';
        } else if (fileName.includes('simple') || fileName.includes('basic')) {
          tag = '@fast';
        }

        // 在第一个test之前添加标签
        const testMatch = content.match(/(\n  test\()/);
        if (testMatch) {
          content = content.replace(
            /(\n  test\()/,
            `\n  test('${tag} $1`
          );
        }
      }

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf-8');
        updatedCount++;
        console.log(`✅ 已更新: ${file}`);
      } else {
        skippedCount++;
      }
    }
  }

  console.log('\n=== 更新完成 ===');
  console.log(`更新文件数: ${updatedCount}`);
  console.log(`跳过文件数: ${skippedCount}`);
}

updateImports().catch(console.error);
