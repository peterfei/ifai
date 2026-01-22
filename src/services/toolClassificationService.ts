/**
 * 工具分类服务
 *
 * 封装与Rust后端的通信，提供工具分类功能
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  ClassificationResult,
  ClassifyToolResponse,
  BatchClassifyResponse,
} from '@/types/toolClassification';

/**
 * 分类结果（带总延迟）
 */
export interface ClassificationResultWithLatency extends ClassificationResult {
  totalLatency: number;
}

/**
 * 工具分类服务
 */
export const toolClassificationService = {
  /**
   * 单次工具分类
   *
   * @param input - 用户输入
   * @returns 分类结果和延迟
   *
   * @example
   * ```ts
   * const response = await toolClassificationService.classify('读取文件');
   * console.log(response.result.category); // 'file_operations'
   * console.log(response.latencyMs); // 延迟毫秒数
   * ```
   */
  async classify(input: string): Promise<ClassifyToolResponse> {
    try {
      const result = await invoke<ClassifyToolResponse>('tool_classify', { input });
      return result;
    } catch (error) {
      console.error('[ToolClassificationService] classify error:', error);
      throw new Error(`工具分类失败: ${error}`);
    }
  },

  /**
   * 批量工具分类
   *
   * @param inputs - 用户输入列表
   * @returns 分类结果列表和总延迟
   *
   * @example
   * ```ts
   * const response = await toolClassificationService.batchClassify([
   *   '读取文件',
   *   '生成函数',
   *   'git status'
   * ]);
   * console.log(response.results.length); // 3
   * ```
   */
  async batchClassify(inputs: string[]): Promise<BatchClassifyResponse> {
    try {
      const result = await invoke<BatchClassifyResponse>('tool_batch_classify', { inputs });
      return result;
    } catch (error) {
      console.error('[ToolClassificationService] batchClassify error:', error);
      throw new Error(`批量工具分类失败: ${error}`);
    }
  },

  /**
   * 实时分类（带性能监控）
   *
   * @param input - 用户输入
   * @param onProgress - 进度回调
   * @returns 分类结果
   */
  async classifyWithProgress(
    input: string,
    onProgress?: (stage: string, latency: number) => void
  ): Promise<ClassificationResultWithLatency> {
    const startTime = performance.now();

    onProgress?.('开始分类', 0);

    try {
      const response = await this.classify(input);
      const totalLatency = performance.now() - startTime;

      onProgress?.('分类完成', totalLatency);

      return {
        ...response.result,
        totalLatency,
      };
    } catch (error) {
      const totalLatency = performance.now() - startTime;
      onProgress?.('分类失败', totalLatency);
      throw error;
    }
  },

  /**
   * 测试分类性能
   *
   * @param inputs - 测试输入列表
   * @returns 性能统计
   */
  async benchmark(inputs: string[]): Promise<{
    totalInputs: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    byLayer: Record<string, { count: number; totalTime: number; avgTime: number }>;
  }> {
    const startTime = performance.now();
    const response = await this.batchClassify(inputs);
    const totalTime = performance.now() - startTime;

    // 按层级统计
    const byLayer: Record<string, { count: number; totalTime: number; avgTime: number }> = {};

    for (const result of response.results) {
      const layer = result.layer;
      if (!byLayer[layer]) {
        byLayer[layer] = { count: 0, totalTime: 0, avgTime: 0 };
      }
      byLayer[layer].count++;
      // 假设每个结果的延迟大致相等（简化处理）
      byLayer[layer].totalTime += response.totalLatencyMs / inputs.length;
    }

    // 计算平均值
    for (const layer in byLayer) {
      byLayer[layer].avgTime = byLayer[layer].totalTime / byLayer[layer].count;
    }

    return {
      totalInputs: inputs.length,
      totalTime,
      averageTime: totalTime / inputs.length,
      minTime: response.totalLatencyMs / inputs.length * 0.8, // 估算
      maxTime: response.totalLatencyMs / inputs.length * 1.2, // 估算
      byLayer,
    };
  },
};
