/**
 * Registry<T> — 泛型注册表
 *
 * 运行时按 type 字段查表 dispatch，消灭 if-else 链。
 * 安全降级：get() 返回 undefined 时调用方自行 fallback。
 *
 * @design D0: 元编程架构 — 声明式基础设施优先
 */

export class Registry<T> {
  private handlers = new Map<string, T>();

  /** 注册一个 handler。同一 type 多次注册时后者覆盖前者。 */
  register(type: string, handler: T): void {
    this.handlers.set(type, handler);
  }

  /** 按 type 查询 handler。未注册时返回 undefined（安全降级，不抛异常）。 */
  get(type: string): T | undefined {
    return this.handlers.get(type);
  }

  /** 检查是否已注册指定 type。 */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /** 返回所有已注册的 [type, handler] 条目。 */
  entries(): Array<[string, T]> {
    return Array.from(this.handlers.entries());
  }

  /** 清空注册表（测试用）。 */
  clear(): void {
    this.handlers.clear();
  }
}
