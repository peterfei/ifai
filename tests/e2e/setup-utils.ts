import { Page } from '@playwright/test';

/**
 * 设置 E2E 测试环境，强力锁定应用状态
 */
export async function setupE2ETestEnvironment(page: Page) {
  // 1. Mock API
  await page.route('**/v1/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-' + Date.now(),
        choices: [{ index: 0, message: { role: 'assistant', content: 'Starting task implementation...' }, finish_reason: 'stop' }],
        usage: { total_tokens: 10 }
      }),
    });
  });

  // 2. 注入核心拦截与锁定脚本
  await page.addInitScript(() => {
    // A. 深度 Mock Tauri with event support
    const eventListeners: Record<string, Function[]> = {};

    const mockInvoke = async (cmd: string, args?: any) => {
        if (cmd === 'get_git_statuses') return [];
        if (cmd === 'read_directory') return [];
        if (cmd === 'plugin:dialog|ask') return true;
        if (cmd === 'ai_chat') {
            // Mock streaming response that sends content and triggers _finish event
            const eventId = args?.event_id || 'mock-event-id';
            const responseContent = 'Mock AI response: Task completed successfully.';

            // Simulate async streaming
            setTimeout(() => {
                // Send content chunk
                const streamListeners = eventListeners[eventId] || [];
                streamListeners.forEach(fn => fn({ payload: responseContent }));

                // Trigger _finish event shortly after
                setTimeout(() => {
                    const finishListeners = eventListeners[`${eventId}_finish`] || [];
                    finishListeners.forEach(fn => fn({ payload: 'DONE' }));
                }, 50);
            }, 100);
            return {};
        }
        return {};
    };

    const mockListen = async (event: string, handler: Function) => {
        const listeners = eventListeners[event] || [];
        listeners.push(handler);
        eventListeners[event] = listeners;
        return () => {
            const idx = eventListeners[event]?.indexOf(handler);
            if (idx > -1) eventListeners[event]?.splice(idx, 1);
        };
    };

    (window as any).__TAURI_INTERNALS__ = { transformCallback: (cb: any) => cb, invoke: mockInvoke };
    (window as any).__TAURI__ = { core: { invoke: mockInvoke }, event: { listen: mockListen } };

    // B. 强力劫持 LocalStorage 防止被 SettingsStore 初始化覆盖
    const providers = [{
        id: 'ollama-e2e', name: 'Ollama Mock', protocol: 'openai', 
        baseUrl: 'http://localhost:11434/v1/chat/completions', 
        apiKey: 'e2e-token', models: ['mock-model'], enabled: true
    }];
    
    const configurations: Record<string, any> = {
        'ifai_onboarding_state': { completed: true, skipped: true },
        'file-storage': { state: { rootPath: '/Users/mac/mock-project' }, version: 0 },
        'settings-storage': { state: { currentProviderId: 'ollama-e2e', currentModel: 'mock-model', providers }, version: 0 },
        'thread-storage': { state: { activeThreadId: 'e2e-thread-1', threads: [{ id: 'e2e-thread-1', messages: [] }] }, version: 0 },
        'layout-storage': { state: { isChatOpen: true, isSidebarOpen: true }, version: 0 }
    };

    const originalGetItem = window.localStorage.getItem.bind(window.localStorage);
    window.localStorage.getItem = (key: string) => {
        if (configurations[key]) return JSON.stringify(configurations[key]);
        return originalGetItem(key);
    };

    // C. 注入万能后门
    (window as any).__E2E_SEND__ = async (text: string) => {
        const store = (window as any).__chatStore?.getState();
        if (store) {
            console.log(`[E2E] Direct Store Send: ${text}`);
            await store.sendMessage(text, 'ollama-e2e', 'mock-model');
        }
    };

    (window as any).__E2E_GET_MESSAGES__ = () => {
        return (window as any).__chatStore?.getState()?.messages || [];
    };

    // E. Mock IndexedDB for thread persistence testing
    (window as any).__E2E_INDEXED_DB_MOCK__ = {
        threads: new Map<string, any>(),
        messages: new Map<string, any[]>(),

        clear() {
            this.threads.clear();
            this.messages.clear();
        },

        saveThread(thread: any) {
            this.threads.set(thread.id, thread);
        },

        getThread(threadId: string) {
            return this.threads.get(threadId);
        },

        getAllThreads() {
            return Array.from(this.threads.values());
        },

        saveMessages(messages: any[]) {
            messages.forEach(msg => {
                const threadMsgs = this.messages.get(msg.threadId) || [];
                threadMsgs.push(msg);
                this.messages.set(msg.threadId, threadMsgs);
            });
        },

        getThreadMessages(threadId: string) {
            return this.messages.get(threadId) || [];
        },

        deleteThread(threadId: string) {
            this.threads.delete(threadId);
            this.messages.delete(threadId);
        }
    };

    // 暴露任务拆解 Store
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (key, val) => {
        if (key === 'task-breakdown-storage') {
            console.log('[E2E] Intercepted Task Breakdown Store Save');
        }
        return originalSetItem(key, val);
    };

    // D. 运行时状态稳定器 (防止组件挂载后的状态偏移)
    setInterval(() => {
        const settings = (window as any).__settingsStore?.getState();
        if (settings && settings.currentProviderId !== 'ollama-e2e') {
            settings.updateSettings({ currentProviderId: 'ollama-e2e', currentModel: 'mock-model' });
        }
        const file = (window as any).__fileStore?.getState();
        if (file && !file.rootPath) {
            file.setFileTree({ id: 'root', name: 'mock', kind: 'directory', path: '/Users/mac/mock-project', children: [] });
        }
    }, 1000);
  });
}