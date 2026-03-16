import { Message } from '../stores/chatStore';
import { countMessagesTokens } from './tokenCounter';

/**
 * 🏆 PIVO 3.0 Intelligent Message Context Selection
 * 物理级上下文协议对齐与自愈机制 (原子重构版)
 */
export async function selectMessagesForContext(
    messages: Message[], 
    maxMessages: number = 20,
    model?: string,
    maxTokens?: number
): Promise<Message[]> {
    if (messages.length === 0) return [];

    // 1. 基础物理评分 (Scoring)
    const scored = messages.map((msg, index) => {
        const positionFromEnd = messages.length - 1 - index;
        let baseScore = 0;

        if (msg.role === 'system') baseScore = 5000; 
        else if (msg.role === 'user' && positionFromEnd === 0) baseScore = 4000; 
        else if (msg.toolCalls && msg.toolCalls.length > 0) baseScore = 800; 
        else if (msg.tool_call_id) baseScore = 750; 
        else if (msg.role === 'user') baseScore = 300; 
        else baseScore = 100; 

        const decay = Math.pow(0.95, positionFromEnd);
        return {
            message: msg,
            index,
            score: baseScore * decay,
            estimatedTokens: countMessagesTokens([msg], model || 'gpt-4o')
        };
    });

    // 2. 初始物理选择 (Protocol Baseline)
    scored.sort((a, b) => b.score - a.score);
    const selection = new Map(scored.slice(0, maxMessages).map(s => [s.message.id, s]));

    // 3. 🏆 PIVO 3.0: 物理全家桶补全 (Pairing Fidelity)
    // 多轮迭代补全，确保协议闭环
    let changed = true;
    while (changed) {
        changed = false;
        const currentItems = Array.from(selection.values());
        for (const item of currentItems) {
            // A. 向上溯源：如果保留了 Tool 响应，找回发出调用的 Assistant
            if (item.message.role === 'tool') {
                const parent = scored.find(s => s.message.toolCalls?.some(tc => tc.id === item.message.tool_call_id));
                if (parent && !selection.has(parent.message.id)) {
                    console.log(`[ContextFilter] 🛡️ Recovery (Parent): ${parent.index}`);
                    selection.set(parent.message.id, parent);
                    changed = true;
                }
            }
            // B. 向下补全：如果保留了 Assistant，补全其关联的所有 Tool 响应
            if (item.message.role === 'assistant' && item.message.toolCalls) {
                for (const tc of item.message.toolCalls) {
                    const resp = scored.find(s => s.message.role === 'tool' && s.message.tool_call_id === tc.id);
                    if (resp && !selection.has(resp.message.id)) {
                        console.log(`[ContextFilter] 🛡️ Recovery (Response): ${resp.index}`);
                        selection.set(resp.message.id, resp);
                        changed = true;
                    }
                }
            }
        }
    }

    // C. 用户指令强制保全
    const hasUser = Array.from(selection.values()).some(s => s.message.role === 'user');
    if (!hasUser) {
        const lastUser = scored.filter(s => s.message.role === 'user').sort((a,b) => b.index - a.index)[0];
        if (lastUser) {
            console.log(`[ContextFilter] 🛡️ Recovery (User): ${lastUser.index}`);
            selection.set(lastUser.message.id, lastUser);
        }
    }

    // 4. 物理级 Token 裁减 (如果超限)
    let finalItems = Array.from(selection.values());
    if (model && maxTokens) {
        finalItems.sort((a, b) => a.index - b.index);
        let currentTokens = 0;
        const windowSelected: typeof finalItems = [];
        
        // 必保成员：系统、用户及工具对成员
        const criticalSet = new Set();
        finalItems.forEach(item => {
            if (item.message.role === 'system' || item.message.role === 'user' || item.message.role === 'tool' || (item.message.role === 'assistant' && item.message.toolCalls)) {
                criticalSet.add(item.message.id);
            }
        });

        for (let i = finalItems.length - 1; i >= 0; i--) {
            const item = finalItems[i];
            const tokens = await item.estimatedTokens; // 🏆 PIVO 3.4.14: 物理级异步解构
            if (criticalSet.has(item.message.id) || (currentTokens + tokens <= maxTokens)) {
                windowSelected.push(item);
                currentTokens += tokens;
            }
        }
        finalItems = windowSelected;
    }

    // 5. 物理对齐返回
    return finalItems.sort((a, b) => a.index - b.index).map(s => s.message);
}
