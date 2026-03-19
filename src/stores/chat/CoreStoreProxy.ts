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

// 劫持 getState 产生的闭包
const originalSendMessage = coreStore.getState().sendMessage;

(coreStore.getState() as any).sendMessage = async (content: any, pId?: string, model?: string, opts?: any) => {
    if (REFACTOR_FLAGS.useNewChatArchitecture || (window as any).VITE_TEST_ENV === 'e2e') {
        console.log('[CoreProxy] 🛡️ Compile-time Shield: Routing via Orchestrator');
        return sendMessageOrchestrator.send(content, pId, model, opts);
    }
    return originalSendMessage(content, pId, model, opts);
};

export const useChatStore = coreStore;
export default useChatStore;
