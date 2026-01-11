import { FullConfig } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 全局测试设置
 * 在所有测试运行前执行一次
 */
async function globalSetup(config: FullConfig) {
  console.log('\n========================================');
  console.log('🚀 E2E测试环境初始化');
  console.log('========================================\n');

  const startTime = Date.now();

  try {
    // 设置环境变量
    process.env.NODE_ENV = 'test';
    process.env.E2E_TEST = 'true';

    // 🔥 创建 E2E 标记文件，让 Vite 检测到 E2E 环境
    const e2eFlagPath = path.join(process.cwd(), 'tests/e2e/.env.e2e');
    try {
      await fs.writeFile(e2eFlagPath, Date.now().toString());
      console.log(`✅ E2E 标记文件已创建: ${e2eFlagPath}`);
    } catch (err) {
      console.warn(`⚠️ 无法创建 E2E 标记文件:`, err);
    }

    // 确保test-results目录存在
    const testResultsDir = path.join(process.cwd(), 'test-results');

    try {
      await fs.mkdir(testResultsDir, { recursive: true });
    } catch (err) {
      // 目录可能已存在，忽略错误
    }

    const duration = Date.now() - startTime;
    console.log(`✅ 全局设置完成 (${duration}ms)\n`);
  } catch (error) {
    console.error('❌ 全局设置失败:', error);
    throw error;
  }
}

export default globalSetup;
