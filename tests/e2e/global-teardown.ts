import { FullConfig } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 全局测试清理
 * 在所有测试运行后执行一次
 */
async function globalTeardown(config: FullConfig) {
  console.log('\n========================================');
  console.log('🧹 E2E测试环境清理');
  console.log('========================================\n');

  const startTime = Date.now();

  try {
    // 🔥 删除 E2E 标记文件，避免影响正常开发
    const e2eFlagPath = path.join(process.cwd(), 'tests/e2e/.env.e2e');
    try {
      await fs.unlink(e2eFlagPath);
      console.log(`✅ E2E 标记文件已删除: ${e2eFlagPath}`);
    } catch (err) {
      // 文件可能不存在，忽略错误
      console.log(`ℹ️ E2E 标记文件不存在或已删除`);
    }

    // 清理临时文件（可选）
    // 清理超过7天的test-results（可选，谨慎使用）
    const testResultsDir = path.join(process.cwd(), 'test-results');
    try {
      await fs.access(testResultsDir);
      // 保留最新的测试结果，只清理旧的临时文件
      console.log('📁 测试结果目录:', testResultsDir);
    } catch (err) {
      // 目录不存在，跳过
    }

    const duration = Date.now() - startTime;
    console.log(`✅ 全局清理完成 (${duration}ms)\n`);

    console.log('========================================');
    console.log('🎉 E2E测试套件执行完毕');
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ 全局清理失败:', error);
    // 不抛出错误，避免影响测试结果
  }
}

export default globalTeardown;
