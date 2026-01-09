/**
 * E2E测试辅助工具统一导出
 * 提供所有测试辅助函数和工具的便捷导入
 */

// 等待函数
export * from './wait-helpers';

// 断言函数
export * from './assert-helpers';

// 数据生成器
export * from './data-generators';

// 重新导出setup-utils（向后兼容）
export { setupE2ETestEnvironment } from '../setup-utils';
