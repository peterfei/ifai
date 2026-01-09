import { describe, test, expect } from 'vitest';

/**
 * 验证 Composer 的冲突检测逻辑
 */
const checkFileConflict = (currentDiskHash: string, aiBaseHash: string) => {
    // 如果 AI 生成建议时的文件哈希与当前磁盘哈希不一致，说明发生了冲突
    return currentDiskHash !== aiBaseHash;
};

describe('Composer Conflict Handler', () => {
    test('should detect conflict when file changed during AI generation', () => {
        const aiBaseHash = 'hash_v1';
        const currentDiskHash = 'hash_v2'; // 用户在 AI 生成期间改了代码
        
        const isConflict = checkFileConflict(currentDiskHash, aiBaseHash);
        expect(isConflict).toBe(true);
    });

    test('should allow merge when hashes match', () => {
        const aiBaseHash = 'hash_v1';
        const currentDiskHash = 'hash_v1';
        
        const isConflict = checkFileConflict(currentDiskHash, aiBaseHash);
        expect(isConflict).toBe(false);
    });
});
