// Browser polyfill for node:async_hooks.
// In SSR/server builds we re-export the real Node.js AsyncLocalStorage so
// that frameworks which use AsyncLocalStorage to propagate request context
// (TanStack Start's start-storage-context) keep working. In client builds
// we expose a no-op stand-in to avoid "AsyncLocalStorage is not a
// constructor" during hydration (TanStack Start + React 19 quirk).
//
// The previous implementation exported a fixed no-op class and the build
// alias pointed both client and server at it, which broke
// `getStartContext()` on the server and made every SSR loader / server fn
// 500. This file is now environment-aware, so we can drop the alias entirely.
import * as NodeAsyncHooks from "node:async_hooks";

type AsyncLocalStorageLike<T> = {
  getStore: () => T | undefined;
  run: <R>(store: T, fn: () => R, ...args: unknown[]) => R;
  enterWith: (store: T) => void;
  disable: () => void;
};

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

class BrowserAsyncLocalStorage implements AsyncLocalStorageLike<unknown> {
  private store: unknown = undefined;
  getStore(): unknown {
    return this.store;
  }
  run<R>(store: unknown, fn: () => R, ..._args: unknown[]): R {
    const prev = this.store;
    this.store = store;
    try {
      return fn();
    } finally {
      this.store = prev;
    }
  }
  enterWith(store: unknown): void {
    this.store = store;
  }
  disable(): void {
    this.store = undefined;
  }
}

const AsyncLocalStorageImpl: new <T>() => AsyncLocalStorageLike<T> =
  isBrowser
    ? (BrowserAsyncLocalStorage as unknown as new <T>() => AsyncLocalStorageLike<T>)
    : (NodeAsyncHooks.AsyncLocalStorage as unknown as new <T>() => AsyncLocalStorageLike<T>);

export const AsyncLocalStorage = AsyncLocalStorageImpl;
export const asyncLocalStorage = new AsyncLocalStorageImpl<unknown>();

// Re-export the original Node type so consumers who need the real class can
// import it from this module instead of `node:async_hooks` directly.
export const NodeAsyncLocalStorage = NodeAsyncHooks.AsyncLocalStorage;
