/**
 * MessageOperations — 可组合消息操作
 *
 * 元编程原则：操作即数据（Operation as Data）。
 * 每个操作是一个纯函数 `(msg) => msg`，可组合、可复用、可测试。
 * 不再为不同场景重复写 msg.map/findIndex 逻辑。
 */

/** 可组合消息操作类型 */
export interface MessageOperation {
    apply(msg: any): any;
    describe(): string;
}

/** 声明式操作工厂 */
export const ops = {
    /** 追加 content delta，标记 isStreaming */
    appendContent: (delta: string): MessageOperation => ({
        apply: (msg: any) => ({
            ...msg,
            content: (msg.content || '') + delta,
            isStreaming: true,
        }),
        describe: () => `appendContent(${delta.length} chars)`,
    }),

    /** 标记流完成 */
    finishStream: (): MessageOperation => ({
        apply: (msg: any) => ({
            ...msg,
            isStreaming: false,
            status: 'completed' as const,
        }),
        describe: () => 'finishStream',
    }),
};

/**
 * 对给定 thread + correlationId 的消息依次应用一组操作
 *
 * @example
 * await applyToMessages(threadId, corrId,
 *     ops.appendContent('hello'),
 *     ops.finishStream(),
 * );
 */
export async function applyToMessages(
    threadId: string,
    correlationId: string,
    ...operations: MessageOperation[]
): Promise<void> {
    const { threadPersistence } = await import('../../persistence/threadPersistence');
    return applyToMessagesWith(threadPersistence, threadId, correlationId, ...operations);
}

/**
 * 可注入持久化的 applyToMessages，用于测试注入 mock persistence。
 * 核心逻辑在此，applyToMessages 仅负责解析依赖并委托。
 */
export async function applyToMessagesWith(
    persistence: {
        loadThreadMessages(id: string): Promise<any[]>;
        saveThreadMessages(id: string, msgs: any[]): Promise<void>;
    },
    threadId: string,
    correlationId: string,
    ...operations: MessageOperation[]
): Promise<void> {
    const messages = await persistence.loadThreadMessages(threadId);
    const idx = messages.findIndex((m: any) => m.id === correlationId);
    if (idx === -1) return;

    messages[idx] = operations.reduce(
        (msg, op) => op.apply(msg),
        messages[idx],
    );
    await persistence.saveThreadMessages(threadId, messages as any);
}

export default ops;
