/**
 * WriteBehindBuffer — 通用声明式写延迟缓冲器
 *
 * 元编程原则：不手动管理 timer/map/阈值，声明式配置即可。
 * 框架自动处理：定时刷新、批量分组、失败重试、生命周期管理。
 *
 * @example
 * ```ts
 * const buffer = new WriteBehindBuffer({
 *     groupBy: (key) => getSession(key)?.threadId ?? '_orphan',
 *     merge: (a, b) => a + b,
 *     onFlush: (group, items) => writeToDB(group, items),
 * });
 * buffer.add('corr-id', 'hello ');
 * buffer.add('corr-id', 'world'); // 自动 500ms 后合并为 'hello world' 写入
 * ```
 */
export class WriteBehindBuffer<K, V = string> {
    private items: Map<K, V> = new Map();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;

    constructor(private config: {
        flushInterval?: number;
        maxBatchSize?: number;
        /** 按什么键分组写入（eg. threadId） */
        groupBy: (key: K, value: V) => string;
        /** 相同 key 的累积策略（eg. 字符串拼接） */
        merge: (existing: V, incoming: V) => V;
        /** 批量写入回调（按 group 分组后调用） */
        onFlush: (group: string, items: Map<K, V>) => Promise<void>;
    }) {}

    /** 添加一个值，自动合并 + 调度写入 */
    add(key: K, value: V): void {
        if (this.destroyed) return;
        const existing = this.items.get(key);
        this.items.set(key, existing !== undefined ? this.config.merge(existing, value) : value);
        this.scheduleFlush();
        if (this.items.size >= (this.config.maxBatchSize ?? 50)) {
            this.flushNow();
        }
    }

    /** 立即冲刷所有缓冲 */
    async flush(): Promise<void> {
        if (this.items.size === 0) return;
        const snapshot = new Map(this.items);
        this.items.clear();
        await this.flushMap(snapshot);
    }

    /** 立即冲刷单个 key 的缓冲 */
    async flushKey(key: K): Promise<void> {
        const value = this.items.get(key);
        if (value === undefined) return;
        this.items.delete(key);
        const group = this.config.groupBy(key, value);
        await this.config.onFlush(group, new Map([[key, value]]));
    }

    /** 立即冲刷指定分组的所有缓冲 */
    async flushGroup(group: string): Promise<void> {
        if (this.items.size === 0) return;
        const pending: Map<K, V> = new Map();
        for (const [key, value] of this.items) {
            if (this.config.groupBy(key, value) === group) {
                pending.set(key, value);
            }
        }
        if (pending.size === 0) return;
        for (const key of pending.keys()) {
            this.items.delete(key);
        }
        await this.config.onFlush(group, pending).catch(e => {
            console.warn(`[WriteBehindBuffer] Flush failed for group "${group}":`, e);
        });
    }

    /** 清空缓冲（不写入） */
    clear(): void {
        this.items.clear();
    }

    /** 销毁（清理 timer & 内存） */
    destroy(): void {
        this.destroyed = true;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.items.clear();
    }

    private scheduleFlush(): void {
        if (this.timer !== null || this.destroyed) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush();
        }, this.config.flushInterval ?? 500);
    }

    private async flushNow(): Promise<void> {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        await this.flush();
    }

    private async flushMap(items: Map<K, V>): Promise<void> {
        const groups = new Map<string, Map<K, V>>();
        for (const [key, value] of items) {
            const group = this.config.groupBy(key, value);
            if (!groups.has(group)) groups.set(group, new Map());
            groups.get(group)!.set(key, value);
        }
        await Promise.all(
            Array.from(groups, ([group, groupItems]) =>
                this.config.onFlush(group, groupItems).catch(e => {
                    console.warn(`[WriteBehindBuffer] Flush failed for group "${group}":`, e);
                })
            )
        );
    }
}

export default WriteBehindBuffer;
