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
        const testValue = 'raw-string-value';

        await manager.setItem(testKey, testValue);
        expect(set).toHaveBeenCalledWith(testKey, testValue);

        vi.mocked(get).mockResolvedValue(testValue);
        const result = await manager.getItem(testKey);
        expect(result).toBe(testValue);
    });

    it('should route light config keys to LocalStorage', async () => {
        const testKey = 'settings-theme';
        const testValue = 'dark';

        await manager.setItem(testKey, testValue);
        expect(localStorage.getItem(testKey)).toBe(testValue);

        const result = await manager.getItem(testKey);
        expect(result).toBe(testValue);
    });

    it('should handle complex objects correctly in LocalStorage fallback', async () => {
        const testKey = 'ui-state';
        // PersistenceManager.setItem now takes string values (StateStorage interface)
        // The caller (e.g., Zustand) is responsible for JSON serialization
        const testValue = JSON.stringify({ sidebarWidth: 250, open: true });

        await manager.setItem(testKey, testValue);
        const result = await manager.getItem(testKey);
        expect(result).toBe(testValue);

        // Verify round-trip
        const parsed = JSON.parse(result as string);
        expect(parsed).toEqual({ sidebarWidth: 250, open: true });
    });
});
