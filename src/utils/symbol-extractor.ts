import { invoke } from '@tauri-apps/api/core';

/**
 * 🏆 PIVO 3.0 Symbol Probe Interface
 */
export interface SymbolProbe {
    name: string;
    kind: string;
    line: number;
    context: string;
}

export interface FileMetadata {
    size: number;
    mtime: number;
    fingerprint: string;
}

/**
 * 🏆 PIVO 3.0 Symbol Extractor Adapter
 * 物理层适配器，连接 Rust 探测引擎与前端业务逻辑。
 */
export class SymbolExtractor {
    /**
     * 探测目标文件的符号骨架
     * @param path 文件的绝对路径
     */
    static async probeFile(path: string): Promise<SymbolProbe[]> {
        console.log(`[SymbolExtractor] 🔍 Probing symbols: ${path}`);
        try {
            // 🏆 PIVO 3.0: 自动注入项目根目录上下文
            const project_root = (window as any).__REDUX_STATE__?.file?.rootPath || null;
            
            const symbols = await invoke<any>('probe_symbols', { 
                path, 
                project_root 
            });
            
            if (Array.isArray(symbols)) {
                return symbols as SymbolProbe[];
            }
            
            console.warn(`[SymbolExtractor] ⚠️ Unexpected probe response for ${path}:`, symbols);
            return [];
        } catch (error) {
            console.error(`[SymbolExtractor] ❌ Probe failed for ${path}:`, error);
            return [];
        }
    }

    /**
     * 获取文件物理元数据（用于指纹校验）
     */
    static async getMetadata(path: string): Promise<FileMetadata> {
        return await invoke<FileMetadata>('get_file_metadata', { path });
    }
}
