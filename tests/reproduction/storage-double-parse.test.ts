import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceManager } from '../../src/services/storage/PersistenceManager';

describe('Storage Persistence Bug Reproduction (TDD)', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('should return a RAW string for Zustand to handle parsing', async () => {
        const manager = PersistenceManager.getInstance();
        const testKey = 'test-storage-key';
        const testData = { version: 0, state: { key: 'value' } };
        const jsonString = JSON.stringify(testData);

        // 模拟 Zustand 存入数据
        localStorage.setItem(testKey, jsonString);

        // 🏆 核心测试点：PersistenceManager.getItem 应该返回字符串，而不是解析后的对象
        const result = await manager.getItem(testKey);
        
        console.log('[TDD] PersistenceManager.getItem returned type:', typeof result);
        console.log('[TDD] PersistenceManager.getItem returned value:', result);

        // 预期失败：目前的实现会返回 object，而 Zustand 期望 string
        expect(typeof result).toBe('string');
        expect(result).toBe(jsonString);
    });
});
