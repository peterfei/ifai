/**
 * v0.2.9 行内编辑 Mock 实现
 *
 * 提供模拟的代码编辑响应，用于测试和社区版
 */

import {
  IInlineEditor,
  InlineEditorRequest,
  InlineEditorResponse,
  InlineEditorOptions,
} from '../../interfaces/v0.2.9/IInlineEditor';

/**
 * Mock 响应延迟（毫秒）
 */
const MOCK_DELAY = 500;

/**
 * 常见的编辑指令模式
 */
const EDIT_PATTERNS = {
  ERROR_HANDLING: ['error handling', '错误处理', 'try catch', '异常处理'],
  ADD_COMMENT: ['comment', '注释', 'doc'],
  ADD_LOG: ['log', 'console', 'debug', '调试'],
  TYPE_CONVERSION: ['type', '类型', 'typescript', 'ts'],
  OPTIMIZE: ['optimize', '优化', 'refactor', '重构'],
  FORMAT: ['format', '格式化', 'style', '风格'],
};

/**
 * Mock 行内编辑器
 *
 * 提供预定义的编辑模式响应，用于 E2E 测试和社区版
 */
export class MockInlineEditor implements IInlineEditor {
  private delay: number;

  constructor(config?: { delay?: number }) {
    this.delay = config?.delay ?? MOCK_DELAY;
  }

  /**
   * 应用代码编辑
   */
  async applyEdit(
    request: InlineEditorRequest,
    options?: InlineEditorOptions
  ): Promise<InlineEditorResponse> {
    console.log('[MockInlineEditor] applyEdit called:', {
      instruction: request.instruction,
      codeLength: request.code.length,
      language: request.language,
    });

    // 模拟网络延迟
    await this.simulateDelay();

    const instruction = request.instruction.toLowerCase();
    let modifiedCode = request.code;
    const changes: string[] = [];

    // 检测编辑模式并应用相应的转换
    if (this.matchesPattern(instruction, EDIT_PATTERNS.ERROR_HANDLING)) {
      modifiedCode = this.addErrorHandling(request.code, request.language);
      changes.push('Added try-catch error handling');
    } else if (this.matchesPattern(instruction, EDIT_PATTERNS.ADD_COMMENT)) {
      modifiedCode = this.addComment(request.code, request.instruction);
      changes.push('Added comment');
    } else if (this.matchesPattern(instruction, EDIT_PATTERNS.ADD_LOG)) {
      modifiedCode = this.addLogging(request.code, request.language);
      changes.push('Added console.log statements');
    } else if (this.matchesPattern(instruction, EDIT_PATTERNS.TYPE_CONVERSION)) {
      modifiedCode = this.addTypes(request.code);
      changes.push('Added TypeScript type annotations');
    } else if (this.matchesPattern(instruction, EDIT_PATTERNS.OPTIMIZE)) {
      modifiedCode = this.optimizeCode(request.code);
      changes.push('Optimized code structure');
    } else {
      // 默认：添加注释
      modifiedCode = this.addComment(request.code, request.instruction);
      changes.push(`Applied: ${request.instruction}`);
    }

    return {
      originalCode: request.code,
      modifiedCode,
      instruction: request.instruction,
      success: true,
      summary: `Mock edit applied: ${request.instruction}`,
      changes,
    };
  }

