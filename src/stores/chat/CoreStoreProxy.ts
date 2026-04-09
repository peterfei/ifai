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
    if (isProxyInstalled) return;

    try {
        const state = coreStore.getState();
        if (!state) {
            console.warn('[CoreProxy] ⚠️ Store not initialized yet');
            return false;
        }

        if (state.sendMessage) {
            originalSendMessage = state.sendMessage;
        }

        // 安装代理
        (coreStore.getState() as any).sendMessage = async (content: any, pId?: string, model?: string, opts?: any) => {
            if (REFACTOR_FLAGS.useNewChatArchitecture || (window as any).VITE_TEST_ENV === 'e2e') {
                console.log('[CoreProxy] 🛡️ Compile-time Shield: Routing via Orchestrator');
                return sendMessageOrchestrator.send(content, pId, model, opts);
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
        console.log('[CoreProxy] ✅ sendMessage proxy installed');
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

export const useChatStore = coreStore;
export default useChatStore;
