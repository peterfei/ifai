import { SymbolExtractor, SymbolProbe } from '../../utils/symbol-extractor';
import { PersistenceManager } from '../storage/PersistenceManager';

/**
 * 🏆 PIVO 3.0 Semantic Index Service
 * 负责管理项目符号索引，提供带缓存的物理探测能力。
 */

interface CachedIndex {
    fingerprint: string;
    symbols: SymbolProbe[];
    timestamp: number;
}

export class SemanticIndexService {
    private static instance: SemanticIndexService;
    private CACHE_PREFIX = 'ifai-semantic-index:';

    private constructor() {}

    static getInstance(): SemanticIndexService {
        if (!this.instance) {
            this.instance = new SemanticIndexService();
        }
        return this.instance;
    }

    /**
     * 获取文件的符号列表（优先从缓存恢复）
     */
    async getFileSymbols(path: string): Promise<SymbolProbe[]> {
        const manager = PersistenceManager.getInstance();
        const cacheKey = `${this.CACHE_PREFIX}${path}`;

        try {
            // 1. 获取当前物理文件的元数据
            const meta = await SymbolExtractor.getMetadata(path);
            
            // 2. 尝试从 IndexedDB 读取缓存
            const cached = await manager.getItem<CachedIndex>(cacheKey);

            // 3. 校验指纹
            if (cached && cached.fingerprint === meta.fingerprint) {
                console.log(`[SemanticIndex] ⚡ Cache hit for: ${path}`);
                return cached.symbols;
            }

            // 4. 缓存不命中或已失效，执行物理扫描
            console.log(`[SemanticIndex] 🔍 Cache miss/stale, scanning: ${path}`);
            const symbols = await SymbolExtractor.probeFile(path);

            // 5. 更新缓存
            const newIndex: CachedIndex = {
                fingerprint: meta.fingerprint,
                symbols,
                timestamp: Date.now()
            };
            await manager.setItem(cacheKey, newIndex);

            return symbols;
        } catch (error) {
            console.error(`[SemanticIndex] ❌ Failed to get symbols for ${path}:`, error);
            // 降级：如果索引系统出错，直接返回探测结果而不使用缓存
            return await SymbolExtractor.probeFile(path);
        }
    }

    /**
     * 清理特定文件的索引缓存
     */
    async invalidateIndex(path: string): Promise<void> {
        const manager = PersistenceManager.getInstance();
        await manager.removeItem(`${this.CACHE_PREFIX}${path}`);
    }
}
