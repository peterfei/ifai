import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceManager } from '../../src/services/storage/PersistenceManager';

describe('Settings Persistence Fidelity (TDD)', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('should persist and recover "showMinimap" setting correctly via PersistenceManager', async () => {
        const manager = PersistenceManager.getInstance();
        const settingsKey = 'settings-storage';
        
        // 1. 模拟 Zustand 存入设置数据 (Zustand 存入的是字符串)
        const mockPersistedState = {
            version: 4,
            state: {
                showMinimap: true,
                fontSize: 18,
                theme: 'vibe'
            }
        };
        const jsonString = JSON.stringify(mockPersistedState);
        
        await manager.setItem(settingsKey, jsonString);

        // 2. 物理验证：LocalStorage 中是否存在该字符串
        expect(localStorage.getItem(settingsKey)).toBe(jsonString);

        // 3. 模拟应用重启恢复：调用 getItem
        const recoveredValue = await manager.getItem(settingsKey);
        
        console.log('[TDD] Recovered settings type:', typeof recoveredValue);
        console.log('[TDD] Recovered settings value:', recoveredValue);

        // 🏆 核心断言：必须返回 RAW 字符串，否则 Zustand 的 JSON.parse(recoveredValue) 会失败
        expect(typeof recoveredValue).toBe('string');
        
        const parsed = JSON.parse(recoveredValue as string);
        expect(parsed.state.showMinimap).toBe(true);
        expect(parsed.state.fontSize).toBe(18);
    });
});
