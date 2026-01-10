/**
 * v0.2.8 错误修复服务
 *
 * 提供智能错误检测和修复建议：
 * - 解析终端错误输出
 * - 生成修复上下文
 * - 集成 AI 聊天提供建议
 */

import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 解析后的错误信息
 */
export interface ParsedError {
    /** 错误代码 */
    code: string;

    /** 错误消息 */
    message: string;

    /** 文件路径 */
    file: string;

    /** 行号 */
    line: number;

    /** 列号 */
    column?: number;

    /** 错误级别 */
    level: string;

    /** 语言类型 */
    language: string;

    /** 原始错误行 */
    raw_line: string;
}

/**
 * 修复上下文
 */
export interface FixContext {
    /** 错误代码 */
    error_code: string;

    /** 错误消息 */
    error_message: string;

    /** 文件路径 */
    file_path: string;

    /** 行号 */
    line_number: number;

    /** 列号 */
    column?: number;

    /** 代码上下文 */
    code_context: string;

    /** 语言类型 */
    language: string;
}

/**
 * AI 修复建议
 */
export interface AIFixSuggestion {
    /** 错误信息 */
    error: ParsedError;

    /** 修复上下文 */
    fixContext: FixContext;

    /** AI 生成的建议 */
    suggestion: string;

    /** 建议的代码修复 */
    codeFix?: string;

    /** 置信度 */
    confidence: 'high' | 'medium' | 'low';
}

/**
 * 错误修复选项
 */
export interface ErrorFixOptions {
    /** 是否显示 Toast 通知 */
    showNotification?: boolean;

    /** 自动生成 AI 建议 */
    generateAISuggestion?: boolean;

    /** 自定义错误过滤器 */
    errorFilter?: (error: ParsedError) => boolean;
}

// ============================================================================
// 服务类
// ============================================================================

class ErrorFixService {
    private errorCache: Map<string, ParsedError[]> = new Map();

    /**
     * 解析终端输出，提取所有错误
     */
    async parseTerminalErrors(output: string): Promise<ParsedError[]> {
        try {
            const errors = await invoke<ParsedError[]>('parse_terminal_errors', {
                output
            });

            console.log(`[ErrorFix] Parsed ${errors.length} errors from terminal output`);

            // 缓存错误
            const cacheKey = this.hashString(output);
            this.errorCache.set(cacheKey, errors);

            return errors;
        } catch (error) {
            console.error('[ErrorFix] Failed to parse terminal errors:', error);
            return [];
        }
    }

    /**
     * 快速解析单个错误行（实时错误检测）
     */
    async quickParseErrorLine(line: string): Promise<ParsedError | null> {
        try {
            const error = await invoke<ParsedError | null>('quick_parse_error_line', {
                line
            });

            if (error) {
                console.log('[ErrorFix] Quick parsed error:', error.code);
            }

            return error;
        } catch (error) {
            console.error('[ErrorFix] Failed to quick parse error:', error);
            return null;
        }
    }

    /**
     * 生成错误修复上下文
     */
    async generateFixContext(error: ParsedError): Promise<FixContext | null> {
        try {
            const context = await invoke<FixContext>('generate_error_fix_context', {
                filePath: error.file,
                errorCode: error.code,
                errorMessage: error.message,
                line: error.line,
                column: error.column,
                language: error.language,
                rawLine: error.raw_line
            });

            console.log('[ErrorFix] Generated fix context for:', error.code);

            return context;
        } catch (error) {
            console.error('[ErrorFix] Failed to generate fix context:', error);

            // 降级：返回基本上下文
            return {
                error_code: error.code,
                error_message: error.message,
                file_path: error.file,
                line_number: error.line,
                column: error.column,
                code_context: '',
                language: error.language
            };
        }
    }

    /**
     * 检测终端输出的语言类型
     */
    async detectLanguage(output: string): Promise<string> {
        try {
            const language = await invoke<string>('detect_terminal_language', {
                output
            });

            return language;
        } catch (error) {
            console.error('[ErrorFix] Failed to detect language:', error);
            return 'Generic';
        }
    }

    /**
     * 获取错误的文件内容
     */
    async getErrorFileContent(
        filePath: string,
        line: number,
        contextLines = 3
    ): Promise<string> {
        try {
            const content = await invoke<string>('get_error_file_content', {
                filePath,
                line,
                contextLines
            });

            return content;
        } catch (error) {
            console.error('[ErrorFix] Failed to get error file content:', error);
            return '';
        }
    }

