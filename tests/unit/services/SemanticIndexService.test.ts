import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticIndexService } from '../../../src/services/analyzer/SemanticIndexService';
import { SymbolExtractor } from '../../../src/utils/symbol-extractor';
import { PersistenceManager } from '../../../src/services/storage/PersistenceManager';

// Mock instance
const mockManager = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
};

vi.mock('../../../src/utils/symbol-extractor');
vi.mock('../../../src/services/storage/PersistenceManager', () => ({
    PersistenceManager: {
        getInstance: vi.fn(() => mockManager)
    }
}));

describe('SemanticIndexService (TDD)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should probe file and cache results on first call', async () => {
        const service = SemanticIndexService.getInstance();
        const mockMeta = { size: 100, mtime: 1, fingerprint: '100_1' };
        const mockSymbols = [{ name: 'Test', kind: 'class', line: 1, context: '' }];

        vi.mocked(SymbolExtractor.getMetadata).mockResolvedValue(mockMeta);
        vi.mocked(SymbolExtractor.probeFile).mockResolvedValue(mockSymbols);

        mockManager.getItem.mockResolvedValue(null); // 模拟缓存不命中

        const result = await service.getFileSymbols('src/test.ts');

        expect(SymbolExtractor.probeFile).toHaveBeenCalledWith('src/test.ts');
        expect(mockManager.setItem).toHaveBeenCalled(); // 应该存入缓存
        expect(result).toEqual(mockSymbols);
    });

    it('should return cached results if fingerprint matches', async () => {
        const service = SemanticIndexService.getInstance();
        const mockMeta = { size: 100, mtime: 1, fingerprint: '100_1' };
        const mockSymbols = [{ name: 'Cached', kind: 'class', line: 1, context: '' }];

        vi.mocked(SymbolExtractor.getMetadata).mockResolvedValue(mockMeta);

        // 模拟缓存命中且指纹匹配
        // PersistenceManager.getItem returns raw strings, SemanticIndexService parses them
        const cachedData = JSON.stringify({
            fingerprint: '100_1',
            symbols: mockSymbols,
            timestamp: Date.now()
        });
        mockManager.getItem.mockResolvedValue(cachedData);

        const result = await service.getFileSymbols('src/test.ts');

        expect(SymbolExtractor.probeFile).not.toHaveBeenCalled(); // 不应该再次探测
        expect(result).toEqual(mockSymbols);
    });
});
