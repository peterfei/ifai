import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataMigrator } from '../../../src/services/storage/DataMigrator';
import { PersistenceManager } from '../../../src/services/storage/PersistenceManager';

const mockManager = {
    setItem: vi.fn(),
    getItem: vi.fn()
};

vi.mock('../../../src/services/storage/PersistenceManager', () => ({
    PersistenceManager: {
        getInstance: vi.fn(() => mockManager)
    }
}));

describe('DataMigrator (TDD)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should migrate relevant keys from LocalStorage to PersistenceManager', async () => {
        const historyData = JSON.stringify({ messages: ['hello'] });
        localStorage.setItem('ifai-history-session-1', historyData);
        localStorage.setItem('some-other-config', 'keep-me');

        await DataMigrator.migrate();

        // 验证数据已迁移
        expect(mockManager.setItem).toHaveBeenCalledWith('ifai-history-session-1', expect.anything());
        
        // 验证旧 Key 已被删除
        expect(localStorage.getItem('ifai-history-session-1')).toBeNull();
        
        // 验证非大数据 Key 未被删除
        expect(localStorage.getItem('some-other-config')).toBe('keep-me');
    });
});
