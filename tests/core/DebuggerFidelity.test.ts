import { test, expect } from '@playwright/test';
import { AuthoritativeWait } from '../utils/AuthoritativeWait';

/**
 * 🏆 DebuggerAgent v0.5.0 PIVO 3.0 高保真链路验证
 * 验证：报错意图拦截 -> 任务树步进 -> 物理持久化
 */
test.describe('DebuggerAgent Fidelity (PIVO 3.0)', () => {
    
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:1420?e2e=true');
        // 等待应用就绪信号
        await AuthoritativeWait.forPersistenceHydrated(page);
    });

    test('should intercept error logs and step through PIVO task tree', async ({ page }) => {
        const errorLog = "error[E0425]: cannot find value `unknown_var` in this scope\n  --> src/main.rs:10:5";
        
        console.log('[Test] 发送模拟报错日志...');
        
        // 1. 触发调试意图
        await page.evaluate((log) => {
            const chatStore = (window as any).__chatStore;
            const settings = (window as any).__settingsStore.getState();
            
            chatStore.getState().sendMessage(log, {
                provider: settings.provider,
                model: settings.model
            });
        }, errorLog);

        // 2. 权威等待：验证 PIVO 任务树是否出现了“分析错误日志”步骤
        console.log('[Test] 等待 PIVO 任务树步进...');
        await page.waitForFunction(() => {
            const pivoStore = (window as any).__pivoStore;
            if (!pivoStore) return false;
            const tasks = pivoStore.getState().taskTrees;
            // 查找是否有任何 message 下存在包含“分析错误日志”的任务
            return Object.values(tasks).some((tree: any) => 
                tree.some((t: any) => t.label.includes('分析错误日志'))
            );
        }, { timeout: 10000 });

        // 3. 权威等待：验证该步骤是否最终变绿 (success)
        console.log('[Test] 验证“分析错误日志”是否变绿...');
        await page.waitForFunction(() => {
            const pivoStore = (window as any).__pivoStore;
            const tasks = pivoStore.getState().taskTrees;
            return Object.values(tasks).some((tree: any) => 
                tree.some((t: any) => t.label.includes('分析错误日志') && t.status === 'success')
            );
        }, { timeout: 15000 });

        // 4. 最终校验：验证是否生成了“原子补丁方案”
        console.log('[Test] 验证后续步骤生成...');
        const hasPatchStep = await page.evaluate(() => {
            const pivoStore = (window as any).__pivoStore;
            const tasks = pivoStore.getState().taskTrees;
            return Object.values(tasks).some((tree: any) => 
                tree.some((t: any) => t.label.includes('生成原子补丁方案'))
            );
        });

        expect(hasPatchStep).toBe(true);
        console.log('[Test] ✅ DebuggerAgent PIVO 链路验证通过！');
    });
});
