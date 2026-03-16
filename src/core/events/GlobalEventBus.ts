/**
 * 🏆 PIVO 3.0 全局物理事件总线
 * 负责各组件间的解耦通信、协议校验与异步调度
 */
type EventCallback = (payload: any) => void;

export class GlobalEventBus {
    private static instance: GlobalEventBus;
    private subscribers: Map<string, Set<EventCallback>> = new Map();

    private constructor() {}

    static getInstance(): GlobalEventBus {
        if (!GlobalEventBus.instance) GlobalEventBus.instance = new GlobalEventBus();
        return GlobalEventBus.instance;
    }

    emit(event: string, payload?: any) {
        const callbacks = this.subscribers.get(event);
        if (callbacks) {
            callbacks.forEach(cb => {
                try { 
                    cb(payload); 
                } catch (e) { 
                    console.error(`[EventBus] ❌ Error in subscriber for ${event}:`, e); 
                }
            });
        }
    }

    on(event: string, callback: EventCallback): () => void {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, new Set());
        }
        this.subscribers.get(event)!.add(callback);
        
        return () => {
            const callbacks = this.subscribers.get(event);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) this.subscribers.delete(event);
            }
        };
    }
}

export const eventBus = GlobalEventBus.getInstance();
