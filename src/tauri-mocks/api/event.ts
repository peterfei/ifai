/**
 * Mock for @tauri-apps/api/event
 * Used in E2E test environment where actual Tauri API is not available
 */

export async function listen<T = any>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> {
  const listeners = (window as any).__TAURI_EVENT_LISTENERS__ || {};
  if (!listeners[event]) {
    listeners[event] = [];
  }
  listeners[event].push(handler);
  (window as any).__TAURI_EVENT_LISTENERS__ = listeners;

  // Return unlisten function
  return () => {
    const idx = listeners[event]?.indexOf(handler);
    if (idx > -1) {
      listeners[event]?.splice(idx, 1);
    }
  };
}

export async function once<T = any>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> {
  const unlisten = await listen(event, handler);
  // Auto-unlisten after first call
  const wrappedHandler = handler;
  const listeners = (window as any).__TAURI_EVENT_LISTENERS__?.[event];
  if (listeners) {
    const idx = listeners.indexOf(wrappedHandler);
    if (idx > -1) {
      listeners[idx] = (payload: any) => {
        wrappedHandler(payload);
        unlisten();
      };
    }
  }
  return unlisten;
}

export async function emit(event: string, payload?: any): Promise<void> {
  const listeners = (window as any).__TAURI_EVENT_LISTENERS__?.[event] || [];
  listeners.forEach((fn: Function) => fn({ payload }));
}
