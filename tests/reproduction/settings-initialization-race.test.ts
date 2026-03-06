import { describe, it, expect, beforeEach, vi } from 'vitest';

// 🏆 核心：模拟延迟加载的存储后端，诱发竞态
const mockData = JSON.stringify({
    version: 4,
    state: {
        showMinimap: true,
        providers: [{ id: 'zhipu', apiKey: 'valid-key', enabled: true, models: [] }],
        currentProviderId: 'zhipu'
    }
});

vi.mock('../../src/services/storage/PersistenceManager', () => ({
    PersistenceManager: {
        getInstance: () => ({
            getItem: async () => {
                await new Promise(resolve => setTimeout(resolve, 50)); // 故意延迟 50ms
                return mockData;
            },
            setItem: vi.fn()
        })
    }
}));

describe('Settings Initialization Race Defense (TDD)', () => {
    it('should NOT overwrite restored settings with defaults during hydration', async () => {
        // 动态导入以触发 Store 创建
        const { useSettingsStore } = await import('../../src/stores/settingsStore');
        
        // 等待 Hydration 结束 (对应我们代码中的 onRehydrateStorage)
        await new Promise(resolve => setTimeout(resolve, 300));

        const state = useSettingsStore.getState();
        console.log('[TDD] Final showMinimap state:', state.showMinimap);
        
        // 🏆 核心断言：如果修复成功，这里应该是 true
        expect(state.showMinimap).toBe(true);
    });
});
