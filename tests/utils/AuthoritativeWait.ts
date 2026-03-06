import { Page } from '@playwright/test';

/**
 * 🏆 PIVO 3.0 Authoritative Wait SDK
 * 支持状态机轮询 (Store) 和 物理信号管线 (Pipeline) 双模等待。
 */
export class AuthoritativeWait {
    /**
     * [模式 1] 状态机轮询：等待 Store 进入特定状态
     */
    private static async forChatStateInternal(
        page: Page,
        predicateStr: string,
        options: { timeout?: number; interval?: number } = {}
    ) {
        const { timeout = 30000, interval = 100 } = options;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const isMatch = await page.evaluate((logic) => {
                const state = (window as any).__CHAT_STORE_STATE__;
                if (!state) return false;
                const fn = new Function('state', `return (${logic})`);
                return fn(state);
            }, predicateStr);

            if (isMatch) return;
            await new Promise(resolve => setTimeout(resolve, interval));
        }

        throw new Error(`[AuthoritativeWait] Timeout waiting for Store logic: ${predicateStr}`);
    }

    /**
     * [模式 2] 信号管线：等待特定的物理信号 (CustomEvent)
     */
    static async forPipelineSignal(
        page: Page,
        signalName: string,
        options: { timeout?: number } = {}
    ) {
        const { timeout = 30000 } = options;
        
        console.log(`[AuthoritativeWait] 🛰️ Listening for pipeline signal: ${signalName}`);
        
        const signalFound = await page.evaluate((name) => {
            return new Promise((resolve) => {
                const handler = (e: any) => {
                    window.removeEventListener(name, handler);
                    resolve(true);
                };
                window.addEventListener(name, handler);
                setTimeout(() => resolve(false), 29000); // 略低于 Playwright 超时
            });
        }, signalName);

        if (!signalFound) {
            throw new Error(`[AuthoritativeWait] Timeout waiting for pipeline signal: ${signalName}`);
        }
    }

    /**
     * [模式 3] 日志哨兵：等待控制台出现特定标识
     */
    static async forConsoleSignal(page: Page, pattern: string | RegExp, options: { timeout?: number } = {}) {
        const { timeout = 30000 } = options;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                page.off('console', consoleHandler);
                reject(new Error(`[AuthoritativeWait] Timeout waiting for console signal: ${pattern}`));
            }, timeout);

            const consoleHandler = (msg: any) => {
                if (msg.text().match(pattern)) {
                    clearTimeout(timer);
                    page.off('console', consoleHandler);
                    resolve(true);
                }
            };
            page.on('console', consoleHandler);
        });
    }

    /**
     * 等待持久化层 Hydration 完成 (由 threadPersistence.ts 发出的信号)
     */
    static async forPersistenceHydrated(page: Page, options?: { timeout?: number }) {
        console.log('[AuthoritativeWait] 🛰️ Awaiting physical persistence signal...');
        await this.forPipelineSignal(page, 'ifainew:persistence-hydrated', options);
    }

    /**
     * 等待流式响应完成 (优先使用物理信号，Store 状态作为回退)
     */
    static async forStreamComplete(page: Page, options?: { timeout?: number }) {
        try {
            // 优先尝试物理信号管线 (更权威)
            await this.forPipelineSignal(page, 'ifainew:stream-finished', options);
        } catch (e) {
            console.warn('[AuthoritativeWait] Pipeline signal failed, falling back to Store polling...');
            await this.forChatStateInternal(page, '!state.isLoading && !state.messages.some(m => m.isStreaming)', options);
        }
    }

    /**
     * 等待消息列表中出现符合条件的消息
     */
    static async forMessage(page: Page, messagePredicate: string, options?: { timeout?: number }) {
        await this.forChatStateInternal(page, `(${messagePredicate})(state.messages)`, options);
    }
}
