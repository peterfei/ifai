import { describe, it, expect, vi } from 'vitest';
import { setThreadMessages } from '../../../src/stores/useChatStore';

// Mock 依赖
vi.mock('../../../src/stores/persistence/threadPersistence', () => ({
    autoSaveThread: vi.fn()
}));

vi.mock('../../../src/stores/threadStore', () => ({
    useThreadStore: {
        getState: () => ({ activeThreadId: 'perf-thread' })
    }
}));

// 🏆 PIVO 3.0: 存储性能基准测试
describe('Store Synchronization Performance (TDD)', () => {
    it('should NOT block main thread when syncing large payloads (>1MB)', async () => {
        // 1. 准备一个 1MB 的超大负载
        const largePayload = 'A'.repeat(1024 * 1024); 
        const messages = [{ id: 'msg-1', role: 'assistant', content: largePayload }];

        const startTime = performance.now();
        
        // 2. 执行高频同步 (模拟流式输出中后端的频繁回调)
        for (let i = 0; i < 5; i++) {
            setThreadMessages('perf-thread', messages as any);
        }

        const duration = performance.now() - startTime;
        console.log(`[TDD-Perf] Total duration for 5x 1MB sync: ${duration.toFixed(2)}ms`);

        // 🏆 核心断言：同步操作不应超过 100ms
        // 如果超过 100ms，说明发生了严重的同步阻塞
        expect(duration).toBeLessThan(100);
    });
});
