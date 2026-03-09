import { describe, it, expect, vi } from 'vitest';
import { SymbolExtractor } from '../../../src/utils/symbol-extractor';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
    invoke: (cmd: string, args: any) => mockInvoke(cmd, args)
}));

describe('Symbol Probe Fidelity (TDD)', () => {
    it('should correctly handle relative paths and return valid symbols', async () => {
        // 模拟后端因路径问题返回空对象 {} 而不是数组 []
        mockInvoke.mockResolvedValue({}); 

        const result = await SymbolExtractor.probeFile('src/App.tsx');

        console.log('[TDD-Probe] Result for empty response:', result);

        // 🏆 核心断言：即使后端返回异常结构，适配器也应保证返回数组
        expect(Array.isArray(result)).toBe(true);
    });
});
