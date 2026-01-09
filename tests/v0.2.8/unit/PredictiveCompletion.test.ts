/**
 * v0.2.8 预测补全 (Predictive Completion) 逻辑测试
 */

import { describe, test, expect } from 'vitest';

// 模拟补全引擎
const getPredictiveSuggestion = (prefix: string, symbols: string[]) => {
    // 简单逻辑：如果在 class 定义后，优先建议方法名
    if (prefix.trim().endsWith('class User {')) {
        return '  constructor() {}';
    }
    // 如果在变量输入一半，从符号库中匹配
    if (prefix.endsWith('let u = new ')) {
        return symbols.find(s => s.startsWith('U')) || '';
    }
    return '';
};

describe('Predictive Completion Engine', () => {
    const mockSymbols = ['User', 'AuthService', 'Product'];

    test('should suggest constructor after class declaration', () => {
        const prefix = 'class User {';
        const suggestion = getPredictiveSuggestion(prefix, mockSymbols);
        expect(suggestion).toContain('constructor');
    });

    test('should suggest known symbols from index', () => {
        const prefix = 'let u = new ';
        const suggestion = getPredictiveSuggestion(prefix, mockSymbols);
        expect(suggestion).toBe('User');
    });

    test('should return empty string if no confident suggestion', () => {
        const prefix = 'random text ';
        const suggestion = getPredictiveSuggestion(prefix, mockSymbols);
        expect(suggestion).toBe('');
    });
});
