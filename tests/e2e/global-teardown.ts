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
    // 可以在这里添加其他全局清理：
    // - 关闭mock服务器
    // - 清理测试数据
    // - 生成测试报告

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
