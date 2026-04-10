/**
 * CoreStoreProxy - 编译时重定向代理 (Phase 5)
 * 
 * 强制将所有对 ifainew-core 的 Store 调用重定向到新架构逻辑。
 * 这是彻底解决私有库内部引用无法拦截的最终方案。
 */

import { useChatStore as originalCoreStore } from 'ifainew-core';
import { sendMessageOrchestrator } from './sendMessage/SendMessageOrchestrator';
import { REFACTOR_FLAGS } from '../../config/edition';

// 🏆 影子拦截：我们克隆原始 Store，但物理替换其导出方法
const coreStore = originalCoreStore;

// 🔥 FIX: 安全检查，防止 store 未初始化时出错
let originalSendMessage: any = null;
let isProxyInstalled = false;

const installProxy = () => {
    if (isProxyInstalled) {
        console.log('[CoreProxy] ✅ Proxy already installed, skipping');
        return true;
    }

    console.log('[CoreProxy] 🔧 Installing proxy...');
    console.log('[CoreProxy] coreStore:', coreStore);
    console.log('[CoreProxy] coreStore.getState:', typeof coreStore.getState);

    try {
        const state = coreStore.getState();
        console.log('[CoreProxy] state:', state);
        console.log('[CoreProxy] state.sendMessage:', typeof state?.sendMessage);

        if (!state) {
            console.warn('[CoreProxy] ⚠️ Store not initialized yet');
            return false;
        }

        if (state.sendMessage) {
            originalSendMessage = state.sendMessage;
        }

        // 安装代理
        (coreStore.getState() as any).sendMessage = async (content: any, pId?: string, model?: string, opts?: any) => {
            console.log('[CoreProxy] 🔍 sendMessage called, checking proxy...');
            console.log('[CoreProxy] useNewChatArchitecture:', REFACTOR_FLAGS.useNewChatArchitecture);
            console.log('[CoreProxy] VITE_TEST_ENV:', (window as any).VITE_TEST_ENV);

            // 🔥 每次调用时都检查并重新安装代理（防止 store 重新初始化）
            if (!isProxyInstalled) {
                console.warn('[CoreProxy] ⚠️ Proxy not installed, attempting to install now...');
                installProxy();
            }

            if (REFACTOR_FLAGS.useNewChatArchitecture || (window as any).VITE_TEST_ENV === 'e2e') {
                console.log('[CoreProxy] 🛡️ Routing via Orchestrator, input:', typeof content === 'string' ? content.substring(0, 50) : 'Array');
                console.log('[CoreProxy] 🔍 sendMessageOrchestrator instance:', sendMessageOrchestrator);
                console.log('[CoreProxy] 🔍 sendMessageOrchestrator.instanceId:', (sendMessageOrchestrator as any).instanceId);
                console.log('[CoreProxy] 🔍 sendMessageOrchestrator.send:', typeof sendMessageOrchestrator?.send);
                if (!sendMessageOrchestrator) {
                    console.error('[CoreProxy] ❌ sendMessageOrchestrator is undefined!');
                    return Promise.reject(new Error('sendMessageOrchestrator not initialized'));
                }
                try {
                    console.log('[CoreProxy] 🔥 About to call sendMessageOrchestrator.send()');
                    const result = sendMessageOrchestrator.send(content, pId, model, opts);
                    console.log('[CoreProxy] 🔥 sendMessageOrchestrator.send() returned, result:', result);
                    return result;
                } catch (e) {
                    console.error('[CoreProxy] ❌ Error calling sendMessageOrchestrator.send():', e);
                    return Promise.reject(e);
                }
            }
            // @ts-ignore: originalSendMessage signature might not reflect all accepted parameters in types
            if (originalSendMessage) {
                return originalSendMessage(content, pId, model, opts);
            } else {
                console.error('[CoreProxy] ❌ originalSendMessage not available');
                return Promise.reject(new Error('sendMessage not initialized'));
            }
        };

        isProxyInstalled = true;
        console.log('[CoreProxy] ✅ sendMessage proxy installed successfully');
        console.log('[CoreProxy] isProxyInstalled:', isProxyInstalled);
        return true;
    } catch (e) {
        console.warn('[CoreProxy] ⚠️ Failed to install proxy:', e);
        return false;
    }
};

// 立即尝试安装，如果失败则在后续使用时重试
installProxy();

// 导出安装函数供外部调用
export const ensureCoreProxyInstalled = () => {
    return installProxy();
};

// 🔥 FIX: 导出本地版本的 useChatStore，确保与 StoreMapper 更新的是同一个实例
// App.tsx 导入这个版本并暴露到 window.__chatStore
// StoreMapper 也更新这个版本，保证一致性
import { useChatStore as localUseChatStore } from '../useChatStore';
export { localUseChatStore as useChatStore };
export { localUseChatStore as default };
