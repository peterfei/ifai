/**
 * threadAwareMiddleware — Zustand middleware for per-thread message isolation
 *
 * Metaprogramming principle: Intercept setState to auto-route messages
 * to the correct thread's bucket, eliminating cross-thread data leaks.
 *
 * Pattern reference: ifainew TUI HashMap<ThreadId, Vec<Message>> + active_id
 *
 * @version 1.0.0
 * @proposal add-per-thread-message-isolation
 */

import { type StateCreator, type StoreMutatorIdentifier } from 'zustand';

// ─── Type Augmentation ────────────────────────────────────────

declare module 'zustand' {
  interface StoreMutators<S, A> {
    threadAware: (writer: StateCreator<S, [], []>) => StateCreator<S, [], []>;
  }
}

// ─── Internal State Shape ─────────────────────────────────────

export interface ThreadAwareState {
  /** Derived view: always = _messagesByThread[currentThreadId] */
  messages: any[];
  isLoading: boolean;
  currentThreadId: string;
  /** Internal per-thread message buckets (never accessed directly by components) */
  _messagesByThread: Record<string, any[]>;
}

// ─── Middleware ────────────────────────────────────────────────

type ThreadAwareMiddleware = <
  T extends ThreadAwareState,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  config: StateCreator<T, Mps, Mcs>,
) => StateCreator<T, Mps, Mcs>;

export const threadAwareMiddleware: ThreadAwareMiddleware =
  (config) => (set: any, get: any, api: any) => {
    const wrappedSet = (partial: Partial<ThreadAwareState> & Record<string, any> | ((state: any) => any)) => {
      const state = get();

      // ── Rule U: setState((state) => result) — updater function ──
      // 🔥 CRITICAL FIX: Updaters bypass plain-object routing (Rule 1/2/3
      // only handle objects). Execute the updater, intercept the result,
      // and route messages to _messagesByThread[currentThreadId].
      // This fixes cross-thread data leaks from StoreMapper/ToolCallManager
      // updater-style setState calls.
      if (typeof partial === 'function') {
        const result = partial(state);
        if ('messages' in result) {
          const targetThreadId = (result as any)._threadId || state.currentThreadId;
          const safeThreadId = targetThreadId || '_orphaned';
          const newMessages = result.messages;
          const baseByThread = (result as any)._messagesByThread || state._messagesByThread || {};
          const byThread = { ...baseByThread, [safeThreadId]: newMessages };

          // Build update carefully (same pattern as Rule 1):
          // Don't spread result — it may contain _threadId or stale _messagesByThread
          const update: Record<string, any> = { _messagesByThread: byThread };

          // Only update messages view if writing to current thread (or no _threadId hint)
          if (!(result as any)._threadId || safeThreadId === state.currentThreadId) {
            update.messages = newMessages;
          }

          // Pass through other fields from result (isLoading, etc.)
          for (const key of Object.keys(result)) {
            if (key !== 'messages' && key !== '_messagesByThread' && key !== '_threadId') {
              update[key] = (result as any)[key];
            }
          }

          set(update as any);
          return;
        }
        set(result as any);
        return;
      }

      // ── Rule 1: setState({messages, ...}) — route to thread bucket ──
      if ('messages' in partial) {
        const newMessages = partial.messages as any[];
        const targetThreadId = (partial as any)._threadId || state.currentThreadId;

        // Fallback for null/undefined currentThreadId
        const safeThreadId = targetThreadId || '_orphaned';

        // Update per-thread bucket
        // During hydration, partial may contain _messagesByThread (from persist merge).
        // Use it as the base to preserve ALL threads' data, not just current thread.
        const baseByThread = (partial as any)._messagesByThread || state._messagesByThread || {};
        const byThread = {
          ...baseByThread,
          [safeThreadId]: newMessages,
        };

        // Build the actual setState payload
        // IMPORTANT: Strip _threadId so it doesn't leak to state/persist
        const update: Record<string, any> = { _messagesByThread: byThread };

        // Only update messages view if writing to current thread (or no _threadId hint)
        if (!(partial as any)._threadId || safeThreadId === state.currentThreadId) {
          update.messages = newMessages;
        }
        // If writing to a different thread, keep current messages view unchanged
        // (components continue to see current thread's data)

        // Pass through other fields (isLoading, etc.)
        for (const key of Object.keys(partial)) {
          if (key !== 'messages' && key !== '_messagesByThread' && key !== '_threadId') {
            update[key] = (partial as any)[key];
          }
        }

        set(update as any);
        return;
      }

      // ── Rule 2: setState({currentThreadId, ...}) — auto-provide messages ──
      if ('currentThreadId' in partial) {
        const newThreadId = partial.currentThreadId!;
        const existingByThread = state._messagesByThread || {};
        const threadMessages = existingByThread[newThreadId] || [];

        // Ensure bucket exists (ER-3: switching to empty-thread creates empty bucket)
        const byThread = {
          ...existingByThread,
          [newThreadId]: threadMessages,
        };

        const update: Record<string, any> = {
          ...partial,
          messages: threadMessages,
          _messagesByThread: byThread,
        };

        set(update as any);
        return;
      }

      // ── Rule 3: All other setState calls pass through unchanged ──
      set(partial);
    };

    // 🔥 Critical: Replace public setState API so store.setState() goes through middleware
    api.setState = wrappedSet as any;
    return config(wrappedSet as any, get, api);
  };

export default threadAwareMiddleware;
