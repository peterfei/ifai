/**
 * 多模态引擎服务
 * v0.3.0: Vision LLM 集成、OCR、图片分析
 */

import { invoke } from '@tauri-apps/api/core';
import type { ImageContent, VisionAnalysisResult, MultimodalEngine } from '../types/multimodal';

/**
 * 社区版 Mock 多模态引擎
 */
class MockMultimodalEngine implements MultimodalEngine {
  async analyzeImage(image: ImageContent, prompt: string): Promise<VisionAnalysisResult> {
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 返回模拟响应
    return {
      description: `[社区版] 这是一个图片分析功能的模拟响应。\n\n您发送的提示词是: "${prompt}"\n\n图片类型: ${image.mime_type}\n图片大小: ${image.data?.length || 0} 字符\n\n注意: 这是社区版的 Mock 实现。商业版将支持真实的 Vision LLM 分析。`,
      code: undefined,
      language: undefined,
      confidence: 0.5,
    };
  }

  isVisionSupported(): boolean {
    return false; // 社区版不支持真实 Vision
  }
}

/**
 * 商业版真实多模态引擎 (通过 Tauri 调用后端)
 */
class RealMultimodalEngine implements MultimodalEngine {
  async analyzeImage(image: ImageContent, prompt: string): Promise<VisionAnalysisResult> {
    try {
      const result = await invoke<VisionAnalysisResult>('multimodal_analyze_image', {
        image,
        prompt,
      });
      return result;
    } catch (error) {
      console.error('[MultimodalEngine] 分析失败:', error);
      throw new Error(`图片分析失败: ${error}`);
    }
  }

  isVisionSupported(): boolean {
    return true; // 商业版支持真实 Vision
  }
}

/**
 * 多模态引擎服务
 */
class MultimodalService {
  private engine: MultimodalEngine;

  constructor() {
    // 根据版本选择引擎
    const isCommercial = import.meta.env.MODE === 'commercial' ||
                         (import.meta.env as any).APP_EDITION === 'commercial';

    this.engine = isCommercial ? new RealMultimodalEngine() : new MockMultimodalEngine();
  }

  /**
   * 分析图片
   */
  async analyzeImage(image: ImageContent, prompt: string): Promise<VisionAnalysisResult> {
    return this.engine.analyzeImage(image, prompt);
  }

  /**
   * 检查是否支持 Vision
   */
  isVisionSupported(): boolean {
    return this.engine.isVisionSupported();
  }

  /**
   * UI 设计图转代码
   */
  async uiDesignToCode(image: ImageContent): Promise<VisionAnalysisResult> {
    const prompt = `请分析这个 UI 设计图，生成对应的 React + Tailwind CSS 代码。

要求：
1. 使用 React 函数组件
2. 使用 Tailwind CSS 进行样式设计
3. 保持设计图的布局和样式
4. 使用语义化的 HTML 标签
5. 添加必要的注释说明

请直接返回代码，不需要额外解释。`;

    return this.analyzeImage(image, prompt);
  }

  /**
   * 报错截图诊断
   */
  async diagnoseError(image: ImageContent): Promise<VisionAnalysisResult> {
    const prompt = `请分析这个报错截图，提供修复建议。

要求：
1. 识别错误类型和错误信息
2. 分析错误原因
3. 提供具体的修复方案
4. 如果有代码示例，请提供

请详细解释并给出可操作的修复步骤。`;

    return this.analyzeImage(image, prompt);
  }

  /**
   * OCR 文字识别
   */
  async ocrImage(image: ImageContent): Promise<VisionAnalysisResult> {
    const prompt = `请识别图片中的所有文字内容。

要求：
1. 准确识别所有可见文字
2. 保持原有的排版和格式
3. 如果有代码，请用代码块格式化
4. 如果有表格，请用 Markdown 表格格式

请只返回识别的文字内容，不需要额外解释。`;

    return this.analyzeImage(image, prompt);
  }
}

// 单例导出
export const multimodalService = new MultimodalService();

// 类型导出
export type { ImageContent, VisionAnalysisResult, MultimodalEngine };