    /**
     * 完整的错误分析和修复建议流程
     */
    async analyzeAndSuggestFixes(
        terminalOutput: string,
        options: ErrorFixOptions = {}
    ): Promise<AIFixSuggestion[]> {
        const {
            showNotification = true,
            errorFilter
        } = options;

        try {
            // 1. 解析错误
            let errors = await this.parseTerminalErrors(terminalOutput);

            // 2. 应用过滤器
            if (errorFilter) {
                errors = errors.filter(errorFilter);
            }

            if (errors.length === 0) {
                console.log('[ErrorFix] No errors found or all filtered out');
                return [];
            }

            if (showNotification) {
                toast.info(`检测到 ${errors.length} 个错误`);
            }

            // 3. 为每个错误生成修复上下文
            const suggestions: AIFixSuggestion[] = [];

            for (const error of errors) {
                const fixContext = await this.generateFixContext(error);

                if (!fixContext) {
                    continue;
                }

                // 4. 生成 AI 建议（需要集成 AI Chat）
                const suggestion = await this.generateAISuggestion(error, fixContext);

                suggestions.push({
                    error,
                    fixContext,
                    suggestion: suggestion.text,
                    codeFix: suggestion.codeFix,
                    confidence: suggestion.confidence
                });
            }

            return suggestions;

        } catch (error) {
            console.error('[ErrorFix] Failed to analyze and suggest fixes:', error);

            if (showNotification) {
                toast.error('错误分析失败');
            }

            return [];
        }
    }

    /**
     * 生成 AI 修复建议（集成到 AI Chat）
     */
    private async generateAISuggestion(
        error: ParsedError,
        fixContext: FixContext
    ): Promise<{ text: string; codeFix?: string; confidence: 'high' | 'medium' | 'low' }> {
        // 构造 AI 提示
        const prompt = this.constructFixPrompt(error, fixContext);

        // 这里应该调用 AI Chat 服务
        // 暂时返回基本建议
        return {
            text: `在 ${fixContext.file_path}:${fixContext.line_number} 发现 ${error.level}：${error.message}\n\n建议：检查代码语法和类型错误。`,
            confidence: 'medium'
        };
    }

    /**
     * 构造修复提示
     */
    private constructFixPrompt(error: ParsedError, context: FixContext): string {
        return `
请分析以下错误并提供修复建议：

**错误信息：**
- 代码：${error.code}
- 消息：${error.message}
- 文件：${context.file_path}:${context.line_number}
- 语言：${context.language}

**代码上下文：**
\`\`\`${context.language.toLowerCase()}
${context.code_context}
\`\`\`

请提供：
1. 错误原因分析
2. 具体的修复方案
3. 修复后的代码示例（如果适用）
`;
    }

    /**
     * 清空错误缓存
     */
    clearCache(): void {
        this.errorCache.clear();
        console.log('[ErrorFix] Cache cleared');
    }

    /**
     * 字符串哈希（用于缓存）
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }
}

// ============================================================================
// 导出单例
// ============================================================================

export const errorFixService = new ErrorFixService();

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 检测文本中的错误（用于实时错误高亮）
 */
export async function detectErrorsInText(
    text: string,
    options?: ErrorFixOptions
): Promise<AIFixSuggestion[]> {
    return errorFixService.analyzeAndSuggestFixes(text, options);
}

/**
 * 获取单个错误的修复建议
 */
export async function getErrorSuggestion(
    error: ParsedError
): Promise<AIFixSuggestion | null> {
    const fixContext = await errorFixService.generateFixContext(error);

    if (!fixContext) {
        return null;
    }

    const suggestion = await errorFixService['generateAISuggestion'](error, fixContext);

    return {
        error,
        fixContext,
        suggestion: suggestion.text,
        codeFix: suggestion.codeFix,
        confidence: suggestion.confidence
    };
}

/**
 * 判断是否为可修复的错误
 */
export function isFixableError(error: ParsedError): boolean {
    // 过滤掉不可修复的错误类型
    const unfixablePatterns = [
        /^E0502$/, // Rust unused files
        /^warning: unused_/,
        /^TODO/,
        /^FIXME/
    ];

    return !unfixablePatterns.some(pattern =>
        pattern.test(error.code) || pattern.test(error.message)
    );
}
