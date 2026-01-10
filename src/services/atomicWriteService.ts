/**
 * v0.2.8 原子写入服务
 *
 * 提供事务性文件写入功能：
 * - 创建原子写入会话
 * - 批量添加文件操作
 * - 冲突检测
 * - 提交/回滚
 */

import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

// ============================================================================
// 类型定义
// ============================================================================

export interface FileOperation {
    path: string;
    op_type: 'Create' | 'Update' | 'Delete';
    content?: string;
    original_content?: string;
}

export interface AtomicWriteResult {
    session_id: string;
    success: boolean;
    applied_files: string[];
    conflicts: string[];
    errors: string[];
}

export interface AtomicSession {
    id: string;
    operations: FileOperation[];
}

// ============================================================================
// 服务类
// ============================================================================

class AtomicWriteService {
    /**
     * 开始新的原子写入会话
     */
    async startSession(): Promise<string> {
        try {
            const sessionId = await invoke<string>('atomic_write_start');
            console.log('[AtomicWrite] Session started:', sessionId);
            return sessionId;
        } catch (error) {
            console.error('[AtomicWrite] Failed to start session:', error);
            throw new Error(`Failed to start session: ${error}`);
        }
    }

    /**
     * 添加文件操作到会话
     */
    async addOperation(sessionId: string, operation: FileOperation): Promise<void> {
        try {
            await invoke('atomic_write_add_operation', {
                sessionId,
                operation
            });
            console.log('[AtomicWrite] Operation added:', operation.path);
        } catch (error) {
            console.error('[AtomicWrite] Failed to add operation:', error);
            throw new Error(`Failed to add operation: ${error}`);
        }
    }

    /**
     * 批量添加文件操作
     */
    async addOperations(sessionId: string, operations: FileOperation[]): Promise<void> {
        for (const op of operations) {
            await this.addOperation(sessionId, op);
        }
    }

    /**
     * 检测冲突
     */
    async detectConflicts(sessionId: string): Promise<string[]> {
        try {
            const conflicts = await invoke<string[]>('atomic_write_detect_conflicts', {
                sessionId
            });
            return conflicts;
        } catch (error) {
            console.error('[AtomicWrite] Failed to detect conflicts:', error);
            return [];
        }
    }

    /**
     * 提交原子写入会话
     */
    async commit(sessionId: string): Promise<AtomicWriteResult> {
        try {
            const result = await invoke<AtomicWriteResult>('atomic_write_commit', {
                sessionId
            });

            console.log('[AtomicWrite] Commit result:', result);

            if (result.success) {
                toast.success(`已应用 ${result.applied_files.length} 个文件变更`);
            } else {
                if (result.conflicts.length > 0) {
                    toast.error(`发现 ${result.conflicts.length} 个冲突`);
                }
                if (result.errors.length > 0) {
                    toast.error(`写入失败: ${result.errors.join(', ')}`);
                }
            }

            return result;
        } catch (error) {
            console.error('[AtomicWrite] Failed to commit:', error);
            toast.error(`提交失败: ${error}`);
            throw error;
        }
    }

    /**
     * 回滚原子写入会话
     */
    async rollback(sessionId: string): Promise<void> {
        try {
            await invoke('atomic_write_rollback', { sessionId });
            console.log('[AtomicWrite] Session rolled back:', sessionId);
            toast.info('已回滚所有变更');
        } catch (error) {
            console.error('[AtomicWrite] Failed to rollback:', error);
            throw new Error(`Failed to rollback: ${error}`);
        }
    }

    /**
     * 完整的原子写入流程
     * 1. 创建会话
     * 2. 添加所有操作
     * 3. 检测冲突
     * 4. 提交（如果有冲突则提示用户）
     */
    async executeAtomicWrite(
        operations: FileOperation[],
        options?: {
            skipConflictCheck?: boolean;
            onConflict?: (conflicts: string[]) => Promise<boolean>; // 返回 true 继续，false 取消
        }
    ): Promise<AtomicWriteResult> {
        // 🔥 E2E 测试支持：检查是否有 window mock
        if (typeof window !== 'undefined' && (window as any).__atomicWriteService) {
            console.log('[AtomicWrite] Using window mock for E2E tests');
            return await (window as any).__atomicWriteService.executeAtomicWrite(operations, options);
        }

        // 1. 创建会话
        const sessionId = await this.startSession();

        try {
            // 2. 添加所有操作
            await this.addOperations(sessionId, operations);

            // 3. 检测冲突
            if (!options?.skipConflictCheck) {
                const conflicts = await this.detectConflicts(sessionId);

                if (conflicts.length > 0) {
                    console.warn('[AtomicWrite] Conflicts detected:', conflicts);

                    // 调用回调
                    const shouldContinue = options?.onConflict
                        ? await options.onConflict(conflicts)
                        : confirm(`发现 ${conflicts.length} 个冲突：\n${conflicts.join('\n')}\n\n是否继续？`);

                    if (!shouldContinue) {
                        await this.rollback(sessionId);
                        return {
                            session_id: sessionId,
                            success: false,
                            applied_files: [],
                            conflicts,
                            errors: []
                        };
                    }
                }
            }

            // 4. 提交
            const result = await this.commit(sessionId);
            return result;

        } catch (error) {
            // 发生错误时回滚
            console.error('[AtomicWrite] Error during write, rolling back:', error);
            await this.rollback(sessionId);
            throw error;
        }
    }
}

// ============================================================================
// 导出单例
// ============================================================================

export const atomicWriteService = new AtomicWriteService();

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 将 Composer 的 FileChange 转换为 FileOperation
 */
export function fileChangeToOperation(change: {
    path: string;
    content: string;
    originalContent?: string;
    changeType?: 'added' | 'modified' | 'deleted';
}): FileOperation {
    let op_type: 'Create' | 'Update' | 'Delete' = 'Update';

    if (change.changeType === 'added') {
        op_type = 'Create';
    } else if (change.changeType === 'deleted') {
        op_type = 'Delete';
    }

    return {
        path: change.path,
        op_type,
        content: change.content,
        original_content: change.originalContent
    };
}
