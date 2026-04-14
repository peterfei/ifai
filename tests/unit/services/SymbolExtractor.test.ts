import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SymbolExtractor } from '../../../src/utils/symbol-extractor';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
    invoke: (cmd: string, args: any) => mockInvoke(cmd, args)
}));

describe('SymbolExtractor (TDD)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call rust probe_symbols command and format results', async () => {
        const mockSymbols = [
            { name: 'App', kind: 'function', line: 10, context: 'function App() {' },
            { name: 'useChatStore', kind: 'variable', line: 5, context: 'export const useChatStore = ...' }
        ];
        
        mockInvoke.mockResolvedValue(mockSymbols);

        const result = await SymbolExtractor.probeFile('src/App.tsx');

        expect(mockInvoke).toHaveBeenCalledWith('probe_symbols', { path: 'src/App.tsx', project_root: null });
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('App');
    });

    it('should handle large file metadata correctly', async () => {
        mockInvoke.mockResolvedValue({ size: 500000, mtime: 1234567, fingerprint: '500000_1234567' });
        
        const meta = await SymbolExtractor.getMetadata('src/large-file.ts');
        expect(mockInvoke).toHaveBeenCalledWith('get_file_metadata', { path: 'src/large-file.ts' });
        expect(meta.size).toBe(500000);
    });
});
