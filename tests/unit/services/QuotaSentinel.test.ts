import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuotaSentinel } from '../../../src/services/storage/QuotaSentinel';

describe('QuotaSentinel (TDD)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should correctly calculate localStorage usage', () => {
        const testData = 'a'.repeat(1024); // 1KB
        localStorage.setItem('test-key', testData);
        
        const usage = QuotaSentinel.getLocalStorageUsage();
        // localStorage 存储的是 UTF-16，通常占用 2 字节每个字符，加上 Key 的长度
        expect(usage.bytes).toBeGreaterThanOrEqual(2048);
        expect(usage.percentage).toBeLessThan(1); // 远小于 5MB
    });

    it('should identify when storage is approaching limit', () => {
        // 模拟一个极小的限制
        const limit = 5000; 
        const usage = 4500; 
        
        const isNearLimit = QuotaSentinel.isNearLimit(usage, limit, 0.8);
        expect(isNearLimit).toBe(true);
    });

    it('should get storage estimate from browser API', async () => {
        // Mock navigator.storage.estimate
        const mockEstimate = vi.fn().mockResolvedValue({ usage: 1000, quota: 5000 });
        vi.stubGlobal('navigator', {
            storage: {
                estimate: mockEstimate
            }
        });

        const estimate = await QuotaSentinel.getStorageEstimate();
        expect(estimate.usage).toBe(1000);
        expect(estimate.quota).toBe(5000);
    });
});
