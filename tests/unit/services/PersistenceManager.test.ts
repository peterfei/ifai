import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceManager } from '../../../src/services/storage/PersistenceManager';

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    clear: vi.fn()
}));

describe('PersistenceManager (TDD)', () => {
    let manager: PersistenceManager;

    beforeEach(() => {
        vi.clearAllMocks();
        // 清理 localStorage
        localStorage.clear();
        manager = PersistenceManager.getInstance();
    });

    it('should route keys starting with "ifai-history" to IndexedDB', async () => {
        const { get, set } = await import('idb-keyval');
        const testKey = 'ifai-history-session-1';
        const testValue = { messages: [] };

        await manager.setItem(testKey, testValue);
        expect(set).toHaveBeenCalledWith(testKey, JSON.stringify(testValue));

        vi.mocked(get).mockResolvedValue(JSON.stringify(testValue));
        const result = await manager.getItem(testKey);
        expect(result).toEqual(testValue);
    });

    it('should route light config keys to LocalStorage', async () => {
        const testKey = 'settings-theme';
        const testValue = 'dark';

        await manager.setItem(testKey, testValue);
        expect(localStorage.getItem(testKey)).toBe(JSON.stringify(testValue));

        const result = await manager.getItem(testKey);
        expect(result).toBe(testValue);
    });

    it('should handle complex objects correctly in LocalStorage fallback', async () => {
        const testKey = 'ui-state';
        const testValue = { sidebarWidth: 250, open: true };

        await manager.setItem(testKey, testValue);
        const result = await manager.getItem(testKey);
        expect(result).toEqual(testValue);
    });
});