  /**
   * 流式应用代码编辑
   */
  async applyEditStream(
    request: InlineEditorRequest,
    onProgress: (chunk: string) => void
  ): Promise<InlineEditorResponse> {
    console.log('[MockInlineEditor] applyEditStream called');

    const response = await this.applyEdit(request, { onProgress });

    if (response.success && response.modifiedCode) {
      // 模拟流式输出
      const code = response.modifiedCode;
      const chunkSize = Math.max(50, Math.floor(code.length / 20));

      for (let i = 0; i < code.length; i += chunkSize) {
        const chunk = code.substring(i, Math.min(i + chunkSize, code.length));
        onProgress(chunk);
        await this.simulateDelay(this.delay / 10);
      }
    }

    return response;
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * 获取服务提供商信息
   */
  getProviderInfo(): {
    name: string;
    version: string;
    features: string[];
  } {
    return {
      name: 'MockInlineEditor',
      version: '0.2.9',
      features: ['mock-editing', 'test-support', 'community-edition'],
    };
  }

  // ==========================================================================
  // 私有辅助方法
  // ==========================================================================

  /**
   * 检查指令是否匹配某个模式
   */
  private matchesPattern(instruction: string, patterns: string[]): boolean {
    return patterns.some(pattern => instruction.includes(pattern));
  }

  /**
   * 添加错误处理
   */
  private addErrorHandling(code: string, language: string): string {
    // 简单处理：在 return 语句前添加 try-catch
    // 查找包含 return 的行，并在行首添加 try {
    // 在函数末尾添加 catch 块

    // 如果代码包含 "error handling" 或类似关键字
    if (code.includes('error handling') || code.includes('错误处理') || code.includes('Error')) {
      return code.replace(/return\s+(.+?);/g, 'try {\n        return $1;\n    } catch (error) {\n        console.error("Error:", error);\n        throw error;\n    }');
    }

    // 对于简单的函数，包装整个函数体
    const lines = code.split('\n');
    if (lines.length === 1) {
      // 单行函数
      return code.replace(/function\s+(\w+)\s*\(\s*\)\s*\{\s*return\s+(.+?);\s*\}/,
        'function $1() {\n    try {\n        return $2;\n    } catch (error) {\n        console.error("Error:", error);\n        throw error;\n    }\n}');
    }

    // 多行函数：查找第一个 { 和最后一个 }
    const firstBrace = code.indexOf('{');
    const lastBrace = code.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      const before = code.substring(0, firstBrace + 1);
      const body = code.substring(firstBrace + 1, lastBrace).trim();
      const after = code.substring(lastBrace);

      return `${before}\n    try {\n        ${body}\n    } catch (error) {\n        console.error("Error:", error);\n        throw error;\n    }\n${after}`;
    }

    return code;
  }

  /**
   * 添加注释
   */
  private addComment(code: string, comment: string): string {
    // 根据语言判断注释风格
    const commentStyle = this.getCommentStyle(code);
    const prefix = commentStyle === '//' ? '//' : '#';

    return `${code}\n\n${prefix} ${comment}`;
  }

  /**
   * 添加日志
   */
  private addLogging(code: string, language: string): string {
    // 在 return 语句前添加 console.log
    const returnRegex = /(\s+)return\s+/g;

    return code.replace(returnRegex, (match, spaces) => {
      return `${spaces}console.log('Debug:', result);\n${spaces}return `;
    });
  }

  /**
   * 添加类型注解
   */
  private addTypes(code: string): string {
    // 简单的类型添加示例
    return code
      .replace(/function\s+(\w+)\s*\(([^)]*)\)/g, 'function $1($2: any): any {')
      .replace(/const\s+(\w+)\s*=/g, 'const $1: any =');
  }

  /**
   * 优化代码
   */
  private optimizeCode(code: string): string {
    // 移除多余的空行
    return code.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * 获取注释风格
   */
  private getCommentStyle(code: string): '//' | '#' {
    // Python/Shell 使用 #
    if (code.includes('def ') || code.includes('import ') || code.includes('#!')) {
      return '#';
    }
    // 其他语言使用 //
    return '//';
  }

  /**
   * 模拟延迟
   */
  private async simulateDelay(ms?: number): Promise<void> {
    const delay = ms ?? this.delay;
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * 获取默认的 MockInlineEditor 实例
 */
export function getMockInlineEditor(config?: { delay?: number }): MockInlineEditor {
  return new MockInlineEditor(config);
}
